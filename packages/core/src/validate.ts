import type { z } from 'zod';
import { CONTAINMENT_RULES } from './catalog.ts';
import { type GraphIndex, indexGraph } from './graph.ts';
import { isContainerKind } from './kinds.ts';
import { type ArchitectureGraph, type ArchNode, ArchitectureGraphSchema } from './schema.ts';

/**
 * Structural validation: is this graph well formed?
 *
 * It answers "can the rest of the system trust this data", not "is this a
 * good architecture". Design advice belongs to the lint engine.
 * Errors make a graph unusable; warnings are tolerated but surfaced.
 */

export const VALIDATION_CODES = [
  'SCHEMA',
  'DUPLICATE_NODE_ID',
  'DUPLICATE_EDGE_ID',
  'EDGE_UNKNOWN_SOURCE',
  'EDGE_UNKNOWN_TARGET',
  'EDGE_SELF_LOOP',
  'EDGE_ENDPOINT_IS_CONTAINER',
  'DUPLICATE_EDGE',
  'PARENT_NOT_FOUND',
  'PARENT_NOT_CONTAINER',
  'PARENT_CYCLE',
  'INVALID_CONTAINMENT',
] as const;
export type ValidationCode = (typeof VALIDATION_CODES)[number];

export type IssueSeverity = 'error' | 'warning';

export interface ValidationIssue {
  readonly code: ValidationCode;
  readonly severity: IssueSeverity;
  readonly message: string;
  /** Location in the input document, for schema issues. */
  readonly path?: readonly PropertyKey[];
  readonly nodeIds?: readonly string[];
  readonly edgeId?: string;
}

export type ParseResult =
  | {
      readonly success: true;
      readonly graph: ArchitectureGraph;
      readonly warnings: ValidationIssue[];
    }
  | { readonly success: false; readonly issues: ValidationIssue[] };

type IssueDetails = Pick<ValidationIssue, 'nodeIds' | 'edgeId'>;

function error(code: ValidationCode, message: string, details: IssueDetails = {}): ValidationIssue {
  return { code, severity: 'error', message, ...details };
}

function warning(
  code: ValidationCode,
  message: string,
  details: IssueDetails = {},
): ValidationIssue {
  return { code, severity: 'warning', message, ...details };
}

export function validateGraph(graph: ArchitectureGraph): ValidationIssue[] {
  const index = indexGraph(graph);
  return [...checkNodeIds(graph), ...checkEdges(graph, index), ...checkPlacement(index)];
}

function checkNodeIds(graph: ArchitectureGraph): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const seen = new Set<string>();
  for (const { id } of graph.nodes) {
    if (seen.has(id)) {
      issues.push(
        error('DUPLICATE_NODE_ID', `Node id "${id}" is used more than once`, { nodeIds: [id] }),
      );
    }
    seen.add(id);
  }
  return issues;
}

function checkEdges(graph: ArchitectureGraph, index: GraphIndex): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const seenIds = new Set<string>();
  const seenConnections = new Set<string>();

  for (const edge of graph.edges) {
    const { id, source: sourceId, target: targetId } = edge;
    const at = { edgeId: id };

    if (seenIds.has(id)) {
      issues.push(error('DUPLICATE_EDGE_ID', `Edge id "${id}" is used more than once`, at));
    }
    seenIds.add(id);

    const source = index.nodesById.get(sourceId);
    const target = index.nodesById.get(targetId);
    if (!source) {
      issues.push(
        error('EDGE_UNKNOWN_SOURCE', `Edge "${id}" starts at unknown node "${sourceId}"`, at),
      );
    }
    if (!target) {
      issues.push(
        error('EDGE_UNKNOWN_TARGET', `Edge "${id}" ends at unknown node "${targetId}"`, at),
      );
    }
    if (sourceId === targetId) {
      issues.push(
        error('EDGE_SELF_LOOP', `Edge "${id}" connects "${sourceId}" to itself`, {
          ...at,
          nodeIds: [sourceId],
        }),
      );
    }
    for (const endpoint of new Set([source, target])) {
      if (endpoint && isContainerKind(endpoint.kind)) {
        issues.push(
          error(
            'EDGE_ENDPOINT_IS_CONTAINER',
            `Edge "${id}" touches container "${endpoint.id}"; connect the components inside it instead`,
            { ...at, nodeIds: [endpoint.id] },
          ),
        );
      }
    }

    const connection = JSON.stringify([sourceId, targetId, edge.protocol ?? null]);
    if (seenConnections.has(connection)) {
      issues.push(
        warning(
          'DUPLICATE_EDGE',
          `Edge "${id}" repeats an existing connection from "${sourceId}" to "${targetId}"`,
          at,
        ),
      );
    }
    seenConnections.add(connection);
  }
  return issues;
}

