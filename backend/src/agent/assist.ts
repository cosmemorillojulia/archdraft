import {
  applyPatch,
  type ArchitectureGraph,
  ArchitectureGraphSchema,
  ASSIST_LIMITS,
  type AssistRequest,
  type AssistResult,
  type AssistWarning,
  compareFindings,
  createEmptyGraph,
  diffGraphs,
  GraphPatchSchema,
  hasChanges,
  isContainerKind,
  isShapeKind,
  type LintRuleId,
  lintGraph,
  parseArchitectureGraph,
  type Proposal,
  SCHEMA_VERSION,
} from '@archdraft/shared';
import { z } from 'zod';
import type { LlmMessage, LlmProvider } from '../llm/provider.ts';
import { isObject } from './extract-json.ts';
import {
  describeFinding,
  editMessage,
  generateMessage,
  improveMessage,
  redesignMessage,
  systemPrompt,
} from './prompt.ts';
import { type OnProgress, reporting } from './progress.ts';
import { type Interpretation, runWithRepair } from './repair.ts';

/**
 * The agent: one call to the model per task (plus repairs), with an answer
 * that is checked as untrusted input before anything is returned (ADR 0022).
 * A diagram that is created or redesigned comes back whole; an edit or an
 * improvement comes back as operations applied to the diagram it was asked on.
 */

// "assumptions" comes before the diagram, so the model settles what it decides before drawing it.
const TitledSchema = z.object({
  title: z.string(),
  rationale: z.string(),
  assumptions: z.array(z.string()).max(ASSIST_LIMITS.maxAssumptions).optional(),
});
const GraphAnswerSchema = TitledSchema.extend({ graph: ArchitectureGraphSchema });
const PatchAnswerSchema = TitledSchema.extend({ operations: GraphPatchSchema });
const ImproveAnswerSchema = z.object({
  proposals: z
    .array(PatchAnswerSchema.extend({ ruleIds: z.array(z.string()).optional() }))
    .min(1)
    .max(ASSIST_LIMITS.maxProposals),
});

/**
 * JSON Schemas of what the model answers, built once on first use: building
 * them takes CPU time, which a Worker on the free plan counts per request.
 */
const SCHEMAS = new Map<z.ZodType, object>();
function jsonSchemaOf(schema: z.ZodType): object {
  let built = SCHEMAS.get(schema);
  if (built === undefined) SCHEMAS.set(schema, (built = z.toJSONSchema(schema, { io: 'input' })));
  return built;
}

/**
 * A diagram is long; a list of edits is shorter. Limits keep a runaway answer in the quota,
 * and leave room for a prompt of some 3,000 tokens within the 8,000 tokens a minute of the
 * free plan of Groq, which counts the tokens reserved for the answer too.
 */
const MAX_TOKENS = { graph: 4500, patch: 2500, improve: 3500 } as const;
const TEMPERATURE = 0.2;

