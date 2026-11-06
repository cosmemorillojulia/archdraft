import { assist } from '../src/agent/assist.ts';
import { LlmError } from '../src/llm/errors.ts';
import type { LlmProvider } from '../src/llm/provider.ts';
import { type EvalCase, requestOf } from './case.ts';
import { type CaseScore, type Outcome, scoreCase, summarizeAll } from './score.ts';

export interface RunOptions {
  readonly cases: readonly EvalCase[];
  /** The model each case is asked; the same one for all, except for the ideal fake. */
  readonly providerFor: (evalCase: EvalCase) => LlmProvider;
  /** Provider and model, for the report. */
  readonly model: string;
  readonly now?: () => number;
  readonly sleep?: (ms: number) => Promise<void>;
  /** Pause between cases, to stay within the rate limit of a free plan. */
  readonly pauseMs?: number;
  /** Times a case that hits the rate limit is asked again, after the wait the provider asks. */
  readonly rateLimitRetries?: number;
  /** Longest wait taken for a rate limit; a longer one counts as the failure of the case. */
  readonly maxWaitMs?: number;
  readonly onCase?: (score: CaseScore, index: number) => void;
}

export interface EvalReport {
  readonly model: string;
  readonly startedAt: string;
  readonly summary: ReturnType<typeof summarizeAll>;
  readonly cases: readonly CaseScore[];
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Asks the agent each case, one after another, and scores the answers. It runs the same
 * `assist` as the API, so what is measured is what is deployed. A failure of a case is part of
 * the result, never a reason to stop.
 */
export async function runEvals(options: RunOptions): Promise<EvalReport> {
  const {
    cases,
    providerFor,
    model,
    now = Date.now,
    sleep = defaultSleep,
    pauseMs = 0,
    rateLimitRetries = 2,
    maxWaitMs = 120_000,
    onCase,
  } = options;
  const startedAt = new Date(now()).toISOString();

  const ask = async (evalCase: EvalCase): Promise<Outcome> => {
    const provider = providerFor(evalCase);
    const request = requestOf(evalCase);
    for (let retry = 0; ; retry++) {
      const started = now();
      try {
        const result = await assist(provider, request);
        return { ok: true, result, latencyMs: now() - started };
      } catch (error) {
        const latencyMs = now() - started;
        if (
          error instanceof LlmError &&
          error.kind === 'rate-limited' &&
          retry < rateLimitRetries
        ) {
          // A provider that does not say how long to wait usually counts quotas by the minute.
          const wait = (error.retryAfter ?? 60) * 1000;
          if (wait <= maxWaitMs) {
            await sleep(wait);
            continue;
          }
        }
        return error instanceof LlmError
          ? { ok: false, error: error.kind, message: error.message, latencyMs }
          : { ok: false, error: 'internal', message: String(error), latencyMs };
      }
    }
  };

  const scores: CaseScore[] = [];
  for (const [index, evalCase] of cases.entries()) {
    if (index > 0 && pauseMs > 0) await sleep(pauseMs);
    const score = scoreCase(evalCase, await ask(evalCase));
    scores.push(score);
    onCase?.(score, index);
  }
  return { model, startedAt, summary: summarizeAll(scores), cases: scores };
}
