import {
  ASSIST_PROBLEMS,
  type AssistProblem,
  type AssistProgress,
  AssistProgressSchema,
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

function retryAfterOf(value: unknown): number | undefined {
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : undefined;
}

/**
 * Asks the assistant. The answer is checked against the contract before it is
 * returned, like any other data from outside. A cancellation through `signal`
 * goes up as the AbortError it is. With `onProgress` the answer comes as a
 * stream, and each step of the work is passed on as it is told; an API that
 * does not stream answers the same, without them.
 */
export async function requestAssist(
  request: AssistRequest,
  signal: AbortSignal,
  base: string | undefined = apiUrl(),
  onProgress?: (progress: AssistProgress) => void,
): Promise<AssistResult> {
  if (base === undefined) throw new AssistError('network');
  let response: Response;
  try {
    response = await fetch(`${base}/v1/assist`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(onProgress === undefined ? {} : { Accept: 'text/event-stream, application/json' }),
      },
      body: JSON.stringify(request),
      signal,
    });
  } catch (error) {
    if (signal.aborted) throw error;
    console.warn('Could not reach the assistant', error);
    throw new AssistError('network');
  }

  const streamed =
    response.ok &&
    onProgress !== undefined &&
    response.body !== null &&
    response.headers.get('Content-Type')?.startsWith('text/event-stream') === true;
  if (streamed && response.body !== null && onProgress !== undefined) {
    return readEvents(response.body, signal, onProgress);
  }
  const body: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    throw new AssistError(problemOf(body), retryAfterOf(response.headers.get('Retry-After')));
  }
  return resultOf(body);
}

function resultOf(body: unknown): AssistResult {
  const result = AssistResultSchema.safeParse(body);
  if (!result.success) {
    console.warn('The assistant answered outside the contract', result.error.issues);
    throw new AssistError('invalid-model-output');
  }
  return result.data;
}

/**
 * Reads the server-sent events of a streamed answer: `progress` until one `result` or one
 * `problem`. Progress that does not follow the contract is skipped; it only tells how the work
 * goes. A stream that ends before its result counts as the API going away.
 */
async function readEvents(
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal,
  onProgress: (progress: AssistProgress) => void,
): Promise<AssistResult> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const handle = (block: string): AssistResult | undefined => {
    let event = 'message';
    const data: string[] = [];
    for (const line of block.split(/\r?\n/)) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
    }
    let payload: unknown;
    try {
      payload = JSON.parse(data.join('\n'));
    } catch {
      return undefined;
    }
    if (event === 'progress') {
      const progress = AssistProgressSchema.safeParse(payload);
      if (progress.success) onProgress(progress.data);
      return undefined;
    }
    if (event === 'problem') {
      const retryAfter =
        typeof payload === 'object' && payload !== null && 'retryAfter' in payload
          ? retryAfterOf(payload.retryAfter)
          : undefined;
      throw new AssistError(problemOf(payload), retryAfter);
    }
    return event === 'result' ? resultOf(payload) : undefined;
  };
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split(/\r?\n\r?\n/);
      buffer = blocks.pop() ?? '';
      for (const block of blocks) {
        const result = handle(block);
        if (result) return result;
      }
    }
    const result = buffer.trim() === '' ? undefined : handle(buffer);
    if (result) return result;
  } catch (error) {
    if (signal.aborted || error instanceof AssistError) throw error;
    console.warn('The stream of the assistant broke off', error);
  } finally {
    reader.releaseLock();
  }
  throw new AssistError('network');
}
