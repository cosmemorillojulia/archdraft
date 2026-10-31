import { createEmptyLayout, type DiagramDocument, type DiagramLayout } from '../document.ts';
import { createEmptyGraph, LIMITS, type ArchEdge, type ArchNode } from '../schema.ts';
import { parseArchitectureGraph } from '../validate.ts';
import type { ImportResult } from './mermaid.ts';
import { cleanLabel, freshId } from './shared.ts';

interface Tag {
  readonly name: string;
  readonly attributes: Readonly<Record<string, string>>;
  readonly closing: boolean;
  readonly selfClosing: boolean;
  /** Text after the tag up to the next one. */
  readonly text: string;
}

const ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

function decode(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (whole, code: string) => {
    if (code.startsWith('#x') || code.startsWith('#X')) {
      return String.fromCodePoint(parseInt(code.slice(2), 16));
    }
    if (code.startsWith('#')) return String.fromCodePoint(Number(code.slice(1)));
    return ENTITIES[code] ?? whole;
  });
}

/** The tags of an XML text, in order. Enough for draw.io files, which are flat and have no scripts. */
function tagsOf(xml: string): Tag[] {
  const tags: Tag[] = [];
  const pattern = /<(\/?)([\w:.-]+)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>([^<]*)/g;
  for (const match of xml.matchAll(pattern)) {
    const attributes: Record<string, string> = {};
    for (const attribute of (match[3] ?? '').matchAll(
      /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g,
    )) {
      attributes[attribute[1] as string] = decode(attribute[2] ?? attribute[3] ?? '');
    }
    tags.push({
      name: match[2] as string,
      attributes,
      closing: match[1] === '/',
      selfClosing: match[4] === '/',
      text: match[5] ?? '',
    });
  }
  return tags;
}

/** The model of a draw.io page is stored as deflated, base64 and URL-encoded text. */
async function inflate(encoded: string): Promise<string> {
  const binary = atob(encoded.replace(/\s+/g, ''));
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return decodeURIComponent(await new Response(stream).text());
}

interface Cell {
  readonly id: string;
  readonly parent: string | undefined;
  readonly value: string;
  readonly style: string;
  readonly vertex: boolean;
  readonly edge: boolean;
  readonly source: string | undefined;
  readonly target: string | undefined;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** The cells of the first page of a draw.io file. */
async function cellsOf(xml: string): Promise<Cell[] | undefined> {
  let model = xml;
  const page = tagsOf(xml).find((tag) => tag.name === 'diagram' && !tag.closing);
  // A page holds either its model as XML, or the same model compressed.
  const body = page?.text.trim() ?? '';
  if (body !== '') model = await inflate(body);
  const cells: Cell[] = [];
  let wrapper: Record<string, string> | undefined;
  let current: { attributes: Record<string, string>; box: Record<string, string> } | undefined;
  const flush = () => {
    if (!current) return;
    const a = current.attributes;
    const number = (value: string | undefined) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : 0;
    };
    cells.push({
      id: a.id ?? '',
      parent: a.parent,
      value: wrapper?.label ?? a.value ?? '',
      style: a.style ?? '',
      vertex: a.vertex === '1',
      edge: a.edge === '1',
      source: a.source,
      target: a.target,
      x: number(current.box.x),
      y: number(current.box.y),
      width: number(current.box.width),
      height: number(current.box.height),
    });
    current = undefined;
  };
  for (const tag of tagsOf(model)) {
    if (tag.name === 'object' || tag.name === 'UserObject') {
      wrapper = tag.closing ? undefined : tag.attributes;
      continue;
    }
    if (tag.name === 'mxCell' && !tag.closing) {
      flush();
      const attributes = { ...tag.attributes };
      if (wrapper?.id !== undefined) attributes.id = wrapper.id;
      current = { attributes, box: {} };
      if (tag.selfClosing) flush();
    } else if (tag.name === 'mxCell' && tag.closing) {
      flush();
    } else if (
      tag.name === 'mxGeometry' &&
      !tag.closing &&
      current &&
      tag.attributes.as === 'geometry'
    ) {
      current.box = tag.attributes;
    }
  }
  flush();
  return cells.length > 0 ? cells : undefined;
}

function kindOf(cell: Cell, holds: boolean): ArchNode['kind'] {
  const style = cell.style;
  if (holds) return 'boundary';
  if (/(^|;)text(;|$)/.test(style) && /strokeColor=none/.test(style)) return 'text';
  if (/(^|;)text;/.test(style) || style.startsWith('text')) return 'text';
  if (/(^|;)ellipse(;|$)/.test(style) || /shape=ellipse/.test(style)) return 'circle';
  if (/(^|;)rhombus(;|$)/.test(style) || /shape=rhombus/.test(style)) return 'diamond';
  if (/shape=note/.test(style)) return 'note';
  return 'box';
}