/** Does `request`; with `onProgress`, telling along the way what it is doing (`reporting`). */
export async function assist(
  provider: LlmProvider,
  request: AssistRequest,
  signal?: AbortSignal,
  onProgress?: OnProgress,
): Promise<AssistResult> {
  const model = onProgress === undefined ? provider : reporting(provider, onProgress);
  const ask = <T>(
    content: string,
    jsonSchema: object,
    maxTokens: number,
    interpret: (answer: Record<string, unknown>, lastAttempt: boolean) => Interpretation<T>,
  ) => {
    const messages: LlmMessage[] = [
      { role: 'system', content: systemPrompt(request.locale) },
      { role: 'user', content },
    ];
    return runWithRepair(
      model,
      { messages, jsonSchema, maxTokens, temperature: TEMPERATURE, ...(signal ? { signal } : {}) },
      interpret,
    );
  };

  switch (request.task) {
    case 'generate': {
      const schema = jsonSchemaOf(GraphAnswerSchema);
      const empty = createEmptyGraph('');
      const { value, attempts, warnings } = await ask(
        generateMessage(request.prompt, request.provider, jsonSchemaOf(ArchitectureGraphSchema)),
        schema,
        MAX_TOKENS.graph,
        (answer) => reviewed(readGraphAnswer(answer, empty), empty),
      );
      return { task: request.task, proposals: [value], attempts, warnings: [...warnings] };
    }
    case 'edit': {
      const { graph } = request;
      const { value, attempts, warnings } = await ask(
        editMessage(request.prompt, graph, jsonSchemaOf(PatchAnswerSchema)),
        jsonSchemaOf(PatchAnswerSchema),
        MAX_TOKENS.patch,
        (answer) => reviewed(readPatchAnswer(answer, graph), graph),
      );
      return { task: request.task, proposals: [value], attempts, warnings: [...warnings] };
    }
    case 'improve': {
      const { graph } = request;
      const findings = lintGraph(graph);
      const { value, attempts, warnings } = await ask(
        improveMessage(graph, findings, request.prompt, jsonSchemaOf(ImproveAnswerSchema)),
        jsonSchemaOf(ImproveAnswerSchema),
        MAX_TOKENS.improve,
        (answer, lastAttempt) => readImproveAnswer(answer, graph, lastAttempt),
      );
      return { task: request.task, proposals: value, attempts, warnings: [...warnings] };
    }
    case 'simplify':
    case 'extend': {
      const { graph, task } = request;
      const { value, attempts, warnings } = await ask(
        redesignMessage(task, graph, request.prompt, jsonSchemaOf(ArchitectureGraphSchema)),
        jsonSchemaOf(GraphAnswerSchema),
        MAX_TOKENS.graph,
        (answer) => reviewed(readRedesignAnswer(answer, graph, task), graph),
      );
      return { task, proposals: [value], attempts, warnings: [...warnings] };
    }
  }
}

/** A string field of an answer, cut to `max`; small models overshoot lengths. */
function text(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string' || value.trim() === '') return undefined;
  return value.trim().slice(0, max);
}

type Titled = Pick<Proposal, 'title' | 'rationale' | 'assumptions'>;

/** The sentences of a list that are text, cut like the other fields; anything else is ignored. */
function sentences(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .flatMap((item) => text(item, ASSIST_LIMITS.assumptionLength) ?? [])
    .slice(0, ASSIST_LIMITS.maxAssumptions);
}

function readTitle(answer: Record<string, unknown>, problems: string[], prefix = ''): Titled {
  const title = text(answer['title'], ASSIST_LIMITS.titleLength);
  if (title === undefined) problems.push(`${prefix}"title" must be a non-empty string.`);
  const assumptions = sentences(answer['assumptions']);
  return {
    title: title ?? '',
    rationale: text(answer['rationale'], ASSIST_LIMITS.textLength) ?? '',
    ...(assumptions.length > 0 ? { assumptions } : {}),
  };
}

/**
 * Rules whose new findings are worth one more attempt: a data store open to
 * clients, compute without an entry, data stored unencrypted, a loop of calls.
 */
const REVIEWED_RULES: ReadonlySet<LintRuleId> = new Set([
  'public-database',
  'unprotected-entry',
  'unencrypted-data',
  'sync-cycle',
]);

/** A design that adds risks of those rules to `before` is sent back once to fix them. */
function reviewed(
  read: Interpretation<Proposal>,
  before: ArchitectureGraph,
): Interpretation<Proposal> {
  if (!read.ok) return read;
  const risks = compareFindings(lintGraph(before), lintGraph(read.value.graph))
    .introduced.filter(
      (finding) => finding.severity !== 'info' && REVIEWED_RULES.has(finding.ruleId),
    )
    .map(describeFinding);
  return risks.length === 0 ? read : { ...read, review: risks };
}

/** A whole diagram in `answer.graph`, compared with the one it replaces. */
function readGraphAnswer(
  answer: Record<string, unknown>,
  previous: ArchitectureGraph,
): Interpretation<Proposal> {
  const problems: string[] = [];
  const titled = readTitle(answer, problems);
  const input = answer['graph'];
  if (!isObject(input)) return { ok: false, problems: [...problems, '"graph" must be an object.'] };
  // The version is ours to set, not the model's to remember.
  const parsed = parseArchitectureGraph({ ...input, schemaVersion: SCHEMA_VERSION });
  if (!parsed.success) {
    problems.push(...parsed.issues.map((issue) => `graph: ${issue.message}`));
  }
  if (!parsed.success || problems.length > 0) return { ok: false, problems };
  return {
    ok: true,
    value: { ...titled, graph: parsed.graph, changes: diffGraphs(previous, parsed.graph) },
  };
}

