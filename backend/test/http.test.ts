import { type ArchitectureGraph, AssistResultSchema } from '@archdraft/shared';
import { describe, expect, it, vi } from 'vitest';
import { type AppDependencies, type AssistLogEntry, createApp } from '../src/http/app.ts';
import {
  allowedOrigins,
  type Env,
  providerFromEnv,
  reasoningEffortFor,
  type UsageCounterNamespace,
} from '../src/http/env.ts';
import { consumeDailyUse } from '../src/http/usage.ts';
import { LlmError } from '../src/llm/errors.ts';
import { createScriptedProvider, type ScriptedTurn } from '../src/llm/scripted-provider.ts';
import { memoryStorage } from './memory-storage.ts';

const ENV: Env = { ALLOWED_ORIGINS: 'https://editor.example, http://localhost:5173' };

const GRAPH: Omit<ArchitectureGraph, 'schemaVersion'> = {
  title: 'Shop',
  provider: 'generic',
  nodes: [
    { id: 'user', kind: 'user', label: 'User' },
    { id: 'api', kind: 'api-gateway', label: 'API' },
  ],
  edges: [{ id: 'user-api', source: 'user', target: 'api', mode: 'sync' }],
};

function appAnswering(turns: ScriptedTurn[], dependencies: AppDependencies = {}) {
  const logs: AssistLogEntry[] = [];
  const scripted = createScriptedProvider(turns);
  const app = createApp({
    provider: () => scripted.provider,
    log: (entry) => logs.push(entry),
    ...dependencies,
  });
  const post = (body: unknown, headers: Record<string, string> = {}) =>
    app.request(
      '/v1/assist',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: typeof body === 'string' ? body : JSON.stringify(body),
      },
      ENV,
    );
  return { app, post, logs, requests: scripted.requests };
}

const GENERATE = { task: 'generate', locale: 'en', prompt: 'A small shop' };
const GOOD_ANSWER = JSON.stringify({ title: 'Shop', rationale: 'Small.', graph: GRAPH });

describe('GET /health', () => {
  it('says the API is up', async () => {
    const { app } = appAnswering([]);
    const response = await app.request('/health', {}, ENV);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
  });
});

describe('POST /v1/assist', () => {
  it('runs the agent and answers with its proposals', async () => {
    const { post, logs } = appAnswering([GOOD_ANSWER]);
    const response = await post(GENERATE, { 'X-Request-Id': 'abc-123' });
    expect(response.status).toBe(200);
    expect(response.headers.get('X-Request-Id')).toBe('abc-123');
    const result = AssistResultSchema.parse(await response.json());
    expect(result.proposals[0]?.title).toBe('Shop');
    expect(logs).toEqual([
      expect.objectContaining({ requestId: 'abc-123', task: 'generate', status: 200, attempts: 1 }),
    ]);
    // What the person wrote never reaches the logs.
    expect(JSON.stringify(logs)).not.toContain('A small shop');
  });

  it('makes up a request id when the one given is not usable', async () => {
    const { post } = appAnswering([GOOD_ANSWER]);
    const response = await post(GENERATE, { 'X-Request-Id': 'not valid!' });
    expect(response.headers.get('X-Request-Id')).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('rejects a body that is not JSON', async () => {
    const { post } = appAnswering([]);
    const response = await post('{nope');
    expect(response.status).toBe(400);
    expect(response.headers.get('Content-Type')).toBe('application/problem+json');
    expect(await response.json()).toMatchObject({ type: '/problems/invalid-request', status: 400 });
  });

  it('rejects a request outside the contract and says where', async () => {
    const { post, requests } = appAnswering([]);
    const response = await post({ task: 'edit', locale: 'fr', prompt: '' });
    expect(response.status).toBe(400);
    const body = (await response.json()) as { errors: { path: string }[] };
    expect(body.errors.map((error) => error.path)).toEqual(
      expect.arrayContaining(['locale', 'prompt', 'graph']),
    );
    expect(requests).toHaveLength(0);
  });

  it('rejects a body larger than the limit', async () => {
    const { post } = appAnswering([]);
    const response = await post({ ...GENERATE, prompt: 'x'.repeat(70_000) });
    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({ type: '/problems/payload-too-large' });
  });

  it.each([
    [new LlmError('rate-limited', 'Spent', { retryAfter: 120 }), 429, 'rate-limited'],
    [new LlmError('timeout', 'Slow'), 504, 'model-timeout'],
    [new LlmError('provider', 'Down'), 502, 'model-error'],
  ])('turns a failure of the model into a problem', async (error, status, type) => {
    const { post, logs } = appAnswering([error]);
    const response = await post(GENERATE);
    expect(response.status).toBe(status);
    expect(await response.json()).toMatchObject({
      type: `/problems/${type}`,
      detail: error.message,
    });
    expect(logs[0]).toMatchObject({ status, problem: error.kind, detail: error.message });
  });

  it('says when to come back after a rate limit', async () => {
    const { post } = appAnswering([new LlmError('rate-limited', 'Spent', { retryAfter: 120 })]);
    const response = await post(GENERATE);
    expect(response.headers.get('Retry-After')).toBe('120');
  });

  it('reports a model that never gives a valid answer', async () => {
    const { post } = appAnswering(['nonsense', 'nonsense', 'nonsense']);
    const response = await post(GENERATE);
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ type: '/problems/invalid-model-output' });
  });

  it('reports when no model is configured', async () => {
    const app = createApp({ provider: () => undefined });
    const response = await app.request(
      '/v1/assist',
      { method: 'POST', body: JSON.stringify(GENERATE) },
      ENV,
    );
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ detail: 'No model is configured for this API' });
  });

  it('answers an unexpected failure with a generic problem', async () => {
    const { post } = appAnswering([], {
      provider: () => ({ name: 'broken', complete: () => Promise.reject(new Error('Bug')) }),
    });
    const response = await post(GENERATE);
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ type: '/problems/internal-error' });
  });
});