/**
 * Reads a draw.io (diagrams.net) file, compressed or not: the first page, with
 * its shapes as boxes, circles, diamonds, notes and text, the shapes that hold
 * others as groups, and its connectors, dashed ones as asynchronous. It keeps
 * the positions and sizes. Images, colours and styles are left out.
 */
export async function importDrawio(xml: string): Promise<ImportResult> {
  let cells: Cell[] | undefined;
  try {
    cells = await cellsOf(xml);
  } catch {
    return { success: false, message: 'The draw.io file could not be read.' };
  }
  if (!cells) return { success: false, message: 'The file has no draw.io diagram.' };

  const vertices = cells.filter((cell) => cell.vertex && cell.width > 0 && cell.height > 0);
  const byId = new Map(vertices.map((cell) => [cell.id, cell]));
  const holders = new Set(
    vertices.flatMap((cell) =>
      cell.parent !== undefined && byId.has(cell.parent) ? [cell.parent] : [],
    ),
  );
  if (vertices.length === 0) return { success: false, message: 'The diagram has no shapes.' };
  if (vertices.length > LIMITS.maxNodes) {
    return { success: false, message: 'The diagram is larger than Archdraft allows.' };
  }

  const taken = new Set<string>();
  const ids = new Map<string, string>();
  for (const cell of vertices) {
    const id = freshId(cell.id, taken);
    taken.add(id);
    ids.set(cell.id, id);
  }
  const nodes: ArchNode[] = vertices.map((cell) => {
    const parent =
      cell.parent !== undefined && byId.has(cell.parent) ? ids.get(cell.parent) : undefined;
    return {
      id: ids.get(cell.id) as string,
      kind: kindOf(cell, holders.has(cell.id)),
      label: cleanLabel(cell.value),
      ...(parent === undefined ? {} : { parentId: parent }),
    };
  });
  // A group must have a name: it is shown on its border.
  const named = nodes.map((node) =>
    node.kind === 'boundary' && node.label === '' ? { ...node, label: 'Group' } : node,
  );

  const positions: Record<string, { x: number; y: number }> = {};
  const sizes: Record<string, { width: number; height: number }> = {};
  for (const cell of vertices) {
    const id = ids.get(cell.id) as string;
    positions[id] = { x: Math.round(cell.x), y: Math.round(cell.y) };
    sizes[id] = { width: Math.round(cell.width), height: Math.round(cell.height) };
  }

  const warnings: string[] = [];
  const groupIds = new Set(named.filter((node) => node.kind === 'boundary').map((node) => node.id));
  const edges: ArchEdge[] = [];
  let skipped = 0;
  for (const cell of cells.filter((candidate) => candidate.edge)) {
    const source = cell.source === undefined ? undefined : ids.get(cell.source);
    const target = cell.target === undefined ? undefined : ids.get(cell.target);
    if (
      source === undefined ||
      target === undefined ||
      source === target ||
      groupIds.has(source) ||
      groupIds.has(target) ||
      edges.some((edge) => edge.source === source && edge.target === target)
    ) {
      skipped++;
      continue;
    }
    const label = cleanLabel(cell.value);
    edges.push({
      id: freshId(`${source}-${target}`, new Set(edges.map((edge) => edge.id)), 'edge'),
      source,
      target,
      ...(label === '' ? {} : { label }),
      ...(/dashed=1/.test(cell.style) ? { mode: 'async' as const } : {}),
    });
  }
  if (skipped > 0) {
    warnings.push(`${skipped} connectors were left out (loose, repeated or tied to a group).`);
  }

  const pageName = tagsOf(xml)
    .find((tag) => tag.name === 'diagram')
    ?.attributes.name?.trim();
  const base = createEmptyGraph(
    (pageName === undefined || pageName === '' ? 'Imported diagram' : pageName).slice(
      0,
      LIMITS.titleLength,
    ),
  );
  const parsed = parseArchitectureGraph({ ...base, nodes: named, edges });
  if (!parsed.success) {
    return { success: false, message: parsed.issues[0]?.message ?? 'The diagram is not valid.' };
  }
  const layout: DiagramLayout = { ...createEmptyLayout(), positions, sizes };
  const document: DiagramDocument = { graph: parsed.graph, layout };
  return { success: true, document, placed: true, warnings };
}
