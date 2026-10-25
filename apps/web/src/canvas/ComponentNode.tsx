import { Handle, type NodeProps } from '@xyflow/react';
import { m } from 'motion/react';
import { memo } from 'react';
import { KIND_ICONS } from '../icons.ts';
import { SPRING_POP } from '../motion.ts';
import { strings } from '../strings.ts';
import { isSelected, useCanvas } from './canvas-context.ts';
import type { ComponentFlowNode } from './flow.ts';

/**
 * A component on the canvas: the icon of its kind on the colour of its
 * category, its name, the product it resolves to and, when it runs outside
 * the provider of the diagram, a badge saying so. Dragging from the dot on
 * its outgoing side, shown on hover or when selected, connects it.
 */
export const ComponentNode = memo(function ComponentNode({
  id,
  data,
  isConnectable,
}: NodeProps<ComponentFlowNode>) {
  const { node, category, service, providerBadge, sourcePosition, targetPosition, appearDelay } =
    data;
  const Icon = KIND_ICONS[node.kind];
  const canvas = useCanvas();
  const focused = canvas.focusId === id;
  const dimmed = canvas.dimOthers && !canvas.nodes.has(id);
  const selected = isSelected(canvas.selection, 'node', id);

  return (
    <m.div
      initial={{ opacity: 0, scale: 0.86, y: 6 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ ...SPRING_POP, delay: canvas.building ? appearDelay : 0 }}
      className="group h-full w-full"
    >
      <div
        data-state={focused ? 'focused' : dimmed ? 'dimmed' : 'idle'}
        data-selected={selected || undefined}
        title={service === node.label ? node.label : `${node.label}: ${service}`}
        className="relative flex h-full w-full items-center gap-2.5 rounded-xl border bg-surface px-3 outline-2 outline-offset-2 outline-transparent transition-[opacity,transform,border-color,box-shadow,outline-color] duration-200 ease-out-soft data-selected:outline-accent data-[state=dimmed]:opacity-30 data-[state=focused]:scale-[1.04] data-[state=focused]:shadow-[0_8px_20px_-6px_rgb(17_24_39/0.25)]"
        style={{ borderColor: focused || selected ? `var(--cat-${category})` : 'var(--line)' }}
      >
        <span
          className="flex size-9 shrink-0 items-center justify-center rounded-[10px]"
          style={{ color: `var(--cat-${category})`, backgroundColor: `var(--cat-${category}-bg)` }}
        >
          <Icon size={18} strokeWidth={1.75} aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] leading-tight font-semibold">
            {node.label}
          </span>
          <span className="block truncate text-[11px] leading-tight text-muted">{service}</span>
        </span>
        {providerBadge !== undefined && (
          <span className="absolute -top-2 right-2 rounded-full border border-line bg-surface px-1.5 text-[9.5px] leading-4 font-medium text-muted">
            {strings.canvas.providerBadges[providerBadge]}
          </span>
        )}
      </div>
      <Handle
        type="target"
        position={targetPosition}
        isConnectable={isConnectable}
        className="pointer-events-none opacity-0"
      />
      <Handle
        type="source"
        position={sourcePosition}
        isConnectable={isConnectable}
        data-selected={selected || undefined}
        className="connect-handle"
      />
    </m.div>
  );
});
