import type { EdgeStyle } from '@archdraft/core';
import { getBezierPath, getSmoothStepPath, type Position } from '@xyflow/react';

/** Radius of the corners of a right-angled connection, in diagram pixels. */
export const CORNER_RADIUS = 6;

export interface ConnectionEnds {
  readonly sourceX: number;
  readonly sourceY: number;
  readonly targetX: number;
  readonly targetY: number;
  readonly sourcePosition: Position;
  readonly targetPosition: Position;
}

/**
 * SVG path of a connection drawn in `style`, and the point for its label. Both
 * styles leave a side of the source and reach a side of the target straight,
 * so the arrowhead (`arrowhead` in geometry.ts) fits either one.
 */
export function connectionPath(
  style: EdgeStyle,
  ends: ConnectionEnds,
): [path: string, labelX: number, labelY: number] {
  const [path, labelX, labelY] =
    style === 'square'
      ? getSmoothStepPath({ ...ends, borderRadius: CORNER_RADIUS })
      : getBezierPath(ends);
  return [path, labelX, labelY];
}
