import {
  type ArchEdge,
  type ArchitectureGraph,
  type ArchNode,
  CONTAINER_PADDING,
  CONTAINMENT_RULES,
  type ContainerKind,
  DEFAULT_CONTAINER_SIZE,
  DEFAULT_EDGE_STYLE,
  defaultSizeOf,
  type DiagramDocument,
  type DiagramLayout,
  type EdgeRoute,
  type EdgeStyle,
  getNodeDefinition,
  isContainerKind,
  isShapeKind,
  layoutEntry,
  LIMITS,
  type NodeKind,
  ownEdgeRoute,
  ownEdgeStyle,
  type Point,
  type Size,
} from '@archdraft/core';
import { absoluteBoxes, type Box, nestingDepths, stackingOrder } from '../canvas/geometry.ts';
import { currentStrings } from '../i18n/locale.ts';

/**
 * Edits of a diagram document as pure functions. Each one returns the next
 * document and, when it changes, what to select; or the reason it cannot be
 * made. They do not validate the resulting graph: the store does that once
 * for every edit (store.ts), so no edit can leave the diagram invalid.
 */

export interface Selection {
  readonly type: 'node' | 'edge';
  readonly id: string;
}

export type Edit =
  | {
      readonly ok: true;
      readonly document: DiagramDocument;
      /** What to select afterwards; `undefined` keeps the current selection. */
      readonly selection?: Selection | null;
    }
  | { readonly ok: false; readonly reason: string };

/** Fields of a node the inspector edits. `undefined` removes the field. */
export interface NodePatch {
  readonly label?: string;
  readonly description?: string | undefined;
  readonly service?: string | undefined;
  readonly provider?: ArchNode['provider'];
  /** Text only: the box it is fixed to; `undefined` sets it free. */
  readonly attachedTo?: string | undefined;
  readonly attributes?: ArchNode['attributes'];
}

/** Fields of an edge the inspector edits. `undefined` removes the field. */
export interface EdgePatch {
  readonly label?: string | undefined;
  readonly protocol?: ArchEdge['protocol'];
  readonly mode?: ArchEdge['mode'];
}

/** Offset of a duplicate from its original. */
export const NUDGE = 32;

const ORIGIN: Point = { x: 0, y: 0 };

const unchanged = (document: DiagramDocument): Edit => ({ ok: true, document });
const reject = (reason: string): Edit => ({ ok: false, reason });

export function sizeOfKind(kind: NodeKind): Size {
  return defaultSizeOf(kind);
}

