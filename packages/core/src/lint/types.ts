import type { GraphIndex } from '../graph.ts';

/**
 * `error`: a defect that should be fixed before relying on the design.
 * `warning`: a probable risk worth fixing.
 * `info`: missing information or a point worth reviewing; not a defect.
 */
export const LINT_SEVERITIES = ['error', 'warning', 'info'] as const;
export type LintSeverity = (typeof LINT_SEVERITIES)[number];

export const LINT_RULE_IDS = [
  'single-point-of-failure',
  'public-database',
  'unprotected-entry',
  'database-single-az',
  'unencrypted-data',
  'sync-chain-too-long',
  'sync-cycle',
  'orphan-component',
] as const;
export type LintRuleId = (typeof LINT_RULE_IDS)[number];

export interface LintFinding {
  readonly ruleId: LintRuleId;
  readonly severity: LintSeverity;
  readonly message: string;
  readonly nodeIds: readonly string[];
  readonly edgeIds: readonly string[];
  /** What to change in the design to resolve the finding. */
  readonly suggestion: string;
}

/**
 * What a rule reports. The engine adds the rule id, and the severity when the
 * rule does not pick one: a rule only sets it when a finding is milder or
 * harsher than its default, e.g. `info` when the deciding attribute is unknown.
 */
export type RuleFinding = Omit<LintFinding, 'ruleId' | 'severity'> & {
  readonly severity?: LintSeverity;
};

export interface LintRule {
  readonly id: LintRuleId;
  readonly title: string;
  /** Why the rule exists, shown next to its findings. */
  readonly description: string;
  readonly defaultSeverity: LintSeverity;
  /** Pure. Receives the index of a structurally valid graph. */
  readonly check: (index: GraphIndex) => RuleFinding[];
}
