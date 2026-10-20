import { describe, expect, it } from 'vitest';
import {
  type ArchEdge,
  type ArchitectureGraph,
  type ArchNode,
  LINT_RULE_IDS,
  LINT_RULES,
  type LintRuleId,
  lintGraph,
  MAX_SYNC_HOPS,
  validateGraph,
} from '../src/index.ts';
import { threeTierGraph } from './fixtures.ts';

function graphOf(nodes: ArchNode[], edges: ArchEdge[] = []): ArchitectureGraph {
  const graph: ArchitectureGraph = {
    schemaVersion: 1,
    title: 'Test',
    provider: 'generic',
    nodes,
    edges,
  };
  // Lint rules assume a structurally valid graph; guard the fixtures themselves.
  expect(validateGraph(graph).filter((issue) => issue.severity === 'error')).toEqual([]);
  return graph;
}

const node = (id: string, kind: ArchNode['kind'], extra: Partial<ArchNode> = {}): ArchNode => ({
  id,
  kind,
  label: id,
  ...extra,
});

const edge = (source: string, target: string, extra: Partial<ArchEdge> = {}): ArchEdge => ({
  id: `${source}-${target}`,
  source,
  target,
  ...extra,
});

/** Findings of a single rule, to keep each test focused on the rule under test. */
function findingsOf(ruleId: LintRuleId, graph: ArchitectureGraph) {
  return lintGraph(graph).filter((finding) => finding.ruleId === ruleId);
}

describe('rule registry', () => {
  it('registers every rule id exactly once', () => {
    expect(LINT_RULES.map((rule) => rule.id).sort()).toEqual([...LINT_RULE_IDS].sort());
  });

  it('documents every rule', () => {
    for (const rule of LINT_RULES) {
      expect(rule.title.length).toBeGreaterThan(0);
      expect(rule.description.length).toBeGreaterThan(0);
    }
  });
});

describe('lintGraph', () => {
  it('reports only the unknown zone setup of the cache in the three-tier fixture', () => {
    expect(lintGraph(threeTierGraph())).toEqual([
      expect.objectContaining({
        ruleId: 'database-single-az',
        severity: 'info',
        nodeIds: ['cache'],
        edgeIds: [],
      }),
    ]);
  });

  it('returns nothing for an empty graph', () => {
    expect(lintGraph(graphOf([]))).toEqual([]);
  });

  it('sorts findings by severity, errors first', () => {
    const graph = graphOf(
      [node('lonely', 'service'), node('client', 'web-client'), node('db', 'nosql-db')],
      [edge('client', 'db')],
    );
    expect(lintGraph(graph).map((finding) => finding.severity)).toEqual(['error', 'info']);
  });

  it('skips disabled rules', () => {
    const graph = graphOf([node('lonely', 'service')]);
    expect(lintGraph(graph)).toHaveLength(1);
    expect(lintGraph(graph, { disabledRules: ['orphan-component'] })).toEqual([]);
  });

  it('does not modify its input', () => {
    const graph = threeTierGraph();
    const copy = structuredClone(graph);
    lintGraph(graph);
    expect(graph).toEqual(copy);
  });

  it('handles a graph at the schema limits quickly and references only existing elements', () => {
    const nodes = Array.from({ length: 200 }, (_, i) =>
      node(`n${i}`, i % 20 === 0 ? 'user' : i % 3 === 0 ? 'relational-db' : 'service'),
    );
    // Deterministic pseudo-random edges, including cycles and long chains.
    const edges: ArchEdge[] = [];
    let seed = 7;
    while (edges.length < 400) {
      seed = (seed * 48271) % 2147483647;
      const source = seed % 200;
      const target = (source + 1 + (seed % 7)) % 200;
      const candidate = edge(`n${source}`, `n${target}`);
      if (!edges.some((e) => e.id === candidate.id)) edges.push(candidate);
    }
    const graph = graphOf(nodes, edges);

    const started = performance.now();
    const findings = lintGraph(graph);
    expect(performance.now() - started).toBeLessThan(1000);

    const nodeIds = new Set(nodes.map((n) => n.id));
    const edgeIds = new Set(edges.map((e) => e.id));
    for (const finding of findings) {
      expect(finding.nodeIds.every((id) => nodeIds.has(id))).toBe(true);
      expect(finding.edgeIds.every((id) => edgeIds.has(id))).toBe(true);
    }
    expect(new Set(findings.map((finding) => finding.ruleId))).toContain('sync-cycle');
  });
});

