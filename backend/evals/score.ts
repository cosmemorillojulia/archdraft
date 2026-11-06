import {
  type ArchitectureGraph,
  type AssistResult,
  type AssistTask,
  type AssistWarning,
  type ComponentKind,
  getNodeDefinition,
  isContainerKind,
  isShapeKind,
  lintGraph,
  type NodeKind,
} from '@archdraft/shared';
import type { EvalCase, KindPair } from './case.ts';

/** What happened when the agent was asked a case. */
export type Outcome =
  | { readonly ok: true; readonly result: AssistResult; readonly latencyMs: number }
  | {
      readonly ok: false;
      /** The kind of `LlmError`, or `internal` for anything else. */
      readonly error: string;
      readonly message: string;
      readonly latencyMs: number;
    };

export interface TypeScore {
  readonly precision: number;
  readonly recall: number;
  readonly f1: number;
  readonly missing: readonly ComponentKind[];
  readonly unexpected: readonly NodeKind[];
}

/** The measures of one case (docs/evaluacion.md). The quality ones only for a valid answer. */
export interface CaseScore {
  readonly id: string;
  readonly task: AssistTask;
  readonly locale: string;
  readonly valid: boolean;
  readonly error?: string;
  /** What failed, in the words of the agent or the provider. */
  readonly detail?: string;
  readonly attempts?: number;
  readonly latencyMs: number;
  readonly warnings: readonly AssistWarning[];
  readonly types?: TypeScore;
  /** Required connections found; null when the case requires none. */
  readonly connectionRecall?: number | null;
  readonly missingConnections?: readonly string[];
  /** Forbidden kinds and direct connections the design has. */
  readonly forbidden?: readonly string[];
  readonly lint?: { readonly errors: number; readonly warnings: number };
  /** Of the components of a kind the diagram had, the share that kept an id of the diagram. */
  readonly idsKept?: number | null;
  /** Whether the answer does what the task is for; false for an answer that is not valid. */
  readonly goalMet: boolean;
}

/** Nodes that are parts of the architecture, not groups or drawings. */
function components(graph: ArchitectureGraph) {
  return graph.nodes.filter((node) => !isContainerKind(node.kind) && !isShapeKind(node.kind));
}

function kindsOf(graph: ArchitectureGraph): Set<NodeKind> {
  return new Set(components(graph).map((node) => node.kind));
}

const isActor = (kind: NodeKind) => getNodeDefinition(kind).category === 'actor';

const ratio = (found: number, total: number) => (total === 0 ? 1 : found / total);

const pairName = ([source, target]: KindPair) => `${source}>${target}`;

/**
 * Precision counts the kinds the answer brings that the case does not expect; on a diagram, only
 * the kinds it adds, since what was there is not the answer's. Recall counts the required kinds
 * it has. Actors are always allowed.
 */
export function scoreTypes(
  evalCase: EvalCase,
  graph: ArchitectureGraph,
  before?: ArchitectureGraph,
): TypeScore {
  const { required = [], optional = [] } = evalCase.expect;
  const kinds = kindsOf(graph);
  const had = before === undefined ? new Set<NodeKind>() : kindsOf(before);
  const allowed = new Set<NodeKind>([...required, ...optional]);
  const brought = [...kinds].filter((kind) => !had.has(kind));
  const unexpected = brought.filter((kind) => !allowed.has(kind) && !isActor(kind));
  const missing = required.filter((kind) => !kinds.has(kind));
  const precision = ratio(brought.length - unexpected.length, brought.length);
  const recall = ratio(required.length - missing.length, required.length);
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  return { precision, recall, f1, missing, unexpected };
}

