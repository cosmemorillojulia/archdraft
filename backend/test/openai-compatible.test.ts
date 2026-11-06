import { describe, expect, it } from 'vitest';
import { LlmError, parseRetryAfter } from '../src/llm/errors.ts';
import { createOpenAiCompatibleProvider } from '../src/llm/openai-compatible.ts';
import type { LlmRequest } from '../src/llm/provider.ts';

const REQUEST: LlmRequest = { messages: [{ role: 'user', content: 'Hello' }] };

function completion(content: string | null): Response {
  return Response.json({ choices: [{ message: { content } }] });
}

/** The JSON body of a request, which the provider always sends as text. */
function bodyOf(init: RequestInit | undefined): unknown {
  if (typeof init?.body !== 'string') throw new Error('Expected a text body');
  return JSON.parse(init.body);
}

/** A provider whose fetch answers with `answer` and keeps what it was sent. */
function providerAnswering(answer: (init: RequestInit) => Promise<Response>, timeoutMs?: number) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fakeFetch = (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    calls.push({ url, init: init ?? {} });
    return answer(init ?? {});
  };
  const provider = createOpenAiCompatibleProvider({
    baseUrl: 'https://api.example.com/openai/v1/',
    apiKey: 'secret',
    model: 'test-model',
    fetch: fakeFetch,
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
  });
  return { provider, calls };
}

/** A fetch that never answers until its signal aborts, like a slow server. */
function hangingFetch(init: RequestInit): Promise<Response> {
  return new Promise((_, reject) => {
    init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
  });
}

async function failure(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('Expected the call to fail');
}

describe('createOpenAiCompatibleProvider', () => {
  it('posts the conversation to chat completions and returns the message', async () => {
    const { provider, calls } = providerAnswering(() => Promise.resolve(completion('{"ok":1}')));

    const text = await provider.complete({
      ...REQUEST,
      jsonSchema: { type: 'object' },
      temperature: 0.2,
      maxTokens: 100,
    });

    expect(text).toBe('{"ok":1}');
    expect(provider.name).toBe('openai-compatible:test-model');
    expect(calls[0]?.url).toBe('https://api.example.com/openai/v1/chat/completions');
    expect(calls[0]?.init.headers).toMatchObject({ Authorization: 'Bearer secret' });
    expect(bodyOf(calls[0]?.init)).toEqual({
      model: 'test-model',
      messages: REQUEST.messages,
      temperature: 0.2,
      max_tokens: 100,
      response_format: { type: 'json_object' },
    });
  });

  it('tells a reasoning model how much to think', async () => {
    const calls: RequestInit[] = [];
    const provider = createOpenAiCompatibleProvider({
      baseUrl: 'https://api.example.com/openai/v1',
      apiKey: 'secret',
      model: 'openai/gpt-oss-120b',
      reasoningEffort: 'low',
      fetch: (_input, init) => {
        calls.push(init ?? {});
        return Promise.resolve(completion('{}'));
      },
    });
    await provider.complete(REQUEST);
    expect(bodyOf(calls[0])).toMatchObject({ reasoning_effort: 'low' });
  });

  it('leaves out the options that were not given', async () => {
    const { provider, calls } = providerAnswering(() => Promise.resolve(completion('hi')));
    await provider.complete(REQUEST);
    expect(bodyOf(calls[0]?.init)).toEqual({
      model: 'test-model',
      messages: REQUEST.messages,
    });
  });

  it('reports a rate limit with the seconds to wait', async () => {
    const { provider } = providerAnswering(() =>
      Promise.resolve(new Response('', { status: 429, headers: { 'Retry-After': '30' } })),
    );
    const error = await failure(provider.complete(REQUEST));
    expect(error).toBeInstanceOf(LlmError);
    expect(error).toMatchObject({ kind: 'rate-limited', retryAfter: 30 });
  });

  it('reports a rate limit without a wait when the provider does not say', async () => {
    const { provider } = providerAnswering(() =>
      Promise.resolve(new Response('', { status: 429 })),
    );
    expect(await failure(provider.complete(REQUEST))).toMatchObject({
      kind: 'rate-limited',
      retryAfter: undefined,
    });
  });

  it('keeps the explanation of the provider when it refuses', async () => {
    const { provider } = providerAnswering(() =>
      Promise.resolve(
        Response.json(
          {
            error: {
              message: 'The model `old` has been decommissioned',
              type: 'invalid_request_error',
            },
          },
          { status: 400 },
        ),
      ),
    );
    expect(await failure(provider.complete(REQUEST))).toMatchObject({
      kind: 'provider',
      message: 'The model provider answered 400: The model `old` has been decommissioned',
    });
  });

  it('reports a server error as a provider failure', async () => {
    const { provider } = providerAnswering(() =>
      Promise.resolve(new Response('', { status: 500 })),
    );
    expect(await failure(provider.complete(REQUEST))).toMatchObject({
      kind: 'provider',
      message: 'The model provider answered 500',
    });
  });

  it.each([
    ['without choices', Response.json({ choices: [] })],
    ['with an empty message', completion(null)],
    ['with a body that is not JSON', new Response('<html>')],
  ])('reports an answer %s as a provider failure', async (_, response) => {
    const { provider } = providerAnswering(() => Promise.resolve(response));
    expect(await failure(provider.complete(REQUEST))).toMatchObject({ kind: 'provider' });
  });

  it('reports a network failure as a provider failure', async () => {
    const { provider } = providerAnswering(() => Promise.reject(new TypeError('fetch failed')));
    expect(await failure(provider.complete(REQUEST))).toMatchObject({ kind: 'provider' });
  });

  it('gives up with a timeout when the provider is too slow', async () => {
    const { provider } = providerAnswering(hangingFetch, 10);
    expect(await failure(provider.complete(REQUEST))).toMatchObject({ kind: 'timeout' });
  });

  it('passes a cancellation by the caller up as it is, not as a failure', async () => {
    const { provider } = providerAnswering(hangingFetch);
    const controller = new AbortController();
    const call = provider.complete({ ...REQUEST, signal: controller.signal });
    controller.abort(new DOMException('Stopped', 'AbortError'));
    const error = await failure(call);
    expect(error).not.toBeInstanceOf(LlmError);
    expect(error).toMatchObject({ name: 'AbortError' });
  });
});

