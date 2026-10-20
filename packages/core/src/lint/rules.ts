import { getNodeDefinition } from '../catalog.ts';
import { type GraphIndex, isContainer, resolveEdgeMode } from '../graph.ts';
import type { ComponentKind, NodeCategory, NodeKind } from '../kinds.ts';
import type { ArchEdge, ArchNode } from '../schema.ts';
import { findLongSyncPaths, findSyncCycles } from './sync-paths.ts';
import type { LintRule, RuleFinding } from './types.ts';

/**
 * Design rules. Absent attributes mean "unknown", never "false": a rule may
 * only claim a defect from an explicit value, and turns unknowns into `info`
 * findings that ask to review the point (docs/modelo-de-dominio.md).
 */

function categoryOf(node: ArchNode): NodeCategory {
  return getNodeDefinition(node.kind).category;
}

function components(index: GraphIndex): ArchNode[] {
  return [...index.nodesById.values()].filter((node) => !isContainer(node));
}

/** Edges arriving at `node` from components of `category`, with their source. */
function callersFrom(
  index: GraphIndex,
  node: ArchNode,
  category: NodeCategory,
): { edge: ArchEdge; caller: ArchNode }[] {
  return (index.incoming.get(node.id) ?? []).flatMap((edge) => {
    const caller = index.nodesById.get(edge.source);
    return caller !== undefined && categoryOf(caller) === category ? [{ edge, caller }] : [];
  });
}

const ids = (items: readonly { id: string }[]) => items.map((item) => item.id);

/** Serverless functions scale per request, so replica counts do not apply. */
const SELF_SCALING_KINDS: ReadonlySet<NodeKind> = new Set<ComponentKind>(['function']);

const singlePointOfFailure: LintRule = {
  id: 'single-point-of-failure',
  title: 'Single point of failure',
  description:
    'A compute component that serves synchronous requests with a single instance takes the whole request path down when it fails or is redeployed.',
  defaultSeverity: 'warning',
  check(index) {
    const findings: RuleFinding[] = [];
    for (const node of components(index)) {
      if (categoryOf(node) !== 'compute' || SELF_SCALING_KINDS.has(node.kind)) continue;
      const { replicas, autoscaling, managed } = node.attributes ?? {};
      if (autoscaling === true || managed === true || (replicas ?? 1) > 1) continue;
      const syncCallers = (index.incoming.get(node.id) ?? []).filter(
        (edge) => resolveEdgeMode(edge) === 'sync',
      );
      if (syncCallers.length === 0) continue;

      const details = { nodeIds: [node.id], edgeIds: ids(syncCallers) };
      findings.push(
        replicas === undefined
          ? {
              ...details,
              severity: 'info',
              message: `"${node.label}" serves synchronous requests and its number of replicas is unknown`,
              suggestion:
                'Set replicas or autoscaling so that the design states how this component survives an instance failure.',
            }
          : {
              ...details,
              message: `"${node.label}" serves synchronous requests with a single replica and ${autoscaling === false ? 'autoscaling disabled' : 'no autoscaling stated'}`,
              suggestion:
                'Run at least two replicas behind a load balancer, or enable autoscaling with a minimum of two instances.',
            },
      );
    }
    return findings;
  },
};

const publicDatabase: LintRule = {
  id: 'public-database',
  title: 'Data store exposed to clients',
  description:
    'A data store reachable from the internet or called directly by clients bypasses the application layer that enforces authorisation and validation.',
  defaultSeverity: 'error',
  check(index) {
    const findings: RuleFinding[] = [];
    for (const node of components(index)) {
      if (categoryOf(node) !== 'data') continue;
      const fromClients = callersFrom(index, node, 'actor');
      const isPublic = node.attributes?.publiclyAccessible === true;
      if (!isPublic && fromClients.length === 0) continue;

      const reasons = [
        ...(isPublic ? ['is publicly accessible'] : []),
        ...(fromClients.length > 0 ? ['is called directly by clients'] : []),
      ];
      findings.push({
        nodeIds: [node.id, ...fromClients.map(({ caller }) => caller.id)],
        edgeIds: fromClients.map(({ edge }) => edge.id),
        message: `Data store "${node.label}" ${reasons.join(' and ')}`,
        suggestion:
          'Keep the data store in a private network and reach it through a service or API; serve public files through a CDN with restricted origin access.',
      });
    }
    return findings;
  },
};

const unprotectedEntry: LintRule = {
  id: 'unprotected-entry',
  title: 'Compute exposed without an entry point',
  description:
    'Clients that call compute directly get no TLS termination, rate limiting, routing or failover from a load balancer, API gateway or CDN.',
  defaultSeverity: 'warning',
  check(index) {
    const findings: RuleFinding[] = [];
    for (const node of components(index)) {
      if (categoryOf(node) !== 'compute') continue;
      for (const { edge, caller } of callersFrom(index, node, 'actor')) {
        findings.push({
          nodeIds: [caller.id, node.id],
          edgeIds: [edge.id],
          message: `"${caller.label}" calls "${node.label}" directly`,
          suggestion: 'Put a load balancer, API gateway or CDN in front of it.',
        });
      }
    }
    return findings;
  },
};

