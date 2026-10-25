import { LINT_SEVERITIES, type LintFinding, type LintSeverity } from '@archdraft/core';
import {
  ChevronRight,
  ClipboardCheck,
  EyeOff,
  Info,
  OctagonAlert,
  Pencil,
  TriangleAlert,
} from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';
import { useId, useState } from 'react';
import { editorStore, useEditor } from '../editor/store.ts';
import { EASE_OUT } from '../motion.ts';
import { findingKey, SEVERITY_COLOR, useFindings } from '../review/findings.ts';
import { reviewStore, useReview } from '../review/review-store.ts';
import { useStrings } from '../i18n/locale.ts';
import { Button } from './Button.tsx';
import { FloatingPanel, type PanelPlacement } from './FloatingPanel.tsx';
import { PanelHeader } from './Inspector.tsx';

/** A finding as the panel shows it: what is wrong and what to do, in the language of the interface. */
type Describe = (finding: LintFinding) => { message: string; suggestion: string };

const SEVERITY_ICON = { error: OctagonAlert, warning: TriangleAlert, info: Info } as const;

/** Sets the severity colour for the element and its children, as `var(--severity)`. */
const severityStyle = (severity: LintSeverity): Record<`--${string}`, string> => ({
  '--severity': SEVERITY_COLOR[severity],
});

/**
 * Design review (T10): the findings of the rule engine on the open diagram,
 * grouped by severity, recalculated with every edit. Choosing a finding
 * selects its component and brings it into view on the canvas; each rule can
 * be explained and turned off.
 */
export function ReviewPanel({ placement }: { placement: PanelPlacement }) {
  const strings = useStrings();
  const findings = useFindings();
  const disabledRules = useReview((state) => state.disabledRules);
  const activeKey = useReview((state) => state.activeKey);
  const graph = useEditor((state) => state.current?.document.graph);
  const [hidden, setHidden] = useState<ReadonlySet<LintSeverity>>(new Set());
  const headingId = useId();

  const labelOf = (id: string) => graph?.nodes.find((node) => node.id === id)?.label ?? id;
  const describe: Describe = (finding) =>
    strings.lint.finding({
      finding,
      labels: finding.nodeIds.map(labelOf),
      attributes: graph?.nodes.find((node) => node.id === finding.nodeIds[0])?.attributes,
    });
  const countOf = (severity: LintSeverity) =>
    findings.filter((finding) => finding.severity === severity).length;
  const groups = LINT_SEVERITIES.filter((severity) => !hidden.has(severity))
    .map((severity) => ({
      severity,
      findings: findings.filter((finding) => finding.severity === severity),
    }))
    .filter((group) => group.findings.length > 0);

  const toggle = (severity: LintSeverity) =>
    setHidden((current) => {
      const next = new Set(current);
      if (!next.delete(severity)) next.add(severity);
      return next;
    });

  return (
    <FloatingPanel placement={placement} labelledBy={headingId}>
      <PanelHeader
        headingId={headingId}
        title={strings.review.title}
        subtitle={strings.review.summary(findings.length)}
        closeLabel={strings.review.close}
        onClose={() => reviewStore.getState().setOpen(false)}
        icon={
          <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-surface-muted text-muted">
            <ClipboardCheck size={18} strokeWidth={1.75} aria-hidden="true" />
          </span>
        }
      />

      <div
        role="group"
        aria-label={strings.review.filters}
        className="flex flex-wrap gap-1 border-b border-line px-3 py-2.5"
      >
        {LINT_SEVERITIES.map((severity) => {
          const Icon = SEVERITY_ICON[severity];
          const shown = !hidden.has(severity);
          return (
            <button
              key={severity}
              type="button"
              aria-pressed={shown}
              onClick={() => toggle(severity)}
              style={severityStyle(severity)}
              className="inline-flex h-7 items-center gap-1 rounded-full border border-line px-2 text-xs font-medium text-muted transition-colors hover:text-ink aria-pressed:border-transparent aria-pressed:bg-[color-mix(in_srgb,var(--severity)_12%,transparent)] aria-pressed:text-ink"
            >
              <Icon size={12} aria-hidden="true" style={{ color: 'var(--severity)' }} />
              {strings.review.groups[severity]}
              <span className="tabular-nums">{countOf(severity)}</span>
            </button>
          );
        })}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-2">
        {findings.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-muted">{strings.review.empty}</p>
        ) : groups.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-muted">{strings.review.filteredOut}</p>
        ) : (
          groups.map((group) => (
            <FindingGroup
              key={group.severity}
              severity={group.severity}
              findings={group.findings}
              activeKey={activeKey}
              labelOf={labelOf}
              describe={describe}
            />
          ))
        )}
        {disabledRules.length > 0 && (
          <details className="group mx-1.5 mt-2 border-t border-line pt-2.5 text-xs">
            <summary className="flex cursor-pointer list-none items-center gap-1 font-medium text-muted hover:text-ink">
              <ChevronRight
                size={14}
                aria-hidden="true"
                className="transition-transform group-open:rotate-90"
              />
              {strings.review.disabled(disabledRules.length)}
            </summary>
            <p className="mt-1.5 text-muted">{strings.review.disabledNote}</p>
            <ul className="mt-1.5 flex flex-col gap-1">
              {disabledRules.map((id) => {
                const title = strings.lint.rules[id].title;
                return (
                  <li key={id} className="flex items-center justify-between gap-2">
                    <span>{title}</span>
                    <Button
                      variant="ghost"
                      aria-label={strings.review.turnOnLabel(title)}
                      onClick={() => reviewStore.getState().enableRule(id)}
                      className="h-7 px-2 text-xs"
                    >
                      {strings.review.turnOn}
                    </Button>
                  </li>
                );
              })}
            </ul>
          </details>
        )}
      </div>
    </FloatingPanel>
  );
}