/** A streamed answer made of `pieces` of text, cut wherever they are cut; `fail` breaks it after. */
function eventStream(pieces: readonly string[], fail?: unknown): Response {
  const encoder = new TextEncoder();
  let index = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      const piece = pieces[index];
      index += 1;
      if (piece !== undefined) controller.enqueue(encoder.encode(piece));
      else if (fail !== undefined) controller.error(fail);
      else controller.close();
    },
  });
  return new Response(body, { headers: { 'Content-Type': 'text/event-stream' } });
}

const chunk = (delta: object) => `data: ${JSON.stringify({ choices: [{ delta }] })}\n\n`;

describe('createOpenAiCompatibleProvider streaming', () => {
  it('asks for a stream and passes on each piece of the answer and of the reasoning', async () => {
    const whole =
      chunk({ reasoning: 'Groq thinks' }) + chunk({ reasoning_content: 'others think' });
    const { provider, calls } = providerAnswering(() =>
      Promise.resolve(
        eventStream([
          ': keep-alive\r\n\r\n',
          whole.slice(0, 20),
          whole.slice(20),
          chunk({ content: '{"ok":' }),
          'data: not json\n\n',
          'data: {"choices":"wrong"}\n\n',
          chunk({ content: null }),
          'data: {"choices":[{}]}\n\n',
          chunk({ content: '1}' }).trimEnd(),
          '\ndata: [DONE]',
        ]),
      ),
    );
    const deltas: unknown[] = [];

    const text = await provider.complete({ ...REQUEST, onDelta: (delta) => deltas.push(delta) });

    expect(text).toBe('{"ok":1}');
    expect(bodyOf(calls[0]?.init)).toMatchObject({ stream: true });
    expect(deltas).toEqual([
      { reasoning: 'Groq thinks' },
      { reasoning: 'others think' },
      { content: '{"ok":' },
      { content: '1}' },
    ]);
  });

  it('reads the last event even without a final new line', async () => {
    const { provider } = providerAnswering(() =>
      Promise.resolve(eventStream([chunk({ content: 'done' }).trimEnd()])),
    );
    expect(await provider.complete({ ...REQUEST, onDelta: () => undefined })).toBe('done');
  });

  it('reports an error the provider sends in the middle of the answer', async () => {
    const { provider } = providerAnswering(() =>
      Promise.resolve(
        eventStream([
          chunk({ content: '{' }),
          `data: ${JSON.stringify({ error: { message: 'Overloaded' } })}\n\n`,
        ]),
      ),
    );
    const error = await failure(provider.complete({ ...REQUEST, onDelta: () => undefined }));
    expect(error).toBeInstanceOf(LlmError);
    expect(error).toMatchObject({
      kind: 'provider',
      message: 'The model provider failed while answering: Overloaded',
    });
  });

  it('reports a streamed error without an explanation', async () => {
    const { provider } = providerAnswering(() =>
      Promise.resolve(eventStream(['data: {"error":{}}\n\n'])),
    );
    const error = await failure(provider.complete({ ...REQUEST, onDelta: () => undefined }));
    expect(error).toMatchObject({ message: 'The model provider failed while answering' });
  });

  it('reports a stream that ends without any answer', async () => {
    const { provider } = providerAnswering(() =>
      Promise.resolve(eventStream([chunk({ reasoning: 'only thinking' }), 'data: [DONE]\n\n'])),
    );
    const error = await failure(provider.complete({ ...REQUEST, onDelta: () => undefined }));
    expect(error).toMatchObject({
      kind: 'provider',
      message: 'The model provider answered without a message',
    });
  });

  it('reports a stream that breaks off as a provider failure', async () => {
    const cause = new TypeError('network lost');
    const { provider } = providerAnswering(() =>
      Promise.resolve(eventStream([chunk({ content: '{' })], cause)),
    );
    const error = await failure(provider.complete({ ...REQUEST, onDelta: () => undefined }));
    expect(error).toBeInstanceOf(LlmError);
    expect(error).toMatchObject({
      kind: 'provider',
      message: 'The answer of the model provider broke off',
      cause,
    });
  });

  it('gives up with a timeout when the stream is too slow', async () => {
    const { provider } = providerAnswering(
      (init) =>
        Promise.resolve(
          new Response(
            new ReadableStream<Uint8Array>({
              start(controller) {
                init.signal?.addEventListener('abort', () =>
                  controller.error(new DOMException('Aborted', 'AbortError')),
                );
              },
            }),
          ),
        ),
      10,
    );
    const error = await failure(provider.complete({ ...REQUEST, onDelta: () => undefined }));
    expect(error).toMatchObject({ kind: 'timeout' });
  });

  it('passes a cancellation during the stream up as it is', async () => {
    const controller = new AbortController();
    const aborted = new DOMException('Aborted', 'AbortError');
    const { provider } = providerAnswering(() =>
      Promise.resolve(eventStream([chunk({ content: '{' })], aborted)),
    );
    const error = await failure(
      provider.complete({
        ...REQUEST,
        signal: controller.signal,
        onDelta: () => controller.abort(),
      }),
    );
    expect(error).toBe(aborted);
  });
});

describe('parseRetryAfter', () => {
  it('reads seconds and HTTP dates, and ignores what is neither', () => {
    const now = Date.parse('2026-10-31T12:00:00Z');
    expect(parseRetryAfter('12', now)).toBe(12);
    expect(parseRetryAfter('1.2', now)).toBe(2);
    expect(parseRetryAfter('Sat, 31 Oct 2026 12:01:00 GMT', now)).toBe(60);
    expect(parseRetryAfter('Sat, 31 Oct 2026 11:00:00 GMT', now)).toBe(0);
    expect(parseRetryAfter('soon', now)).toBeUndefined();
    expect(parseRetryAfter('', now)).toBeUndefined();
    expect(parseRetryAfter(null, now)).toBeUndefined();
  });
});