const ZONE_SENSITIVE_KINDS: ReadonlySet<NodeKind> = new Set<ComponentKind>([
  'relational-db',
  'cache',
]);

const databaseSingleAz: LintRule = {
  id: 'database-single-az',
  title: 'Database in a single availability zone',
  description:
    'A relational database or cache in one zone loses its data path, and possibly recent writes, when that zone fails.',
  defaultSeverity: 'warning',
  check(index) {
    const findings: RuleFinding[] = [];
    for (const node of components(index)) {
      if (!ZONE_SENSITIVE_KINDS.has(node.kind)) continue;
      const multiAz = node.attributes?.multiAz;
      if (multiAz === true) continue;

      const details = { nodeIds: [node.id], edgeIds: [] };
      findings.push(
        multiAz === undefined
          ? {
              ...details,
              severity: 'info',
              message: `It is unknown whether "${node.label}" spans several availability zones`,
              suggestion: 'Set multiAz to state whether a zone failure is covered.',
            }
          : {
              ...details,
              message: `"${node.label}" runs in a single availability zone`,
              suggestion:
                'Enable a multi-zone deployment with automatic failover, or a replica in another zone.',
            },
      );
    }
    return findings;
  },
};

const unencryptedData: LintRule = {
  id: 'unencrypted-data',
  title: 'Data not encrypted at rest',
  description:
    'Unencrypted storage exposes data through snapshots, backups or leaked disks, and fails most compliance baselines.',
  defaultSeverity: 'warning',
  check(index) {
    return components(index)
      .filter((node) => categoryOf(node) === 'data' && node.attributes?.encryptedAtRest === false)
      .map((node) => ({
        nodeIds: [node.id],
        edgeIds: [],
        message: `"${node.label}" stores data without encryption at rest`,
        suggestion: 'Enable encryption at rest, ideally with keys managed by a key service.',
      }));
  },
};

/** Maximum number of synchronous hops from a client before latency and failure compound. */
export const MAX_SYNC_HOPS = 4;

const syncChainTooLong: LintRule = {
  id: 'sync-chain-too-long',
  title: 'Long synchronous chain',
  description: `Every synchronous hop adds latency and multiplies the chance of failure. More than ${MAX_SYNC_HOPS} hops from a client is fragile.`,
  defaultSeverity: 'warning',
  check(index) {
    return findLongSyncPaths(index, MAX_SYNC_HOPS).map(({ nodes, edges }) => {
      const labels = nodes.map((node) => node.label);
      return {
        nodeIds: ids(nodes),
        edgeIds: ids(edges),
        message: `A synchronous chain of at least ${edges.length} hops starts at a client: "${labels.join('" → "')}"`,
        suggestion:
          'Make a step asynchronous with a queue or event, cache results, or merge services that always call each other.',
      };
    });
  },
};

const syncCycle: LintRule = {
  id: 'sync-cycle',
  title: 'Synchronous cycle',
  description:
    'Components that wait on each other in a loop can deadlock, retry forever or fail together, and cannot be deployed independently.',
  defaultSeverity: 'error',
  check(index) {
    return findSyncCycles(index).map(({ nodes, edges }) => {
      const labels = nodes.map((node) => `"${node.label}"`);
      return {
        nodeIds: ids(nodes),
        edgeIds: ids(edges),
        message: `These components call each other synchronously in a loop: ${labels.join(', ')}`,
        suggestion:
          'Break the loop by making one call asynchronous, or move the shared logic into a component both can call.',
      };
    });
  },
};

/** Cross-cutting services are usually drawn without edges to keep diagrams readable. */
const CROSS_CUTTING_KINDS: ReadonlySet<NodeKind> = new Set<ComponentKind>([
  'monitoring',
  'secrets-manager',
  'identity-provider',
]);

const orphanComponent: LintRule = {
  id: 'orphan-component',
  title: 'Unconnected component',
  description:
    'A component without connections is either unused or missing the interactions that explain its role.',
  defaultSeverity: 'info',
  check(index) {
    return components(index)
      .filter(
        (node) =>
          !CROSS_CUTTING_KINDS.has(node.kind) &&
          !index.incoming.has(node.id) &&
          !index.outgoing.has(node.id),
      )
      .map((node) => ({
        nodeIds: [node.id],
        edgeIds: [],
        message: `"${node.label}" has no connections`,
        suggestion: 'Connect it to the components it serves or depends on, or remove it.',
      }));
  },
};

/** All rules, in the order their findings are listed within a severity. */
export const LINT_RULES: readonly LintRule[] = [
  syncCycle,
  publicDatabase,
  singlePointOfFailure,
  unprotectedEntry,
  databaseSingleAz,
  unencryptedData,
  syncChainTooLong,
  orphanComponent,
];