/** Pairs with no path of connections from a component of the first kind to one of the second. */
export function missingConnections(
  graph: ArchitectureGraph,
  pairs: readonly KindPair[],
): KindPair[] {
  const kindOf = new Map(graph.nodes.map((node) => [node.id, node.kind]));
  const next = new Map<string, string[]>();
  for (const edge of graph.edges)
    next.set(edge.source, [...(next.get(edge.source) ?? []), edge.target]);

  /** Kinds reachable from `start` through one connection or more. */
  const reachableKinds = (start: string): Set<NodeKind> => {
    const seen = new Set<string>();
    const pending = [...(next.get(start) ?? [])];
    for (let id = pending.pop(); id !== undefined; id = pending.pop()) {
      if (seen.has(id)) continue;
      seen.add(id);
      pending.push(...(next.get(id) ?? []));
    }
    return new Set([...seen].flatMap((id) => kindOf.get(id) ?? []));
  };
  const reach = new Map<NodeKind, Set<NodeKind>>();
  for (const node of graph.nodes) {
    const kinds = reach.get(node.kind) ?? new Set();
    for (const kind of reachableKinds(node.id)) kinds.add(kind);
    reach.set(node.kind, kinds);
  }
  return pairs.filter(([source, target]) => reach.get(source)?.has(target) !== true);
}

/** Forbidden kinds present and forbidden pairs joined by a direct connection. */
export function forbiddenFound(evalCase: EvalCase, graph: ArchitectureGraph): string[] {
  const { kinds = [], connections = [] } = evalCase.expect.forbidden ?? {};
  const present = kindsOf(graph);
  const kindOf = new Map(graph.nodes.map((node) => [node.id, node.kind]));
  const direct = new Set(
    graph.edges.map((edge) => `${kindOf.get(edge.source)}>${kindOf.get(edge.target)}`),
  );
  return [
    ...kinds.filter((kind) => present.has(kind)),
    ...connections.map(pairName).filter((pair) => direct.has(pair)),
  ];
}

/** Findings of the design rules worth fixing: errors and warnings, not missing information. */
function riskCount(graph: ArchitectureGraph): number {
  return lintGraph(graph).filter((finding) => finding.severity !== 'info').length;
}

/** Of the components of a kind `before` had, the share that kept an id of `before`. */
export function idsKept(before: ArchitectureGraph, after: ArchitectureGraph): number | null {
  const ids = new Set(before.nodes.map((node) => node.id));
  const kinds = kindsOf(before);
  const comparable = components(after).filter((node) => kinds.has(node.kind));
  if (comparable.length === 0) return null;
  return comparable.filter((node) => ids.has(node.id)).length / comparable.length;
}

/**
 * Whether the answer does what its task is for. Creating and editing: everything required,
 * nothing forbidden. Improving: a diagram with risks has fewer with some proposal, one without
 * gets none from any. Simplifying: fewer components; completing: more; both keeping what is
 * required and leaving out what is forbidden.
 */
function goalMet(
  evalCase: EvalCase,
  first: ArchitectureGraph,
  graphs: readonly ArchitectureGraph[],
  expectationsMet: boolean,
): boolean {
  const count = (graph: ArchitectureGraph) => components(graph).length;
  const after = count(first);
  switch (evalCase.task) {
    case 'generate':
    case 'edit':
      return expectationsMet;
    case 'improve': {
      const risks = riskCount(evalCase.graph);
      return risks > 0
        ? graphs.some((graph) => riskCount(graph) < risks)
        : graphs.every((graph) => riskCount(graph) === 0);
    }
    case 'simplify':
      return expectationsMet && after < count(evalCase.graph);
    case 'extend':
      return expectationsMet && after > count(evalCase.graph);
  }
}

/**
 * The score of one case. Pure: the same case and outcome always give the same score. An answer
 * with several proposals is measured on the first; the goal of `improve` looks at all of them.
 */
