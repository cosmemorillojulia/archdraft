import { indexGraph } from '../graph.ts';
import type { ArchitectureGraph } from '../schema.ts';
import { LINT_RULES } from './rules.ts';
import { LINT_SEVERITIES, type LintFinding, type LintRuleId } from './types.ts';

export interface LintOptions {
  /** Rules to skip, e.g. those the user turned off in the editor. */
  readonly disabledRules?: Iterable<LintRuleId>;
}

/**
 * Runs every enabled design rule on a structurally valid graph.
 *
 * Pure and total for valid graphs. Findings are sorted by severity (errors
 * first); within a severity they keep the order of `LINT_RULES` and then the
 * order in which each rule reports them, so the output is deterministic.
 */
export function lintGraph(graph: ArchitectureGraph, options: LintOptions = {}): LintFinding[] {
  const disabled = new Set(options.disabledRules);
  const index = indexGraph(graph);
  const findings = LINT_RULES.filter((rule) => !disabled.has(rule.id)).flatMap((rule) =>
    rule.check(index).map((finding): LintFinding => ({
      ...finding,
      ruleId: rule.id,
      severity: finding.severity ?? rule.defaultSeverity,
    })),
  );
  const rank = (finding: LintFinding) => LINT_SEVERITIES.indexOf(finding.severity);
  return findings.sort((a, b) => rank(a) - rank(b));
}