/** `base`, or `base-2`, `base-3`… if taken, within the length of an id. */
export function uniqueId(base: string, taken: ReadonlySet<string>): string {
  const plain = base.slice(0, LIMITS.idLength);
  if (!taken.has(plain)) return plain;
  for (let n = 2; ; n++) {
    const suffix = `-${n}`;
    const candidate = `${base.slice(0, LIMITS.idLength - suffix.length)}${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/** `label`, or `label 2`, `label 3`… if another node has it. */
export function uniqueLabel(label: string, taken: ReadonlySet<string>): string {
  // No name is not a name: any number of shapes may have none.
  if (label === '' || !taken.has(label)) return label;
  const base = label.replace(/ \d+$/, '');
  for (let n = 2; ; n++) {
    const suffix = ` ${n}`;
    const candidate = `${base.slice(0, LIMITS.labelLength - suffix.length)}${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/** Whether a container of `parentKind` may hold a node of `childKind` (CONTAINMENT_RULES). */
export function canContain(parentKind: ContainerKind, childKind: NodeKind): boolean {
  return !isContainerKind(childKind) || CONTAINMENT_RULES[childKind].parents.includes(parentKind);
}

/** The node and everything nested inside it. */
export function subtreeOf(graph: ArchitectureGraph, id: string): Set<string> {
  const ids = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const node of graph.nodes) {
      // What a node holds, and the text fixed to it, goes wherever it goes.
      const carried =
        (node.parentId !== undefined && ids.has(node.parentId)) ||
        (node.attachedTo !== undefined && ids.has(node.attachedTo));
      if (carried && !ids.has(node.id)) {
        ids.add(node.id);
        grew = true;
      }
    }
  }
  return ids;
}

const contains = (box: Box, point: Point) =>
  point.x >= box.x &&
  point.x <= box.x + box.width &&
  point.y >= box.y &&
  point.y <= box.y + box.height;

/**
 * The innermost container under `point` that may hold a node of `kind`, or
 * undefined for the top level. `excluded` leaves out a node being moved and
 * its contents, which cannot become its own parent.
 */
export function containerAt(
  document: DiagramDocument,
  point: Point,
  kind: NodeKind,
  excluded: ReadonlySet<string> = new Set(),
): string | undefined {
  const boxes = absoluteBoxes(document.graph, document.layout);
  const depths = nestingDepths(document.graph);
  let best: { id: string; depth: number } | undefined;
  for (const node of document.graph.nodes) {
    if (!isContainerKind(node.kind) || excluded.has(node.id) || !canContain(node.kind, kind)) {
      continue;
    }
    const box = boxes.get(node.id);
    if (!box || !contains(box, point)) continue;
    const depth = depths.get(node.id) ?? 0;
    if (!best || depth > best.depth) best = { id: node.id, depth };
  }
  return best?.id;
}

const round = (point: Point): Point => ({ x: Math.round(point.x), y: Math.round(point.y) });

/** Keeps a child clear of its container's border and title. */
function insideParent(position: Point, parentId: string | undefined): Point {
  if (parentId === undefined) return position;
  return {
    x: Math.max(position.x, CONTAINER_PADDING.left),
    y: Math.max(position.y, CONTAINER_PADDING.top),
  };
}

/** Grows every container around `id` so that its children fit inside it. */
function growAncestors(graph: ArchitectureGraph, layout: DiagramLayout, id: string): DiagramLayout {
  const parents = new Map(graph.nodes.map((node) => [node.id, node.parentId]));
  const sizes = { ...layout.sizes };
  const seen = new Set<string>();
  for (let parentId = parents.get(id); parentId !== undefined; parentId = parents.get(parentId)) {
    if (seen.has(parentId)) break;
    seen.add(parentId);
    let { width, height } = layoutEntry(sizes, parentId) ?? DEFAULT_CONTAINER_SIZE;
    for (const child of graph.nodes) {
      if (child.parentId !== parentId) continue;
      const position = layoutEntry(layout.positions, child.id) ?? ORIGIN;
      const size = layoutEntry(sizes, child.id) ?? sizeOfKind(child.kind);
      width = Math.max(width, position.x + size.width + CONTAINER_PADDING.right);
      height = Math.max(height, position.y + size.height + CONTAINER_PADDING.bottom);
    }
    sizes[parentId] = { width, height };
  }
  return { ...layout, sizes };
}

/** Grid step, reach in steps and clearance of the search for room around a new node. */
const SEARCH_STEP = 24;
const SEARCH_REACH = 24;
const CLEARANCE = 16;

/** Nearest spot to `position` where a node of `size` does not touch any sibling. */
function roomFor(
  document: DiagramDocument,
  parentId: string | undefined,
  position: Point,
  size: Size,
): Point {
  const { positions, sizes } = document.layout;
  const siblings = document.graph.nodes
    .filter((node) => node.parentId === parentId)
    .flatMap((node) => {
      const start = layoutEntry(positions, node.id);
      const extent = layoutEntry(sizes, node.id);
      return start && extent ? [{ ...start, ...extent }] : [];
    });
  const free = (at: Point) =>
    siblings.every(
      (box) =>
        at.x + size.width + CLEARANCE <= box.x ||
        box.x + box.width + CLEARANCE <= at.x ||
        at.y + size.height + CLEARANCE <= box.y ||
        box.y + box.height + CLEARANCE <= at.y,
    );
  if (free(position)) return position;

  const offsets: Point[] = [];
  for (let dx = -SEARCH_REACH; dx <= SEARCH_REACH; dx++) {
    for (let dy = -SEARCH_REACH; dy <= SEARCH_REACH; dy++) {
      offsets.push({ x: dx * SEARCH_STEP, y: dy * SEARCH_STEP });
    }
  }
  offsets.sort((a, b) => a.x * a.x + a.y * a.y - (b.x * b.x + b.y * b.y));
  for (const offset of offsets) {
    const candidate = insideParent(
      { x: position.x + offset.x, y: position.y + offset.y },
      parentId,
    );
    if (free(candidate)) return candidate;
  }
  return position;
}

function withParent(node: ArchNode, parentId: string | undefined): ArchNode {
  const { parentId: _previous, ...rest } = node;
  return parentId === undefined ? rest : { ...rest, parentId };
}

/** The box a text put at `point` is fixed to: the frontmost one there that is not a group or text. */
function hostAt(
  document: DiagramDocument,
  point: Point,
  excluded: ReadonlySet<string>,
): ArchNode | undefined {
  const boxes = absoluteBoxes(document.graph, document.layout);
  let host: ArchNode | undefined;
  for (const node of stackingOrder(document.graph)) {
    if (isContainerKind(node.kind) || node.kind === 'text' || excluded.has(node.id)) continue;
    const box = boxes.get(node.id);
    if (box && contains(box, point)) host = node;
  }
  return host;
}

/** `node` fixed to `hostId`, or free when there is none. */
function fixedTo(node: ArchNode, hostId: string | undefined): ArchNode {
  const { attachedTo: _previous, ...rest } = node;
  return hostId === undefined ? rest : { ...rest, attachedTo: hostId };
}

function withoutKeys<T>(record: Readonly<Record<string, T>>, ids: ReadonlySet<string>) {
  return Object.fromEntries(Object.entries(record).filter(([id]) => !ids.has(id)));
}

/** The layout with `styles` as the styles of single edges; with none, the field is left out. */
function withEdgeStyles(
  layout: DiagramLayout,
  styles: Readonly<Record<string, EdgeStyle>>,
): DiagramLayout {
  const { edgeStyles: _previous, ...rest } = layout;
  return Object.keys(styles).length === 0 ? rest : { ...rest, edgeStyles: styles };
}

/** The layout with `routes` as the routes of single edges; with none, the field is left out. */
function withEdgeRoutes(
  layout: DiagramLayout,
  routes: Readonly<Record<string, EdgeRoute>>,
): DiagramLayout {
  const { edgeRoutes: _previous, ...rest } = layout;
  return Object.keys(routes).length === 0 ? rest : { ...rest, edgeRoutes: routes };
}

/** Copies `target` with the fields of `patch`; an `undefined` value removes the field. */
function patched<T extends object>(target: T, patch: object): T {
  const next: Record<string, unknown> = { ...(target as Record<string, unknown>) };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) delete next[key];
    else next[key] = value;
  }
  return next as T;
}

