import { AnimatePresence } from 'motion/react';
import { useEditor } from '../editor/store.ts';
import { useReview } from '../review/review-store.ts';
import type { PanelPlacement } from './FloatingPanel.tsx';
import { Inspector, useInspecting } from './Inspector.tsx';
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
  const graph = useEditor((state) => state.current?.document.graph);

  return (
    <AnimatePresence mode="popLayout" initial={false}>
      {reviewOpen ? (
        <ReviewPanel key="review" placement={placement} />
      ) : inspecting && selection && graph ? (
        <Inspector key="inspector" placement={placement} selection={selection} graph={graph} />
      ) : null}
    </AnimatePresence>
  );
}
