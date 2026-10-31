import type { NodeProps } from '@xyflow/react';
import { m } from 'motion/react';
import { memo } from 'react';
import { KIND_ICONS } from '../icons.ts';
import { EASE_OUT } from '../motion.ts';
import { nodeChoice, useCanvas } from './canvas-context.ts';
import { groupTint } from './appearance.ts';
import type { ContainerFlowNode } from './flow.ts';
import { NameEditor } from './NameEditor.tsx';
import { ResizeHandles } from './ResizeHandles.tsx';

/** Extra tint of the group a dragged node would move into. */
const DROP_TINT = 6;

/**
 * A container (region, network, subnet, zone or boundary). Its fill is
 * opaque, so the canvas dots stay outside, and deepens with nesting. It
 * lights up when a dragged node would move into it. Selected, it can be
 * resized, never smaller than what it holds; its contents stay in place.
 */
export const ContainerNode = memo(function ContainerNode({
  id,
  data,
}: NodeProps<ContainerFlowNode>) {
  const { node, depth, appearDelay } = data;
  const Icon = KIND_ICONS[node.kind];
  const canvas = useCanvas();
  const { selected, grouped } = nodeChoice(canvas, id);
  const dropTarget = canvas.dropTargetId === id;
  const tint = groupTint(depth) + (dropTarget ? DROP_TINT : 0);

  return (
    <>
      <m.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: canvas.building ? appearDelay : 0, ease: EASE_OUT }}
        data-selected={selected || undefined}
        data-drop-target={dropTarget || undefined}
        className="h-full w-full rounded-[14px] border transition-[background-color,border-color,box-shadow] duration-200 data-drop-target:shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_25%,transparent)] data-selected:cursor-grab"
        style={{
          backgroundColor: `color-mix(in srgb, var(--accent) ${tint}%, var(--canvas))`,
          borderColor: selected || dropTarget ? 'var(--accent)' : 'var(--group-line)',
          borderStyle: node.kind === 'boundary' ? 'dashed' : 'solid',
        }}
      >
        <div className="flex items-center gap-1.5 px-3.5 pt-3 text-xs font-semibold text-muted">
          <Icon size={14} aria-hidden="true" className="shrink-0" />
          {canvas.renamingId === id ? (
            <NameEditor
              id={id}
              value={node.label}
              className="min-w-0 flex-1 px-1 text-xs font-semibold"
            />
          ) : (
            <span className="truncate">{node.label}</span>
          )}
        </div>
      </m.div>
      <ResizeHandles id={id} kind={node.kind} visible={selected && !grouped} />
    </>
  );
});