/** The events of a server-sent stream, with their data parsed. */
async function eventsOf(response: Response): Promise<{ event: string; data: unknown }[]> {
  const text = await response.text();
  return text
    .split('\n\n')
    .filter((chunk) => chunk.trim() !== '')
    .map((chunk) => {
      const lines = chunk.split('\n');
      const event =
        lines
          .find((line) => line.startsWith('event:'))
          ?.slice(6)
          .trim() ?? '';
      const data = lines
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trim())
        .join('\n');
      return { event, data: JSON.parse(data) as unknown };
    });
}

const STREAM = { Accept: 'text/event-stream' };

describe('POST /v1/assist as a stream', () => {
  it('sends the progress of the agent in order, then the result', async () => {
    const { post, logs } = appAnswering([GOOD_ANSWER]);
    const response = await post(GENERATE, STREAM);
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('text/event-stream');

    const events = await eventsOf(response);
    const last = events.at(-1);
    expect(last?.event).toBe('result');
    expect(AssistResultSchema.parse(last?.data).proposals[0]?.title).toBe('Shop');
    const progress = events.slice(0, -1);
    expect(progress.length).toBeGreaterThan(0);
    expect(progress.every(({ event }) => event === 'progress')).toBe(true);
    expect(progress[0]?.data).toEqual({ stage: 'thinking' });
    expect(progress.at(-1)?.data).toEqual({ stage: 'checking' });
    expect(logs).toEqual([expect.objectContaining({ status: 200, attempts: 1 })]);
  });

  it('ends with a problem when the model fails, saying when to come back', async () => {
    const error = new LlmError('rate-limited', 'Spent', { retryAfter: 120 });
    const { post, logs } = appAnswering([error]);
    const events = await eventsOf(await post(GENERATE, STREAM));
    expect(events.at(-1)).toEqual({
      event: 'problem',
      data: expect.objectContaining({
        type: '/problems/rate-limited',
        status: 429,
        detail: 'Spent',
        retryAfter: 120,
      }) as unknown,
    });
    expect(logs[0]).toMatchObject({ status: 429, problem: 'rate-limited', detail: 'Spent' });
  });

  it('ends with a generic problem on an unexpected failure', async () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { post, logs } = appAnswering([], {
      provider: () => ({ name: 'broken', complete: () => Promise.reject(new Error('Bug')) }),
    });
    const events = await eventsOf(await post(GENERATE, STREAM));
    quiet.mockRestore();
    const last = events.at(-1);
    expect(last?.event).toBe('problem');
    expect(last?.data).toMatchObject({ type: '/problems/internal-error', status: 500 });
    expect(last?.data).not.toHaveProperty('detail');
    expect(last?.data).not.toHaveProperty('retryAfter');
    expect(logs[0]).toMatchObject({ status: 500, problem: 'internal-error' });
    expect(logs[0]).not.toHaveProperty('detail');
  });

  it('tells nobody when the editor goes away', async () => {
    const controller = new AbortController();
    const logs: AssistLogEntry[] = [];
    const app = createApp({
      provider: () => ({
        name: 'cancelled',
        complete: () => {
          controller.abort();
          return Promise.reject(new DOMException('Aborted', 'AbortError'));
        },
      }),
      log: (entry) => logs.push(entry),
    });
    const response = await app.request(
      '/v1/assist',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...STREAM },
        body: JSON.stringify(GENERATE),
        signal: controller.signal,
      },
      ENV,
    );
    const events = await eventsOf(response);
    expect(events.every(({ event }) => event === 'progress')).toBe(true);
    expect(logs).toEqual([]);
  });
});

