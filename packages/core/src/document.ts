import { z } from 'zod';
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

function boundedRecord<T extends z.ZodType>(value: T) {
  return z
    .record(IdSchema, value)
    .refine((record) => Object.keys(record).length <= LIMITS.maxNodes, {
      message: `At most ${LIMITS.maxNodes} entries`,
    });
}

export const DiagramLayoutSchema = z.strictObject({
  positions: boundedRecord(PointSchema).describe('Top left corner per node id, parent relative'),
  sizes: boundedRecord(SizeSchema).describe('Width and height per node id'),
});

/** What the editor stores, shares and restores: the graph plus how it is drawn. */
export const DiagramDocumentSchema = z.strictObject({
  graph: ArchitectureGraphSchema,
  layout: DiagramLayoutSchema,
});

export type Point = z.infer<typeof PointSchema>;
export type Size = z.infer<typeof SizeSchema>;
export type DiagramLayout = z.infer<typeof DiagramLayoutSchema>;
export type DiagramDocument = z.infer<typeof DiagramDocumentSchema>;

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
