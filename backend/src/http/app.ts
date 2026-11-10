import { ASSIST_LIMITS, type AssistRequest, AssistRequestSchema } from '@archdraft/shared';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { cors } from 'hono/cors';
import { streamSSE } from 'hono/streaming';
import { assist } from '../agent/assist.ts';
import { LlmError } from '../llm/errors.ts';
import type { LlmProvider } from '../llm/provider.ts';
import { allowedOrigins, type Env, providerFromEnv } from './env.ts';
import { PROBLEM_OF, problemBody, problemResponse } from './problems.ts';
import { dailyLimitFrom, type UsageDecision, usageKey } from './usage.ts';

/** One line per call to the agent. Never the prompt or the diagram (docs/arquitectura.md §7). */
export interface AssistLogEntry {
  readonly requestId: string;
  readonly task: AssistRequest['task'];
  readonly provider: string;
  readonly status: number;
  readonly durationMs: number;
  readonly attempts?: number;
  readonly problem?: string;
  /** What failed, in the words of the agent or the provider; never the prompt. */
  readonly detail?: string;
}

export interface AppDependencies {
  /** The model to use for a request; by default the one the environment configures. */
  readonly provider?: (env: Env) => LlmProvider | undefined;
  readonly log?: (entry: AssistLogEntry) => void;
  readonly now?: () => number;
}

type AppEnv = { Bindings: Env; Variables: { requestId: string } };

const REQUEST_ID = /^[\w-]{1,64}$/;

function logJson(entry: AssistLogEntry): void {
  // Workers Logs indexes JSON written to the console.
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(entry));
}

/**
 * Counts the request against the daily use of its address (ADR 0025).
 * Undefined when there is no counter to ask: none is bound, as in local
 * tests, or it failed. A failing counter lets requests through rather than
 * take the assistant down with it; the failure is logged.
 */
async function consumeUse(
  env: Env,
  address: string | undefined,
  limit: number,
): Promise<UsageDecision | undefined> {
  if (!env.USAGE) return undefined;
  try {
    return await env.USAGE.getByName(await usageKey(address)).consume(limit);
  } catch (error) {
    console.error('Usage counter failed', error);
    return undefined;
  }
}

/**
 * The HTTP API (docs/modulos/backend.md): `GET /health` and `POST /v1/assist`.
 * The work is the agent's; this layer checks what comes in, picks the model
 * and turns failures into problem details. A request that accepts
 * `text/event-stream` gets server-sent events instead: `progress` while the
 * agent works, then one `result` or one `problem`, with the same bodies.
 */
export function createApp(dependencies: AppDependencies = {}) {
  const pickProvider = dependencies.provider ?? providerFromEnv;
  const log = dependencies.log ?? logJson;
  const now = dependencies.now ?? Date.now;
  const app = new Hono<AppEnv>();

  app.use(async (c, next) => {
    const given = c.req.header('X-Request-Id');
    const requestId = given !== undefined && REQUEST_ID.test(given) ? given : crypto.randomUUID();
    c.set('requestId', requestId);
    await next();
    c.res.headers.set('X-Request-Id', requestId);
  });

  // The allowed origins come from the environment of each request, which only a request has.
  app.use((c, next) =>
    cors({
      origin: allowedOrigins(c.env),
      allowMethods: ['GET', 'POST', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'X-Request-Id'],
      exposeHeaders: ['X-Request-Id', 'Retry-After'],
      maxAge: 86_400,
    })(c, next),
  );

  app.get('/health', (c) => c.json({ status: 'ok' }));

  app.post(
    '/v1/assist',
    bodyLimit({
      maxSize: ASSIST_LIMITS.bodyBytes,
      onError: () =>
        problemResponse('payload-too-large', {
          detail: `The body may be ${ASSIST_LIMITS.bodyBytes} bytes at most`,
        }),
    }),
    async (c) => {
      const body: unknown = await c.req.json().catch(() => undefined);
      if (body === undefined) {
        return problemResponse('invalid-request', { detail: 'The body must be JSON' });
      }
      const parsed = AssistRequestSchema.safeParse(body);
      if (!parsed.success) {
        return problemResponse('invalid-request', {
          detail: 'The body does not follow the contract of /v1/assist',
          extra: {
            errors: parsed.error.issues.slice(0, 20).map((issue) => ({
              path: issue.path.map(String).join('.'),
              message: issue.message,
            })),
          },
        });
      }

      const request = parsed.data;
      const provider = pickProvider(c.env);
      if (!provider) {
        return problemResponse('model-error', { detail: 'No model is configured for this API' });
      }
      const started = now();
      const entry = { requestId: c.get('requestId'), task: request.task, provider: provider.name };

      const limit = dailyLimitFrom(c.env.DAILY_ASSIST_LIMIT);
      const usage = await consumeUse(c.env, c.req.header('CF-Connecting-IP'), limit);
      if (usage?.allowed === false) {
        log({ ...entry, status: 429, durationMs: now() - started, problem: 'daily-limit' });
        return problemResponse('rate-limited', {
          detail: `This address has made its ${limit} requests for today`,
          retryAfter: usage.retryAfter,
        });
      }

      if (c.req.header('Accept')?.includes('text/event-stream') === true) {
        return streamSSE(c, async (stream) => {
          // Events go out in order, whatever the agent is doing when it reports.
          let queue = Promise.resolve();
          const send = (event: string, data: unknown) =>
            (queue = queue.then(() => stream.writeSSE({ event, data: JSON.stringify(data) })));
          try {
            const result = await assist(provider, request, c.req.raw.signal, (progress) => {
              void send('progress', progress);
            });
            log({ ...entry, status: 200, durationMs: now() - started, attempts: result.attempts });
            await send('result', result);
          } catch (error) {
            // The editor went away: there is nobody to tell.
            if (c.req.raw.signal.aborted) return;
            const failure = error instanceof LlmError ? error : undefined;
            if (!failure) console.error('Unexpected error', error);
            const problem = failure ? PROBLEM_OF[failure.kind] : 'internal-error';
            const body = problemBody(problem, failure ? { detail: failure.message } : {});
            log({
              ...entry,
              status: body.status,
              durationMs: now() - started,
              problem: failure?.kind ?? 'internal-error',
              ...(failure ? { detail: failure.message } : {}),
            });
            await send('problem', {
              ...body,
              ...(failure?.retryAfter === undefined ? {} : { retryAfter: failure.retryAfter }),
            });
          }
        });
      }

      try {
        const result = await assist(provider, request, c.req.raw.signal);
        log({ ...entry, status: 200, durationMs: now() - started, attempts: result.attempts });
        return c.json(result);
      } catch (error) {
        if (!(error instanceof LlmError)) throw error;
        const response = problemResponse(PROBLEM_OF[error.kind], {
          detail: error.message,
          ...(error.retryAfter === undefined ? {} : { retryAfter: error.retryAfter }),
        });
        log({
          ...entry,
          status: response.status,
          durationMs: now() - started,
          problem: error.kind,
          detail: error.message,
        });
        return response;
      }
    },
  );

  app.notFound(() => problemResponse('not-found'));
  app.onError((error) => {
    console.error('Unexpected error', error);
    return problemResponse('internal-error');
  });

  return app;
}
