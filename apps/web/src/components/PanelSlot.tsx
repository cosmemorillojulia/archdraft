import { AnimatePresence } from 'motion/react';
import { isInspectorExpanded, useEditor } from '../editor/store.ts';
import { useReview } from '../review/review-store.ts';
import type { PanelPlacement } from './FloatingPanel.tsx';
import { GroupPanel, Inspector, useInspecting } from './Inspector.tsx';
import { ReviewPanel } from './ReviewPanel.tsx';

/**
 * The place under the diagram card, or across the bottom on narrow screens,
 * for one panel at a time: the design review while it is open, otherwise
 * the inspector of the selection. One panel leaves as the other arrives.
 */
export function PanelSlot({ placement }: { placement: PanelPlacement }) {
  const reviewOpen = useReview((state) => state.open);
  const inspecting = useInspecting(placement);
  const selection = useEditor((state) => state.selection);
  const group = useEditor((state) => state.group);
  const graph = useEditor((state) => state.current?.document.graph);
  const expanded = useEditor(isInspectorExpanded);

  return (
    <AnimatePresence mode="popLayout" initial={false}>
      {reviewOpen ? (
        <ReviewPanel key="review" placement={placement} />
      ) : inspecting && selection && graph ? (
        group.length > 1 ? (
          <GroupPanel key="group" placement={placement} count={group.length} />
        ) : (
          <Inspector
            key="inspector"
            placement={placement}
            selection={selection}
            graph={graph}
            expanded={expanded}
          />
        )
      ) : null}
    </AnimatePresence>
  );
}