describe('daily limit per address', () => {
  const NOON = Date.parse('2026-11-10T12:00:00Z');

  /** Durable Objects in memory, one per name, as the `USAGE` binding hands them out. */
  function usageNamespace() {
    const objects = new Map<string, ReturnType<typeof memoryStorage>>();
    const namespace: UsageCounterNamespace = {
      getByName: (name) => ({
        consume: (limit) => {
          const object = objects.get(name) ?? memoryStorage();
          objects.set(name, object);
          return consumeDailyUse(object.storage, limit, NOON);
        },
      }),
    };
    return { namespace, objects };
  }

  function limitedApp(env: Env, turns: ScriptedTurn[] = [GOOD_ANSWER, GOOD_ANSWER, GOOD_ANSWER]) {
    const logs: AssistLogEntry[] = [];
    const scripted = createScriptedProvider(turns);
    const app = createApp({ provider: () => scripted.provider, log: (entry) => logs.push(entry) });
    const post = (body: unknown, headers: Record<string, string> = {}) =>
      app.request(
        '/v1/assist',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...headers },
          body: JSON.stringify(body),
        },
        { ...ENV, ...env },
      );
    return { post, logs, requests: scripted.requests };
  }

  const FROM = (address: string) => ({ 'CF-Connecting-IP': address });

  it('answers 429 with Retry-After once an address has used its requests for the day', async () => {
    const { namespace } = usageNamespace();
    const { post, logs, requests } = limitedApp({ USAGE: namespace, DAILY_ASSIST_LIMIT: '2' });
    expect((await post(GENERATE, FROM('203.0.113.7'))).status).toBe(200);
    expect((await post(GENERATE, FROM('203.0.113.7'))).status).toBe(200);

    const refused = await post(GENERATE, FROM('203.0.113.7'));
    expect(refused.status).toBe(429);
    expect(refused.headers.get('Content-Type')).toBe('application/problem+json');
    expect(refused.headers.get('Retry-After')).toBe(String(12 * 3600));
    expect(await refused.json()).toMatchObject({
      type: '/problems/rate-limited',
      status: 429,
      detail: 'This address has made its 2 requests for today',
    });
    // The model is not called for a refused request, and the refusal is logged.
    expect(requests).toHaveLength(2);
    expect(logs.at(-1)).toMatchObject({ status: 429, problem: 'daily-limit' });
    expect(JSON.stringify(logs)).not.toContain('203.0.113.7');
  });

  it('keeps a count for each address', async () => {
    const { namespace, objects } = usageNamespace();
    const { post } = limitedApp({ USAGE: namespace, DAILY_ASSIST_LIMIT: '1' });
    expect((await post(GENERATE, FROM('203.0.113.7'))).status).toBe(200);
    expect((await post(GENERATE, FROM('198.51.100.1'))).status).toBe(200);
    expect(objects.size).toBe(2);
  });

  it('refuses before opening a stream, so the editor gets a plain problem', async () => {
    const { namespace } = usageNamespace();
    const { post } = limitedApp({ USAGE: namespace, DAILY_ASSIST_LIMIT: '1' });
    await post(GENERATE, FROM('203.0.113.7'));
    const refused = await post(GENERATE, { ...FROM('203.0.113.7'), ...STREAM });
    expect(refused.status).toBe(429);
    expect(refused.headers.get('Content-Type')).toBe('application/problem+json');
    expect(refused.headers.get('Retry-After')).toBe(String(12 * 3600));
  });

  it('does not count requests the contract rejects', async () => {
    const { namespace, objects } = usageNamespace();
    const { post } = limitedApp({ USAGE: namespace, DAILY_ASSIST_LIMIT: '1' });
    expect((await post({ task: 'generate' }, FROM('203.0.113.7'))).status).toBe(400);
    expect(objects.size).toBe(0);
  });

  it('lets requests through and says so when the counter fails', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const failing: UsageCounterNamespace = {
      getByName: () => ({ consume: () => Promise.reject(new Error('Exceeded allowed rows')) }),
    };
    const { post } = limitedApp({ USAGE: failing });
    expect((await post(GENERATE, FROM('203.0.113.7'))).status).toBe(200);
    expect(error).toHaveBeenCalledWith('Usage counter failed', expect.any(Error));
    error.mockRestore();
  });
});

