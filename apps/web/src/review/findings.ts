import {
  type ArchitectureGraph,
  LINT_SEVERITIES,
  type LintFinding,
  type LintRuleId,
  type LintSeverity,
  lintGraph,
} from '@archdraft/core';
import { useEditor } from '../editor/store.ts';
import { useReview } from './review-store.ts';

const NO_FINDINGS: readonly LintFinding[] = [];

/**
 * Last review of each graph. Graphs in the editor are immutable, so a graph
 * object is a version of the document: the rules run once per version and
 * set of turned off rules, however many components ask.
 */
const cache = new WeakMap<
  ArchitectureGraph,
  { disabled: readonly LintRuleId[]; findings: readonly LintFinding[] }
>();

export function findingsOf(
  graph: ArchitectureGraph,
  disabled: readonly LintRuleId[],
): readonly LintFinding[] {
  const cached = cache.get(graph);
  if (cached?.disabled === disabled) return cached.findings;
  const findings = lintGraph(graph, { disabledRules: disabled });
  cache.set(graph, { disabled, findings });
  return findings;
}

/** Findings of the open diagram, without the rules turned off. */
export function useFindings(): readonly LintFinding[] {
  const graph = useEditor((state) => state.current?.document.graph);
  const disabled = useReview((state) => state.disabledRules);
  return graph ? findingsOf(graph, disabled) : NO_FINDINGS;
}

/** Identifies a finding across versions of the document while it stays the same. */
export function findingKey(finding: LintFinding): string {
  return `${finding.ruleId}|${finding.nodeIds.join(',')}|${finding.edgeIds.join(',')}`;
}

const rank = (severity: LintSeverity) => LINT_SEVERITIES.indexOf(severity);

/** The most severe level among `findings`, or null if there are none. */
export function worstSeverity(findings: readonly LintFinding[]): LintSeverity | null {
  return findings.reduce<LintSeverity | null>(
    (worst, finding) =>
      worst === null || rank(finding.severity) < rank(worst) ? finding.severity : worst,
    null,
  );
}

/** For each node with findings, the most severe of them. */
export function severityByNode(findings: readonly LintFinding[]): Map<string, LintSeverity> {
  const map = new Map<string, LintSeverity>();
  for (const finding of findings) {
    for (const id of finding.nodeIds) {
      const current = map.get(id);
      if (current === undefined || rank(finding.severity) < rank(current)) {
        map.set(id, finding.severity);
      }
    }
  }
  return map;
}

/** Colour token of each severity. */
export const SEVERITY_COLOR: Record<LintSeverity, string> = {
  error: 'var(--danger)',
  warning: 'var(--warning)',
  info: 'var(--accent)',
};
