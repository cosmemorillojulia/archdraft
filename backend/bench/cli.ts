/**
 * Prints the CPU time of the largest requests to /v1/assist (bench/cpu.ts):
 *
 *   pnpm --filter @archdraft/api bench:cpu [runs]
 */
import { measureCpu } from './cpu.ts';

const runs = Number(process.argv[2] ?? 50);
const round = (ms: number) => ms.toFixed(1);

// eslint-disable-next-line no-console
console.table(
  (await measureCpu(Number.isSafeInteger(runs) && runs > 0 ? runs : 50)).map((measure) => ({
    case: measure.name,
    status: measure.status,
    'first (ms)': round(measure.firstMs),
    'median (ms)': round(measure.medianMs),
    'max (ms)': round(measure.maxMs),
  })),
);
