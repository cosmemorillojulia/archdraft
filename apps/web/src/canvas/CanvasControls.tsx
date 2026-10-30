import { CanvasShortcuts } from './CanvasShortcuts.tsx';
import { ZoomControls } from './ZoomControls.tsx';

interface CanvasControlsProps {
  onFit: () => void;
  minZoom: number;
  maxZoom: number;
}

/**
 * What floats over the corner of the canvas. On desktop it is two panels side by side: the
 * zoom at the edge, and the shortcuts to its left. On touch screens both are one panel, in one
 * column.
 */
export function CanvasControls(props: CanvasControlsProps) {
  return (
    <div className="pointer-events-auto flex flex-col items-center gap-0.5 max-md:floating max-md:rounded-panel max-md:p-1 md:flex-row-reverse md:items-end md:gap-2">
      <ZoomControls {...props} />
      <span aria-hidden="true" className="my-0.5 h-px w-5 bg-line md:hidden" />
      <CanvasShortcuts />
    </div>
  );
}
