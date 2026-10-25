import type { NodeKind, Point } from '@archdraft/core';
import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';

/** Distance a mouse or pen moves with the button down before a press on a tile becomes a drag. */
export const DRAG_DISTANCE = 5;
/** How long a finger rests on a tile to pick it up, and how far it may wander meanwhile. */
export const HOLD_MS = 280;
export const HOLD_TOLERANCE = 10;

/** A palette tile being carried to the diagram. */
export interface PaletteDrag {
  readonly kind: NodeKind;
  /** Pointer position in the window. */
  readonly point: Point;
  /** Whether letting go here adds the node: the pointer is over the diagram, not over a panel. */
  readonly overCanvas: boolean;
}

interface PaletteDragState {
  readonly drag: PaletteDrag | null;
}

export const paletteDragStore = createStore<PaletteDragState>()(() => ({ drag: null }));

export function usePaletteDrag<T>(selector: (state: PaletteDragState) => T): T {
  return useStore(paletteDragStore, selector);
}

export interface PressOptions {
  /** Called once the press becomes a drag; on phones, the sheet makes way for the diagram. */
  onStart?: () => void;
  /** Where the node is to be added, in window coordinates. */
  onDrop: (kind: NodeKind, point: Point) => void;
  isOverCanvas: (point: Point) => boolean;
}

/** Set when a drag ends, so that the click the browser may send to the tile does not add again. */
let dragJustEnded = false;

/** Whether this click finishes a drag rather than asking to add at the centre. Clears itself. */
export function takeDragClick(): boolean {
  const ended = dragJustEnded;
  dragJustEnded = false;
  return ended;
}

/**
 * Follows a press on a palette tile until it is a click or a drag. With a
 * mouse or a pen it becomes a drag after a few pixels; with a finger, after
 * resting on the tile for a moment, so that swiping still scrolls the
 * palette. While dragging, the tile follows the pointer (see
 * PaletteDragGhost) and letting go over the diagram adds the node there.
 * Escape, or letting go anywhere else, cancels it.
 *
 * The listeners live on the window, so the drag survives the sheet closing
 * under the finger.
 */
export function pressTile(
  kind: NodeKind,
  press: { pointerId: number; pointerType: string; clientX: number; clientY: number },
  { onStart, onDrop, isOverCanvas }: PressOptions,
): void {
  const { pointerId, pointerType, clientX, clientY } = press;
  const touch = pointerType === 'touch';
  const start = { x: clientX, y: clientY };
  let last = start;
  let dragging = false;

  const show = (point: Point) =>
    paletteDragStore.setState({ drag: { kind, point, overCanvas: isOverCanvas(point) } });

  const begin = () => {
    dragging = true;
    if (touch) navigator.vibrate?.(8);
    onStart?.();
    show(last);
  };

  const onMove = (event: PointerEvent) => {
    if (event.pointerId !== pointerId) return;
    last = { x: event.clientX, y: event.clientY };
    if (dragging) {
      show(last);
      return;
    }
    const distance = Math.hypot(last.x - start.x, last.y - start.y);
    // A finger that moves before the hold ends is scrolling the palette.
    if (touch) {
      if (distance > HOLD_TOLERANCE) stop();
    } else if (distance > DRAG_DISTANCE) {
      begin();
    }
  };

  const onUp = (event: PointerEvent) => {
    if (event.pointerId !== pointerId) return;
    if (dragging) {
      dragJustEnded = true;
      // The flag only concerns the click that may follow this release.
      setTimeout(() => {
        dragJustEnded = false;
      }, 0);
      const point = { x: event.clientX, y: event.clientY };
      if (isOverCanvas(point)) onDrop(kind, point);
    }
    stop();
  };

  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && dragging) stop();
  };

  // Once the tile is picked up, the finger moves it instead of scrolling the page.
  const onTouchMove = (event: TouchEvent) => {
    if (dragging) event.preventDefault();
  };

  const timer = touch ? setTimeout(begin, HOLD_MS) : undefined;

  function stop() {
    clearTimeout(timer);
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', stop);
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('touchmove', onTouchMove);
    paletteDragStore.setState({ drag: null });
  }

  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', stop);
  window.addEventListener('keydown', onKey);
  window.addEventListener('touchmove', onTouchMove, { passive: false });
}