/** Checks that every node sits in a valid place of the container hierarchy. */
function checkPlacement(index: GraphIndex): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const reportedCycles = new Set<string>();

  for (const node of index.nodesById.values()) {
    if (node.parentId === undefined) {
      if (isContainerKind(node.kind) && !CONTAINMENT_RULES[node.kind].topLevel) {
        issues.push(
          error('INVALID_CONTAINMENT', `A ${node.kind} must be placed inside another container`, {
            nodeIds: [node.id],
          }),
        );
      }
      continue;
    }

    const parent = index.nodesById.get(node.parentId);
    if (!parent) {
      issues.push(
        error(
          'PARENT_NOT_FOUND',
          `Node "${node.id}" references unknown parent "${node.parentId}"`,
          {
            nodeIds: [node.id],
          },
        ),
      );
      continue;
    }
    if (!isContainerKind(parent.kind)) {
      issues.push(
        error(
          'PARENT_NOT_CONTAINER',
          `Node "${node.id}" is placed inside "${parent.id}", which is a ${parent.kind}, not a container`,
          { nodeIds: [node.id, parent.id] },
        ),
      );
      continue;
    }

    const cycle = findParentCycle(index, node.id);
    if (cycle) {
      const key = [...cycle].sort().join(',');
      if (!reportedCycles.has(key)) {
        reportedCycles.add(key);
        issues.push(
          error(
            'PARENT_CYCLE',
            `Containers nest inside each other in a loop: ${cycle.join(' → ')}`,
            {
              nodeIds: cycle,
            },
          ),
        );
      }
      continue;
    }

    if (isContainerKind(node.kind) && !CONTAINMENT_RULES[node.kind].parents.includes(parent.kind)) {
      issues.push(
        error(
          'INVALID_CONTAINMENT',
          `A ${node.kind} cannot be placed inside a ${parent.kind} ("${node.id}" in "${parent.id}")`,
          { nodeIds: [node.id, parent.id] },
        ),
      );
    }
  }
  return issues;
}

/** Ids forming a parent loop reachable from `startId`, if any. */
function findParentCycle(index: GraphIndex, startId: string): string[] | undefined {
  const path: string[] = [];
  const positions = new Map<string, number>();
  let current: ArchNode | undefined = index.nodesById.get(startId);
  while (current) {
    const seenAt = positions.get(current.id);
    if (seenAt !== undefined) return path.slice(seenAt);
    positions.set(current.id, path.length);
    path.push(current.id);
    current = current.parentId === undefined ? undefined : index.nodesById.get(current.parentId);
  }
  return undefined;
}

function fromZodIssues(issues: readonly z.core.$ZodIssue[]): ValidationIssue[] {
  return issues.map((issue) => {
    const location = issue.path.map(String).join('.');
    return {
      code: 'SCHEMA',
      severity: 'error',
      message: location ? `${location}: ${issue.message}` : issue.message,
      path: issue.path,
    };
  });
}

/**
 * Entry point for untrusted input (files, URLs, LLM output): schema check
 * first, then structural validation. Never throws.
 */
export function parseArchitectureGraph(input: unknown): ParseResult {
  const parsed = ArchitectureGraphSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, issues: fromZodIssues(parsed.error.issues) };
  }
  const issues = validateGraph(parsed.data);
  if (issues.some((issue) => issue.severity === 'error')) return { success: false, issues };
  return { success: true, graph: parsed.data, warnings: issues };
}
