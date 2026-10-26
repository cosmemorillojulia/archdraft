import { getNodeDefinition } from '../catalog.ts';
import { indexGraph, resolveEdgeMode } from '../graph.ts';
import { isContainerKind } from '../kinds.ts';
import type { ArchEdge, ArchitectureGraph, ArchNode } from '../schema.ts';
import { edgeText, nodeSubtitle } from './labels.ts';

/**
 * Exports a graph as a Mermaid `flowchart`, the format GitHub, GitLab and
 * most documentation tools render natively.
 *
 * Containers become nested `subgraph` blocks, the node shape follows the
 * category (cylinder for data, stadium for actors, rectangle otherwise, and
 * circle, rhombus or flag for those shapes) and
 * asynchronous edges are dashed. Edges are declared after every node and
 * subgraph because Mermaid moves a node into the subgraph where it is first
 * mentioned.
 */

export const MERMAID_DIRECTIONS = ['LR', 'TB', 'RL', 'BT'] as const;
export type MermaidDirection = (typeof MERMAID_DIRECTIONS)[number];

export interface MermaidOptions {
  /** Flow direction of the chart. Defaults to `LR`. */
  readonly direction?: MermaidDirection;
}

const INDENT = '  ';

/** Expects a structurally valid graph, see `parseArchitectureGraph`. */
export function toMermaid(graph: ArchitectureGraph, options: MermaidOptions = {}): string {
  const index = indexGraph(graph);
  const ids = mermaidIds(graph.nodes);
  const lines = [
    '---',
    // A JSON string is a valid YAML double-quoted scalar, so it needs no other escaping.
    `title: ${JSON.stringify(graph.title)}`,
    '---',
    `flowchart ${options.direction ?? 'LR'}`,
  ];

  const emit = (node: ArchNode, depth: number): void => {
    const indent = INDENT.repeat(depth);
    const id = idOf(ids, node.id);
    if (!isContainerKind(node.kind)) {
      lines.push(`${indent}${id}${nodeShape(node, graph)}`);
      return;
    }
    lines.push(`${indent}subgraph ${id} ["${escapeLabel(node.label)}"]`);
    for (const child of index.childrenOf.get(node.id) ?? []) emit(child, depth + 1);
    lines.push(`${indent}end`);
  };
  for (const root of index.roots) emit(root, 1);

  for (const edge of graph.edges) lines.push(`${INDENT}${edgeLine(edge, ids)}`);
  return lines.join('\n');
}

/**
 * Mermaid ids are derived from domain ids. Domain ids may contain `--`, which
 * Mermaid reads as part of an arrow, and may be keywords such as `end` or
 * `style`. Replacing `-` with `_` and adding a prefix avoids both; a numeric
 * suffix keeps ids unique when two domain ids map to the same text (`a-b` and
 * `a_b`).
 */
function mermaidIds(nodes: readonly ArchNode[]): ReadonlyMap<string, string> {
  const ids = new Map<string, string>();
  const used = new Set<string>();
  for (const { id } of nodes) {
    const base = `n_${id.replaceAll('-', '_')}`;
    let candidate = base;
    for (let suffix = 2; used.has(candidate); suffix++) candidate = `${base}_${suffix}`;
    ids.set(id, candidate);
    used.add(candidate);
  }
  return ids;
}

function idOf(ids: ReadonlyMap<string, string>, nodeId: string): string {
  const id = ids.get(nodeId);
  if (id === undefined) throw new Error(`Unknown node "${nodeId}"; validate the graph first`);
  return id;
}

function nodeShape(node: ArchNode, graph: ArchitectureGraph): string {
  const subtitle = nodeSubtitle(node, graph);
  // Mermaid rejects an empty label, so a shape without a name gets a space.
  const name = node.label === '' ? ' ' : escapeLabel(node.label);
  const label = subtitle === undefined ? name : `${name}<br/>${escapeLabel(subtitle)}`;
  switch (node.kind) {
    case 'circle':
      return `(("${label}"))`;
    case 'diamond':
      return `{"${label}"}`;
    case 'note':
      return `>"${label}"]`;
    default:
      break;
  }
  switch (getNodeDefinition(node.kind).category) {
    case 'data':
      return `[("${label}")]`;
    case 'actor':
      return `(["${label}"])`;
    default:
      return `["${label}"]`;
  }
}

function edgeLine(edge: ArchEdge, ids: ReadonlyMap<string, string>): string {
  const arrow = resolveEdgeMode(edge) === 'async' ? '-.->' : '-->';
  const text = edgeText(edge);
  const label = text === '' ? '' : `|"${escapeLabel(text)}"|`;
  return `${idOf(ids, edge.source)} ${arrow}${label} ${idOf(ids, edge.target)}`;
}

/**
 * Labels are written inside double quotes. Characters that would end the
 * string, start Mermaid entity, directive (`%%{...}%%`) or Markdown syntax,
 * close an edge label or be read as HTML are replaced with Mermaid entity codes (`#34;`), which render
 * as the literal character. Line breaks become `<br/>`.
 */
const ESCAPED_CHARACTERS = /["#%&<>`|]/g;

function escapeLabel(text: string): string {
  return text
    .replace(ESCAPED_CHARACTERS, (character) => `#${character.charCodeAt(0)};`)
    .replace(/\r\n|\r|\n/g, '<br/>');
}
