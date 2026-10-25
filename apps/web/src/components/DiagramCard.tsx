import { type ArchitectureGraph, isContainerKind, isShapeKind } from '@archdraft/core';
import {
  Boxes,
  Cable,
  ChevronRight,
  CircleCheck,
  Info,
  OctagonAlert,
  Shapes,
  TriangleAlert,
} from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';
import { type CSSProperties, useId } from 'react';
import { EASE_OUT } from '../motion.ts';
import { SEVERITY_COLOR, useFindings, worstSeverity } from '../review/findings.ts';
import { reviewStore, useReview } from '../review/review-store.ts';
import { useStrings } from '../i18n/locale.ts';

/**
 * Floating summary of the current diagram: what it is, its size and its
 * design review, whose status opens the review panel.
 */
export function DiagramCard({ graph }: { graph: ArchitectureGraph }) {
  const strings = useStrings();
  const headingId = useId();
  const components = graph.nodes.filter(
    (node) => !isContainerKind(node.kind) && !isShapeKind(node.kind),
  ).length;
  const shapes = graph.nodes.filter((node) => isShapeKind(node.kind)).length;

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
          {strings.card.components(components)}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Cable size={14} aria-hidden="true" />
          <Count value={graph.edges.length} />
          {strings.card.connections(graph.edges.length)}
        </span>
        {shapes > 0 && (
          <span className="inline-flex items-center gap-1.5">
            <Shapes size={14} aria-hidden="true" />
            <Count value={shapes} />
            {strings.card.shapes(shapes)}
          </span>
        )}
        <ReviewStatus />
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

const STATUS_ICON = { error: OctagonAlert, warning: TriangleAlert, info: Info } as const;

/** Review status in the colour of the most severe finding; it opens and closes the review. */
function ReviewStatus() {
  const strings = useStrings();
  const findings = useFindings();
  const open = useReview((state) => state.open);
  const worst = worstSeverity(findings);
  const color = worst === null ? 'var(--success)' : SEVERITY_COLOR[worst];
  const Icon = worst === null ? CircleCheck : STATUS_ICON[worst];
  const text = worst === null ? strings.review.clean : strings.review.issues(findings.length);
  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => reviewStore.getState().setOpen(!open)}
        className="ml-auto inline-flex h-7 items-center gap-1.5 rounded-full bg-[color-mix(in_srgb,var(--status)_12%,transparent)] pr-1.5 pl-2.5 font-medium text-(--status) transition-colors hover:bg-[color-mix(in_srgb,var(--status)_20%,transparent)]"
        style={{ '--status': color } as CSSProperties}
      >
        <Icon size={14} aria-hidden="true" />
        {text}
        <ChevronRight
          size={14}
          aria-hidden="true"
          className={`transition-transform ${open ? 'rotate-90' : ''}`}
        />
      </button>
      {/* Announces changes of the review while editing. */}
      <span role="status" className="sr-only">
        {text}
      </span>
    </>
  );
}
