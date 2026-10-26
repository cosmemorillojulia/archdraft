import { isShapeKind, type NodeKind, type Point } from '@archdraft/core';
import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';

/** Distance a mouse or pen moves with the button down before a press on a tile becomes a drag. */
export const DRAG_DISTANCE = 5;
/** How long a finger rests on a tile to pick it up, and how far it may wander meanwhile. */
export const HOLD_MS = 280;
export const HOLD_TOLERANCE = 10;

/** Pixels a press on the diagram moves before a shape is drawn to the size dragged, not placed. */
export const DRAW_DISTANCE = 6;

/** A palette tile being carried to the diagram. */
export interface PaletteDrag {
  readonly kind: NodeKind;
  /** Pointer position in the window. */
  readonly point: Point;
  /** Whether letting go here adds the node: the pointer is over the diagram, not over a panel. */
  readonly overCanvas: boolean;
  /** Whether the pointer is over the box that throws the node away. */
  readonly overDiscard: boolean;
  /** Held down from the tile (`drag`), or stuck to the pointer after a click on it (`carry`). */
  readonly mode: 'drag' | 'carry';
  /** The box a shape is being drawn into on the diagram, if it is. */
  readonly drawing: DrawnBox | null;
}

/** Keys held while drawing: Shift keeps the sides equal, Alt draws from the centre. */
export interface DrawKeys {
  readonly shift: boolean;
  readonly alt: boolean;
}

/** Two opposite corners of a shape drawn on the diagram, in window coordinates. */
export interface DrawnBox {
  readonly from: Point;
  readonly to: Point;
}

/**
 * The box a shape is drawn into, as in Excalidraw: from where the press
 * started to the pointer. A circle, or any shape with Shift held, takes the
 * longer side for both, towards the pointer; with Alt the press is the centre
 * and the box grows to both sides of it.
 */
export function drawnBox(kind: NodeKind, from: Point, to: Point, keys: DrawKeys): DrawnBox {
  let dx = to.x - from.x;
  let dy = to.y - from.y;
  if (kind === 'circle' || keys.shift) {
    const side = Math.max(Math.abs(dx), Math.abs(dy));
    dx = dx < 0 ? -side : side;
    dy = dy < 0 ? -side : side;
  }
  return keys.alt
    ? { from: { x: from.x - dx, y: from.y - dy }, to: { x: from.x + dx, y: from.y + dy } }
    : { from, to: { x: from.x + dx, y: from.y + dy } };
}

/** Whether a point of the window is over the box that discards what is being carried. */
export function isOverDiscard(point: Point): boolean {
  const element = document.elementFromPoint(point.x, point.y);
  return (element?.closest('[data-discard-drop]') ?? null) !== null;
}

/** Ends the tile stuck to the pointer, if there is one. */
let stopCarrying: (() => void) | null = null;

/** Drops what is being carried without adding it. */
export function discardCarried(): void {
  stopCarrying?.();
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
  /**
   * Where the node is to be added, in window coordinates; for a shape drawn on the diagram, also
   * the box that was drawn.
   */
  onDrop: (kind: NodeKind, point: Point, drawn?: DrawnBox) => void;
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
  stopCarrying?.();
  const { pointerId, pointerType, clientX, clientY } = press;
  const touch = pointerType === 'touch';
  const start = { x: clientX, y: clientY };
  let last = start;
  let dragging = false;

  const show = (point: Point) =>
    paletteDragStore.setState({
      drag: {
        kind,
        point,
        overCanvas: isOverCanvas(point),
        overDiscard: isOverDiscard(point),
        mode: 'drag',
        drawing: null,
      },
    });

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
      if (isOverCanvas(point) && !isOverDiscard(point)) onDrop(kind, point);
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

/**
 * A click on a tile with a mouse or a pen sticks the node to the pointer
 * until it is placed: a click on the diagram adds it there, and a shape can
 * instead be drawn at the size dragged, as in Excalidraw. The box at the top
 * (`data-discard-drop`), Escape or the right button throw it away. The
 * listeners live on the window, and the press that places the node is not
 * passed on, so it neither pans nor selects.
 */
export function carryTile(
  kind: NodeKind,
  start: Point,
  { onDrop, isOverCanvas }: Pick<PressOptions, 'onDrop' | 'isOverCanvas'>,
): void {
  stopCarrying?.();
  const shape = isShapeKind(kind);
  let last = start;
  let keys: DrawKeys = { shift: false, alt: false };
  let pointerId: number | null = null;
  let drawFrom: Point | null = null;

  const box = (): DrawnBox | null =>
    drawFrom === null ? null : drawnBox(kind, drawFrom, last, keys);

  const show = () => {
    const drawing = box();
    paletteDragStore.setState({
      drag: {
        kind,
        point: last,
        overCanvas: isOverCanvas(last),
        overDiscard: isOverDiscard(last),
        mode: 'carry',
        drawing,
      },
    });
  };

  const remember = (event: PointerEvent | KeyboardEvent) => {
    keys = { shift: event.shiftKey, alt: event.altKey };
  };

  const onMove = (event: PointerEvent) => {
    last = { x: event.clientX, y: event.clientY };
    remember(event);
    show();
  };

  const onDown = (event: PointerEvent) => {
    if (event.button !== 0) {
      event.preventDefault();
      stop();
      return;
    }
    const point = { x: event.clientX, y: event.clientY };
    // Clicks on the box that discards, or on a panel, are for those; a panel may hold another tile.
    if (!isOverCanvas(point) || isOverDiscard(point)) return;
    event.preventDefault();
    event.stopPropagation();
    pointerId = event.pointerId;
    last = point;
    remember(event);
    window.addEventListener('click', swallow, true);
    if (shape) drawFrom = point;
    show();
  };

  const onUp = (event: PointerEvent) => {
    if (event.pointerId !== pointerId) return;
    last = { x: event.clientX, y: event.clientY };
    remember(event);
    const drawing = box();
    const drawn =
      drawing !== null &&
      Math.hypot(last.x - drawing.from.x, last.y - drawing.from.y) > DRAW_DISTANCE;
    // A drawing ends wherever the pointer is let go, as in Excalidraw, except over the discard box.
    if (!isOverDiscard(last)) {
      if (drawn) onDrop(kind, drawing.from, drawing);
      else if (isOverCanvas(last)) onDrop(kind, drawFrom ?? last);
    }
    stop();
  };

  /** Shift and Alt pressed or let go while drawing change the box at once. */
  const onKeyChange = (event: KeyboardEvent) => {
    if (drawFrom === null) return;
    remember(event);
    show();
  };

  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape') stop();
  };

  /** The click that follows the press placing the node must not select what is under it. */
  const swallow = (event: Event) => {
    event.stopPropagation();
    event.preventDefault();
  };

  function stop() {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerdown', onDown, true);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', stop);
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('keydown', onKeyChange);
    window.removeEventListener('keyup', onKeyChange);
    window.removeEventListener('contextmenu', stop);
    delete document.documentElement.dataset.drawing;
    // The click, if any, comes right after the release.
    setTimeout(() => window.removeEventListener('click', swallow, true), 0);
    if (stopCarrying === stop) stopCarrying = null;
    paletteDragStore.setState({ drag: null });
  }

  stopCarrying = stop;
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerdown', onDown, true);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', stop);
  window.addEventListener('keydown', onKey);
  window.addEventListener('keydown', onKeyChange);
  window.addEventListener('keyup', onKeyChange);
  window.addEventListener('contextmenu', stop);
  // Shapes are drawn with a crosshair, as in Excalidraw (see styles.css).
  if (shape) document.documentElement.dataset.drawing = '';
  show();
}
