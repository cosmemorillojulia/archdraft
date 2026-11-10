/**
 * The part of the `cloudflare:workers` module the Worker uses. Declared here
 * rather than taken from `@cloudflare/workers-types`, whose globals clash
 * with those of Node.js that the tests run on (see `llm/workers-ai.ts`).
 */
declare module 'cloudflare:workers' {
  /** What `consumeDailyUse` needs (`http/usage.ts`), and `deleteAll` for the alarm. */
  interface DurableObjectStorage {
    get<T>(key: string): Promise<T | undefined>;
    put(key: string, value: unknown): Promise<void>;
    setAlarm(scheduledTimeMs: number): Promise<void>;
    deleteAll(): Promise<void>;
  }

  interface DurableObjectState {
    readonly storage: DurableObjectStorage;
  }

  export abstract class DurableObject<Env = unknown> {
    protected readonly ctx: DurableObjectState;
    protected readonly env: Env;
    constructor(ctx: DurableObjectState, env: Env);
    alarm?(): void | Promise<void>;
  }
}
