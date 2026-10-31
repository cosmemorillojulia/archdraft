import { useReactFlow, useViewport } from '@xyflow/react';
import { Maximize, Minus, Plus } from 'lucide-react';
import { memo } from 'react';
import { Button } from '../components/Button.tsx';
import { useStrings } from '../i18n/locale.ts';

/** Duration of the animated zoom steps, in milliseconds. */
const ZOOM_STEP_MS = 220;
/** Touch screens get 40 px buttons, close to the recommended 44 px target, in a compact column. */
export const TOUCH_SIZE = 'max-md:size-10';
/**
 * A group of canvas buttons: a compact column that is a panel of its own on desktop. On touch
 * screens the groups share the one panel of `CanvasControls`.
 */
export const CONTROL_GROUP =
  'flex flex-col items-center gap-0.5 md:floating md:rounded-panel md:p-1 md:[&_button]:size-7';

interface ZoomControlsProps {
  onFit: () => void;
  minZoom: number;
  maxZoom: number;
}

/**
 * Zoom and fit. Pinching (fingers or trackpad) and the mouse wheel zoom too; these buttons are
 * the visible, keyboard-friendly way to do it.
 */
export const ZoomControls = memo(function ZoomControls({
  onFit,
  minZoom,
  maxZoom,
}: ZoomControlsProps) {
  const strings = useStrings();
  const { zoomIn, zoomOut } = useReactFlow();
  const { zoom } = useViewport();
  return (
    <div role="group" aria-label={strings.canvas.zoom.label} className={CONTROL_GROUP}>
      <Button
        variant="ghost"
        size="icon"
        className={TOUCH_SIZE}
        aria-label={strings.canvas.zoom.in}
        title={strings.canvas.zoom.in}
        disabled={zoom >= maxZoom}
        onClick={() => void zoomIn({ duration: ZOOM_STEP_MS })}
      >
        <Plus size={16} aria-hidden="true" />
      </Button>
      <span className="text-[10px] font-medium text-muted tabular-nums">
        {Math.round(zoom * 100)}%
      </span>
      <Button
        variant="ghost"
        size="icon"
        className={TOUCH_SIZE}
        aria-label={strings.canvas.zoom.out}
        title={strings.canvas.zoom.out}
        disabled={zoom <= minZoom}
        onClick={() => void zoomOut({ duration: ZOOM_STEP_MS })}
      >
        <Minus size={16} aria-hidden="true" />
      </Button>
      <span aria-hidden="true" className="my-0.5 h-px w-5 bg-line" />
      <Button
        variant="ghost"
        size="icon"
        className={TOUCH_SIZE}
        aria-label={strings.canvas.zoom.fit}
        title={strings.canvas.zoom.fit}
        onClick={onFit}
      >
        <Maximize size={15} aria-hidden="true" />
      </Button>
    </div>
  );
});
