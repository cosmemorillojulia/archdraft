import { secondsUntilQuotaReset } from '../llm/workers-ai.ts';

/**
 * Daily use of the agent per address (ADR 0025). The counting is here, pure
 * apart from the storage it is given, so that it runs the same in the
 * Durable Object (`usage-counter.ts`) and in the tests.
 */

/** Requests to `/v1/assist` an address may make each day unless `DAILY_ASSIST_LIMIT` says otherwise. */
export const DEFAULT_DAILY_ASSIST_LIMIT = 10;

export interface UsageDecision {
  readonly allowed: boolean;
  /** Requests left today once this one is counted. */
  readonly remaining: number;
  /** Seconds until 00:00 UTC, when every count starts again. */
  readonly retryAfter: number;
}

/** The part of the storage of a Durable Object the counter uses. */
export interface UsageStorage {
  get<T>(key: string): Promise<T | undefined>;
  put(key: string, value: unknown): Promise<void>;
  setAlarm(scheduledTimeMs: number): Promise<void>;
}

interface StoredUsage {
  /** UTC day, `YYYY-MM-DD`. */
  readonly day: string;
  readonly count: number;
}

const USAGE_KEY = 'usage';

function utcDay(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

/**
 * Counts one request if the address still has some left today. A refused
 * request is not stored, so it costs no write. The first request of a day
 * sets an alarm for midnight that deletes the object, so nothing about an
 * address outlives the day it was used.
 */
export async function consumeDailyUse(
  storage: UsageStorage,
  limit: number,
  now: number,
): Promise<UsageDecision> {
  const day = utcDay(now);
  const retryAfter = secondsUntilQuotaReset(now);
  const stored = await storage.get<StoredUsage>(USAGE_KEY);
  // An alarm may run late: a count from an earlier day no longer counts.
  const used = stored?.day === day ? stored.count : 0;
  if (used >= limit) return { allowed: false, remaining: 0, retryAfter };
  await storage.put(USAGE_KEY, { day, count: used + 1 } satisfies StoredUsage);
  if (used === 0) await storage.setAlarm(now + retryAfter * 1000);
  return { allowed: true, remaining: limit - used - 1, retryAfter };
}

/** `DAILY_ASSIST_LIMIT` as a whole number of at least 1, or the default. */
export function dailyLimitFrom(value: string | undefined): number {
  const limit = Number(value?.trim() || Number.NaN);
  return Number.isSafeInteger(limit) && limit >= 1 ? limit : DEFAULT_DAILY_ASSIST_LIMIT;
}

/**
 * Who a request is counted against: the IPv4 address, or the first 64 bits
 * of an IPv6 one, since a single connection usually holds a whole /64 and
 * could otherwise change address at will. Hashed, so that the name of the
 * counter is not the address itself; the hash only hides it from a casual
 * look, and what protects people is that counters last a day.
 */
export async function usageKey(address: string | undefined): Promise<string> {
  const prefix = address === undefined ? 'unknown' : addressPrefix(address.trim().toLowerCase());
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(prefix));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function addressPrefix(address: string): string {
  if (!address.includes(':')) return address;
  // An IPv4 address written as IPv6 is still that IPv4 address.
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(address)?.[1];
  if (mapped !== undefined) return mapped;
  const [head = '', tail] = address.split('::');
  const left = head === '' ? [] : head.split(':');
  const right = tail === undefined || tail === '' ? [] : tail.split(':');
  const missing = Math.max(0, 8 - left.length - right.length);
  const groups = [...left, ...Array<string>(missing).fill('0'), ...right];
  return groups
    .slice(0, 4)
    .map((group) => group.replace(/^0+(?=.)/, ''))
    .join(':');
}
