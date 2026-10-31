import { type ArchitectureGraph, AssistResultSchema } from '@archdraft/shared';
import { describe, expect, it } from 'vitest';
import { type AppDependencies, type AssistLogEntry, createApp } from '../src/http/app.ts';
import { allowedOrigins, type Env, providerFromEnv } from '../src/http/env.ts';
import { LlmError } from '../src/llm/errors.ts';
import { createScriptedProvider, type ScriptedTurn } from '../src/llm/scripted-provider.ts';

const ENV: Env = { ALLOWED_ORIGINS: 'https://editor.example, http://localhost:5173' };

const GRAPH: Omit<ArchitectureGraph, 'schemaVersion'> = {
  title: 'Shop',
  provider: 'generic',
  nodes: [
    { id: 'user', kind: 'user', label: 'User' },
    { id: 'api', kind: 'service', label: 'API' },
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
    expect(logs[0]).toMatchObject({ status, problem: error.kind });
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
    expect(provider?.name).toBe('openai-compatible:llama-3.3-70b-versatile');
  });

  it('uses Workers AI otherwise, with the model asked for', () => {
    expect(providerFromEnv({ AI: ai })?.name).toBe(
      'workers-ai:@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    );
    expect(providerFromEnv({ AI: ai, LLM_MODEL: '@cf/other' })?.name).toBe('workers-ai:@cf/other');
  });

  it('has none when nothing is configured', () => {
    expect(providerFromEnv({})).toBeUndefined();
  });

  it('reads the allowed origins, ignoring blanks', () => {
    expect(allowedOrigins({ ALLOWED_ORIGINS: ' a , ,b' })).toEqual(['a', 'b']);
    expect(allowedOrigins({})).toEqual([]);
  });
});