/** Operations in `answer.operations`, applied to `graph`. */
function readPatchAnswer(
  answer: Record<string, unknown>,
  graph: ArchitectureGraph,
  prefix = '',
): Interpretation<Proposal> {
  const problems: string[] = [];
  const titled = readTitle(answer, problems, prefix);
  const operations = GraphPatchSchema.safeParse(answer['operations']);
  if (!operations.success) {
    problems.push(
      ...operations.error.issues.map(
        (issue) => `${prefix}operations.${issue.path.map(String).join('.')}: ${issue.message}`,
      ),
    );
    return { ok: false, problems };
  }
  const result = applyPatch(graph, operations.data);
  if (!result.success) {
    problems.push(
      ...result.issues.map(({ operation, message }) =>
        operation === undefined
          ? `${prefix}the diagram would be invalid: ${message}`
          : `${prefix}operation ${operation}: ${message}`,
      ),
    );
  } else if (!hasChanges(result.changes)) {
    problems.push(`${prefix}the operations change nothing in the diagram.`);
  }
  if (!result.success || problems.length > 0) return { ok: false, problems };
  return {
    ok: true,
    value: { ...titled, graph: result.graph, changes: result.changes, operations: operations.data },
  };
}

/** Design findings worth fixing: errors and warnings, not missing information. */
function riskCount(graph: ArchitectureGraph): number {
  return lintGraph(graph).filter((finding) => finding.severity !== 'info').length;
}

/**
 * Several independent improvements, each applied on its own. While retries
 * remain, any invalid one sends them all back; on the last attempt the valid
 * ones are kept and the rest left out, with a warning.
 */
function readImproveAnswer(
  answer: Record<string, unknown>,
  graph: ArchitectureGraph,
  lastAttempt: boolean,
): Interpretation<Proposal[]> {
  const proposals = answer['proposals'];
  if (!Array.isArray(proposals) || proposals.length === 0) {
    return { ok: false, problems: ['"proposals" must be a non-empty array.'] };
  }
  const valid: Proposal[] = [];
  const problems: string[] = [];
  proposals.slice(0, ASSIST_LIMITS.maxProposals).forEach((proposal: unknown, index) => {
    const prefix = `proposals.${index}: `;
    if (!isObject(proposal)) {
      problems.push(`${prefix}must be an object.`);
      return;
    }
    const read = readPatchAnswer(proposal, graph, prefix);
    if (read.ok) valid.push(read.value);
    else problems.push(...read.problems);
  });
  if (valid.length === 0 || (problems.length > 0 && !lastAttempt)) return { ok: false, problems };

  const warnings: AssistWarning[] = [];
  if (problems.length > 0) warnings.push('proposals-dropped');
  const risks = riskCount(graph);
  if (valid.some((proposal) => riskCount(proposal.graph) > risks)) warnings.push('more-findings');
  return { ok: true, value: valid, warnings };
}

/** Nodes that are parts of the architecture, not groups or drawings. */
function componentCount(graph: ArchitectureGraph): number {
  return graph.nodes.filter((node) => !isContainerKind(node.kind) && !isShapeKind(node.kind))
    .length;
}

/** A redesign must change something; one that goes the wrong way is still offered, with a warning. */
function readRedesignAnswer(
  answer: Record<string, unknown>,
  graph: ArchitectureGraph,
  goal: 'simplify' | 'extend',
): Interpretation<Proposal> {
  const read = readGraphAnswer(answer, graph);
  if (!read.ok) return read;
  if (!hasChanges(read.value.changes)) {
    return { ok: false, problems: ['The new diagram is the same as the current one.'] };
  }
  const before = componentCount(graph);
  const after = componentCount(read.value.graph);
  const warnings: AssistWarning[] = [];
  if (goal === 'simplify' && after > before) warnings.push('not-simpler');
  if (goal === 'extend' && after < before) warnings.push('not-more-complete');
  return { ok: true, value: read.value, warnings };
}
