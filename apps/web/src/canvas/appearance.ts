import type { LayoutDirection } from '@archdraft/layout';
import { Position } from '@xyflow/react';

/** Sides of a node that edges leave from and arrive at, by flow direction. */
export const FLOW_HANDLES: Record<LayoutDirection, { source: Position; target: Position }> = {
  LR: { source: Position.Right, target: Position.Left },
  RL: { source: Position.Left, target: Position.Right },
  TB: { source: Position.Bottom, target: Position.Top },
  BT: { source: Position.Top, target: Position.Bottom },
};

/** Percentage of accent mixed into a group's fill, and how much more each nesting level adds. */
export const TINT_BASE = 3;
export const TINT_STEP = 2.5;

/** Accent in the fill of a group at this nesting depth, in percent. */
export function groupTint(depth: number): number {
  return TINT_BASE + depth * TINT_STEP;
}
