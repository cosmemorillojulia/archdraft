/**
 * Why a call to the model did not give a usable answer. Each kind maps to one
 * problem type of the API (http/problems.ts), which the editor translates.
 *
 * - `rate-limited`: the provider's quota is spent; try again after `retryAfter` seconds.
 * - `timeout`: the model took longer than allowed.
 * - `provider`: the provider failed or could not be reached.
 * - `invalid-response`: the model answered, but not with what was asked, even after retries.
 */
export const LLM_ERROR_KINDS = ['rate-limited', 'timeout', 'provider', 'invalid-response'] as const;
export type LlmErrorKind = (typeof LLM_ERROR_KINDS)[number];

export class LlmError extends Error {
  override readonly name = 'LlmError';
  readonly kind: LlmErrorKind;
  /** Seconds to wait before trying again, when the provider says. */
  readonly retryAfter: number | undefined;

  constructor(
    kind: LlmErrorKind,
    message: string,
    options: { retryAfter?: number; cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause });
    this.kind = kind;
    this.retryAfter = options.retryAfter;
  }
}

/** Seconds in a `Retry-After` header, which may be a number of seconds or an HTTP date. */
export function parseRetryAfter(
  value: string | null,
  now: number = Date.now(),
): number | undefined {
  if (value === null || value.trim() === '') return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, Math.ceil(seconds));
  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.max(0, Math.ceil((date - now) / 1000));
}

/**
 * The signal a call listens to: the caller's, if any, plus a deadline. When the
 * deadline is what fired, `timedOut` says so, to tell a timeout from a cancellation.
 */
export function withDeadline(signal: AbortSignal | undefined, timeoutMs: number) {
  const deadline = AbortSignal.timeout(timeoutMs);
  return {
    signal: signal ? AbortSignal.any([signal, deadline]) : deadline,
    timedOut: () => deadline.aborted,
  };
}
