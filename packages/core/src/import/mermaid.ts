import { createEmptyLayout, type DiagramDocument } from '../document.ts';
import { createEmptyGraph, LIMITS, type ArchEdge, type ArchNode } from '../schema.ts';
import { type ParseResult, parseArchitectureGraph } from '../validate.ts';
import { cleanLabel, freshId } from './shared.ts';

/** The result of reading a diagram written for another tool. */
export type ImportResult =
  | {
      readonly success: true;
      readonly document: DiagramDocument;
      /** Whether the file placed the boxes; when it did not, they are laid out afterwards. */
      readonly placed: boolean;
      readonly warnings: readonly string[];
    }
  | { readonly success: false; readonly message: string };

type Shape = 'box' | 'circle' | 'diamond' | 'note';

/** Opening and closing marks of each shape of a Mermaid node, longest first. */
const SHAPES: readonly { open: string; close: string; shape: Shape }[] = [
  { open: '(((', close: ')))', shape: 'circle' },
  { open: '((', close: '))', shape: 'circle' },
  { open: '([', close: '])', shape: 'box' },
  { open: '[(', close: ')]', shape: 'box' },
  { open: '[[', close: ']]', shape: 'box' },
  { open: '{{', close: '}}', shape: 'box' },
  { open: '[/', close: '/]', shape: 'box' },
  { open: '[\\', close: '\\]', shape: 'box' },
  { open: '[/', close: '\\]', shape: 'box' },
  { open: '[\\', close: '/]', shape: 'box' },
  { open: '(', close: ')', shape: 'box' },
  { open: '[', close: ']', shape: 'box' },
  { open: '{', close: '}', shape: 'diamond' },
  { open: '>', close: ']', shape: 'note' },
];

