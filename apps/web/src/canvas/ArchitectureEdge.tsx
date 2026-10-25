import { BaseEdge, EdgeLabelRenderer, type EdgeProps, getBezierPath } from '@xyflow/react';
import { AnimatePresence, m, useReducedMotion } from 'motion/react';
import { memo } from 'react';
import { EASE_OUT } from '../motion.ts';
import { strings } from '../strings.ts';
import { isSelected, useCanvas } from './canvas-context.ts';
import type { ArchitectureFlowEdge } from './flow.ts';

/** Speed of the flow particle, in diagram pixels per second, and its limits in seconds. */
const PARTICLE_SPEED = 110;
const PARTICLE_MIN_S = 1.2;
const PARTICLE_MAX_S = 4;

/**
 * A connection: a smooth curve that draws itself in when the diagram builds,
 * dashed when asynchronous, with a particle in the colour of its source that
 * travels along it. When it is selected, or either end is in focus, it turns
 * to the accent colour and shows its label.
 */
export const ArchitectureEdge = memo(function ArchitectureEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
}: EdgeProps<ArchitectureFlowEdge>) {
  const canvas = useCanvas();
  const reduceMotion = useReducedMotion() === true;
  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });
  if (!data) return null;

  const { edge, async, sourceCategory, appearDelay } = data;
  const selected = isSelected(canvas.selection, 'edge', id);
  const active = selected || canvas.edges.has(id);
  const dimmed = canvas.dimOthers && !active;
  const label = edge.label ?? (edge.protocol && strings.protocols[edge.protocol]);
  const travel = Math.min(
    Math.max(Math.hypot(targetX - sourceX, targetY - sourceY) / PARTICLE_SPEED, PARTICLE_MIN_S),
    PARTICLE_MAX_S,
  );
  // Dashes and pathLength both use stroke-dasharray, so async edges fade in instead of drawing.
  const reveal = async
    ? { initial: { opacity: 0 }, animate: { opacity: 1 } }
    : { initial: { pathLength: 0, opacity: 0 }, animate: { pathLength: 1, opacity: 1 } };

  return (
    <>
      <g className="transition-opacity duration-200" style={{ opacity: dimmed ? 0.15 : 1 }}>
        {/* Invisible wide stroke from React Flow, so the edge is easy to point at. */}
        <BaseEdge path={path} style={{ stroke: 'transparent' }} interactionWidth={20} />
        <m.path
          d={path}
          fill="none"
          strokeWidth={selected ? 2.5 : active ? 2 : 1.5}
          strokeDasharray={async ? '5 5' : undefined}
          markerEnd={`url(#${active ? canvas.markers.active : canvas.markers.idle})`}
          className="transition-[stroke,stroke-width] duration-200"
          style={{ stroke: active ? 'var(--accent)' : 'var(--edge)' }}
          {...reveal}
          transition={{ duration: 0.55, delay: canvas.building ? appearDelay : 0, ease: EASE_OUT }}
        />
        {!reduceMotion && (
          <m.circle
            r={async ? 2.25 : 2.5}
            style={{ fill: `var(--cat-${sourceCategory})` }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.9 }}
            transition={{ duration: 0.4, delay: canvas.building ? appearDelay + 0.6 : 0.3 }}
          >
            <animateMotion dur={`${travel}s`} repeatCount="indefinite" path={path} />
          </m.circle>
        )}
      </g>
      <EdgeLabelRenderer>
        {/* Positioned by a plain wrapper: Motion writes its own transform on the animated child. */}
        <div
          className="nodrag nopan pointer-events-none absolute"
          style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
        >
          <AnimatePresence>
            {active && label !== undefined && (
              <m.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18, ease: EASE_OUT }}
                className="rounded-full bg-accent px-2 py-0.5 text-[10.5px] font-semibold whitespace-nowrap text-on-accent"
              >
                {label}
              </m.div>
            )}
          </AnimatePresence>
        </div>
      </EdgeLabelRenderer>
    </>
  );
});