function originOf(boxes: ReadonlyMap<string, Box>, parentId: string | undefined): Point {
  return (parentId === undefined ? undefined : boxes.get(parentId)) ?? ORIGIN;
}

/**
 * Adds a node of `kind` centred on `centre` (diagram coordinates), or as
 * close as possible without touching another node, inside the innermost
 * container there that can hold it, and selects it. Its name is `name`,
 * numbered if taken; by default the English name of the kind. A node drawn by
 * dragging has the size `drawn` (see `drawnSize`) instead of the usual one.
 */
export interface AddOptions {
  /** Name of the node, numbered if taken; by default the English name of the kind. */
  readonly name?: string;
  /** Size drawn by dragging (see `drawnSize`) instead of the usual one. */
  readonly size?: Size;
  /** Keep the node exactly where it is put, even if that is over other nodes. */
  readonly exact?: boolean;
}

export function addNode(
  document: DiagramDocument,
  kind: NodeKind,
  centre: Point,
  options: AddOptions = {},
): Edit {
  // A shape is born without a name: it is what it looks like, and text is what is typed in it.
  const {
    name = isShapeKind(kind) ? '' : getNodeDefinition(kind).label,
    size: drawn,
    exact = false,
  } = options;
  const { graph, layout } = document;
  if (graph.nodes.length >= LIMITS.maxNodes) return reject(currentStrings().edit.tooManyNodes);

  const id = uniqueId(kind, new Set(graph.nodes.map((node) => node.id)));
  const label = uniqueLabel(name, new Set(graph.nodes.map((node) => node.label)));
  const size = drawn === undefined ? sizeOfKind(kind) : drawnSize(kind, drawn);
  const boxes = absoluteBoxes(graph, layout);
  const topLeft = { x: centre.x - size.width / 2, y: centre.y - size.height / 2 };
  const bottomRight = { x: topLeft.x + size.width, y: topLeft.y + size.height };
  // A text put by hand over a box is fixed to it, and lives in the same group as the box.
  const host = kind === 'text' && exact ? hostAt(document, centre, new Set()) : undefined;
  let parentId = host === undefined ? containerAt(document, centre, kind) : host.parentId;
  const parentBox = parentId === undefined ? undefined : boxes.get(parentId);
  // Put by hand, a node joins a container only if it is drawn wholly inside it; one that
  // sticks out stays on the diagram, where it was drawn, instead of being pulled in.
  if (
    exact &&
    host === undefined &&
    parentBox !== undefined &&
    !(contains(parentBox, topLeft) && contains(parentBox, bottomRight))
  ) {
    parentId = undefined;
  }
  const origin = originOf(boxes, parentId);
  const placed = round({ x: topLeft.x - origin.x, y: topLeft.y - origin.y });
  // Where the author put it, even over other nodes, or else the nearest spot clear of them.
  const position = exact
    ? placed
    : roomFor(document, parentId, insideParent(placed, parentId), size);

  const node: ArchNode = fixedTo(withParent({ id, kind, label }, parentId), host?.id);
  const nextGraph = { ...graph, nodes: [...graph.nodes, node] };
  const nextLayout = growAncestors(
    nextGraph,
    {
      ...layout,
      positions: { ...layout.positions, [id]: position },
      sizes: { ...layout.sizes, [id]: size },
    },
    id,
  );
  return {
    ok: true,
    document: { graph: nextGraph, layout: nextLayout },
    selection: { type: 'node', id },
  };
}

