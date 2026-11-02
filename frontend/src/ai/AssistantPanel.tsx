import {
  type ArchitectureGraph,
  compareFindings,
  createEmptyGraph,
  diffGraphs,
  type LintFinding,
  type Proposal,
} from '@archdraft/shared';
import {
  CircleAlert,
  CircleCheck,
  Check,
  ChevronDown,
  LayoutGrid,
  Lightbulb,
  Minus,
  PenLine,
  Plus,
  Undo2,
  WandSparkles,
  X,
} from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';
import { type ReactNode, useId, useMemo, useState } from 'react';
import { MARK_COLOR } from '../canvas/appearance.ts';
import { Button } from '../components/Button.tsx';
import { FloatingPanel, type PanelPlacement } from '../components/FloatingPanel.tsx';
import { PanelHeader } from '../components/Inspector.tsx';
import { useEditor } from '../editor/store.ts';
import { useStrings } from '../i18n/locale.ts';
import { EASE_OUT } from '../motion.ts';
import { findingsOf } from '../review/findings.ts';
import { useReview } from '../review/review-store.ts';
import { type Offer, type Report, useAssistant } from './assistant-store.ts';
import { type ChangeDetail, type ChangeItem, changeItems } from './changes.ts';
import {
  applyOffered,
  candidateGraph,
  closeOffer,
  closeReport,
  discardOffered,
  focusChange,
  setTidy,
  showProposal,
  undoReported,
} from './run-assistant.ts';

/** A key per proposal that does not change when the ones before it leave the list. */
const keys = new WeakMap<Proposal, number>();
let nextKey = 0;
function keyOf(proposal: Proposal): number {
  let key = keys.get(proposal);
  if (key === undefined) keys.set(proposal, (key = nextKey++));
  return key;
}

/** Changes listed before the rest wait behind a button. */
const SHOWN_CHANGES = 6;

const MARK_ICONS = { added: Plus, updated: PenLine, removed: Minus } as const;

const PANEL_ICON = (
  <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-accent/10 text-accent">
    <WandSparkles size={18} strokeWidth={1.75} aria-hidden="true" />
  </span>
);

/**
 * The assistant in the panel slot (T20). While there are proposals, each one
 * with why, what it decided by itself, what it does to the design review and
 * what it changes; the open one is drawn on the canvas as it would be applied,
 * and applying it is one step that undo takes back. After a change, what it
 * did, until the person is done with it. It takes the place of the design
 * review and of the inspector while it is open.
 */
export function AssistantPanel({ placement }: { placement: PanelPlacement }) {
  const offer = useAssistant((state) => state.offer);
  const report = useAssistant((state) => state.report);
  if (offer) return <OfferPanel placement={placement} offer={offer} />;
  if (report) return <ReportPanel placement={placement} report={report} />;
  return null;
}

function OfferPanel({ placement, offer }: { placement: PanelPlacement; offer: Offer }) {
  const strings = useStrings();
  const headingId = useId();
  const { task } = offer;

  return (
    <FloatingPanel placement={placement} labelledBy={headingId}>
      <PanelHeader
        headingId={headingId}
        title={strings.assistant.titles[task]}
        subtitle={strings.assistant.actionHints[task]}
        closeLabel={strings.assistant.close}
        onClose={closeOffer}
        icon={PANEL_ICON}
      />
      <ul className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overscroll-contain p-2">
        <AnimatePresence initial={false}>
          {offer.proposals.map((proposal, index) => (
            <ProposalRow
              key={keyOf(proposal)}
              proposal={proposal}
              index={index}
              open={index === offer.active}
              offer={offer}
            />
          ))}
        </AnimatePresence>
      </ul>
    </FloatingPanel>
  );
}

/** The diagram `proposal` gives on the open one now, or null when it no longer fits. */
function useCandidate(proposal: Proposal, basedOn: ArchitectureGraph) {
  const current = useEditor((state) => state.current?.document.graph);
  return useMemo(
    () => (current ? { current, after: candidateGraph(proposal, basedOn, current) } : null),
    [basedOn, current, proposal],
  );
}

