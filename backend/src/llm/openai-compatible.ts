import { z } from 'zod';
import { LlmError, parseRetryAfter, withDeadline } from './errors.ts';
import type { LlmProvider, LlmRequest } from './provider.ts';

export interface OpenAiCompatibleOptions {
  /** Up to the version, without `/chat/completions`: `https://api.groq.com/openai/v1`. */
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly model: string;
  /** Injected so tests and the Worker decide how requests go out. */
  readonly fetch: typeof fetch;
  readonly timeoutMs?: number;
  /**
   * How much a reasoning model such as `gpt-oss` thinks before it answers. Its
   * thoughts come out of the tokens of the answer, so too much leaves the JSON cut.
   */
  readonly reasoningEffort?: ReasoningEffort;
}

export const REASONING_EFFORTS = ['low', 'medium', 'high'] as const;
export type ReasoningEffort = (typeof REASONING_EFFORTS)[number];

/** How long one call may take before it counts as a timeout. */
export const DEFAULT_TIMEOUT_MS = 60_000;

const CompletionSchema = z.object({
  choices: z.array(z.object({ message: z.object({ content: z.string().nullable() }) })).min(1),
});

/**
 * Any provider that speaks the OpenAI chat completions API, such as Groq.
 * JSON answers are asked for with `json_object`, which every Groq model
 * accepts; the schema itself goes in the prompt.
 */
export function createOpenAiCompatibleProvider(options: OpenAiCompatibleOptions): LlmProvider {
  const url = `${options.baseUrl.replace(/\/+$/, '')}/chat/completions`;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return {
    name: `openai-compatible:${options.model}`,
    async complete(request: LlmRequest) {
      const { signal, timedOut } = withDeadline(request.signal, timeoutMs);
      let response: Response;
      try {
        response = await options.fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${options.apiKey}`,
          },
          body: JSON.stringify(body(options, request)),
          signal,
        });
      } catch (error) {
        if (timedOut()) throw new LlmError('timeout', 'The model took too long to answer');
        // A cancellation by the caller is not a failure of the provider: it goes up as it is.
        if (request.signal?.aborted) throw error;
        throw new LlmError('provider', 'The model provider could not be reached', { cause: error });
      }

      if (response.status === 429) {
        const retryAfter = parseRetryAfter(response.headers.get('Retry-After'));
        throw new LlmError(
          'rate-limited',
          'The model provider is rate limiting requests',
          retryAfter === undefined ? {} : { retryAfter },
        );
      }
      if (!response.ok) {
        const reason = await providerMessage(response);
        throw new LlmError(
          'provider',
          `The model provider answered ${response.status}${reason === undefined ? '' : `: ${reason}`}`,
        );
      }

      const parsed = CompletionSchema.safeParse(await response.json().catch(() => null));
      const content = parsed.success ? parsed.data.choices[0]?.message.content : null;
      if (content === null || content === undefined) {
        throw new LlmError('provider', 'The model provider answered without a message');
      }
      return content;
    },
  };
}

/** Longest part of the provider's own explanation kept in an error. */
const MAX_REASON_LENGTH = 300;

/**
 * Why the provider refused, in its own words (`{"error":{"message":…}}`), so
 * that a decommissioned model or a bad key can be told apart in the logs. It
 * describes the request, never repeats its content.
 */
async function providerMessage(response: Response): Promise<string | undefined> {
  const body: unknown = await response.json().catch(() => undefined);
  const error =
    typeof body === 'object' && body !== null && 'error' in body ? body.error : undefined;
  const message =
    typeof error === 'object' && error !== null && 'message' in error ? error.message : undefined;
  return typeof message === 'string' ? message.slice(0, MAX_REASON_LENGTH) : undefined;
}

function body({ model, reasoningEffort }: OpenAiCompatibleOptions, request: LlmRequest) {
  return {
    model,
    ...(reasoningEffort === undefined ? {} : { reasoning_effort: reasoningEffort }),
    messages: request.messages,
    ...(request.temperature === undefined ? {} : { temperature: request.temperature }),
    ...(request.maxTokens === undefined ? {} : { max_tokens: request.maxTokens }),
    ...(request.jsonSchema === undefined ? {} : { response_format: { type: 'json_object' } }),
  };
}
