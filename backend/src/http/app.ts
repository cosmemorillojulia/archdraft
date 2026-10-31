import { ASSIST_LIMITS, type AssistRequest, AssistRequestSchema } from '@archdraft/shared';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { cors } from 'hono/cors';
import { assist } from '../agent/assist.ts';
import { LlmError } from '../llm/errors.ts';
import type { LlmProvider } from '../llm/provider.ts';
import { allowedOrigins, type Env, providerFromEnv } from './env.ts';
import { PROBLEM_OF, problemResponse } from './problems.ts';

/** One line per call to the agent. Never the prompt or the diagram (docs/arquitectura.md §7). */
export interface AssistLogEntry {
  readonly requestId: string;
  readonly task: AssistRequest['task'];
  readonly provider: string;
  readonly status: number;
  readonly durationMs: number;
  readonly attempts?: number;
  readonly problem?: string;
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
 * The HTTP API (docs/modulos/backend.md): `GET /health` and `POST /v1/assist`.
 * The work is the agent's; this layer checks what comes in, picks the model
 * and turns failures into problem details.
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
