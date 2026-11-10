import { DurableObject } from 'cloudflare:workers';
import { consumeDailyUse, type UsageDecision } from './http/usage.ts';

/**
 * One counter per address and day (ADR 0025), as a SQLite-backed Durable
 * Object, the only kind the Workers Free plan offers. Requests to one object
 * run one at a time, so the read and the write of a count never interleave.
 * Only a thin shell over `consumeDailyUse`, which the tests cover; this file
 * needs the Workers runtime and is left out of them.
 */
export class UsageCounter extends DurableObject {
  consume(limit: number): Promise<UsageDecision> {
    return consumeDailyUse(this.ctx.storage, limit, Date.now());
  }

  /** At midnight UTC the counter is forgotten. */
  override async alarm(): Promise<void> {
    await this.ctx.storage.deleteAll();
  }
}