describe('single-point-of-failure', () => {
  const withApi = (attributes: ArchNode['attributes'], mode?: ArchEdge['mode']) =>
    graphOf(
      [node('lb', 'load-balancer'), node('api', 'service', { attributes })],
      [edge('lb', 'api', mode ? { mode } : {})],
    );

  it('warns about one replica without autoscaling behind synchronous traffic', () => {
    expect(findingsOf('single-point-of-failure', withApi({ replicas: 1 }))).toEqual([
      expect.objectContaining({ severity: 'warning', nodeIds: ['api'], edgeIds: ['lb-api'] }),
    ]);
    expect(
      findingsOf('single-point-of-failure', withApi({ replicas: 1, autoscaling: false })),
    ).toEqual([
      expect.objectContaining({
        message: '"api" serves synchronous requests with a single replica and autoscaling disabled',
      }),
    ]);
  });

  it('asks to review when the replica count is unknown', () => {
    expect(findingsOf('single-point-of-failure', withApi(undefined))).toEqual([
      expect.objectContaining({ severity: 'info', nodeIds: ['api'] }),
    ]);
  });

  it('accepts several replicas, autoscaling or a managed service', () => {
    expect(findingsOf('single-point-of-failure', withApi({ replicas: 2 }))).toEqual([]);
    expect(findingsOf('single-point-of-failure', withApi({ autoscaling: true }))).toEqual([]);
    expect(findingsOf('single-point-of-failure', withApi({ managed: true }))).toEqual([]);
  });

  it('ignores components that only receive asynchronous traffic', () => {
    expect(findingsOf('single-point-of-failure', withApi({ replicas: 1 }, 'async'))).toEqual([]);
  });

  it('ignores serverless functions and non compute components', () => {
    const graph = graphOf(
      [node('gw', 'api-gateway'), node('fn', 'function'), node('db', 'relational-db')],
      [edge('gw', 'fn'), edge('fn', 'db')],
    );
    expect(findingsOf('single-point-of-failure', graph)).toEqual([]);
  });
});

describe('public-database', () => {
  it('flags a publicly accessible data store', () => {
    const graph = graphOf([
      node('bucket', 'object-storage', { attributes: { publiclyAccessible: true } }),
    ]);
    expect(findingsOf('public-database', graph)).toEqual([
      expect.objectContaining({
        severity: 'error',
        nodeIds: ['bucket'],
        message: expect.stringContaining('is publicly accessible') as string,
      }),
    ]);
  });

  it('flags a data store called directly by a client, naming both reasons', () => {
    const graph = graphOf(
      [
        node('app', 'mobile-client'),
        node('db', 'nosql-db', { attributes: { publiclyAccessible: true } }),
      ],
      [edge('app', 'db')],
    );
    expect(findingsOf('public-database', graph)).toEqual([
      expect.objectContaining({
        nodeIds: ['db', 'app'],
        edgeIds: ['app-db'],
        message: 'Data store "db" is publicly accessible and is called directly by clients',
      }),
    ]);
  });

  it('accepts data stores reached through services or private', () => {
    const graph = graphOf(
      [
        node('user', 'user'),
        node('api', 'service', { attributes: { autoscaling: true } }),
        node('db', 'relational-db', { attributes: { publiclyAccessible: false, multiAz: true } }),
      ],
      [edge('user', 'api'), edge('api', 'db')],
    );
    expect(findingsOf('public-database', graph)).toEqual([]);
  });
});

describe('unprotected-entry', () => {
  it('flags each client edge that reaches compute directly', () => {
    const graph = graphOf(
      [node('web', 'web-client'), node('app', 'mobile-client'), node('vm', 'vm')],
      [edge('web', 'vm'), edge('app', 'vm')],
    );
    expect(findingsOf('unprotected-entry', graph)).toEqual([
      expect.objectContaining({ severity: 'warning', nodeIds: ['web', 'vm'], edgeIds: ['web-vm'] }),
      expect.objectContaining({ nodeIds: ['app', 'vm'], edgeIds: ['app-vm'] }),
    ]);
  });

  it('accepts compute behind an entry component', () => {
    const graph = graphOf(
      [node('web', 'web-client'), node('gw', 'api-gateway'), node('fn', 'function')],
      [edge('web', 'gw'), edge('gw', 'fn')],
    );
    expect(findingsOf('unprotected-entry', graph)).toEqual([]);
  });
});

describe('database-single-az', () => {
  it('warns when multiAz is false', () => {
    const graph = graphOf([node('db', 'relational-db', { attributes: { multiAz: false } })]);
    expect(findingsOf('database-single-az', graph)).toEqual([
      expect.objectContaining({ severity: 'warning', nodeIds: ['db'] }),
    ]);
  });

  it('asks to review when multiAz is unknown', () => {
    const graph = graphOf([node('cache', 'cache')]);
    expect(findingsOf('database-single-az', graph)).toEqual([
      expect.objectContaining({ severity: 'info', nodeIds: ['cache'] }),
    ]);
  });

  it('accepts multi-zone deployments and ignores other data stores', () => {
    const graph = graphOf([
      node('db', 'relational-db', { attributes: { multiAz: true } }),
      node('docs', 'nosql-db'),
      node('files', 'object-storage'),
    ]);
    expect(findingsOf('database-single-az', graph)).toEqual([]);
  });
});

