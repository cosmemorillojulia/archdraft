import { BaseEdge, EdgeLabelRenderer, type EdgeProps } from '@xyflow/react';
import { AnimatePresence, m } from 'motion/react';
import { memo, useState } from 'react';
import { EASE_OUT } from '../motion.ts';
import { useStrings } from '../i18n/locale.ts';
import { MARK_COLOR } from './appearance.ts';
import { isSelected, markOf, useCanvas } from './canvas-context.ts';
import { connectionPath, routePoints } from './edge-path.ts';
import { EdgeRouteHandles, type RoutePreview } from './EdgeRouteHandles.tsx';
import type { ArchitectureFlowEdge } from './flow.ts';
import { arrowhead, type EdgeSides, sidePoint } from './geometry.ts';

/** Speed of the flow particle, in diagram pixels per second, and its limits in seconds. */
const PARTICLE_SPEED = 110;
const PARTICLE_MIN_S = 1.2;
const PARTICLE_MAX_S = 4;

/** Seconds the line takes to draw in; the arrowhead appears as it arrives. */
const DRAW_S = 0.55;

/**
 * A connection: a smooth curve, or a line of right angles, that draws itself in when the
 * diagram builds, dashed when asynchronous, ending in an arrowhead, with a particle in the
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
  const strings = useStrings();
  const canvas = useCanvas();
  // Drawing in uses a normalised dash, which Chromium does not rescale when the path changes
  // length (a node moved); once drawn, the line is a plain path.
  const [drawn, setDrawn] = useState(false);
  // What a handle being dragged shows until it is let go.
  const [preview, setPreview] = useState<RoutePreview | null>(null);
  if (!data) return null;

  const {
    edge,
    async,
    style,
    route,
    sourceBox,
    targetBox,
    direction,
    sourceCategory,
    appearDelay,
  } = data;
  // The sides come from the handles React Flow measured, except while another side, or another
  // node, is being tried.
  const settled: EdgeSides = { source: sourcePosition, target: targetPosition };
  const reconnecting = preview?.kind === 'reconnect' ? preview : null;
  const trying = preview?.kind === 'sides' ? preview.sides : (reconnecting?.sides ?? null);
  const fromBox = reconnecting?.end === 'source' ? reconnecting.box : sourceBox;
  const toBox = reconnecting?.end === 'target' ? reconnecting.box : targetBox;
  const sides = trying ?? settled;
  const start = trying ? sidePoint(fromBox, trying.source) : { x: sourceX, y: sourceY };
  const tip = trying ? sidePoint(toBox, trying.target) : { x: targetX, y: targetY };
  const arrow = arrowhead(tip.x, tip.y, sides.target);
  const ends = {
    sourceX: start.x,
    sourceY: start.y,
    targetX: arrow.base.x,
    targetY: arrow.base.y,
    sourcePosition: sides.source,
    targetPosition: sides.target,
  };
  const stored = routePoints(style, ends, route);
  // Another node has no use for the points put for this one.
  const points = preview?.kind === 'points' ? preview.points : reconnecting ? [] : stored;
  const shape = connectionPath(style, ends, points);
  const { path, labelX, labelY } = shape;
  const selected = isSelected(canvas.selection, 'edge', id);
  const active = selected || canvas.edges.has(id);
  const dimmed = canvas.dimOthers && !active;
  const mark = markOf(canvas, 'edge', id);
  const removed = mark === 'removed';
  const label = edge.label ?? (edge.protocol && strings.protocols[edge.protocol]);
  const colour = mark ? MARK_COLOR[mark] : active ? 'var(--accent)' : 'var(--edge)';
  const strokeWidth = selected ? 2.5 : active || mark ? 2 : 1.5;
  // A connection that goes is dotted like no other, asynchronous or not.
  const dashes = removed ? '2 5' : async ? '5 5' : undefined;
  const delay = canvas.building ? appearDelay : 0;
  const travel = Math.min(
    Math.max(Math.hypot(tip.x - start.x, tip.y - start.y) / PARTICLE_SPEED, PARTICLE_MIN_S),
    PARTICLE_MAX_S,
  );
  // Dashes and pathLength both use stroke-dasharray, so async edges fade in instead of drawing.
  const reveal = async
    ? { initial: { opacity: 0 }, animate: { opacity: 1 } }
    : { initial: { pathLength: 0, opacity: 0 }, animate: { pathLength: 1, opacity: 1 } };

  return (
    <>
      <g
        className="transition-opacity duration-200"
        style={{ opacity: dimmed ? 0.15 : removed ? 0.7 : 1 }}
      >
        {/* Invisible wide stroke from React Flow, so the edge is easy to point at. */}
        <BaseEdge path={path} style={{ stroke: 'transparent' }} interactionWidth={20} />
        {drawn ? (
          <path
            d={path}
            fill="none"
            strokeWidth={strokeWidth}
            strokeDasharray={dashes}
            className="transition-[stroke,stroke-width] duration-200"
            style={{ stroke: colour }}
          />
        ) : (
          <m.path
            d={path}
            fill="none"
            strokeWidth={strokeWidth}
            strokeDasharray={dashes}
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
        {canvas.particles && !removed && (
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
                style={mark ? { backgroundColor: MARK_COLOR[mark], color: 'var(--surface)' } : {}}
              >
                {label}
              </m.div>
            )}
          </AnimatePresence>
        </div>
        {selected && (
          <EdgeRouteHandles
            id={id}
            style={style}
            sides={settled}
            source={start}
            target={tip}
            ends={ends}
            shape={shape}
            points={stored}
            sourceId={edge.source}
            targetId={edge.target}
            sourceBox={sourceBox}
            targetBox={targetBox}
            direction={direction}
            route={route}
            onPreview={setPreview}
          />
        )}
      </EdgeLabelRenderer>
    </>
  );
});
