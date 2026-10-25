import { LINT_RULE_IDS, type LintRuleId } from '@archdraft/core';
import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';

/** Where the rules turned off in this browser are kept. */
export const DISABLED_RULES_KEY = 'archdraft:disabled-rules';

const RULE_IDS: ReadonlySet<string> = new Set(LINT_RULE_IDS);

/** Rules turned off in this browser; unknown or malformed entries are ignored. */
export function loadDisabledRules(): LintRuleId[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(DISABLED_RULES_KEY) ?? '[]');
    if (!Array.isArray(parsed)) return [];
    return LINT_RULE_IDS.filter((id) => parsed.includes(id) && RULE_IDS.has(id));
  } catch (error) {
    console.warn('Could not read the turned off design rules', error);
    return [];
  }
}

function saveDisabledRules(rules: readonly LintRuleId[]): void {
  try {
    localStorage.setItem(DISABLED_RULES_KEY, JSON.stringify(rules));
  } catch (error) {
    // Storage can be blocked; the choice still applies for this visit.
    console.warn('Could not save the turned off design rules', error);
  }
}

export interface ReviewState {
  readonly open: boolean;
  /** Key of the finding the person chose in the panel (findings.ts, `findingKey`). */
  readonly activeKey: string | null;
  /** Changes on every choice, so choosing the same finding again centres it again. */
  readonly focusCount: number;
  /** In the order of LINT_RULE_IDS. */
  readonly disabledRules: readonly LintRuleId[];
}

export interface ReviewActions {
  setOpen: (open: boolean) => void;
  focusFinding: (key: string) => void;
  clearFocus: () => void;
  disableRule: (id: LintRuleId) => void;
  enableRule: (id: LintRuleId) => void;
}

export type ReviewStore = ReviewState & ReviewActions;

/**
 * State of the design review panel (T10): whether it is open, the finding in
 * focus and the rules turned off, which persist in this browser.
 */
export function createReviewStore(disabledRules: readonly LintRuleId[] = []) {
  return createStore<ReviewStore>()((set, get) => {
    const saveRules = (next: readonly LintRuleId[]) => {
      saveDisabledRules(next);
      set({ disabledRules: next });
    };
    return {
      open: false,
      activeKey: null,
      focusCount: 0,
      disabledRules,
      setOpen: (open) => set(open ? { open } : { open, activeKey: null }),
      focusFinding: (activeKey) => set({ activeKey, focusCount: get().focusCount + 1 }),
      clearFocus: () => set({ activeKey: null }),
      disableRule: (id) => {
        const current = get().disabledRules;
        if (!current.includes(id)) {
          saveRules(LINT_RULE_IDS.filter((rule) => rule === id || current.includes(rule)));
        }
      },
      enableRule: (id) => saveRules(get().disabledRules.filter((rule) => rule !== id)),
    };
  });
}

export const reviewStore = createReviewStore(loadDisabledRules());

export function useReview<T>(selector: (state: ReviewStore) => T): T {
  return useStore(reviewStore, selector);
}