describe('unencrypted-data', () => {
  it('warns when encryption at rest is disabled', () => {
    const graph = graphOf([
      node('lake', 'object-storage', { attributes: { encryptedAtRest: false } }),
    ]);
    expect(findingsOf('unencrypted-data', graph)).toEqual([
      expect.objectContaining({ severity: 'warning', nodeIds: ['lake'] }),
    ]);
  });

  it('treats unknown encryption as unknown and ignores non data components', () => {
    const graph = graphOf([
      node('lake', 'object-storage'),
      node('ok', 'nosql-db', { attributes: { encryptedAtRest: true } }),
      node('q', 'queue', { attributes: { encryptedAtRest: false } }),
    ]);
    expect(findingsOf('unencrypted-data', graph)).toEqual([]);
  });
});

describe('sync-chain-too-long', () => {
  /** user → s1 → s2 → ... → s{hops}, all synchronous unless stated. */
  function chain(hops: number, modes: Partial<Record<number, ArchEdge['mode']>> = {}) {
    const ids = ['user', ...Array.from({ length: hops }, (_, i) => `s${i + 1}`)];
    return graphOf(
      ids.map((id, i) => node(id, i === 0 ? 'user' : 'service')),
      ids.slice(1).map((id, i) => {
        const mode = modes[i + 1];
        return edge(ids[i]!, id, mode ? { mode } : {});
      }),
    );
  }

  it(`accepts up to ${MAX_SYNC_HOPS} synchronous hops`, () => {
    expect(findingsOf('sync-chain-too-long', chain(MAX_SYNC_HOPS))).toEqual([]);
  });

  it('flags a longer chain and reports the path', () => {
    expect(findingsOf('sync-chain-too-long', chain(6))).toEqual([
      expect.objectContaining({
        severity: 'warning',
        nodeIds: ['user', 's1', 's2', 's3', 's4', 's5'],
        edgeIds: ['user-s1', 's1-s2', 's2-s3', 's3-s4', 's4-s5'],
        message: expect.stringContaining('at least 5 hops') as string,
      }),
    ]);
  });

  it('is broken by an asynchronous hop, explicit or implied by the protocol', () => {
    expect(findingsOf('sync-chain-too-long', chain(6, { 3: 'async' }))).toEqual([]);
    const graph = chain(6);
    const viaQueue = {
      ...graph,
      edges: graph.edges.map((e) => (e.id === 's2-s3' ? { ...e, protocol: 'kafka' as const } : e)),
    };
    expect(findingsOf('sync-chain-too-long', viaQueue)).toEqual([]);
  });

  it('does not count a loop as a long chain', () => {
    const graph = graphOf(
      [node('user', 'user'), node('a', 'service'), node('b', 'service')],
      [edge('user', 'a'), edge('a', 'b'), edge('b', 'a')],
    );
    expect(findingsOf('sync-chain-too-long', graph)).toEqual([]);
  });

  it('only measures chains that start at an actor', () => {
    const graph = chain(6);
    const noActor = {
      ...graph,
      nodes: graph.nodes.map((n) => (n.id === 'user' ? { ...n, kind: 'service' as const } : n)),
    };
    expect(findingsOf('sync-chain-too-long', noActor)).toEqual([]);
  });
});

describe('sync-cycle', () => {
  it('reports one finding per group of components in a synchronous loop', () => {
    const graph = graphOf(
      ['a', 'b', 'c', 'x', 'y'].map((id) => node(id, 'service')),
      [
        edge('a', 'b'),
        edge('b', 'c'),
        edge('c', 'a'),
        edge('b', 'a'),
        edge('c', 'x'),
        edge('x', 'y'),
        edge('y', 'x', { protocol: 'grpc' }),
      ],
    );
    expect(findingsOf('sync-cycle', graph)).toEqual([
      expect.objectContaining({
        severity: 'error',
        nodeIds: ['x', 'y'],
        edgeIds: ['x-y', 'y-x'],
      }),
      expect.objectContaining({
        nodeIds: ['a', 'b', 'c'],
        edgeIds: ['a-b', 'b-c', 'c-a', 'b-a'],
      }),
    ]);
  });

  it('ignores loops closed by an asynchronous edge', () => {
    const graph = graphOf(
      [node('a', 'service'), node('q', 'queue'), node('b', 'service')],
      [edge('a', 'q', { protocol: 'amqp' }), edge('q', 'b', { mode: 'async' }), edge('b', 'a')],
    );
    expect(findingsOf('sync-cycle', graph)).toEqual([]);
  });
});

describe('orphan-component', () => {
  it('flags components without edges', () => {
    const graph = graphOf(
      [node('a', 'service'), node('b', 'service'), node('legacy', 'vm')],
      [edge('a', 'b')],
    );
    expect(findingsOf('orphan-component', graph)).toEqual([
      expect.objectContaining({ severity: 'info', nodeIds: ['legacy'] }),
    ]);
  });

  it('ignores containers and cross-cutting services', () => {
    const graph = graphOf([
      node('region', 'region'),
      node('metrics', 'monitoring', { parentId: 'region' }),
      node('vault', 'secrets-manager'),
      node('idp', 'identity-provider'),
    ]);
    expect(findingsOf('orphan-component', graph)).toEqual([]);
  });
});
