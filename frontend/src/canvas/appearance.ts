import type { ChangeMark } from '../ai/assistant-store.ts';

/** Colour token of what a change does: new in green, changed in amber, removed in red. */
export const MARK_COLOR: Record<ChangeMark, string> = {
  added: 'var(--success)',
  updated: 'var(--warning)',
  removed: 'var(--danger)',
};

/** The ring around a marked node, in the colour of its change. */
export const markRing = (mark: ChangeMark) =>
  `0 0 0 3px color-mix(in srgb, ${MARK_COLOR[mark]} 30%, transparent)`;

/** Percentage of accent mixed into a group's fill, and how much more each nesting level adds. */
export const TINT_BASE = 3;
export const TINT_STEP = 2.5;

/** Accent in the fill of a group at this nesting depth, in percent. */
export function groupTint(depth: number): number {
  return TINT_BASE + depth * TINT_STEP;
}
