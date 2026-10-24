/**
 * Shared motion tokens, so that every animation in the editor moves with the
 * same character. See docs/modulos/web.md, section Movimiento.
 */

/** Fast start, long soft landing: the curve for entrances and fades. */
export const EASE_OUT = [0.2, 0.8, 0.2, 1] as const;

/** Small elements that pop into place: nodes, tiles. */
export const SPRING_POP = { type: 'spring', stiffness: 380, damping: 28 } as const;

/** Panels and indicators that slide: palette, active template. */
export const SPRING_SLIDE = { type: 'spring', bounce: 0.18, duration: 0.45 } as const;
