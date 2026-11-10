import type { UsageStorage } from '../src/http/usage.ts';

/** Storage of one Durable Object, in memory. */
export function memoryStorage() {
  const values = new Map<string, unknown>();
  const alarms: number[] = [];
  const storage: UsageStorage = {
    get: <T>(key: string) => Promise.resolve(values.get(key) as T | undefined),
    put: (key, value) => {
      values.set(key, value);
      return Promise.resolve();
    },
    setAlarm: (time) => {
      alarms.push(time);
      return Promise.resolve();
    },
  };
  return { storage, values, alarms };
}