function FindingGroup({
  severity,
  findings,
  activeKey,
  labelOf,
  describe,
}: {
  severity: LintSeverity;
  findings: readonly LintFinding[];
  activeKey: string | null;
  labelOf: (id: string) => string;
  describe: Describe;
}) {
  const strings = useStrings();
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="pb-1">
      <h3
        id={headingId}
        className="flex items-center gap-1.5 px-2 pt-1.5 pb-1 text-xs font-semibold text-muted"
      >
        <span
          aria-hidden="true"
          className="size-2 rounded-full"
          style={{ backgroundColor: SEVERITY_COLOR[severity] }}
        />
        {strings.review.groups[severity]}
        <span className="font-normal tabular-nums">{findings.length}</span>
      </h3>
      <ul className="flex flex-col gap-0.5">
        <AnimatePresence initial={false}>
          {findings.map((finding, index) => {
            const key = findingKey(finding);
            return (
              <FindingRow
                key={`${key}#${index}`}
                finding={finding}
                active={key === activeKey}
                labelOf={labelOf}
                describe={describe}
              />
            );
          })}
        </AnimatePresence>
      </ul>
    </section>
  );
}

function FindingRow({
  finding,
  active,
  labelOf,
  describe,
}: {
  finding: LintFinding;
  active: boolean;
  labelOf: (id: string) => string;
  describe: Describe;
}) {
  const strings = useStrings();
  const [explained, setExplained] = useState(false);
  const explanationId = useId();
  const rule = strings.lint.rules[finding.ruleId];
  const { message, suggestion } = describe(finding);
  const Icon = SEVERITY_ICON[finding.severity];
  const subject = finding.nodeIds[0];
  const ruleTitle = rule.title;

  const show = () => {
    reviewStore.getState().focusFinding(findingKey(finding));
    if (subject !== undefined) editorStore.getState().select({ type: 'node', id: subject });
  };
  const edit = () => {
    if (subject === undefined) return;
    editorStore.getState().select({ type: 'node', id: subject });
    reviewStore.getState().setOpen(false);
  };

  return (
    <m.li
      layout
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.2, ease: EASE_OUT }}
      data-active={active || undefined}
      style={severityStyle(finding.severity)}
      className="overflow-hidden rounded-control transition-colors data-active:bg-[color-mix(in_srgb,var(--severity)_9%,transparent)]"
    >
      <button
        type="button"
        aria-current={active || undefined}
        onClick={show}
        className="flex w-full gap-2.5 rounded-control px-2.5 pt-2.5 pb-1 text-left transition-colors hover:bg-surface-muted"
      >
        <Icon
          size={16}
          aria-hidden="true"
          className="mt-0.5 shrink-0"
          style={{ color: 'var(--severity)' }}
        />
        <span className="min-w-0">
          <span className="block text-[13px] leading-snug font-medium">{message}</span>
          <span className="mt-1 block text-xs leading-snug text-muted">{suggestion}</span>
        </span>
      </button>
      <div className="flex items-center gap-0.5 pr-1 pb-1.5 pl-8 [&>button]:h-7 [&>button]:gap-1 [&>button]:px-2 [&>button]:text-xs">
        <Button
          variant="ghost"
          aria-expanded={explained}
          aria-controls={explanationId}
          onClick={() => setExplained((open) => !open)}
        >
          <ChevronRight
            size={13}
            aria-hidden="true"
            className={`transition-transform ${explained ? 'rotate-90' : ''}`}
          />
          {strings.review.why}
        </Button>
        {subject !== undefined && (
          <Button
            variant="ghost"
            aria-label={strings.review.editLabel(labelOf(subject))}
            onClick={edit}
          >
            <Pencil size={12} aria-hidden="true" />
            {strings.review.edit}
          </Button>
        )}
        <Button
          variant="ghost"
          aria-label={strings.review.turnOffLabel(ruleTitle)}
          title={strings.review.turnOffLabel(ruleTitle)}
          onClick={() => reviewStore.getState().disableRule(finding.ruleId)}
          className="ml-auto"
        >
          <EyeOff size={12} aria-hidden="true" />
          {strings.review.turnOff}
        </Button>
      </div>
      {explained && (
        <div
          id={explanationId}
          className="mx-2.5 mb-2.5 ml-8 rounded-[8px] bg-surface-muted px-2.5 py-2 text-xs"
        >
          <p className="font-semibold">{ruleTitle}</p>
          <p className="mt-0.5 leading-relaxed text-muted">{rule.description}</p>
        </div>
      )}
    </m.li>
  );
}