const NODE_ID = /^[\wÀ-￿]+(?:-(?![->.=])[\wÀ-￿]+)*/;
const ARROW = /^\s*<?(-{2,}[>xo]?|-\.+-?>?|={2,}>?|~~~)/;
const LABELLED_ARROW = /^\s*(--|-\.|==)\s+(.+?)\s+(-{2,}[>xo]?|\.-+>?|={2,}>?)(?=\s|$|[\w"'[({>])/;
const IGNORED = /^(direction|classDef|class|style|linkStyle|click|accTitle|accDescr|%%)\b|^%%/;

/** Mermaid writes special characters as `#34;`; `<br/>` is a line break. */
function readLabel(text: string): string {
  return cleanLabel(
    text
      .replace(/#quot;/g, '"')
      .replace(/#lt;/g, '<')
      .replace(/#gt;/g, '>')
      .replace(/#amp;/g, '&')
      .replace(/#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code))),
  );
}

interface Reference {
  readonly id: string;
  readonly label: string | undefined;
  readonly shape: Shape | undefined;
}

/** Reads a node at the start of `text`: its id and, if it has one, its shape and text. */
function readNode(text: string): { reference: Reference; rest: string } | undefined {
  const id = NODE_ID.exec(text)?.[0];
  if (id === undefined) return undefined;
  let rest = text.slice(id.length);
  let label: string | undefined;
  let shape: Shape | undefined;
  const mark = SHAPES.find(({ open }) => rest.startsWith(open));
  if (mark) {
    const inner = rest.slice(mark.open.length);
    let raw: string | undefined;
    let after = '';
    if (inner.startsWith('"')) {
      const end = inner.indexOf('"', 1);
      if (end > 0) {
        raw = inner.slice(1, end);
        const tail = inner.slice(end + 1);
        const close = SHAPES.filter(({ open }) => open === mark.open).find(({ close }) =>
          tail.trimStart().startsWith(close),
        );
        if (close) after = tail.trimStart().slice(close.close.length);
        else raw = undefined;
      }
    } else {
      const closers = SHAPES.filter(({ open }) => open === mark.open).map(({ close }) => close);
      const found = closers
        .map((close) => ({ close, at: inner.indexOf(close) }))
        .filter(({ at }) => at >= 0)
        .sort((a, b) => a.at - b.at)[0];
      if (found) {
        raw = inner.slice(0, found.at);
        after = inner.slice(found.at + found.close.length);
      }
    }
    if (raw !== undefined) {
      label = readLabel(raw);
      shape = mark.shape;
      rest = after;
    }
  }
  rest = rest.replace(/^:::[\w-]+/, '');
  return { reference: { id, label, shape }, rest };
}

/** Reads `A & B` at the start of `text`. */
function readGroup(text: string): { group: Reference[]; rest: string } | undefined {
  const group: Reference[] = [];
  let rest = text.trimStart();
  for (;;) {
    const read = readNode(rest);
    if (!read) return group.length === 0 ? undefined : { group, rest };
    group.push(read.reference);
    rest = read.rest;
    const joined = /^\s*&\s*/.exec(rest);
    if (!joined) return { group, rest };
    rest = rest.slice(joined[0].length);
  }
}

interface ArrowInfo {
  readonly dashed: boolean;
  readonly label: string | undefined;
  readonly rest: string;
}

function readArrow(text: string): ArrowInfo | undefined {
  const labelled = LABELLED_ARROW.exec(text);
  if (labelled) {
    return {
      dashed: labelled[1] === '-.',
      label: readLabel(labelled[2] ?? ''),
      rest: text.slice(labelled[0].length),
    };
  }
  const plain = ARROW.exec(text);
  if (!plain) return undefined;
  let rest = text.slice(plain[0].length);
  let label: string | undefined;
  const piped = /^\s*\|([^|]*)\|/.exec(rest);
  if (piped) {
    label = readLabel(piped[1] ?? '');
    rest = rest.slice(piped[0].length);
  }
  return { dashed: (plain[1] ?? '').includes('.'), label, rest };
}

/**
 * Reads a Mermaid flowchart (`flowchart` or `graph`) as a diagram: boxes,
 * circles, diamonds and notes by the shape of each node, `subgraph`s as
 * groups, labelled arrows and dashed arrows as asynchronous. Styles, links
 * and other diagram types are left out. Positions are not part of Mermaid,
 * so the diagram comes without a layout.
 */
export function importMermaid(text: string): ImportResult {
  const front = /^\s*---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(text);
  const title = front ? /^\s*title:\s*(.+)$/m.exec(front[1] ?? '')?.[1]?.trim() : undefined;
  const lines = (front ? text.slice(front[0].length) : text)
    .split(/\r?\n|;/)
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('%%'));
  const header = /^(flowchart|graph)\b/i.exec(lines[0] ?? '');
  if (!header) return { success: false, message: 'Only Mermaid flowcharts can be imported.' };

  const warnings: string[] = [];
  const nodes: ArchNode[] = [];
  const edges: ArchEdge[] = [];
  const ids = new Map<string, string>();
  const taken = new Set<string>();
  const containers = new Set<string>();
  const open: string[] = [];
  let skipped = 0;

  const add = (reference: Reference, kind: ArchNode['kind'], container = false): string => {
    const known = ids.get(reference.id);
    const parentId = open.at(-1);
    if (known !== undefined) {
      const node = nodes.find((candidate) => candidate.id === known) as ArchNode;
      const index = nodes.indexOf(node);
      let next = node;
      if (reference.label !== undefined && !container) {
        next = { ...next, label: reference.label, kind: reference.shape ?? next.kind };
      }
      if (next.parentId === undefined && parentId !== undefined && known !== parentId) {
        next = { ...next, parentId };
      }
      nodes[index] = next;
      return known;
    }
    const id = freshId(reference.id, taken);
    taken.add(id);
    ids.set(reference.id, id);
    if (container) containers.add(id);
    nodes.push({
      id,
      kind: reference.shape ?? kind,
      label: reference.label ?? reference.id.slice(0, LIMITS.labelLength),
      ...(parentId === undefined ? {} : { parentId }),
    });
    return id;
  };

  const connect = (sources: readonly string[], targets: readonly string[], arrow: ArrowInfo) => {
    for (const source of sources) {
      for (const target of targets) {
        if (
          source === target ||
          containers.has(source) ||
          containers.has(target) ||
          edges.some((edge) => edge.source === source && edge.target === target)
        ) {
          skipped++;
          continue;
        }
        const edgeId = freshId(
          `${source}-${target}`,
          new Set(edges.map((edge) => edge.id)),
          'edge',
        );
        edges.push({
          id: edgeId,
          source,
          target,
          ...(arrow.label ? { label: arrow.label } : {}),
          ...(arrow.dashed ? { mode: 'async' as const } : {}),
        });
      }
    }
  };

  for (const line of lines.slice(1)) {
    if (IGNORED.test(line)) continue;
    const group = /^subgraph\s+(.*)$/.exec(line);
    if (group) {
      const rest = (group[1] ?? '').trim();
      const read = /^([\wÀ-￿-]+)\s*\[\s*"?(.*?)"?\s*\]$/.exec(rest);
      const quoted = /^"(.*)"$/.exec(rest);
      const reference: Reference = read
        ? { id: read[1] as string, label: readLabel(read[2] ?? ''), shape: undefined }
        : { id: quoted?.[1] ?? rest, label: readLabel(quoted?.[1] ?? rest), shape: undefined };
      const id = add(reference, 'boundary', true);
      open.push(id);
      continue;
    }
    if (line === 'end') {
      open.pop();
      continue;
    }

    const read = readGroup(line);
    if (!read) {
      warnings.push(`Line left out: ${line.slice(0, 60)}`);
      continue;
    }
    let sources = read.group.map((reference) => add(reference, 'box'));
    let rest = read.rest;
    for (;;) {
      const arrow = readArrow(rest);
      if (!arrow) break;
      const next = readGroup(arrow.rest);
      if (!next) break;
      const targets = next.group.map((reference) => add(reference, 'box'));
      connect(sources, targets, arrow);
      sources = targets;
      rest = next.rest;
    }
    if (rest.trim() !== '') warnings.push(`Line partly read: ${line.slice(0, 60)}`);
  }

  if (nodes.length === 0) return { success: false, message: 'The flowchart has no nodes.' };
  if (nodes.length > LIMITS.maxNodes || edges.length > LIMITS.maxEdges) {
    return { success: false, message: 'The flowchart is larger than Archdraft allows.' };
  }
  if (skipped > 0) warnings.push(`${skipped} connections were left out (repeated or to a group).`);

  // Groups that hold no one are plain boxes, since an empty group has no use.
  const used = new Set(
    nodes.flatMap((node) => (node.parentId === undefined ? [] : [node.parentId])),
  );
  const fixed = nodes.map((node) =>
    containers.has(node.id) && !used.has(node.id) ? { ...node, kind: 'box' as const } : node,
  );

  const base = createEmptyGraph(
    title && title !== '' ? title.slice(0, LIMITS.titleLength) : 'Imported diagram',
  );
  const parsed: ParseResult = parseArchitectureGraph({ ...base, nodes: fixed, edges });
  if (!parsed.success) {
    return { success: false, message: parsed.issues[0]?.message ?? 'The flowchart is not valid.' };
  }
  return {
    success: true,
    document: { graph: parsed.graph, layout: createEmptyLayout() },
    placed: false,
    warnings,
  };
}