/**
 * Size of a node drawn by dragging: the size dragged, rounded, but not
 * below the smallest the node can be; a circle is as wide as it is tall.
 */
export function drawnSize(kind: NodeKind, dragged: Size): Size {
  const min = minSizeOf(kind);
  const width = Math.max(Math.round(dragged.width), min.width);
  const height = Math.max(Math.round(dragged.height), min.height);
  if (kind !== 'circle') return { width, height };
  const side = Math.max(width, height);
  return { width: side, height: side };
}

/** Where a node goes among the nodes it is stacked with. */
export type StackMove = 'front' | 'forward' | 'backward' | 'back';

/**
 * The nodes in the same container as `id`, from back to front, grouped so that a box and the
 * text fixed to it stay together; and where `id` is among those groups (-1 for fixed text).
 */
function siblingsOf(graph: ArchitectureGraph, id: string) {
  const node = graph.nodes.find((candidate) => candidate.id === id);
  if (!node) return undefined;
  const slots = graph.nodes.flatMap((other, index) =>
    other.parentId === node.parentId ? [index] : [],
  );
  const siblings = slots.map((index) => graph.nodes[index] as ArchNode);
  const units = siblings.filter((sibling) => sibling.attachedTo === undefined);
  return { slots, siblings, units, at: units.findIndex((unit) => unit.id === id) };
}

/** Which ways `id` can still move in the stack: nothing is in front of the first, or behind the last. */
export function canStack(
  graph: ArchitectureGraph,
  id: string,
): { forward: boolean; backward: boolean } {
  const found = siblingsOf(graph, id);
  if (!found || found.at < 0) return { forward: false, backward: false };
  return { forward: found.at < found.units.length - 1, backward: found.at > 0 };
}

/**
 * Moves a node in the stacking order, among the nodes of its own container: to
 * the very front or back, or one step. A container carries its contents and a
 * box the text fixed to it. The order is that of `graph.nodes`, so it is saved
 * with the diagram.
 */
export function stackNode(document: DiagramDocument, id: string, move: StackMove): Edit {
  const { graph } = document;
  const found = siblingsOf(graph, id);
  if (!found || found.at < 0) return unchanged(document);
  const { slots, siblings, units, at } = found;
  const last = units.length - 1;
  const to =
    move === 'front'
      ? last
      : move === 'back'
        ? 0
        : Math.min(Math.max(at + (move === 'forward' ? 1 : -1), 0), last);
  if (to === at) return unchanged(document);
  const reordered = units.filter((_, index) => index !== at);
  reordered.splice(to, 0, units[at] as ArchNode);
  const stacked = reordered.flatMap((unit) => [
    unit,
    ...siblings.filter((text) => text.attachedTo === unit.id),
  ]);
  const nodes = [...graph.nodes];
  slots.forEach((slot, index) => {
    nodes[slot] = stacked[index] as ArchNode;
  });
  return { ok: true, document: { ...document, graph: { ...graph, nodes } } };
}

/** Connects `source` to `target` and selects the new edge. */
export function connect(document: DiagramDocument, source: string, target: string): Edit {
  const { graph } = document;
  if (graph.edges.some((edge) => edge.source === source && edge.target === target)) {
    return reject(currentStrings().edit.alreadyConnected);
  }
  if (graph.edges.length >= LIMITS.maxEdges) return reject(currentStrings().edit.tooManyEdges);
  const base = `${source}-${target}`;
  const id = uniqueId(
    base.length <= LIMITS.idLength ? base : 'edge',
    new Set(graph.edges.map((edge) => edge.id)),
  );
  return {
    ok: true,
    document: { ...document, graph: { ...graph, edges: [...graph.edges, { id, source, target }] } },
    selection: { type: 'edge', id },
  };
}

/**
 * Moves a node to `position`, relative to its current container. If its
 * centre lands in another container, it moves into the innermost one that
 * can hold it; outside every container, it moves to the top level. A node
 * that changes container goes last among the nodes, so it is drawn above its
 * new neighbours.
 */
