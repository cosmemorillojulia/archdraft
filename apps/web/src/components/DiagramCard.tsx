import {
  type ArchitectureGraph,
  CLOUD_PROVIDERS,
  type CloudProvider,
  isContainerKind,
  isShapeKind,
  LIMITS,
} from '@archdraft/core';
import {
  Boxes,
  Cable,
  ChevronDown,
  ChevronRight,
  CircleCheck,
  Info,
  OctagonAlert,
  Shapes,
  TriangleAlert,
} from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';
import { type CSSProperties, useEffect, useId, useRef, useState } from 'react';
import { editorStore, useEditor } from '../editor/store.ts';
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
  const openedKey = useEditor((state) => state.current?.key ?? 0);
  const components = graph.nodes.filter(
    (node) => !isContainerKind(node.kind) && !isShapeKind(node.kind),
  ).length;
  const shapes = graph.nodes.filter((node) => isShapeKind(node.kind)).length;

  return (
    <m.section
      layout
      aria-labelledby={headingId}
      className="floating pointer-events-auto w-full shrink-0 overflow-hidden rounded-panel px-4 py-2.5"
      transition={{ layout: { duration: 0.35, ease: EASE_OUT } }}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        <m.div
          // A new diagram slides in, with its description folded; renaming
          // the one that is open does not.
          key={openedKey}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.3, ease: EASE_OUT }}
        >
          <CardHeading graph={graph} headingId={headingId} />
        </m.div>
      </AnimatePresence>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted">
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

/**
 * One line with the name, the button that unfolds the description and the
 * cloud of the diagram, over the description while it is unfolded.
 */
function CardHeading({ graph, headingId }: { graph: ArchitectureGraph; headingId: string }) {
  const strings = useStrings();
  const descriptionId = useId();
  const [expanded, setExpanded] = useState(false);
  const toggleLabel = expanded ? strings.card.hideDescription : strings.card.showDescription;

  return (
    <>
      <div className="flex h-7 items-center gap-1">
        <h2
          id={headingId}
          className="-ml-1 min-w-0 truncate leading-snug font-semibold has-[input]:flex-1"
        >
          <TitleField title={graph.title} />
        </h2>
        {graph.description !== undefined && (
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls={descriptionId}
            aria-label={toggleLabel}
            title={toggleLabel}
            onClick={() => setExpanded(!expanded)}
            className="grid size-6 shrink-0 place-items-center rounded-md text-muted transition-colors hover:bg-surface-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
          >
            <ChevronDown
              size={16}
              aria-hidden="true"
              className={`transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
            />
          </button>
        )}
        <ProviderChip provider={graph.provider} />
      </div>
      <AnimatePresence initial={false}>
        {expanded && graph.description !== undefined && (
          <m.div
            id={descriptionId}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: EASE_OUT }}
            className="overflow-hidden"
          >
            <p className="pt-1.5 text-xs leading-relaxed text-muted">{graph.description}</p>
          </m.div>
        )}
      </AnimatePresence>
    </>
  );
}

/**
 * The cloud of the diagram as a chip that fits its own name. A transparent
 * select over it does the choosing, so the browser keeps its native list
 * while the chip keeps its shape, whichever name is longest.
 */
function ProviderChip({ provider }: { provider: CloudProvider }) {
  const strings = useStrings();
  return (
    <label className="relative ml-auto inline-flex h-6 shrink-0 cursor-pointer items-center justify-center rounded-full border border-line bg-surface-muted px-3 text-xs leading-none font-medium text-muted transition-colors hover:border-(--group-line) hover:text-ink has-focus-visible:outline-2 has-focus-visible:outline-accent">
      <span aria-hidden="true">{strings.providers[provider]}</span>
      <select
        aria-label={strings.card.provider}
        value={provider}
        onChange={(event) =>
          editorStore.getState().updateDiagram({ provider: event.target.value as CloudProvider })
        }
        className="absolute inset-0 cursor-pointer appearance-none opacity-0"
      >
        {CLOUD_PROVIDERS.map((option) => (
          <option key={option} value={option}>
            {strings.providers[option]}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * The name of the diagram, which is also the name of the files it is exported
 * to. It reads as a title; pressing it turns it into a field. Enter or
 * leaving keeps the new name, Escape drops it, and an empty one keeps the old.
 */
function TitleField({ title }: { title: string }) {
  const strings = useStrings();
  const [editing, setEditing] = useState(false);
  const field = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      field.current?.focus();
      field.current?.select();
    }
  }, [editing]);

  const finish = (keep: boolean) => {
    const name = field.current?.value.trim() ?? '';
    setEditing(false);
    if (keep && name !== '' && name !== title)
      editorStore.getState().updateDiagram({ title: name });
  };

  if (!editing) {
    return (
      <button
        type="button"
        title={strings.card.rename}
        aria-label={`${strings.card.rename}: ${title}`}
        onClick={() => setEditing(true)}
        className="block max-w-full cursor-text truncate rounded-md px-1 text-left transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-accent"
      >
        {title}
      </button>
    );
  }
  return (
    <input
      ref={field}
      defaultValue={title}
      maxLength={LIMITS.titleLength}
      aria-label={strings.card.rename}
      spellCheck={false}
      onBlur={() => finish(true)}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Enter') finish(true);
        else if (event.key === 'Escape') finish(false);
      }}
      className="w-full rounded-md bg-surface-muted px-1 font-semibold outline-2 outline-accent"
    />
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
