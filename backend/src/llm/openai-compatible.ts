import { z } from 'zod';
import { LlmError, parseRetryAfter, withDeadline } from './errors.ts';
import type { LlmDelta, LlmProvider, LlmRequest } from './provider.ts';

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

/** One event of a streamed answer. Groq names the reasoning `reasoning`; others `reasoning_content`. */
const ChunkSchema = z.object({
  choices: z
    .array(
      z.object({
        delta: z
          .object({
            content: z.string().nullish(),
            reasoning: z.string().nullish(),
            reasoning_content: z.string().nullish(),
          })
          .optional(),
      }),
    )
    .optional(),
  error: z.object({ message: z.string().optional() }).optional(),
});

/**
 * Any provider that speaks the OpenAI chat completions API, such as Groq.
 * JSON answers are asked for with `json_object`, which every Groq model
 * accepts; the schema itself goes in the prompt. With `onDelta` the answer is
 * streamed, and each piece of it and of the reasoning is passed on as it comes.
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
          body: JSON.stringify({
            ...body(options, request),
            ...(request.onDelta === undefined ? {} : { stream: true }),
          }),
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

      if (request.onDelta !== undefined && response.body !== null) {
        try {
          return await streamed(response.body, request.onDelta);
        } catch (error) {
          if (timedOut()) throw new LlmError('timeout', 'The model took too long to answer');
          if (request.signal?.aborted || error instanceof LlmError) throw error;
          throw new LlmError('provider', 'The answer of the model provider broke off', {
            cause: error,
          });
        }
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

/**
 * Reads a streamed answer (server-sent events, one chunk of JSON in each, then `[DONE]`),
 * passing each piece on, and resolves to the whole text of the answer.
 */
async function streamed(
  body: ReadableStream<Uint8Array>,
  onDelta: (delta: LlmDelta) => void,
): Promise<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let content = '';
  const read = (line: string) => {
    if (!line.startsWith('data:')) return;
    const data = line.slice(5).trim();
    if (data === '' || data === '[DONE]') return;
    let json: unknown;
    try {
      json = JSON.parse(data);
    } catch {
      return;
    }
    const chunk = ChunkSchema.safeParse(json);
    if (!chunk.success) return;
    if (chunk.data.error !== undefined) {
      throw new LlmError(
        'provider',
        `The model provider failed while answering${chunk.data.error.message === undefined ? '' : `: ${chunk.data.error.message.slice(0, MAX_REASON_LENGTH)}`}`,
      );
    }
    const delta = chunk.data.choices?.[0]?.delta;
    const reasoning = delta?.reasoning ?? delta?.reasoning_content ?? undefined;
    const piece = delta?.content ?? undefined;
    if (piece) content += piece;
    if (reasoning || piece) {
      onDelta({ ...(reasoning ? { reasoning } : {}), ...(piece ? { content: piece } : {}) });
    }
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? '';
    for (const line of lines) read(line);
  }
  read(buffer);
  if (content === '')
    throw new LlmError('provider', 'The model provider answered without a message');
  return content;
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