export function moveNode(document: DiagramDocument, id: string, position: Point): Edit {
  const { graph, layout } = document;
  const node = graph.nodes.find((candidate) => candidate.id === id);
  if (!node) return unchanged(document);

  const boxes = absoluteBoxes(graph, layout);
  const from = originOf(boxes, node.parentId);
  const size = layoutEntry(layout.sizes, id) ?? sizeOfKind(node.kind);
  const absolute = { x: from.x + position.x, y: from.y + position.y };
  const centre = { x: absolute.x + size.width / 2, y: absolute.y + size.height / 2 };
  const carried = subtreeOf(graph, id);
  // A text let go over a box is fixed to it, and goes with it from then on.
  const host = node.kind === 'text' ? hostAt(document, centre, carried) : undefined;
  const parentId =
    host === undefined ? containerAt(document, centre, node.kind, carried) : host.parentId;
  const to = originOf(boxes, parentId);
  const next = insideParent(round({ x: absolute.x - to.x, y: absolute.y - to.y }), parentId);

  const current = layoutEntry(layout.positions, id);
  if (
    parentId === node.parentId &&
    current?.x === next.x &&
    current.y === next.y &&
    node.attachedTo === host?.id
  ) {
    return unchanged(document);
  }

  // What is fixed to this node moves the same distance, and into the same group.
  const attached =
    node.kind === 'text' ? [] : graph.nodes.filter((other) => other.attachedTo === id);
  const before = boxes.get(id);
  const shift = before ? { x: to.x + next.x - before.x, y: to.y + next.y - before.y } : ORIGIN;
  const positions = { ...layout.positions, [id]: next };
  for (const text of attached) {
    const old = boxes.get(text.id);
    if (old) positions[text.id] = round({ x: old.x + shift.x - to.x, y: old.y + shift.y - to.y });
  }

  const reparented = parentId !== node.parentId;
  const moved = fixedTo(withParent(node, parentId), host?.id);
  const nextGraph =
    reparented || host?.id !== node.attachedTo
      ? {
          ...graph,
          nodes: [
            ...graph.nodes.filter(
              (candidate) => candidate.id !== id && !attached.includes(candidate),
            ),
            moved,
            ...attached.map((text) => withParent(text, parentId)),
          ],
        }
      : graph;
  let nextLayout: DiagramLayout = { ...layout, positions };
  for (const moving of [id, ...attached.map((text) => text.id)]) {
    nextLayout = growAncestors(nextGraph, nextLayout, moving);
  }
  return { ok: true, document: { graph: nextGraph, layout: nextLayout } };
}

/** Moves several nodes in one edit, each as `moveNode` does. */
export function moveNodes(
  document: DiagramDocument,
  moves: readonly { readonly id: string; readonly position: Point }[],
): Edit {
  let next = document;
  const ids = new Set(moves.map((move) => move.id));
  for (const { id, position } of moves) {
    // Text fixed to a box that moves too goes with the box, not by itself.
    const host = document.graph.nodes.find((node) => node.id === id)?.attachedTo;
    if (host !== undefined && ids.has(host)) continue;
    const edit = moveNode(next, id, position);
    if (edit.ok) next = edit.document;
  }
  return next === document ? unchanged(document) : { ok: true, document: next };
}

/** Smallest size a node can be resized to, by what it is, in diagram pixels. */
export const MIN_SIZES = {
  component: { width: 132, height: 52 },
  shape: { width: 40, height: 40 },
  text: { width: 40, height: 24 },
  container: { width: 120, height: 72 },
} as const satisfies Record<string, Size>;

export function minSizeOf(kind: NodeKind): Size {
  if (kind === 'text') return MIN_SIZES.text;
  return isContainerKind(kind)
    ? MIN_SIZES.container
    : isShapeKind(kind)
      ? MIN_SIZES.shape
      : MIN_SIZES.component;
}

/** A resized box, and how far the contents of a group move inside it to stay where they are. */
export interface FittedResize {
  readonly box: Box;
  /** Subtracted from the positions of the children, which are relative to the box. */
  readonly shift: Point;
}

/**
 * The box a node can take when resized towards `box` (relative to its parent,
 * like its position): whole pixels, at least its minimum size, clear of the
 * border of its parent and, for a group, still around everything inside it.
 * Each edge is limited on its own, so the edges the person did not move stay put.
 * A group whose top or left edge moves keeps its contents in place.
 */
