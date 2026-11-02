import {
  createOpenAiCompatibleProvider,
  REASONING_EFFORTS,
  type ReasoningEffort,
} from '../llm/openai-compatible.ts';
import type { LlmProvider } from '../llm/provider.ts';
import {
  createWorkersAiProvider,
  DEFAULT_WORKERS_AI_MODEL,
  type WorkersAiBinding,
} from '../llm/workers-ai.ts';

/** Bindings, variables and secrets of the Worker (wrangler.jsonc, docs/operaciones.md). */
export interface Env {
  readonly AI?: WorkersAiBinding;
  /** Origins allowed to call the API, separated by commas. */
  readonly ALLOWED_ORIGINS?: string;
  /** Model to use; each provider has its own default. */
  readonly LLM_MODEL?: string;
  /** Secrets that switch to an OpenAI-compatible provider, such as Groq. */
  readonly LLM_BASE_URL?: string;
  readonly LLM_API_KEY?: string;
  /** `low`, `medium` or `high`, for reasoning models; see `reasoningEffortFor`. */
  readonly LLM_REASONING_EFFORT?: string;
}

/**
 * Default model of the OpenAI-compatible provider, which is Groq unless said otherwise.
 * Groq shut down `llama-3.3-70b-versatile` for free accounts on 2026-08-16 and points to this one.
 */
export const DEFAULT_OPENAI_COMPATIBLE_MODEL = 'openai/gpt-oss-120b';

/**
 * How much a reasoning model thinks: what the environment says, or `low` for
 * `gpt-oss`. Its thoughts share the tokens of the answer, which the free plan
 * of Groq keeps short (agent/assist.ts), and `medium`, its default, can leave
 * a diagram cut half way. Other models are not sent the parameter.
 */
export function reasoningEffortFor(env: Env, model: string): ReasoningEffort | undefined {
  const asked = REASONING_EFFORTS.find((effort) => effort === env.LLM_REASONING_EFFORT?.trim());
  return asked ?? (/gpt-oss/i.test(model) ? 'low' : undefined);
}

/** Longest a call to the model may take; well within the wall time a Worker is given. */
export const MODEL_TIMEOUT_MS = 60_000;

/**
 * The provider the environment configures: an OpenAI-compatible one when its
 * URL and key are set, which allows local development without a Cloudflare
 * account; Workers AI otherwise. Undefined when neither is available.
 */
export function providerFromEnv(env: Env): LlmProvider | undefined {
  if (env.LLM_BASE_URL && env.LLM_API_KEY) {
    const model = env.LLM_MODEL ?? DEFAULT_OPENAI_COMPATIBLE_MODEL;
    const reasoningEffort = reasoningEffortFor(env, model);
    return createOpenAiCompatibleProvider({
      baseUrl: env.LLM_BASE_URL,
      apiKey: env.LLM_API_KEY,
      model,
      ...(reasoningEffort === undefined ? {} : { reasoningEffort }),
      // Workers refuse a `fetch` called away from the global object.
      fetch: (input, init) => fetch(input, init),
      timeoutMs: MODEL_TIMEOUT_MS,
    });
  }
  if (env.AI) {
    return createWorkersAiProvider({
      ai: env.AI,
      model: env.LLM_MODEL ?? DEFAULT_WORKERS_AI_MODEL,
      timeoutMs: MODEL_TIMEOUT_MS,
    });
  }
  return undefined;
}

export function allowedOrigins(env: Env): string[] {
  return (env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin !== '');
}
