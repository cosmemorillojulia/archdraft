import { CanvasShortcuts } from './CanvasShortcuts.tsx';
import { ZoomControls } from './ZoomControls.tsx';

interface CanvasControlsProps {
  onFit: () => void;
  minZoom: number;
  maxZoom: number;
  /** Width of the overview of the diagram, which floats in the gap left for it; 0 when absent. */
  miniMapWidth: number;
}

/**
 * What floats over the corner of the canvas. On desktop it is a row of panels: the zoom at the
 * edge, the overview of the diagram next to it (a gap here, the map itself is drawn by React Flow),
 * and the shortcuts to its left. On touch screens the shortcuts and the zoom are one panel, in one column.
 */
export function CanvasControls({ miniMapWidth, ...zoom }: CanvasControlsProps) {
  return (
    <div className="pointer-events-auto flex flex-col items-center gap-0.5 max-md:floating max-md:rounded-panel max-md:p-1 md:flex-row-reverse md:items-end md:gap-2">
      <ZoomControls {...zoom} />
      {miniMapWidth > 0 && (
        <span aria-hidden="true" className="hidden md:block" style={{ width: miniMapWidth }} />
      )}
      <span aria-hidden="true" className="my-0.5 h-px w-5 bg-line md:hidden" />
      <CanvasShortcuts />
    </div>
  );
}
