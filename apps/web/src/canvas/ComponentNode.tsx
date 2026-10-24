import { Handle, type NodeProps } from '@xyflow/react';
import { m } from 'motion/react';
import { memo } from 'react';
import { KIND_ICONS } from '../icons.ts';
import { SPRING_POP } from '../motion.ts';
import { strings } from '../strings.ts';
import type { ComponentFlowNode } from './flow.ts';
import { useHighlight } from './highlight.ts';

/**
 * A component on the canvas: the icon of its kind on the colour of its
 * category, its name, the product it resolves to and, when it runs outside
 * the provider of the diagram, a badge saying so.
 */
export const ComponentNode = memo(function ComponentNode({
  id,
  data,
}: NodeProps<ComponentFlowNode>) {
  const { node, category, service, providerBadge, sourcePosition, targetPosition, appearDelay } =
    data;
  const Icon = KIND_ICONS[node.kind];
  const highlight = useHighlight();
  const focused = highlight.focusId === id;
  const dimmed = highlight.focusId !== null && !highlight.nodes.has(id);

  return (
    <m.div
      initial={{ opacity: 0, scale: 0.86, y: 6 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ ...SPRING_POP, delay: appearDelay }}
      className="h-full w-full"
    >
      <div
        data-state={focused ? 'focused' : dimmed ? 'dimmed' : 'idle'}
        title={service === node.label ? node.label : `${node.label}: ${service}`}
        className="relative flex h-full w-full items-center gap-2.5 rounded-xl border bg-surface px-3 transition-[opacity,transform,border-color,box-shadow] duration-200 ease-out-soft data-[state=dimmed]:opacity-30 data-[state=focused]:scale-[1.04] data-[state=focused]:shadow-[0_8px_20px_-6px_rgb(17_24_39/0.25)]"
        style={{ borderColor: focused ? `var(--cat-${category})` : 'var(--line)' }}
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
      <Handle type="target" position={targetPosition} isConnectable={false} className="opacity-0" />
      <Handle type="source" position={sourcePosition} isConnectable={false} className="opacity-0" />
    </m.div>
  );
});