function ProposalRow({
  proposal,
  index,
  open,
  offer,
}: {
  proposal: Proposal;
  index: number;
  open: boolean;
  offer: Offer;
}) {
  const strings = useStrings();
  const [applying, setApplying] = useState(false);
  const candidate = useCandidate(proposal, offer.basedOn);
  const bodyId = useId();
  const stale = candidate !== null && candidate.after === null;

  return (
    <m.li
      layout
      exit={{ opacity: 0, height: 0, transition: { duration: 0.16, ease: EASE_OUT } }}
      data-open={open || undefined}
      className="rounded-xl border border-transparent transition-colors data-open:border-line data-open:bg-surface-muted"
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={bodyId}
        aria-label={strings.assistant.showProposal(proposal.title)}
        onClick={() => showProposal(index)}
        className="flex w-full items-start gap-2 rounded-xl px-2.5 pt-2 pb-1.5 text-left outline-none hover:bg-ink/4 focus-visible:ring-2 focus-visible:ring-focus"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">{proposal.title}</span>
          <ChangeCounts changes={proposal.changes} />
        </span>
        <ChevronDown
          size={16}
          aria-hidden="true"
          className={`mt-0.5 shrink-0 text-muted transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <m.div
            id={bodyId}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: EASE_OUT }}
            className="overflow-hidden"
          >
            <div className="flex flex-col gap-3 px-2.5 pt-1 pb-2.5">
              {proposal.rationale !== '' && (
                <p className="text-[13px] leading-snug text-muted">{proposal.rationale}</p>
              )}
              <Assumptions proposal={proposal} />
              {stale ? (
                <p className="flex gap-1.5 text-[13px] leading-snug text-danger">
                  <CircleAlert size={15} aria-hidden="true" className="mt-0.5 shrink-0" />
                  {strings.assistant.staleProposal}
                </p>
              ) : (
                candidate?.after && (
                  <>
                    <ReviewEffect before={candidate.current} after={candidate.after} />
                    <ChangeList before={candidate.current} after={candidate.after} />
                  </>
                )
              )}
              <div className="flex flex-wrap items-center gap-1">
                <Button
                  variant="primary"
                  aria-label={strings.assistant.applyLabel(proposal.title)}
                  disabled={applying || stale}
                  onClick={() => {
                    setApplying(true);
                    void applyOffered(index).finally(() => setApplying(false));
                  }}
                  className="h-8 gap-1.5 px-3 text-[13px]"
                >
                  <Check size={15} aria-hidden="true" />
                  {strings.assistant.apply}
                </Button>
                <Button
                  variant="ghost"
                  aria-label={strings.assistant.discardLabel(proposal.title)}
                  onClick={() => discardOffered(proposal)}
                  className="h-8 gap-1.5 px-2.5 text-[13px]"
                >
                  <X size={15} aria-hidden="true" />
                  {strings.assistant.discard}
                </Button>
                {!stale && (
                  <Button
                    variant="ghost"
                    aria-pressed={offer.tidy}
                    title={strings.assistant.tidyHint}
                    onClick={() => setTidy(!offer.tidy)}
                    className="ml-auto h-8 gap-1.5 px-2.5 text-[13px] aria-pressed:bg-accent/10 aria-pressed:text-accent"
                  >
                    <LayoutGrid size={15} aria-hidden="true" />
                    {strings.assistant.tidy}
                  </Button>
                )}
              </div>
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </m.li>
  );
}

function ReportPanel({ placement, report }: { placement: PanelPlacement; report: Report }) {
  const strings = useStrings();
  const headingId = useId();
  const { proposal, task, before, after } = report;
  const generated = task === 'generate';

  return (
    <FloatingPanel placement={placement} labelledBy={headingId}>
      <PanelHeader
        headingId={headingId}
        title={generated ? strings.assistant.reported.generate : strings.assistant.reported.change}
        subtitle={proposal.title}
        closeLabel={strings.assistant.closeReport}
        onClose={closeReport}
        icon={
          <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-success/12 text-success">
            <CircleCheck size={18} strokeWidth={1.75} aria-hidden="true" />
          </span>
        }
      />
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain p-3.5">
        {proposal.rationale !== '' && (
          <p className="text-[13px] leading-snug text-muted">{proposal.rationale}</p>
        )}
        <Assumptions proposal={proposal} />
        <ReviewEffect before={generated ? createEmptyGraph('') : before} after={after} />
        {!generated && <ChangeList before={before} after={after} />}
        <div className="flex items-center gap-1">
          <Button variant="primary" onClick={closeReport} className="h-8 gap-1.5 px-3 text-[13px]">
            <Check size={15} aria-hidden="true" />
            {strings.assistant.done}
          </Button>
          <Button variant="ghost" onClick={undoReported} className="h-8 gap-1.5 px-2.5 text-[13px]">
            <Undo2 size={15} aria-hidden="true" />
            {strings.assistant.undo}
          </Button>
        </div>
      </div>
    </FloatingPanel>
  );
}

/** How many nodes and edges a proposal adds, changes and removes, in the colours of the canvas. */
function ChangeCounts({ changes }: { changes: Proposal['changes'] }) {
  const strings = useStrings();
  const { nodes, edges } = changes;
  const counts = {
    added: nodes.added.length + edges.added.length,
    updated: nodes.updated.length + edges.updated.length,
    removed: nodes.removed.length + edges.removed.length,
  };
  const marks = (['added', 'updated', 'removed'] as const).filter((mark) => counts[mark] > 0);
  return (
    <span className="mt-0.5 flex items-center gap-2 text-xs text-muted tabular-nums">
      {marks.map((mark) => (
        <span
          key={mark}
          aria-hidden="true"
          className="size-2 rounded-full"
          style={{ backgroundColor: MARK_COLOR[mark] }}
        />
      ))}
      <span>{strings.assistant.changes(counts)}</span>
    </span>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-1 text-[11px] font-semibold tracking-wide text-muted uppercase">{title}</h3>
      {children}
    </section>
  );
}

/** What the assistant decided that the request did not say. */
function Assumptions({ proposal }: { proposal: Proposal }) {
  const strings = useStrings();
  const assumptions = proposal.assumptions ?? [];
  if (assumptions.length === 0) return null;
  return (
    <Section title={strings.assistant.assumptions}>
      <ul className="flex flex-col gap-1">
        {assumptions.map((assumption) => (
          <li key={assumption} className="flex gap-1.5 text-[13px] leading-snug">
            <Lightbulb size={14} aria-hidden="true" className="mt-0.5 shrink-0 text-warning" />
            {assumption}
          </li>
        ))}
      </ul>
    </Section>
  );
}

/** One line per rule, however many components it reports. */
function byRule(findings: readonly LintFinding[]): LintFinding[] {
  const seen = new Set<string>();
  return findings.filter((finding) => {
    if (finding.severity === 'info' || seen.has(finding.ruleId)) return false;
    seen.add(finding.ruleId);
    return true;
  });
}

/** What the change does to the design review: the findings it solves and those it brings. */
function ReviewEffect({ before, after }: { before: ArchitectureGraph; after: ArchitectureGraph }) {
  const strings = useStrings();
  const disabled = useReview((state) => state.disabledRules);
  const { introduced, resolved } = useMemo(() => {
    const effect = compareFindings(findingsOf(before, disabled), findingsOf(after, disabled));
    return { introduced: byRule(effect.introduced), resolved: byRule(effect.resolved) };
  }, [after, before, disabled]);
  if (introduced.length + resolved.length === 0) return null;
  const rule = (finding: LintFinding) => strings.lint.rules[finding.ruleId].title;
  return (
    <div className="flex flex-col gap-2">
      {resolved.length > 0 && (
        <Section title={strings.assistant.resolves}>
          <ul className="flex flex-col gap-1">
            {resolved.map((finding) => (
              <li key={finding.ruleId} className="flex gap-1.5 text-[13px] leading-snug">
                <CircleCheck
                  size={14}
                  aria-hidden="true"
                  className="mt-0.5 shrink-0 text-success"
                />
                {rule(finding)}
              </li>
            ))}
          </ul>
        </Section>
      )}
      {introduced.length > 0 && (
        <Section title={strings.assistant.introduces}>
          <ul className="flex flex-col gap-1">
            {introduced.map((finding) => (
              <li key={finding.ruleId} className="flex gap-1.5 text-[13px] leading-snug">
                <CircleAlert
                  size={14}
                  aria-hidden="true"
                  className="mt-0.5 shrink-0"
                  style={{
                    color: finding.severity === 'error' ? 'var(--danger)' : 'var(--warning)',
                  }}
                />
                {rule(finding)}
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

/**
 * Each node and edge the change touches, in words. Pointing at one makes it
 * stand out on the canvas, alone.
 */
function ChangeList({ before, after }: { before: ArchitectureGraph; after: ArchitectureGraph }) {
  const strings = useStrings();
  const [all, setAll] = useState(false);
  const items = useMemo(
    () => changeItems(before, after, diffGraphs(before, after)),
    [after, before],
  );
  if (items.length === 0) return null;
  const shown = all ? items : items.slice(0, SHOWN_CHANGES);
  return (
    <Section title={strings.assistant.changeList}>
      <ul className="flex flex-col" onPointerLeave={() => focusChange(null)}>
        {shown.map((item) => (
          <ChangeRow
            key={item.type === 'diagram' ? 'diagram' : `${item.type}:${item.id}`}
            item={item}
          />
        ))}
      </ul>
      {items.length > shown.length && (
        <button
          type="button"
          onClick={() => setAll(true)}
          className="mt-0.5 rounded-md px-1.5 py-0.5 text-xs font-medium text-accent hover:bg-accent/10"
        >
          {strings.assistant.moreChanges(items.length - shown.length)}
        </button>
      )}
    </Section>
  );
}

function ChangeRow({ item }: { item: ChangeItem }) {
  const strings = useStrings();
  const Icon = MARK_ICONS[item.mark];
  const name = (node: { label: string; kind: keyof typeof strings.kinds } | undefined) =>
    node === undefined ? '?' : node.label === '' ? strings.kinds[node.kind].label : node.label;
  const title =
    item.type === 'diagram'
      ? strings.assistant.diagramDetails
      : item.type === 'node'
        ? name(item.node)
        : strings.assistant.connection(name(item.source), name(item.target));
  const kind = item.type === 'node' ? strings.kinds[item.node.kind].label : undefined;
  const details = item.type === 'diagram' ? [] : item.details.map((detail) => wordDetail(detail));
  const focus = item.type === 'diagram' ? null : { type: item.type, id: item.id };

  return (
    <li
      tabIndex={focus ? 0 : undefined}
      onPointerEnter={() => focusChange(focus)}
      onFocus={() => focusChange(focus)}
      onBlur={() => focusChange(null)}
      className="flex gap-2 rounded-lg px-1.5 py-1 outline-none hover:bg-ink/4 focus-visible:ring-2 focus-visible:ring-focus"
    >
      <span
        className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full text-surface"
        style={{ backgroundColor: MARK_COLOR[item.mark] }}
        title={strings.assistant.marks[item.mark]}
      >
        <Icon size={10} strokeWidth={3} aria-hidden="true" />
        <span className="sr-only">{strings.assistant.marks[item.mark]}</span>
      </span>
      <span className="min-w-0 flex-1 text-[13px] leading-snug">
        <span className={`font-medium ${item.mark === 'removed' ? 'line-through' : ''}`}>
          {title}
        </span>
        {kind !== undefined && kind !== title && <span className="text-muted"> · {kind}</span>}
        {details.length > 0 && (
          <span className="block text-xs text-muted">{details.join(' · ')}</span>
        )}
      </span>
    </li>
  );

  function wordDetail(detail: ChangeDetail): string {
    const words = strings.assistant.details;
    switch (detail.type) {
      case 'renamed':
        return words.renamed(detail.from, detail.to);
      case 'kind':
        return words.kind(strings.kinds[detail.from].label, strings.kinds[detail.to].label);
      case 'moved':
        return words.moved(detail.into);
      case 'attributes':
        return detail.names
          .map((name) =>
            name === 'replicas' ? strings.inspector.replicas : strings.inspector.attributes[name],
          )
          .join(', ');
      case 'reconnected':
        return words.reconnected;
      case 'details':
        return words.details;
    }
  }
}
