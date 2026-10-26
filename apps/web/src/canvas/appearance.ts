/** Percentage of accent mixed into a group's fill, and how much more each nesting level adds. */
export const TINT_BASE = 3;
export const TINT_STEP = 2.5;

/** Accent in the fill of a group at this nesting depth, in percent. */
export function groupTint(depth: number): number {
  return TINT_BASE + depth * TINT_STEP;
}