export function fitResize(document: DiagramDocument, id: string, box: Box): FittedResize {
  const { graph, layout } = document;
  const node = graph.nodes.find((candidate) => candidate.id === id);
  const min = node ? minSizeOf(node.kind) : MIN_SIZES.shape;
  let left = Math.round(box.x);
  let top = Math.round(box.y);
  let right = Math.round(box.x + box.width);
  let bottom = Math.round(box.y + box.height);
  if (node?.parentId !== undefined) {
    left = Math.max(left, CONTAINER_PADDING.left);
    top = Math.max(top, CONTAINER_PADDING.top);
  }

  const current = layoutEntry(layout.positions, id);
  const children = graph.nodes.filter((child) => child.parentId === id);
  if (node && current && isContainerKind(node.kind) && children.length > 0) {
    for (const child of children) {
      const position = layoutEntry(layout.positions, child.id) ?? ORIGIN;
      const size = layoutEntry(layout.sizes, child.id) ?? sizeOfKind(child.kind);
      left = Math.min(left, current.x + position.x - CONTAINER_PADDING.left);
      top = Math.min(top, current.y + position.y - CONTAINER_PADDING.top);
      right = Math.max(right, current.x + position.x + size.width + CONTAINER_PADDING.right);
      bottom = Math.max(bottom, current.y + position.y + size.height + CONTAINER_PADDING.bottom);
    }
  }
  right = Math.max(right, left + min.width);
  bottom = Math.max(bottom, top + min.height);

  const shift = current ? { x: left - current.x, y: top - current.y } : ORIGIN;
  return { box: { x: left, y: top, width: right - left, height: bottom - top }, shift };
}

/**
 * Resizes a node to the box `fitResize` allows, moving the contents of a
 * group so they stay where they are, and grows the groups around it.
 */
export function resizeNode(document: DiagramDocument, id: string, box: Box): Edit {
  const { graph, layout } = document;
  const node = graph.nodes.find((candidate) => candidate.id === id);
  if (!node) return unchanged(document);
  const { box: fitted, shift } = fitResize(document, id, box);
  const currentPosition = layoutEntry(layout.positions, id);
  const currentSize = layoutEntry(layout.sizes, id);
  if (
    currentPosition?.x === fitted.x &&
    currentPosition.y === fitted.y &&
    currentSize?.width === fitted.width &&
    currentSize.height === fitted.height
  ) {
    return unchanged(document);
  }
  const positions: Record<string, Point> = {
    ...layout.positions,
    [id]: { x: fitted.x, y: fitted.y },
  };
  if (shift.x !== 0 || shift.y !== 0) {
    for (const child of graph.nodes) {
      const position = child.parentId === id ? layoutEntry(layout.positions, child.id) : undefined;
      if (position) positions[child.id] = { x: position.x - shift.x, y: position.y - shift.y };
    }
  }
  return {
    ok: true,
    document: {
      graph,
      layout: growAncestors(
        graph,
        {
          ...layout,
          positions,
          sizes: { ...layout.sizes, [id]: { width: fitted.width, height: fitted.height } },
        },
        id,
      ),
    },
  };
}

/** The layout without what it says about the edges `ids`: their styles and their routes. */
function withoutEdgeEntries(layout: DiagramLayout, ids: ReadonlySet<string>): DiagramLayout {
  return withEdgeRoutes(
    withEdgeStyles(layout, withoutKeys(layout.edgeStyles ?? {}, ids)),
    withoutKeys(layout.edgeRoutes ?? {}, ids),
  );
}

/** Removes a node with everything inside it and every edge they touch, or an edge. */
export function remove(document: DiagramDocument, selection: Selection): Edit {
  const { graph, layout } = document;
  if (!exists(document, selection)) return unchanged(document);
  if (selection.type === 'edge') {
    return {
      ok: true,
      document: {
        graph: { ...graph, edges: graph.edges.filter((edge) => edge.id !== selection.id) },
        layout: withoutEdgeEntries(layout, new Set([selection.id])),
      },
      selection: null,
    };
  }
  const ids = subtreeOf(graph, selection.id);
  const touched = (edge: ArchEdge) => ids.has(edge.source) || ids.has(edge.target);
  const goneEdges = new Set(graph.edges.filter(touched).map((edge) => edge.id));
  return {
    ok: true,
    document: {
      graph: {
        ...graph,
        nodes: graph.nodes.filter((node) => !ids.has(node.id)),
        edges: graph.edges.filter((edge) => !touched(edge)),
      },
      layout: withoutEdgeEntries(
        {
          ...layout,
          positions: withoutKeys(layout.positions, ids),
          sizes: withoutKeys(layout.sizes, ids),
        },
        goneEdges,
      ),
    },
    selection: null,
  };
}

