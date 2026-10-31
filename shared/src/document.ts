import { z } from 'zod';
import { isContainerKind, isShapeKind, type NodeKind, type ShapeKind } from './kinds.ts';
import { ArchitectureGraphSchema, IdSchema, LIMITS } from './schema.ts';

/**
 * Presentation data kept next to the semantic graph (ADR 0007). Positions are
 * the top left corner of a node relative to its parent container, or to the
 * canvas for root nodes, which is the convention React Flow uses for
 * sub flows. Sizes are in the same units.
 */

const CoordinateSchema = z.number().finite();
const LengthSchema = z.number().finite().positive();

export const PointSchema = z.strictObject({ x: CoordinateSchema, y: CoordinateSchema });
export const SizeSchema = z.strictObject({ width: LengthSchema, height: LengthSchema });

function boundedRecord<T extends z.ZodType>(value: T, max: number = LIMITS.maxNodes) {
  return z.record(IdSchema, value).refine((record) => Object.keys(record).length <= max, {
    message: `At most ${max} entries`,
  });
}

/** How a connection is drawn: a smooth curve, or straight segments joined at right angles. */
export const EDGE_STYLES = ['curved', 'square'] as const;
export type EdgeStyle = (typeof EDGE_STYLES)[number];
export const EdgeStyleSchema = z.enum(EDGE_STYLES);

/** The style of a diagram that does not choose one. */
export const DEFAULT_EDGE_STYLE: EdgeStyle = 'curved';

/** A side of a node, which a connection can leave from or arrive at. */
export const NODE_SIDES = ['left', 'right', 'top', 'bottom'] as const;
export type NodeSide = (typeof NODE_SIDES)[number];
export const NodeSideSchema = z.enum(NODE_SIDES);

/**
 * How one connection departs from what the diagram would draw by itself. Every field is
 * optional, and the missing ones stay automatic: the sides are the ones that make the shortest
 * line, and the bend is where the middle of the connection falls.
 */
export const EdgeRouteSchema = z.strictObject({
  source: NodeSideSchema.optional().describe('Side of the source the connection leaves from'),
  target: NodeSideSchema.optional().describe('Side of the target the connection arrives at'),
  bend: PointSchema.optional().describe(
    'How far the middle of the connection is moved from where it falls by default',
  ),
});

export const DiagramLayoutSchema = z.strictObject({
  positions: boundedRecord(PointSchema).describe('Top left corner per node id, parent relative'),
  sizes: boundedRecord(SizeSchema).describe('Width and height per node id'),
  edgeStyle: EdgeStyleSchema.optional().describe(
    `How connections are drawn unless they have a style of their own; ${DEFAULT_EDGE_STYLE} when absent`,
  ),
  edgeStyles: boundedRecord(EdgeStyleSchema, LIMITS.maxEdges)
    .optional()
    .describe('Style of single connections that differ from the diagram, per edge id'),
  edgeRoutes: boundedRecord(EdgeRouteSchema, LIMITS.maxEdges)
    .optional()
    .describe('Sides and bend of single connections that were routed by hand, per edge id'),
});

/** What the editor stores, shares and restores: the graph plus how it is drawn. */
export const DiagramDocumentSchema = z.strictObject({
  graph: ArchitectureGraphSchema,
  layout: DiagramLayoutSchema,
});

export type Point = z.infer<typeof PointSchema>;
export type EdgeRoute = z.infer<typeof EdgeRouteSchema>;
export type Size = z.infer<typeof SizeSchema>;
export type DiagramLayout = z.infer<typeof DiagramLayoutSchema>;
export type DiagramDocument = z.infer<typeof DiagramDocumentSchema>;

/** Size of a component that has not been measured or laid out yet. */
export const DEFAULT_NODE_SIZE: Size = { width: 180, height: 64 };
/** Size of an empty container, which has no children to grow around. */
export const DEFAULT_CONTAINER_SIZE: Size = { width: 240, height: 140 };
/** Size of each shape before it is resized. */
export const SHAPE_SIZES: Readonly<Record<ShapeKind, Size>> = {
  box: { width: 160, height: 64 },
  circle: { width: 96, height: 96 },
  diamond: { width: 140, height: 96 },
  note: { width: 160, height: 96 },
  text: { width: 160, height: 36 },
};

/** Size of a node of `kind` that has not been measured, resized or laid out yet. */
export function defaultSizeOf(kind: NodeKind): Size {
  if (isContainerKind(kind)) return DEFAULT_CONTAINER_SIZE;
  return isShapeKind(kind) ? SHAPE_SIZES[kind] : DEFAULT_NODE_SIZE;
}

/** Space between a container's border and its children; the top leaves room for its title. */
export const CONTAINER_PADDING = { top: 48, right: 24, bottom: 24, left: 24 } as const;

export function createEmptyLayout(): DiagramLayout {
  return { positions: {}, sizes: {} };
}

/**
 * Reads the entry of a layout record. Ids such as `constructor` are valid,
 * so a plain `record[id]` could return an inherited `Object.prototype`
 * member instead of `undefined`.
 */
export function layoutEntry<T>(record: Readonly<Record<string, T>>, id: string): T | undefined {
  return Object.hasOwn(record, id) ? record[id] : undefined;
}

/** The style an edge has of its own, if it has one. */
export function ownEdgeStyle(layout: DiagramLayout, edgeId: string): EdgeStyle | undefined {
  return layout.edgeStyles === undefined ? undefined : layoutEntry(layout.edgeStyles, edgeId);
}

/** How an edge is drawn: its own style if it has one, else the one of the diagram. */
export function resolveEdgeStyle(layout: DiagramLayout, edgeId: string): EdgeStyle {
  return ownEdgeStyle(layout, edgeId) ?? layout.edgeStyle ?? DEFAULT_EDGE_STYLE;
}

/** The route an edge was given by hand, if it has one. */
export function ownEdgeRoute(layout: DiagramLayout, edgeId: string): EdgeRoute | undefined {
  return layout.edgeRoutes === undefined ? undefined : layoutEntry(layout.edgeRoutes, edgeId);
}
