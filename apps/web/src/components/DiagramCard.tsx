import { type ArchitectureGraph, isContainerKind, lintGraph } from '@archdraft/core';
import { Boxes, Cable, CircleCheck, TriangleAlert } from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';
import { useId, useMemo } from 'react';
import { EASE_OUT } from '../motion.ts';
import { strings } from '../strings.ts';

/** Floating summary of the current diagram: what it is, its size and its design review. */
export function DiagramCard({ graph }: { graph: ArchitectureGraph }) {
  const headingId = useId();
  const components = graph.nodes.filter((node) => !isContainerKind(node.kind)).length;
  const issues = useMemo(() => lintGraph(graph).length, [graph]);

  return (
    <m.section
      layout
      aria-labelledby={headingId}
      className="floating pointer-events-auto w-full shrink-0 overflow-hidden rounded-panel px-4 py-3 md:w-80"
      transition={{ layout: { duration: 0.35, ease: EASE_OUT } }}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        <m.div
          key={graph.title}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.3, ease: EASE_OUT }}
        >
          <div className="flex items-start justify-between gap-3">
            <h2 id={headingId} className="leading-snug font-semibold">
              {graph.title}
            </h2>
            <span className="shrink-0 rounded-full bg-surface-muted px-2 py-0.5 text-xs text-muted">
              {strings.providers[graph.provider]}
            </span>
          </div>
          {graph.description !== undefined && (
            <p className="mt-1 hidden text-xs leading-relaxed text-muted md:line-clamp-2">
              {graph.description}
            </p>
          )}
        </m.div>
      </AnimatePresence>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5">
          <Boxes size={14} aria-hidden="true" />
          <Count value={components} />
          {strings.card.components}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Cable size={14} aria-hidden="true" />
          <Count value={graph.edges.length} />
          {strings.card.connections}
        </span>
        <ReviewStatus issues={issues} />
      </div>
    </m.section>
  );
}

/** A number that rolls when it changes. */
function Count({ value }: { value: number }) {
  return (
    <span className="relative inline-flex overflow-hidden font-semibold text-ink tabular-nums">
      <AnimatePresence mode="popLayout" initial={false}>
        <m.span
          key={value}
          initial={{ y: '100%', opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: '-100%', opacity: 0 }}
          transition={{ duration: 0.3, ease: EASE_OUT }}
        >
          {value}
        </m.span>
      </AnimatePresence>
    </span>
  );
}

function ReviewStatus({ issues }: { issues: number }) {
  const clean = issues === 0;
  const color = clean ? 'var(--success)' : 'var(--warning)';
  return (
    <span
      role="status"
      className="ml-auto inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium"
      style={{ color, backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)` }}
    >
      {clean ? (
        <CircleCheck size={14} aria-hidden="true" />
      ) : (
        <TriangleAlert size={14} aria-hidden="true" />
      )}
      {clean ? strings.review.clean : strings.review.issues(issues)}
    </span>
  );
}
