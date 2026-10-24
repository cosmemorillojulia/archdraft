import type { NodeProps } from '@xyflow/react';
import { m } from 'motion/react';
import { memo } from 'react';
import { KIND_ICONS } from '../icons.ts';
import { EASE_OUT } from '../motion.ts';
import type { ContainerFlowNode } from './flow.ts';

/** Percentage of accent mixed into a group's fill, and how much more each nesting level adds. */
const TINT_BASE = 3;
const TINT_STEP = 2.5;

/**
 * A container (region, network, subnet, zone or boundary). Its fill is
 * opaque, so the canvas dots stay outside, and deepens with nesting.
 */
export const ContainerNode = memo(function ContainerNode({ data }: NodeProps<ContainerFlowNode>) {
  const { node, depth, appearDelay } = data;
  const Icon = KIND_ICONS[node.kind];
  return (
    <m.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5, delay: appearDelay, ease: EASE_OUT }}
      className="h-full w-full rounded-[14px] border"
      style={{
        backgroundColor: `color-mix(in srgb, var(--accent) ${TINT_BASE + depth * TINT_STEP}%, var(--canvas))`,
        borderColor: 'var(--group-line)',
        borderStyle: node.kind === 'boundary' ? 'dashed' : 'solid',
      }}
    >
      <div className="flex items-center gap-1.5 px-3.5 pt-3 text-xs font-semibold text-muted">
        <Icon size={14} aria-hidden="true" className="shrink-0" />
        <span className="truncate">{node.label}</span>
      </div>
    </m.div>
  );
});
