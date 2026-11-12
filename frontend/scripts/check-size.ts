/**
 * Fails when the initial JavaScript or CSS of the build is over its budget
 * (scripts/size-budget.ts). Runs after `vite build`:
 *
 *   node scripts/check-size.ts [dist]
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { checkBudget, initialAssets } from './size-budget.ts';

const BASE = '/archdraft/';
const dist = process.argv[2] ?? 'dist';

const assets = initialAssets(readFileSync(join(dist, 'index.html'), 'utf8'));
if (!assets.some((asset) => asset.kind === 'script')) {
  console.error(`No module script found in ${join(dist, 'index.html')}.`);
  process.exit(1);
}

const sizes = assets.map((asset) => {
  if (!asset.path.startsWith(BASE)) {
    throw new Error(`${asset.path} is not under the base of the site, ${BASE}.`);
  }
  const file = join(dist, asset.path.slice(BASE.length));
  return { ...asset, bytes: gzipSync(readFileSync(file)).length };
});

const kb = (bytes: number) => `${(bytes / 1024).toFixed(1)} kB`;
let over = false;
for (const line of checkBudget(sizes)) {
  const fits = line.bytes <= line.budget;
  over ||= !fits;
  const report = `Initial ${line.kind}: ${kb(line.bytes)} gzip of ${kb(line.budget)}`;
  if (fits) process.stdout.write(`${report}\n`);
  else console.error(`${report}. Load the new code on demand or raise the budget with a reason.`);
}
process.exit(over ? 1 : 0);