describe('CORS', () => {
  it('lets the editor call the API from an allowed origin', async () => {
    const { app } = appAnswering([]);
    const response = await app.request(
      '/v1/assist',
      {
        method: 'OPTIONS',
        headers: {
          Origin: 'https://editor.example',
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'Content-Type',
        },
      },
      ENV,
    );
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://editor.example');
  });

  it('does not let other origins in', async () => {
    const { app } = appAnswering([]);
    const response = await app.request(
      '/health',
      { headers: { Origin: 'https://evil.example' } },
      ENV,
    );
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
});

describe('other routes', () => {
  it('answers unknown routes with a problem', async () => {
    const { app } = appAnswering([]);
    const response = await app.request('/v1/generate', { method: 'POST' }, ENV);
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ type: '/problems/not-found' });
  });
});

describe('providerFromEnv', () => {
  const ai = { run: () => Promise.resolve({ response: '{}' }) };

  it('uses an OpenAI-compatible provider when its URL and key are set', () => {
    const provider = providerFromEnv({
      AI: ai,
      LLM_BASE_URL: 'https://api.groq.com/openai/v1',
      LLM_API_KEY: 'key',
    });
    expect(provider?.name).toBe('openai-compatible:openai/gpt-oss-120b');
  });

  it('uses Workers AI otherwise, with the model asked for', () => {
    expect(providerFromEnv({ AI: ai })?.name).toBe(
      'workers-ai:@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    );
    expect(providerFromEnv({ AI: ai, LLM_MODEL: '@cf/other' })?.name).toBe('workers-ai:@cf/other');
  });

  it('keeps a reasoning model brief unless told otherwise, and leaves other models alone', () => {
    expect(reasoningEffortFor({}, 'openai/gpt-oss-120b')).toBe('low');
    expect(reasoningEffortFor({ LLM_REASONING_EFFORT: ' medium ' }, 'openai/gpt-oss-20b')).toBe(
      'medium',
    );
    expect(reasoningEffortFor({ LLM_REASONING_EFFORT: 'max' }, 'openai/gpt-oss-120b')).toBe('low');
    expect(reasoningEffortFor({}, 'llama-3.3-70b')).toBeUndefined();
  });

  it('has none when nothing is configured', () => {
    expect(providerFromEnv({})).toBeUndefined();
  });

  it('reads the allowed origins, ignoring blanks', () => {
    expect(allowedOrigins({ ALLOWED_ORIGINS: ' a , ,b' })).toEqual(['a', 'b']);
    expect(allowedOrigins({})).toEqual([]);
  });
});