/** Deletes several nodes, with what is inside them and their connections, in one edit. */
export function removeNodes(document: DiagramDocument, ids: readonly string[]): Edit {
  let next = document;
  for (const id of ids) {
    // A node inside one that was already deleted is gone too.
    const edit = remove(next, { type: 'node', id });
    if (edit.ok) next = edit.document;
  }
  return next === document ? unchanged(document) : { ok: true, document: next, selection: null };
}

/**
 * Copies a node, with everything inside it and the edges between those, next
 * to the original in the same container, and selects the copy.
 */
export function duplicate(document: DiagramDocument, id: string): Edit {
  const { graph, layout } = document;
  const ids = subtreeOf(graph, id);
  const originals = graph.nodes.filter((node) => ids.has(node.id));
  if (originals.length === 0) return unchanged(document);
  const innerEdges = graph.edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target));
  if (graph.nodes.length + originals.length > LIMITS.maxNodes) {
    return reject(currentStrings().edit.tooManyNodes);
  }
  if (graph.edges.length + innerEdges.length > LIMITS.maxEdges) {
    return reject(currentStrings().edit.tooManyEdges);
  }

  const takenIds = new Set(graph.nodes.map((node) => node.id));
  const takenLabels = new Set(graph.nodes.map((node) => node.label));
  const copies = new Map<string, string>();
  for (const original of originals) {
    const copyId = uniqueId(original.id.replace(/-\d+$/, ''), takenIds);
    takenIds.add(copyId);
    copies.set(original.id, copyId);
  }
  const copyOf = (original: string) => copies.get(original) ?? original;

  const positions = { ...layout.positions };
  const sizes = { ...layout.sizes };
  const nodes = originals.map((original) => {
    const label = uniqueLabel(original.label, takenLabels);
    takenLabels.add(label);
    const position = layoutEntry(layout.positions, original.id) ?? ORIGIN;
    positions[copyOf(original.id)] =
      original.id === id || original.attachedTo === id
        ? { x: position.x + NUDGE, y: position.y + NUDGE }
        : position;
    sizes[copyOf(original.id)] =
      layoutEntry(layout.sizes, original.id) ?? sizeOfKind(original.kind);
    // The copied root stays in the original's container; its contents follow it.
    const parentId =
      original.id === id || original.parentId === undefined
        ? original.parentId
        : copyOf(original.parentId);
    const copy = withParent({ ...original, id: copyOf(original.id), label }, parentId);
    return original.attachedTo === undefined
      ? copy
      : { ...copy, attachedTo: copyOf(original.attachedTo) };
  });

  const takenEdgeIds = new Set(graph.edges.map((edge) => edge.id));
  // A copied connection is drawn in the style, and runs the way, of the one it copies.
  const edgeStyles: Record<string, EdgeStyle> = { ...layout.edgeStyles };
  const edgeRoutes: Record<string, EdgeRoute> = { ...layout.edgeRoutes };
  const edges = innerEdges.map((edge) => {
    const source = copyOf(edge.source);
    const target = copyOf(edge.target);
    const base = `${source}-${target}`;
    const edgeId = uniqueId(base.length <= LIMITS.idLength ? base : 'edge', takenEdgeIds);
    takenEdgeIds.add(edgeId);
    const own = ownEdgeStyle(layout, edge.id);
    if (own !== undefined) edgeStyles[edgeId] = own;
    const route = ownEdgeRoute(layout, edge.id);
    if (route !== undefined) edgeRoutes[edgeId] = route;
    return { ...edge, id: edgeId, source, target };
  });

  const nextGraph = {
    ...graph,
    nodes: [...graph.nodes, ...nodes],
    edges: [...graph.edges, ...edges],
  };
  return {
    ok: true,
    document: {
      graph: nextGraph,
      layout: growAncestors(
        nextGraph,
        withEdgeRoutes(withEdgeStyles({ ...layout, positions, sizes }, edgeStyles), edgeRoutes),
        copyOf(id),
      ),
    },
    selection: { type: 'node', id: copyOf(id) },
  };
}

/** Whether applying `patch` to `target` would change nothing. Values are plain data. */
function changesNothing(target: object, patch: object): boolean {
  const current = target as Record<string, unknown>;
  return Object.entries(patch).every(
    ([key, value]) => JSON.stringify(current[key]) === JSON.stringify(value),
  );
}

export function updateNode(document: DiagramDocument, id: string, patch: NodePatch): Edit {
  const { graph } = document;
  const node = graph.nodes.find((candidate) => candidate.id === id);
  if (!node || changesNothing(node, patch)) return unchanged(document);
  return {
    ok: true,
    document: {
      ...document,
      graph: {
        ...graph,
        nodes: graph.nodes.map((node) => (node.id === id ? patched(node, patch) : node)),
      },
    },
  };
}

