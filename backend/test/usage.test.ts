import { describe, expect, it } from 'vitest';
import {
  consumeDailyUse,
  DEFAULT_DAILY_ASSIST_LIMIT,
  dailyLimitFrom,
  usageKey,
} from '../src/http/usage.ts';
import { memoryStorage } from './memory-storage.ts';

const NOON = Date.parse('2026-11-10T12:00:00Z');
const HOUR = 3_600_000;

describe('consumeDailyUse', () => {
  it('lets an address make its requests for the day, then refuses until midnight UTC', async () => {
    const { storage } = memoryStorage();
    const decisions = [];
    for (let i = 0; i < 4; i++) decisions.push(await consumeDailyUse(storage, 3, NOON));
    expect(decisions.map((decision) => decision.allowed)).toEqual([true, true, true, false]);
    expect(decisions.map((decision) => decision.remaining)).toEqual([2, 1, 0, 0]);
    expect(decisions[3]?.retryAfter).toBe(12 * 3600);
  });

  it('does not store a refused request', async () => {
    const { storage, values } = memoryStorage();
    await consumeDailyUse(storage, 1, NOON);
    await consumeDailyUse(storage, 1, NOON + HOUR);
    expect(values.get('usage')).toEqual({ day: '2026-11-10', count: 1 });
  });

  it('sets one alarm for midnight, with the first request of the day', async () => {
    const { storage, alarms } = memoryStorage();
    await consumeDailyUse(storage, 5, NOON);
    await consumeDailyUse(storage, 5, NOON + HOUR);
    expect(alarms).toEqual([Date.parse('2026-11-11T00:00:00Z')]);
  });

  it('starts again on a new day even if the alarm has not run yet', async () => {
    const { storage, alarms } = memoryStorage();
    await consumeDailyUse(storage, 1, NOON);
    const tomorrow = await consumeDailyUse(storage, 1, NOON + 24 * HOUR);
    expect(tomorrow.allowed).toBe(true);
    expect(alarms).toHaveLength(2);
  });

  it('counts a request made at the last second of a day in that day', async () => {
    const { storage } = memoryStorage();
    const decision = await consumeDailyUse(storage, 1, Date.parse('2026-11-10T23:59:59.500Z'));
    expect(decision).toEqual({ allowed: true, remaining: 0, retryAfter: 1 });
  });
});

describe('dailyLimitFrom', () => {
  it('reads a whole number of at least one', () => {
    expect(dailyLimitFrom('25')).toBe(25);
    expect(dailyLimitFrom(' 1 ')).toBe(1);
  });

  it('falls back to the default on anything else', () => {
    for (const value of [undefined, '', '0', '-3', '2.5', 'ten', '1e400']) {
      expect(dailyLimitFrom(value)).toBe(DEFAULT_DAILY_ASSIST_LIMIT);
    }
  });
});

describe('usageKey', () => {
  it('never is the address itself', async () => {
    const key = await usageKey('203.0.113.7');
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(key).not.toContain('203');
  });

  it('tells IPv4 addresses apart', async () => {
    expect(await usageKey('203.0.113.7')).not.toBe(await usageKey('203.0.113.8'));
  });

  it('counts a whole IPv6 /64 as one address, however it is written', async () => {
    const key = await usageKey('2001:db8:aa:1::1');
    expect(await usageKey('2001:0db8:00aa:0001:ffff:1:2:3')).toBe(key);
    expect(await usageKey('2001:DB8:AA:1:0:0:0:9')).toBe(key);
    expect(await usageKey('2001:db8:aa:2::1')).not.toBe(key);
  });

  it('expands a short IPv6 address before taking its prefix', async () => {
    expect(await usageKey('2001:db8::1')).toBe(await usageKey('2001:db8:0:0:5::'));
    expect(await usageKey('::1')).toBe(await usageKey('0:0:0:0::2'));
  });

  it('treats an IPv4 address written as IPv6 as that IPv4 address', async () => {
    expect(await usageKey('::ffff:203.0.113.7')).toBe(await usageKey('203.0.113.7'));
    expect(await usageKey('::ffff:203.0.113.7')).not.toBe(await usageKey('::ffff:203.0.113.8'));
  });

  it('puts requests without an address together', async () => {
    expect(await usageKey(undefined)).toBe(await usageKey(undefined));
    expect(await usageKey(undefined)).not.toBe(await usageKey('203.0.113.7'));
  });
});
