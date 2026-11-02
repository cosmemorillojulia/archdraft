import { type AssistProblem, problemType } from '@archdraft/shared';
import type { LlmErrorKind } from '../llm/errors.ts';

/**
 * Errors as `application/problem+json` (RFC 9457). The `type` is stable and
 * the editor words each one itself; `detail` is for people reading logs.
 */

const STATUS: Record<AssistProblem, number> = {
  'invalid-request': 400,
  'payload-too-large': 413,
  'not-found': 404,
  'rate-limited': 429,
  'invalid-model-output': 502,
  'model-error': 502,
  'model-timeout': 504,
  'internal-error': 500,
};

const TITLE: Record<AssistProblem, string> = {
  'invalid-request': 'The request is not valid',
  'payload-too-large': 'The request is too large',
  'not-found': 'There is nothing here',
  'rate-limited': 'Too many requests for now',
  'invalid-model-output': 'The model did not give a usable answer',
  'model-error': 'The model is not available',
  'model-timeout': 'The model took too long',
  'internal-error': 'Something went wrong',
};

export const PROBLEM_OF: Record<LlmErrorKind, AssistProblem> = {
  'rate-limited': 'rate-limited',
  timeout: 'model-timeout',
  provider: 'model-error',
  'invalid-response': 'invalid-model-output',
};

export interface ProblemOptions {
  readonly detail?: string;
  readonly retryAfter?: number;
  /** Extension members, such as the list of `errors` of an invalid request. */
  readonly extra?: Record<string, unknown>;
}

/** The problem details of `problem`, as the body of a response or of a `problem` event. */
export function problemBody(problem: AssistProblem, options: ProblemOptions = {}) {
  return {
    type: problemType(problem),
    title: TITLE[problem],
    status: STATUS[problem],
    ...(options.detail === undefined ? {} : { detail: options.detail }),
    ...options.extra,
  };
}

export function problemResponse(problem: AssistProblem, options: ProblemOptions = {}): Response {
  const body = problemBody(problem, options);
  const headers = new Headers({ 'Content-Type': 'application/problem+json' });
  if (options.retryAfter !== undefined) headers.set('Retry-After', String(options.retryAfter));
  return new Response(JSON.stringify(body), { status: body.status, headers });
}
