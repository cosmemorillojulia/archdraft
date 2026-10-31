import {
  ASSIST_PROBLEMS,
  type AssistProblem,
  type AssistRequest,
  type AssistResult,
  AssistResultSchema,
  problemType,
} from '@archdraft/shared';

/**
 * Why the assistant could not answer: a problem type of the API, or
 * `network` when the API could not be reached at all.
 */
export type AssistFailure = AssistProblem | 'network';

export class AssistError extends Error {
  override readonly name = 'AssistError';
  readonly failure: AssistFailure;
  /** Seconds until it is worth trying again, after a rate limit. */
  readonly retryAfter: number | undefined;

  constructor(failure: AssistFailure, retryAfter?: number) {
    super(`The assistant failed: ${failure}`);
    this.failure = failure;
    this.retryAfter = retryAfter;
  }
}

/** The API of the assistant, if this build has one. */
export function apiUrl(): string | undefined {
  const url = import.meta.env.VITE_API_URL?.trim();
  return url === undefined || url === '' ? undefined : url.replace(/\/+$/, '');
}

const PROBLEM_BY_TYPE = new Map(ASSIST_PROBLEMS.map((problem) => [problemType(problem), problem]));

function problemOf(body: unknown): AssistProblem {
  const type = typeof body === 'object' && body !== null && 'type' in body ? body.type : undefined;
  // A problem the editor does not know is still a failure of the service.
  return (typeof type === 'string' && PROBLEM_BY_TYPE.get(type)) || 'model-error';
}

/**
 * Asks the assistant. The answer is checked against the contract before it is
 * returned, like any other data from outside. A cancellation through `signal`
 * goes up as the AbortError it is.
 */
export async function requestAssist(
  request: AssistRequest,
  signal: AbortSignal,
  base: string | undefined = apiUrl(),
): Promise<AssistResult> {
  if (base === undefined) throw new AssistError('network');
  let response: Response;
  try {
    response = await fetch(`${base}/v1/assist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      signal,
    });
  } catch (error) {
    if (signal.aborted) throw error;
    console.warn('Could not reach the assistant', error);
    throw new AssistError('network');
  }

  const body: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    const retryAfter = Number(response.headers.get('Retry-After'));
    throw new AssistError(
      problemOf(body),
      Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined,
    );
  }
  const result = AssistResultSchema.safeParse(body);
  if (!result.success) {
    console.warn('The assistant answered outside the contract', result.error.issues);
    throw new AssistError('invalid-model-output');
  }
  return result.data;
}
