import { LlmError } from './errors.ts';
import type { LlmProvider, LlmRequest } from './provider.ts';

/**
 * The part of the Workers AI binding (`env.AI`) this adapter uses. Declared
 * here rather than taken from `@cloudflare/workers-types`, whose globals clash
 * with those of Node.js that the tests run on.
 */
export interface WorkersAiBinding {
  run(model: string, inputs: Record<string, unknown>): Promise<unknown>;
}

export interface WorkersAiOptions {
  readonly ai: WorkersAiBinding;
  readonly model: string;
  readonly timeoutMs: number;
  /** Clock for the time until the daily quota resets; injected for tests. */
  readonly now?: () => number;
}

/** One of the models that support JSON mode, see docs/modulos/backend.md. */
export const DEFAULT_WORKERS_AI_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

/** Seconds until 00:00 UTC, when the free daily allocation of neurons starts again. */
export function secondsUntilQuotaReset(now: number): number {
  const midnight = new Date(now);
  midnight.setUTCHours(24, 0, 0, 0);
  return Math.ceil((midnight.getTime() - now) / 1000);
}

/**
 * Workers AI through its binding: no key to keep, and no network hop out of
 * Cloudflare. JSON mode takes the schema as it is (`json_schema` holds the
 * schema itself, unlike OpenAI), and the answer may come back already parsed.
 * The binding takes no signal, so the deadline is a race; the call it leaves
 * behind ends with the request.
 */
export function createWorkersAiProvider(options: WorkersAiOptions): LlmProvider {
  const now = options.now ?? Date.now;
  return {
    name: `workers-ai:${options.model}`,
    async complete(request: LlmRequest) {
      request.signal?.throwIfAborted();
      const inputs = {
        messages: request.messages,
        ...(request.temperature === undefined ? {} : { temperature: request.temperature }),
        ...(request.maxTokens === undefined ? {} : { max_tokens: request.maxTokens }),
        ...(request.jsonSchema === undefined
          ? {}
          : { response_format: { type: 'json_schema', json_schema: request.jsonSchema } }),
      };
      let timer: ReturnType<typeof setTimeout> | undefined;
      const deadline = new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new LlmError('timeout', 'The model took too long to answer')),
          options.timeoutMs,
        );
      });
      try {
        return answerText(await Promise.race([options.ai.run(options.model, inputs), deadline]));
      } catch (error) {
        throw toLlmError(error, now());
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

function answerText(output: unknown): string {
  const response =
    typeof output === 'object' && output !== null && 'response' in output
      ? output.response
      : undefined;
  if (typeof response === 'string') return response;
  if (typeof response === 'object' && response !== null) return JSON.stringify(response);
  throw new LlmError('provider', 'Workers AI answered without a response');
}

/** Errors of the binding come as plain errors; their message tells what happened. */
function toLlmError(error: unknown, now: number): LlmError {
  if (error instanceof LlmError) return error;
  const message = error instanceof Error ? error.message : String(error);
  if (/JSON Mode couldn't be met/i.test(message)) {
    return new LlmError('invalid-response', 'The model could not answer in the format asked', {
      cause: error,
    });
  }
  if (/neuron|daily|quota|rate limit|limit exceeded|capacity/i.test(message)) {
    return new LlmError('rate-limited', 'The daily allocation of Workers AI is spent', {
      retryAfter: secondsUntilQuotaReset(now),
      cause: error,
    });
  }
  return new LlmError('provider', 'Workers AI failed', { cause: error });
}