/** Fields of the diagram itself that the card edits. */
export interface DiagramPatch {
  readonly title?: string;
  readonly provider?: ArchitectureGraph['provider'];
}

/** Renames the diagram, which names the files it is exported to, or changes its cloud. */
export function updateDiagram(document: DiagramDocument, patch: DiagramPatch): Edit {
  const { graph } = document;
  const title = patch.title === undefined ? graph.title : patch.title.trim();
  const provider = patch.provider ?? graph.provider;
  if (title === graph.title && provider === graph.provider) return unchanged(document);
  return { ok: true, document: { ...document, graph: { ...graph, title, provider } } };
}

export function updateEdge(document: DiagramDocument, id: string, patch: EdgePatch): Edit {
  const { graph } = document;
  const edge = graph.edges.find((candidate) => candidate.id === id);
  if (!edge || changesNothing(edge, patch)) return unchanged(document);
  return {
    ok: true,
    document: {
      ...document,
      graph: {
        ...graph,
        edges: graph.edges.map((edge) => (edge.id === id ? patched(edge, patch) : edge)),
      },
    },
  };
}

/**
 * Sets how the connections without a style of their own are drawn. The default
 * style is stored as nothing, so a diagram that never chose one is unchanged.
 */
export function setDefaultEdgeStyle(document: DiagramDocument, style: EdgeStyle): Edit {
  const { layout } = document;
  if ((layout.edgeStyle ?? DEFAULT_EDGE_STYLE) === style) return unchanged(document);
  const { edgeStyle: _previous, ...rest } = layout;
  return {
    ok: true,
    document: {
      ...document,
      layout: style === DEFAULT_EDGE_STYLE ? rest : { ...rest, edgeStyle: style },
    },
  };
}

/** Sets the style of one connection; `undefined` makes it follow the diagram again. */
export function setEdgeStyle(
  document: DiagramDocument,
  id: string,
  style: EdgeStyle | undefined,
): Edit {
  const { graph, layout } = document;
  if (!graph.edges.some((edge) => edge.id === id)) return unchanged(document);
  if (ownEdgeStyle(layout, id) === style) return unchanged(document);
  const others = withoutKeys(layout.edgeStyles ?? {}, new Set([id]));
  return {
    ok: true,
    document: {
      ...document,
      layout: withEdgeStyles(layout, style === undefined ? others : { ...others, [id]: style }),
    },
  };
}

/**
 * What can be said about the route of one connection. A field set to `undefined` goes back to
 * automatic; one left out stays as it was.
 */
export interface EdgeRoutePatch {
  readonly source?: EdgeRoute['source'];
  readonly target?: EdgeRoute['target'];
  readonly bend?: EdgeRoute['bend'];
}

/**
 * Changes how one connection runs: the sides it leaves from and arrives at, and where its
 * middle falls. `null` makes it fully automatic again. A route with nothing left in it is
 * stored as nothing, so a diagram nobody routed by hand is unchanged.
 */
export function setEdgeRoute(
  document: DiagramDocument,
  id: string,
  patch: EdgeRoutePatch | null,
): Edit {
  const { graph, layout } = document;
  if (!graph.edges.some((edge) => edge.id === id)) return unchanged(document);
  const current = ownEdgeRoute(layout, id);
  const merged = patch === null ? {} : patched(current ?? {}, patch);
  // A bend that did not move is no bend.
  const bend =
    merged.bend !== undefined && merged.bend.x === 0 && merged.bend.y === 0
      ? undefined
      : merged.bend;
  // Written in the order of the schema, so that the saved text is stable.
  const next: EdgeRoute = {
    ...(merged.source === undefined ? {} : { source: merged.source }),
    ...(merged.target === undefined ? {} : { target: merged.target }),
    ...(bend === undefined ? {} : { bend }),
  };
  if (JSON.stringify(next) === JSON.stringify(current ?? {})) return unchanged(document);
  const others = withoutKeys(layout.edgeRoutes ?? {}, new Set([id]));
  return {
    ok: true,
    document: {
      ...document,
      layout: withEdgeRoutes(
        layout,
        Object.keys(next).length === 0 ? others : { ...others, [id]: next },
      ),
    },
  };
}

/** Whether `selection` still points at something in `document`. */
export function exists(document: DiagramDocument, selection: Selection): boolean {
  const list: readonly { id: string }[] =
    selection.type === 'node' ? document.graph.nodes : document.graph.edges;
  return list.some((item) => item.id === selection.id);
}
