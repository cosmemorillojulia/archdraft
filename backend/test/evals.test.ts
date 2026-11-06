import {
  ARCHITECTURE_TEMPLATES,
  type ArchitectureGraph,
  type AssistResult,
  createEmptyGraph,
  diffGraphs,
  lintGraph,
  validateGraph,
} from '@archdraft/shared';
import { describe, expect, it } from 'vitest';
import { type EvalCase, requestOf } from '../evals/case.ts';
import { EVAL_CASES } from '../evals/cases.ts';
import { idealOperations, idealProvider } from '../evals/ideal-provider.ts';
import { toMarkdown } from '../evals/report.ts';
import { runEvals } from '../evals/run.ts';
import {
  forbiddenFound,
  idsKept,
  missingConnections,
  type Outcome,
  scoreCase,
  scoreTypes,
  summarize,
} from '../evals/score.ts';
import { LlmError } from '../src/llm/errors.ts';
import type { LlmProvider } from '../src/llm/provider.ts';

/** A graph of components joined in a chain, `user > cdn > service`, with ids equal to kinds. */
function chain(...kinds: ArchitectureGraph['nodes'][number]['kind'][]): ArchitectureGraph {
  return {
    ...createEmptyGraph('Chain'),
    nodes: kinds.map((kind) => ({ id: kind, kind, label: kind })),
    edges: kinds.slice(1).map((kind, index) => ({
      id: `e${index}`,
      source: kinds[index] ?? '',
      target: kind,
    })),
  };
}

function generateCase(expect: EvalCase['expect']): EvalCase {
  return { id: 'case', task: 'generate', locale: 'en', prompt: 'A system', expect };
}

/** An answer with these diagrams as its proposals. */
function answered(graphs: ArchitectureGraph[], before = createEmptyGraph('Before')): Outcome {
  const result: AssistResult = {
    task: 'generate',
    attempts: 1,
    warnings: [],
    proposals: graphs.map((graph) => ({
      title: 'Proposal',
      rationale: '',
      graph,
      changes: diffGraphs(before, graph),
    })),
  };
  return { ok: true, result, latencyMs: 100 };
}

const risks = (graph: ArchitectureGraph) =>
  lintGraph(graph).filter((finding) => finding.severity !== 'info').length;

describe('the evaluation set', () => {
  it('has at least 30 cases with unique ids, in both languages and for every task', () => {
    expect(EVAL_CASES.length).toBeGreaterThanOrEqual(30);
    expect(new Set(EVAL_CASES.map((evalCase) => evalCase.id)).size).toBe(EVAL_CASES.length);
    expect(new Set(EVAL_CASES.map((evalCase) => evalCase.locale))).toEqual(new Set(['es', 'en']));
    expect(new Set(EVAL_CASES.map((evalCase) => evalCase.task))).toEqual(
      new Set(['generate', 'edit', 'improve', 'simplify', 'extend']),
    );
  });

  it('gives the agent valid diagrams and requests', () => {
    for (const evalCase of EVAL_CASES) {
      if (evalCase.task !== 'generate')
        expect(validateGraph(evalCase.graph), evalCase.id).toEqual([]);
      expect(() => requestOf(evalCase), evalCase.id).not.toThrow();
    }
  });

  it('never requires what it forbids', () => {
    for (const { id, expect: expected } of EVAL_CASES) {
      const forbidden = new Set(expected.forbidden?.kinds ?? []);
      expect(expected.required?.filter((kind) => forbidden.has(kind)) ?? [], id).toEqual([]);
    }
  });

  it('asks to improve diagrams that have risks to fix, and leaves the templates alone', () => {
    const flawed = EVAL_CASES.filter(
      (evalCase) => evalCase.task === 'improve' && evalCase.expect.forbidden !== undefined,
    );
    expect(flawed.length).toBeGreaterThan(0);
    for (const evalCase of flawed) {
      if (evalCase.task !== 'generate')
        expect(risks(evalCase.graph), evalCase.id).toBeGreaterThan(0);
    }
    expect(risks(ARCHITECTURE_TEMPLATES['three-tier-web'])).toBe(0);
    expect(
      ARCHITECTURE_TEMPLATES['three-tier-web'].edges.some((edge) => edge.id === 'user-database'),
    ).toBe(false);
  });

  it('can be met in full: the ideal answers score full marks', async () => {
    const report = await runEvals({
      cases: EVAL_CASES,
      providerFor: idealProvider,
      model: 'ideal',
    });
    const { overall } = report.summary;
    expect(overall).toMatchObject({
      cases: EVAL_CASES.length,
      validRate: 1,
      goalRate: 1,
      typeF1: 1,
      connectionRecall: 1,
      forbiddenFound: 0,
      lintErrors: 0,
      idsKept: 1,
      attempts: 1,
    });
    expect(Object.keys(report.summary.byTask)).toHaveLength(5);
  });
});

