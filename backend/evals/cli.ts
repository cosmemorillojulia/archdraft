/**
 * Runs the evaluation set against a model and writes a report in JSON and Markdown
 * (docs/evaluacion.md):
 *
 *   pnpm --filter @archdraft/api eval                    # the model of .env.secrets
 *   pnpm --filter @archdraft/api eval --provider ideal  # a fake with ideal answers
 *   pnpm --filter @archdraft/api eval --cases edit- --pause 20
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { providerFromEnv } from '../src/http/env.ts';
import { EVAL_CASES } from './cases.ts';
import { idealProvider } from './ideal-provider.ts';
import { toMarkdown } from './report.ts';
import { runEvals } from './run.ts';

const HELP = `Usage: pnpm --filter @archdraft/api eval [options]

  --provider env|ideal  env: the OpenAI-compatible model of LLM_BASE_URL, LLM_API_KEY and
                        LLM_MODEL (also read from .env.secrets and .env.defaults); ideal: a
                        fake that gives the ideal answer to each case. Default: env.
  --cases <text>        Only the cases whose id contains one of these, separated by commas.
  --pause <seconds>     Pause between cases, for the rate limit of a free plan. Default: 0.
  --out <folder>        Where the reports go. Default: backend/evals/reports.
  --help                This help.`;

const { values } = parseArgs({
  options: {
    provider: { type: 'string', default: 'env' },
    cases: { type: 'string' },
    pause: { type: 'string', default: '0' },
    out: { type: 'string', default: fileURLToPath(new URL('reports', import.meta.url)) },
    help: { type: 'boolean', default: false },
  },
});

function fail(message: string): never {
  console.error(`${message}\n\n${HELP}`);
  process.exit(1);
}

if (values.help) {
  process.stdout.write(`${HELP}\n`);
  process.exit(0);
}

const filters = values.cases
  ?.split(',')
  .map((part) => part.trim())
  .filter((part) => part !== '');
const cases =
  filters === undefined
    ? EVAL_CASES
    : EVAL_CASES.filter((evalCase) => filters.some((part) => evalCase.id.includes(part)));
if (cases.length === 0) fail(`No case matches "${values.cases}".`);

const pause = Number(values.pause);
if (!Number.isFinite(pause) || pause < 0) fail(`--pause must be a number of seconds.`);

let model: string;
let providerFor: Parameters<typeof runEvals>[0]['providerFor'];
if (values.provider === 'ideal') {
  model = 'ideal';
  providerFor = idealProvider;
} else if (values.provider === 'env') {
  // The values of the shell win, then .env.secrets, then .env.defaults, as with `make api`.
  for (const name of ['.env.secrets', '.env.defaults']) {
    const file = fileURLToPath(new URL(`../../${name}`, import.meta.url));
    if (existsSync(file)) process.loadEnvFile(file);
  }
  const provider = providerFromEnv(process.env);
  if (provider === undefined) fail('Set LLM_BASE_URL and LLM_API_KEY, or use --provider ideal.');
  model = provider.name;
  providerFor = () => provider;
} else {
  fail(`Unknown provider "${values.provider}".`);
}

const report = await runEvals({
  cases,
  providerFor,
  model,
  pauseMs: pause * 1000,
  onCase: (score, index) => {
    const verdict = score.valid ? (score.goalMet ? 'ok' : 'goal missed') : `failed: ${score.error}`;
    process.stdout.write(`[${index + 1}/${cases.length}] ${score.id}: ${verdict}\n`);
  },
});

const folder = resolve(values.out);
mkdirSync(folder, { recursive: true });
const name = `${report.startedAt.replace(/[:.]/g, '-')}-${model.replace(/[^\w.-]+/g, '_')}`;
writeFileSync(join(folder, `${name}.json`), `${JSON.stringify(report, null, 2)}\n`);
writeFileSync(join(folder, `${name}.md`), toMarkdown(report));
process.stdout.write(`\n${toMarkdown(report)}\nReport: ${join(folder, name)}.{json,md}\n`);
