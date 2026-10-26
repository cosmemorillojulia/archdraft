import type { NodeProps } from '@xyflow/react';
import { m } from 'motion/react';
import { memo } from 'react';
import { SPRING_POP } from '../motion.ts';
import { isSelected, useCanvas } from './canvas-context.ts';
import type { ShapeFlowNode } from './flow.ts';
import { ConnectionHandles } from './ConnectionHandles.tsx';
import { ResizeHandles } from './ResizeHandles.tsx';

/**
 * Outline of the diamond and the note, drawn in a 100 × 100 box stretched to
 * the node; the stroke keeps its width (`vector-effect`).
 */
const OUTLINES = {
  diamond: 'M50 1 L99 50 L50 99 L1 50 Z',
  note: 'M1 1 H85 L99 15 V99 H1 Z M85 1 V15 H99',
} as const;

/**
 * A plain figure for simple flows: a box, a circle, a diamond or a note, with
 * its text in the middle. It has no architecture meaning, so it shows no
 * product and the design review ignores it. Selected, it can be resized; a
 * circle keeps its proportions.
 */
export const ShapeNode = memo(function ShapeNode({
  id,
  data,
  isConnectable,
}: NodeProps<ShapeFlowNode>) {
  const { node, appearDelay } = data;
  const canvas = useCanvas();
  const focused = canvas.focusId === id;
  const dimmed = canvas.dimOthers && !canvas.nodes.has(id);
  const selected = isSelected(canvas.selection, 'node', id);
  const kind = node.kind;
  const outline = kind === 'diamond' || kind === 'note' ? OUTLINES[kind] : null;
  const stroke = focused || selected ? 'var(--accent)' : 'var(--shape-line)';
  const fill = kind === 'note' ? 'var(--note)' : 'var(--surface)';

  return (
    // Connection points stay outside the animated figure, so React Flow measures them unscaled.
    <div className="group h-full w-full">
      <m.div
        initial={{ opacity: 0, scale: 0.86 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ ...SPRING_POP, delay: canvas.building ? appearDelay : 0 }}
        className="h-full w-full"
      >
        <div
          data-state={focused ? 'focused' : dimmed ? 'dimmed' : 'idle'}
          data-selected={selected || undefined}
          title={node.label}
          className="relative flex h-full w-full items-center justify-center transition-[opacity,transform] duration-200 ease-out-soft data-[state=dimmed]:opacity-30 data-[state=focused]:scale-[1.03]"
        >
          {outline === null ? (
            <span
              aria-hidden="true"
              className={`absolute inset-0 border-[1.5px] transition-[border-color,box-shadow] duration-200 ${
                kind === 'circle' ? 'rounded-full' : 'rounded-lg'
              } ${selected ? 'shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_25%,transparent)]' : ''}`}
              style={{ borderColor: stroke, backgroundColor: fill }}
            />
          ) : (
            <svg
              aria-hidden="true"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              className="absolute inset-0 h-full w-full overflow-visible"
            >
              <path
                d={outline}
                vectorEffect="non-scaling-stroke"
                strokeWidth={1.5}
                strokeLinejoin="round"
                className="transition-[stroke] duration-200"
                style={{ stroke, fill }}
              />
            </svg>
          )}
          <span
            className={`relative line-clamp-3 text-center text-[13px] leading-snug font-medium break-words ${
              kind === 'diamond' ? 'max-w-[62%]' : kind === 'circle' ? 'max-w-[74%]' : 'max-w-[88%]'
            }`}
          >
            {node.label}
          </span>
        </div>
      </m.div>
      {/* After the figure, so its corner handles are above it. */}
      <ResizeHandles id={id} kind={kind} visible={selected} />
      <ConnectionHandles selected={selected} isConnectable={isConnectable} />
    </div>
  );
});