describe('requestOf', () => {
  it('sends what the editor would, and refuses an edit without a prompt', () => {
    expect(requestOf({ ...generateCase({}), provider: 'aws' } as EvalCase)).toEqual({
      task: 'generate',
      locale: 'en',
      prompt: 'A system',
      provider: 'aws',
    });
    const graph = chain('service');
    expect(requestOf({ id: 'x', task: 'extend', locale: 'es', graph, expect: {} })).toEqual({
      task: 'extend',
      locale: 'es',
      graph,
    });
    expect(() => requestOf({ id: 'x', task: 'edit', locale: 'es', graph, expect: {} })).toThrow(
      'without a prompt',
    );
  });
});

describe('scoreTypes', () => {
  it('measures the kinds against what is required and allowed, with actors always allowed', () => {
    const evalCase = generateCase({ required: ['cdn', 'service', 'cache'], optional: ['dns'] });
    const score = scoreTypes(evalCase, chain('user', 'cdn', 'service', 'queue'));
    expect(score.missing).toEqual(['cache']);
    expect(score.unexpected).toEqual(['queue']);
    expect(score.precision).toBeCloseTo(3 / 4);
    expect(score.recall).toBeCloseTo(2 / 3);
    expect(score.f1).toBeCloseTo((2 * 0.75 * (2 / 3)) / (0.75 + 2 / 3));
  });

  it('on a diagram, counts against precision only the kinds the answer adds', () => {
    const before = chain('user', 'service', 'search-index');
    const evalCase = generateCase({ required: ['cache'] });
    expect(
      scoreTypes(evalCase, chain('user', 'service', 'search-index', 'cache'), before),
    ).toMatchObject({
      precision: 1,
      recall: 1,
      f1: 1,
    });
  });

  it('scores nothing brought and nothing required as full, and an empty answer to a request as none', () => {
    expect(scoreTypes(generateCase({}), createEmptyGraph('Empty')).f1).toBe(1);
    expect(
      scoreTypes(generateCase({ required: ['cdn'] }), createEmptyGraph('Empty')),
    ).toMatchObject({
      precision: 1,
      recall: 0,
    });
    expect(scoreTypes(generateCase({ required: ['cdn'] }), chain('queue')).f1).toBe(0);
  });
});

describe('missingConnections', () => {
  it('finds a pair through other components, in the direction of the connections only', () => {
    const graph = chain('user', 'cdn', 'load-balancer', 'service');
    expect(
      missingConnections(graph, [
        ['cdn', 'service'],
        ['user', 'cdn'],
      ]),
    ).toEqual([]);
    expect(
      missingConnections(graph, [
        ['service', 'cdn'],
        ['cdn', 'cache'],
      ]),
    ).toEqual([
      ['service', 'cdn'],
      ['cdn', 'cache'],
    ]);
  });

  it('does not loop on a cycle', () => {
    const graph = chain('service', 'queue', 'function');
    graph.edges.push({ id: 'back', source: 'function', target: 'service' });
    expect(
      missingConnections(graph, [
        ['queue', 'service'],
        ['service', 'cache'],
      ]),
    ).toEqual([['service', 'cache']]);
  });
});

describe('forbiddenFound', () => {
  it('reports forbidden kinds and forbidden pairs joined directly, not through others', () => {
    const evalCase = generateCase({
      forbidden: {
        kinds: ['vm', 'queue'],
        connections: [
          ['user', 'service'],
          ['user', 'relational-db'],
        ],
      },
    });
    expect(forbiddenFound(evalCase, chain('user', 'service', 'relational-db', 'vm'))).toEqual([
      'vm',
      'user>service',
    ]);
    expect(forbiddenFound(generateCase({}), chain('vm'))).toEqual([]);
  });
});

describe('idsKept', () => {
  it('is the share of components of known kinds that kept an id', () => {
    const before = chain('cdn', 'service');
    const after: ArchitectureGraph = {
      ...before,
      nodes: [
        { id: 'cdn', kind: 'cdn', label: 'CDN' },
        { id: 'renamed', kind: 'service', label: 'Service' },
        { id: 'cache', kind: 'cache', label: 'Cache' },
        { id: 'zone', kind: 'region', label: 'Zone' },
      ],
      edges: [],
    };
    expect(idsKept(before, after)).toBe(0.5);
    expect(idsKept(before, chain('cache'))).toBeNull();
  });
});

