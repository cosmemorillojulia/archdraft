import {
  applyPatch,
  type ArchitectureGraph,
  createEmptyGraph,
  getNodeDefinition,
  type GraphOperation,
  type NodeKind,
} from '@archdraft/shared';
import type { LlmProvider } from '../src/llm/provider.ts';
import type { EvalCase } from './case.ts';
import { missingConnections } from './score.ts';

/**
 * The edits that meet the expectations of a case on `graph`: remove what is forbidden, add a
 * component of each required kind it lacks, and connect each required pair that has no path.
 */
export function idealOperations(evalCase: EvalCase, graph: ArchitectureGraph): GraphOperation[] {
  const { required = [], connections = [], forbidden = {} } = evalCase.expect;
  const operations: GraphOperation[] = [];
  const kindOf = new Map(graph.nodes.map((node) => [node.id, node.kind]));
  const banned = new Set<NodeKind>(forbidden.kinds ?? []);
  const bannedPairs = new Set((forbidden.connections ?? []).map(([a, b]) => `${a}>${b}`));

  for (const node of graph.nodes) {
    if (banned.has(node.kind)) operations.push({ op: 'removeNode', id: node.id });
  }
  const goes = (id: string) => {
    const kind = kindOf.get(id);
    return kind !== undefined && banned.has(kind);
  };
  for (const edge of graph.edges) {
    // The connections of a node that goes, go with it.
    if (goes(edge.source) || goes(edge.target)) continue;
    if (bannedPairs.has(`${kindOf.get(edge.source)}>${kindOf.get(edge.target)}`)) {
      operations.push({ op: 'removeEdge', id: edge.id });
    }
  }

  const kept = graph.nodes.filter((node) => !banned.has(node.kind));
  const first = new Map<NodeKind, string>();
  for (const node of kept) if (!first.has(node.kind)) first.set(node.kind, node.id);
  const idFor = (kind: NodeKind): string => {
    const known = first.get(kind);
    if (known !== undefined) return known;
    const id = `${kind}-ideal`;
    const category = getNodeDefinition(kind).category;
    operations.push({
      op: 'addNode',
      node: {
        id,
        kind,
        label: getNodeDefinition(kind).label,
        // The rules ask stores to say they are encrypted; the ideal design does.
        ...(category === 'data' ? { attributes: { encryptedAtRest: true } } : {}),
      },
    });
    first.set(kind, id);
    return id;
  };
  for (const kind of required) idFor(kind);

  const current = applyPatch(graph, operations);
  const missing = missingConnections(current.success ? current.graph : graph, connections);
  for (const [source, target] of missing) {
    const from = idFor(source);
    const to = idFor(target);
    operations.push({
      op: 'addEdge',
      edge: { id: `${from}-${to}-ideal`, source: from, target: to },
    });
  }
  return operations;
}

/** `graph` with the ideal edits of the case applied; throws if they are not valid. */
function idealGraph(evalCase: EvalCase, graph: ArchitectureGraph): ArchitectureGraph {
  const result = applyPatch(graph, idealOperations(evalCase, graph));
  if (!result.success) {
    throw new Error(
      `The ideal answer to ${evalCase.id} is not valid: ${result.issues[0]?.message}`,
    );
  }
  return result.graph;
}

/**
 * A fake model that always gives the ideal answer to `evalCase`, as JSON in the format of its
 * task. With it the whole bench runs without a model and should score full marks, which checks
 * the cases, the scoring and the runner together.
 */
export function idealProvider(evalCase: EvalCase): LlmProvider {
  const titled = {
    title: `Ideal ${evalCase.id}`,
    rationale: 'Meets the expectations of the case.',
  };
  const answer = (): object => {
    if (evalCase.task === 'generate') {
      const empty = createEmptyGraph(evalCase.id, evalCase.provider ?? 'generic');
      return { ...titled, graph: idealGraph(evalCase, empty) };
    }
    const { graph } = evalCase;
    switch (evalCase.task) {
      case 'edit':
        return { ...titled, operations: idealOperations(evalCase, graph) };
      case 'improve':
        return { proposals: [{ ...titled, operations: idealOperations(evalCase, graph) }] };
      case 'simplify':
      case 'extend':
        return { ...titled, graph: idealGraph(evalCase, graph) };
    }
  };
  return { name: 'ideal', complete: () => Promise.resolve(JSON.stringify(answer())) };
}
