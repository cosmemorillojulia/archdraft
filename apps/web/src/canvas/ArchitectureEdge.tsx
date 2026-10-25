import { BaseEdge, EdgeLabelRenderer, type EdgeProps, getBezierPath } from '@xyflow/react';
import { AnimatePresence, m, useReducedMotion } from 'motion/react';
import { memo, useState } from 'react';
import { EASE_OUT } from '../motion.ts';
import { strings } from '../strings.ts';
import { isSelected, useCanvas } from './canvas-context.ts';
import type { ArchitectureFlowEdge } from './flow.ts';
import { arrowhead } from './geometry.ts';

/** Speed of the flow particle, in diagram pixels per second, and its limits in seconds. */
const PARTICLE_SPEED = 110;
const PARTICLE_MIN_S = 1.2;
const PARTICLE_MAX_S = 4;

/** Seconds the line takes to draw in; the arrowhead appears as it arrives. */
const DRAW_S = 0.55;

/**
 * A connection: a smooth curve that draws itself in when the diagram builds,
 * dashed when asynchronous, ending in an arrowhead, with a particle in the
 * colour of its source that travels along it. When it is selected, or either
 * end is in focus, it turns to the accent colour and shows its label.
 *
 * The arrowhead is drawn here rather than as an SVG marker: a marker scales
 * with the stroke width, cannot fade its colour, and shows before the line
 * has drawn in. The line stops at the base of the arrowhead, whose tip
 * touches the target.
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
  // Drawing in uses a normalised dash, which Chromium does not rescale when the path changes
  // length (a node moved); once drawn, the line is a plain path.
  const [drawn, setDrawn] = useState(false);
  const arrow = arrowhead(targetX, targetY, targetPosition);
  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX: arrow.base.x,
    targetY: arrow.base.y,
    sourcePosition,
    targetPosition,
  });
  if (!data) return null;

  const { edge, async, sourceCategory, appearDelay } = data;
  const selected = isSelected(canvas.selection, 'edge', id);
  const active = selected || canvas.edges.has(id);
  const dimmed = canvas.dimOthers && !active;
  const label = edge.label ?? (edge.protocol && strings.protocols[edge.protocol]);
  const colour = active ? 'var(--accent)' : 'var(--edge)';
  const strokeWidth = selected ? 2.5 : active ? 2 : 1.5;
  const delay = canvas.building ? appearDelay : 0;
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
        {drawn ? (
          <path
            d={path}
            fill="none"
            strokeWidth={strokeWidth}
            strokeDasharray={async ? '5 5' : undefined}
            className="transition-[stroke,stroke-width] duration-200"
            style={{ stroke: colour }}
          />
        ) : (
          <m.path
            d={path}
            fill="none"
            strokeWidth={strokeWidth}
            strokeDasharray={async ? '5 5' : undefined}
            className="transition-[stroke,stroke-width] duration-200"
            style={{ stroke: colour }}
            {...reveal}
            transition={{ duration: DRAW_S, delay, ease: EASE_OUT }}
            onAnimationComplete={() => setDrawn(true)}
          />
        )}
        <m.path
          d={arrow.outline}
          strokeWidth={1.5}
          strokeLinejoin="round"
          className="transition-[fill,stroke] duration-200"
          style={{ fill: colour, stroke: colour }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.15, delay: delay + (canvas.building ? DRAW_S * 0.8 : 0) }}
        />
        {canvas.particles && !reduceMotion && (
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