describe('scoreCase', () => {
  it('scores a failed case as invalid and missing its goal', () => {
    const score = scoreCase(generateCase({}), {
      ok: false,
      error: 'invalid-response',
      message: 'Never valid',
      latencyMs: 900,
    });
    expect(score).toEqual({
      id: 'case',
      task: 'generate',
      locale: 'en',
      valid: false,
      error: 'invalid-response',
      detail: 'Never valid',
      latencyMs: 900,
      warnings: [],
      goalMet: false,
    });
  });

  it('scores an answer without proposals as invalid', () => {
    expect(scoreCase(generateCase({}), answered([]))).toMatchObject({
      valid: false,
      error: 'no-proposal',
    });
  });

  it('measures a valid answer: kinds, connections, forbidden parts and design rules', () => {
    const evalCase = generateCase({
      required: ['service', 'relational-db'],
      connections: [['service', 'relational-db']],
      forbidden: { connections: [['user', 'relational-db']] },
    });
    const graph = chain('user', 'relational-db', 'service');
    const score = scoreCase(evalCase, answered([graph]));
    expect(score).toMatchObject({
      valid: true,
      attempts: 1,
      connectionRecall: 0,
      missingConnections: ['service>relational-db'],
      forbidden: ['user>relational-db'],
      goalMet: false,
    });
    expect(score.lint?.errors).toBeGreaterThan(0);
    expect(score).not.toHaveProperty('idsKept');
    expect(scoreCase(generateCase({}), answered([graph])).connectionRecall).toBeNull();
  });

  const onDiagram = (
    task: 'improve' | 'simplify' | 'extend',
    graph: ArchitectureGraph,
  ): EvalCase => ({
    id: task,
    task,
    locale: 'en',
    graph,
    expect: {},
  });

  it('meets the goal of improve when some proposal has fewer risks, or none when there were none', () => {
    const risky = chain('user', 'relational-db');
    const fixed = chain('user', 'cdn');
    expect(scoreCase(onDiagram('improve', risky), answered([risky, fixed], risky)).goalMet).toBe(
      true,
    );
    expect(scoreCase(onDiagram('improve', risky), answered([risky], risky)).goalMet).toBe(false);
    const sound = chain('cdn', 'service');
    expect(scoreCase(onDiagram('improve', sound), answered([sound], sound)).goalMet).toBe(true);
    expect(scoreCase(onDiagram('improve', sound), answered([risky], sound)).goalMet).toBe(false);
  });

  it('meets the goal of simplify with fewer components and of extend with more', () => {
    const two = chain('cdn', 'service');
    const three = chain('cdn', 'service', 'cache');
    expect(scoreCase(onDiagram('simplify', three), answered([two], three)).goalMet).toBe(true);
    expect(scoreCase(onDiagram('simplify', two), answered([three], two)).goalMet).toBe(false);
    expect(scoreCase(onDiagram('extend', two), answered([three], two))).toMatchObject({
      goalMet: true,
      idsKept: 1,
    });
    expect(scoreCase(onDiagram('extend', three), answered([two], three)).goalMet).toBe(false);
  });
});

describe('summarize', () => {
  it('rates over all the cases and averages quality over the valid ones', () => {
    const evalCase = generateCase({ required: ['cdn'] });
    const scores = [
      scoreCase(evalCase, answered([chain('cdn')])),
      scoreCase(evalCase, answered([chain('queue')])),
      scoreCase(evalCase, { ok: false, error: 'timeout', message: 'Slow', latencyMs: 60_000 }),
    ];
    const summary = summarize(scores);
    expect(summary).toMatchObject({
      cases: 3,
      validRate: 2 / 3,
      goalRate: 1 / 3,
      typeRecall: 0.5,
      connectionRecall: null,
      idsKept: null,
      attempts: 1,
      latencyMs: { p50: 100, p95: 60_000 },
    });
  });

  it('has no means for no cases', () => {
    expect(summarize([])).toMatchObject({ cases: 0, validRate: 1, typeF1: null, latencyMs: null });
  });
});

