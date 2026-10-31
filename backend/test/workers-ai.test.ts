import { describe, expect, it } from 'vitest';
import type { LlmRequest } from '../src/llm/provider.ts';
import {
  createWorkersAiProvider,
  secondsUntilQuotaReset,
  type WorkersAiBinding,
} from '../src/llm/workers-ai.ts';

const REQUEST: LlmRequest = { messages: [{ role: 'user', content: 'Hi' }] };
const NOON = Date.parse('2026-10-31T12:00:00Z');

function providerWith(run: WorkersAiBinding['run'], timeoutMs = 1000) {
  const calls: { model: string; inputs: Record<string, unknown> }[] = [];
  const provider = createWorkersAiProvider({
    ai: {
      run: (model, inputs) => {
        calls.push({ model, inputs });
        return run(model, inputs);
      },
    },
    model: '@cf/test',
    timeoutMs,
    now: () => NOON,
  });
  return { provider, calls };
}

async function failure(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('Expected the call to fail');
}

describe('createWorkersAiProvider', () => {
  it('asks for JSON with the schema itself and returns the text', async () => {
    const { provider, calls } = providerWith(() => Promise.resolve({ response: '{"a":1}' }));
    const schema = { type: 'object' };
    const text = await provider.complete({
      ...REQUEST,
      jsonSchema: schema,
      maxTokens: 50,
      temperature: 0,
    });
    expect(text).toBe('{"a":1}');
    expect(provider.name).toBe('workers-ai:@cf/test');
    expect(calls[0]).toEqual({
      model: '@cf/test',
      inputs: {
        messages: REQUEST.messages,
        temperature: 0,
        max_tokens: 50,
        response_format: { type: 'json_schema', json_schema: schema },
      },
    });
  });

  it('turns an answer that comes back parsed into text', async () => {
    const { provider, calls } = providerWith(() => Promise.resolve({ response: { a: 1 } }));
    expect(await provider.complete(REQUEST)).toBe('{"a":1}');
    expect(calls[0]?.inputs).toEqual({ messages: REQUEST.messages });
  });

  it('fails when there is no response', async () => {
    const { provider } = providerWith(() => Promise.resolve({}));
    expect(await failure(provider.complete(REQUEST))).toMatchObject({ kind: 'provider' });
  });

  it('reports JSON mode that could not be met as an invalid answer', async () => {
    const { provider } = providerWith(() => Promise.reject(new Error("JSON Mode couldn't be met")));
    expect(await failure(provider.complete(REQUEST))).toMatchObject({ kind: 'invalid-response' });
  });

  it('reports the spent daily allocation as a rate limit until midnight UTC', async () => {
    const { provider } = providerWith(() =>
      Promise.reject(
        new Error('3036: you have used up your daily free allocation of 10,000 neurons'),
      ),
    );
    expect(await failure(provider.complete(REQUEST))).toMatchObject({
      kind: 'rate-limited',
      retryAfter: 12 * 3600,
    });
  });

  it('reports other failures of the binding as provider failures', async () => {
    // The binding is not typed: it may fail with anything, not only an Error.
    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
    const { provider } = providerWith(() => Promise.reject('boom'));
    expect(await failure(provider.complete(REQUEST))).toMatchObject({ kind: 'provider' });
  });

  it('gives up with a timeout when the model is too slow', async () => {
    const { provider } = providerWith(() => new Promise(() => undefined), 10);
    expect(await failure(provider.complete(REQUEST))).toMatchObject({ kind: 'timeout' });
  });

  it('does not call the model for a request already cancelled', async () => {
    const { provider, calls } = providerWith(() => Promise.resolve({ response: '{}' }));
    const controller = new AbortController();
    controller.abort();
    await failure(provider.complete({ ...REQUEST, signal: controller.signal }));
    expect(calls).toHaveLength(0);
  });
});

describe('secondsUntilQuotaReset', () => {
  it('counts to the next midnight UTC', () => {
    expect(secondsUntilQuotaReset(NOON)).toBe(12 * 3600);
    expect(secondsUntilQuotaReset(Date.parse('2026-10-31T23:59:59.500Z'))).toBe(1);
  });
});
