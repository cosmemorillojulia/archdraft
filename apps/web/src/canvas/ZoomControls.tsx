import { DEFAULT_EDGE_STYLE } from '@archdraft/core';
import { useReactFlow, useViewport } from '@xyflow/react';
import { Activity, CornerDownRight, Maximize, Minus, Plus, Spline } from 'lucide-react';
import { memo } from 'react';
import { Button } from '../components/Button.tsx';
import { editorStore, useEditor } from '../editor/store.ts';
import { preferencesStore, usePreferences } from '../preferences.ts';
import { useStrings } from '../i18n/locale.ts';

/** Duration of the animated zoom steps, in milliseconds. */
const ZOOM_STEP_MS = 220;
/** Touch screens get 40 px buttons, close to the recommended 44 px target, in a compact column. */
const TOUCH_SIZE = 'max-md:size-10';

interface ZoomControlsProps {
  onFit: () => void;
  minZoom: number;
  maxZoom: number;
}

/**
 * Floating view controls: zoom and fit, the switch between curved and right-angled
 * connections, and the switch for the particles that travel along them. Pinching
 * (fingers or trackpad) and the mouse wheel zoom too; these buttons are the visible,
 * keyboard-friendly way to do it.
 */
export const ZoomControls = memo(function ZoomControls({
  onFit,
  minZoom,
  maxZoom,
}: ZoomControlsProps) {
  const strings = useStrings();
  const { zoomIn, zoomOut } = useReactFlow();
  const { zoom } = useViewport();
  const edgeStyle = useEditor(
    (state) => state.current?.document.layout.edgeStyle ?? DEFAULT_EDGE_STYLE,
  );
  const flowAnimation = usePreferences((state) => state.flowAnimation);
  const edgeStyleLabel =
    edgeStyle === 'curved' ? strings.canvas.edgeStyle.toSquare : strings.canvas.edgeStyle.toCurved;
  const flowLabel = flowAnimation ? strings.canvas.flow.hide : strings.canvas.flow.show;
  return (
    <div
      role="group"
      aria-label={strings.canvas.zoom.label}
      className="floating pointer-events-auto flex flex-col items-center gap-0.5 rounded-panel p-1 md:[&_button]:size-7"
    >
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
      <span aria-hidden="true" className="my-0.5 h-px w-5 bg-line" />
      <Button
        variant="ghost"
        size="icon"
        className={TOUCH_SIZE}
        aria-label={edgeStyleLabel}
        title={edgeStyleLabel}
        onClick={() =>
          editorStore.getState().setDefaultEdgeStyle(edgeStyle === 'curved' ? 'square' : 'curved')
        }
      >
        {edgeStyle === 'curved' ? (
          <Spline size={16} aria-hidden="true" />
        ) : (
          <CornerDownRight size={16} aria-hidden="true" />
        )}
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className={`${TOUCH_SIZE} aria-pressed:text-accent`}
        aria-label={strings.canvas.flow.label}
        aria-pressed={flowAnimation}
        title={flowLabel}
        onClick={() => preferencesStore.getState().setFlowAnimation(!flowAnimation)}
      >
        <Activity size={16} aria-hidden="true" />
      </Button>
    </div>
  );
});
