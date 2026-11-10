/**
 * The part of the `cloudflare:workers` module the Worker uses. Declared here
 * rather than taken from `@cloudflare/workers-types`, whose globals clash
 * with those of Node.js that the tests run on (see `llm/workers-ai.ts`).
 */
declare module 'cloudflare:workers' {
  import type { UsageStorage } from './http/usage.ts';

  interface DurableObjectState {
    readonly storage: UsageStorage & { deleteAll(): Promise<void> };
  }

  export abstract class DurableObject<Env = unknown> {
    protected readonly ctx: DurableObjectState;
    protected readonly env: Env;
    constructor(ctx: DurableObjectState, env: Env);
    alarm?(): void | Promise<void>;
  }
}
