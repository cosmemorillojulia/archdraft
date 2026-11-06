import type { EvalReport } from './run.ts';
import type { CaseScore, Summary } from './score.ts';

const percent = (value: number | null) => (value === null ? 'n/a' : `${Math.round(value * 100)} %`);
const decimal = (value: number | null) => (value === null ? 'n/a' : value.toFixed(2));
const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

const COLUMNS = [
  'Grupo',
  'Casos',
  'Válidos',
  'Objetivo',
  'F1 tipos',
  'Precisión',
  'Exhaustividad',
  'Conexiones',
  'Prohibidos',
  'Errores',
  'Avisos',
  'Ids',
  'Intentos',
  'Latencia p50',
  'p95',
];

function row(name: string, summary: Summary): string {
  const cells = [
    name,
    String(summary.cases),
    percent(summary.validRate),
    percent(summary.goalRate),
    decimal(summary.typeF1),
    decimal(summary.typePrecision),
    decimal(summary.typeRecall),
    percent(summary.connectionRecall),
    String(summary.forbiddenFound),
    decimal(summary.lintErrors),
    decimal(summary.lintWarnings),
    percent(summary.idsKept),
    decimal(summary.attempts),
    summary.latencyMs === null ? 'n/a' : seconds(summary.latencyMs.p50),
    summary.latencyMs === null ? 'n/a' : seconds(summary.latencyMs.p95),
  ];
  return `| ${cells.join(' | ')} |`;
}

/** What went wrong in a case, in a few words, or nothing when it met everything. */
function problems(score: CaseScore): string {
  if (!score.valid) return `sin respuesta válida (${score.error ?? 'desconocido'})`;
  const parts = [
    ...(score.types?.missing.length ? [`faltan ${score.types.missing.join(', ')}`] : []),
    ...(score.types?.unexpected.length ? [`sobran ${score.types.unexpected.join(', ')}`] : []),
    ...(score.missingConnections?.length
      ? [`sin conexión ${score.missingConnections.join(', ')}`]
      : []),
    ...(score.forbidden?.length ? [`prohibido ${score.forbidden.join(', ')}`] : []),
    ...(score.warnings.length > 0 ? [`avisos ${score.warnings.join(', ')}`] : []),
    ...(score.goalMet ? [] : ['no cumple el objetivo']),
  ];
  return parts.join('; ');
}

/** The report as Markdown, in Spanish like the rest of the documentation of the project. */
export function toMarkdown(report: EvalReport): string {
  const { overall, byTask, byLocale } = report.summary;
  const failing = report.cases.filter((score) => problems(score) !== '');
  return [
    `# Evaluación de ${report.model}`,
    '',
    `Ejecutada el ${report.startedAt}. Métricas descritas en docs/evaluacion.md.`,
    '',
    `| ${COLUMNS.join(' | ')} |`,
    `| ${COLUMNS.map(() => '---').join(' | ')} |`,
    row('Todos', overall),
    ...Object.entries(byTask).map(([task, summary]) => row(task, summary)),
    ...Object.entries(byLocale).map(([locale, summary]) => row(locale, summary)),
    '',
    '## Casos con problemas',
    '',
    ...(failing.length === 0
      ? ['Ninguno.']
      : failing.map((score) => `- \`${score.id}\`: ${problems(score)}.`)),
    '',
  ].join('\n');
}