describe('runEvals', () => {
  const cases: EvalCase[] = [EVAL_CASES[0] as EvalCase, EVAL_CASES[1] as EvalCase];

  function failing(errors: Error[]): LlmProvider {
    let call = 0;
    return {
      name: 'failing',
      complete: (request) => {
        const error = errors[call++];
        return error === undefined
          ? idealProvider(cases[0] as EvalCase).complete(request)
          : Promise.reject(error);
      },
    };
  }

  it('waits out a rate limit and asks again, pausing between cases', async () => {
    const waits: number[] = [];
    const seen: string[] = [];
    let time = 0;
    const provider = failing([new LlmError('rate-limited', 'Spent', { retryAfter: 3 })]);
    const report = await runEvals({
      cases: [cases[0] as EvalCase, cases[0] as EvalCase],
      providerFor: () => provider,
      model: 'test',
      now: () => (time += 5),
      sleep: (ms) => {
        waits.push(ms);
        return Promise.resolve();
      },
      pauseMs: 1000,
      onCase: (score, index) => seen.push(`${index}:${score.id}`),
    });
    expect(waits).toEqual([3000, 1000]);
    expect(report.cases.map((score) => score.valid)).toEqual([true, true]);
    expect(seen).toEqual([`0:${cases[0]?.id}`, `1:${cases[0]?.id}`]);
    expect(report).toMatchObject({ model: 'test', startedAt: new Date(5).toISOString() });
  });

  it('gives up on a rate limit after the retries, or when the wait is too long', async () => {
    const limited = () => new LlmError('rate-limited', 'Spent');
    const sleep = () => Promise.resolve();
    const retried = await runEvals({
      cases: [cases[0] as EvalCase],
      providerFor: () => failing([limited(), limited()]),
      model: 'test',
      sleep,
      rateLimitRetries: 1,
    });
    expect(retried.cases[0]).toMatchObject({ valid: false, error: 'rate-limited' });
    const long = await runEvals({
      cases: [cases[0] as EvalCase],
      providerFor: () => failing([new LlmError('rate-limited', 'Spent', { retryAfter: 600 })]),
      model: 'test',
      sleep,
    });
    expect(long.cases[0]).toMatchObject({ valid: false, error: 'rate-limited' });
  });

  it('records other failures and carries on with the next case', async () => {
    const report = await runEvals({
      cases,
      providerFor: (evalCase) =>
        evalCase === cases[0] ? failing([new Error('Bug')]) : idealProvider(evalCase),
      model: 'test',
    });
    expect(report.cases.map((score) => [score.valid, score.error])).toEqual([
      [false, 'internal'],
      [true, undefined],
    ]);
    const timedOut = await runEvals({
      cases: [cases[0] as EvalCase],
      providerFor: () => failing([new LlmError('timeout', 'Slow')]),
      model: 'test',
    });
    expect(timedOut.cases[0]).toMatchObject({ error: 'timeout' });
  });
});

describe('idealOperations', () => {
  it('removes forbidden parts with their connections, adds what is required and connects it', () => {
    const graph = chain('user', 'vm', 'relational-db');
    graph.edges.push({ id: 'direct', source: 'user', target: 'relational-db' });
    const evalCase = generateCase({
      required: ['service'],
      connections: [['service', 'relational-db']],
      forbidden: { kinds: ['vm'], connections: [['user', 'relational-db']] },
    });
    expect(idealOperations(evalCase, graph)).toEqual([
      { op: 'removeNode', id: 'vm' },
      { op: 'removeEdge', id: 'direct' },
      { op: 'addNode', node: { id: 'service-ideal', kind: 'service', label: 'Service' } },
      {
        op: 'addEdge',
        edge: {
          id: 'service-ideal-relational-db-ideal',
          source: 'service-ideal',
          target: 'relational-db',
        },
      },
    ]);
  });
});

describe('toMarkdown', () => {
  it('has a row per group and says what went wrong in each case', async () => {
    const evalCase = generateCase({
      required: ['cdn'],
      connections: [['cdn', 'service']],
      forbidden: { kinds: ['vm'] },
    });
    const report = await runEvals({
      cases: [evalCase, { ...evalCase, id: 'broken', locale: 'es' }],
      providerFor: (current): LlmProvider =>
        current.id === 'broken'
          ? { name: 'x', complete: () => Promise.reject(new LlmError('timeout', 'Slow')) }
          : {
              name: 'x',
              complete: () =>
                Promise.resolve(
                  JSON.stringify({ title: 'T', rationale: '', graph: chain('queue', 'vm') }),
                ),
            },
      model: 'test-model',
    });
    const markdown = toMarkdown(report);
    expect(markdown).toContain('# Evaluación de test-model');
    expect(markdown).toMatch(/\| Todos \| 2 \| 50 % \| 0 % \|/);
    expect(markdown).toContain('| generate |');
    expect(markdown).toContain('| es |');
    expect(markdown).toContain(
      '- `case`: faltan cdn; sobran queue, vm; sin conexión cdn>service; prohibido vm; no cumple el objetivo.',
    );
    expect(markdown).toContain('- `broken`: sin respuesta válida (timeout).');
  });

  it('says when no case had problems', async () => {
    const report = await runEvals({
      cases: [EVAL_CASES[0] as EvalCase],
      providerFor: idealProvider,
      model: 'ideal',
    });
    expect(toMarkdown(report)).toContain('## Casos con problemas\n\nNinguno.');
  });
});
