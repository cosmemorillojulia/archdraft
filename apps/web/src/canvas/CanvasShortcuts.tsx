import { DEFAULT_EDGE_STYLE } from '@archdraft/core';
import { Activity, CornerDownRight, Spline } from 'lucide-react';
import { memo } from 'react';
import { Button } from '../components/Button.tsx';
import { editorStore, useEditor } from '../editor/store.ts';
import { useStrings } from '../i18n/locale.ts';
import { preferencesStore, usePreferences } from '../preferences.ts';
import { CONTROL_GROUP, TOUCH_SIZE } from './ZoomControls.tsx';

/**
 * Shortcuts to the settings of the view that are worth having at hand, in a column of their
 * own next to the zoom: the switch between curved and right-angled connections and the one for
 * the particles that travel along them. Each shortcut is one button here; new ones go in the
 * same column.
 */
export const CanvasShortcuts = memo(function CanvasShortcuts() {
  const strings = useStrings();
  const edgeStyle = useEditor(
    (state) => state.current?.document.layout.edgeStyle ?? DEFAULT_EDGE_STYLE,
  );
  const flowAnimation = usePreferences((state) => state.flowAnimation);
  const edgeStyleLabel =
    edgeStyle === 'curved' ? strings.canvas.edgeStyle.toSquare : strings.canvas.edgeStyle.toCurved;
  const flowLabel = flowAnimation ? strings.canvas.flow.hide : strings.canvas.flow.show;
  return (
    <div role="group" aria-label={strings.canvas.shortcuts.label} className={CONTROL_GROUP}>
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