export function scoreCase(evalCase: EvalCase, outcome: Outcome): CaseScore {
  const head = { id: evalCase.id, task: evalCase.task, locale: evalCase.locale };
  if (!outcome.ok) {
    return {
      ...head,
      valid: false,
      error: outcome.error,
      detail: outcome.message,
      latencyMs: outcome.latencyMs,
      warnings: [],
      goalMet: false,
    };
  }
  const { result, latencyMs } = outcome;
  const before = evalCase.task === 'generate' ? undefined : evalCase.graph;
  const graph = result.proposals[0]?.graph;
  if (graph === undefined) {
    return { ...head, valid: false, error: 'no-proposal', latencyMs, warnings: [], goalMet: false };
  }
  const types = scoreTypes(evalCase, graph, before);
  const pairs = evalCase.expect.connections ?? [];
  const missing = missingConnections(graph, pairs);
  const forbidden = forbiddenFound(evalCase, graph);
  const findings = lintGraph(graph);
  const expectationsMet =
    types.missing.length === 0 && missing.length === 0 && forbidden.length === 0;
  return {
    ...head,
    valid: true,
    attempts: result.attempts,
    latencyMs,
    warnings: result.warnings,
    types,
    connectionRecall:
      pairs.length === 0 ? null : ratio(pairs.length - missing.length, pairs.length),
    missingConnections: missing.map(pairName),
    forbidden,
    lint: {
      errors: findings.filter((finding) => finding.severity === 'error').length,
      warnings: findings.filter((finding) => finding.severity === 'warning').length,
    },
    ...(before === undefined ? {} : { idsKept: idsKept(before, graph) }),
    goalMet: goalMet(
      evalCase,
      graph,
      result.proposals.map((proposal) => proposal.graph),
      expectationsMet,
    ),
  };
}

/** Totals and means of a group of cases. Quality means are over the valid answers only. */
export interface Summary {
  readonly cases: number;
  readonly validRate: number;
  readonly goalRate: number;
  readonly typePrecision: number | null;
  readonly typeRecall: number | null;
  readonly typeF1: number | null;
  readonly connectionRecall: number | null;
  readonly forbiddenFound: number;
  readonly lintErrors: number | null;
  readonly lintWarnings: number | null;
  readonly idsKept: number | null;
  readonly attempts: number | null;
  readonly latencyMs: { readonly mean: number; readonly p50: number; readonly p95: number } | null;
}

function mean(values: readonly (number | null | undefined)[]): number | null {
  const known = values.filter((value): value is number => typeof value === 'number');
  return known.length === 0 ? null : known.reduce((sum, value) => sum + value, 0) / known.length;
}

/** The value below which `share` of the sorted values fall, by the nearest rank. */
function percentile(sorted: readonly number[], share: number): number {
  return sorted[Math.max(Math.ceil(share * sorted.length) - 1, 0)] ?? 0;
}

export function summarize(scores: readonly CaseScore[]): Summary {
  const valid = scores.filter((score) => score.valid);
  const latencies = scores.map((score) => score.latencyMs).sort((a, b) => a - b);
  return {
    cases: scores.length,
    validRate: ratio(valid.length, scores.length),
    goalRate: ratio(scores.filter((score) => score.goalMet).length, scores.length),
    typePrecision: mean(valid.map((score) => score.types?.precision)),
    typeRecall: mean(valid.map((score) => score.types?.recall)),
    typeF1: mean(valid.map((score) => score.types?.f1)),
    connectionRecall: mean(valid.map((score) => score.connectionRecall)),
    forbiddenFound: valid.reduce((sum, score) => sum + (score.forbidden?.length ?? 0), 0),
    lintErrors: mean(valid.map((score) => score.lint?.errors)),
    lintWarnings: mean(valid.map((score) => score.lint?.warnings)),
    idsKept: mean(valid.map((score) => score.idsKept)),
    attempts: mean(valid.map((score) => score.attempts)),
    latencyMs:
      latencies.length === 0
        ? null
        : {
            mean: mean(latencies) ?? 0,
            p50: percentile(latencies, 0.5),
            p95: percentile(latencies, 0.95),
          },
  };
}

/** Summaries of all the cases, of each task and of each language, in a stable order. */
export function summarizeAll(scores: readonly CaseScore[]) {
  const groups = (key: (score: CaseScore) => string) => {
    const keys = [...new Set(scores.map(key))].sort();
    return Object.fromEntries(
      keys.map((name) => [name, summarize(scores.filter((score) => key(score) === name))]),
    );
  };
  return {
    overall: summarize(scores),
    byTask: groups((score) => score.task),
    byLocale: groups((score) => score.locale),
  };
}
