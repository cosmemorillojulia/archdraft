import type { NodeKind } from '@archdraft/core';
import { NodeResizer, type OnResize, type OnResizeEnd } from '@xyflow/react';
import { useCallback } from 'react';
import { minSizeOf } from '../editor/operations.ts';
import { useCanvas } from './canvas-context.ts';

/**
 * Handles to resize a node, shown while it is selected: corners and edges,
 * with a large invisible target for fingers (styles.css). The size in
 * progress lives in the canvas and reaches the editor as one step when the
 * handle is let go. A circle keeps its proportions.
 *
 * The callbacks keep their identity: React Flow binds the gesture again when
 * they change, and a touch gesture bound again mid-resize never ended.
 */
export function ResizeHandles({
  id,
  kind,
  visible,
}: {
  id: string;
  kind: NodeKind;
  visible: boolean;
}) {
  const { resize } = useCanvas();
  const min = minSizeOf(kind);
  const onResize = useCallback<OnResize>((_event, box) => resize(id, box, false), [id, resize]);
  const onResizeEnd = useCallback<OnResizeEnd>(
    (_event, box) => resize(id, box, true),
    [id, resize],
  );
  return (
    <NodeResizer
      isVisible={visible}
      minWidth={min.width}
      minHeight={min.height}
      keepAspectRatio={kind === 'circle'}
      handleClassName="node-resize-handle"
      lineClassName="node-resize-line"
      onResize={onResize}
      onResizeEnd={onResizeEnd}
    />
  );
}
