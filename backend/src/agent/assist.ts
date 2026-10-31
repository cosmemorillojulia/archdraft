import {
  applyPatch,
  type ArchitectureGraph,
  ArchitectureGraphSchema,
  ASSIST_LIMITS,
  type AssistRequest,
  type AssistResult,
  type AssistWarning,
  createEmptyGraph,
  diffGraphs,
  GraphPatchSchema,
  hasChanges,
  isContainerKind,
  isShapeKind,
  lintGraph,
  parseArchitectureGraph,
  type Proposal,
  SCHEMA_VERSION,
} from '@archdraft/shared';
import { z } from 'zod';
import type { LlmMessage, LlmProvider } from '../llm/provider.ts';
import { isObject } from './extract-json.ts';
import {
  editMessage,
  generateMessage,
  improveMessage,
  redesignMessage,
  systemPrompt,
} from './prompt.ts';
import { type Interpretation, runWithRepair } from './repair.ts';

/**
 * The agent: one call to the model per task (plus repairs), with an answer
 * that is checked as untrusted input before anything is returned (ADR 0022).
 * A diagram that is created or redesigned comes back whole; an edit or an
 * improvement comes back as operations applied to the diagram it was asked on.
 */

const TitledSchema = z.object({ title: z.string(), rationale: z.string() });
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

/** A diagram is long; a list of edits is shorter. Limits keep a runaway answer in the quota. */
const MAX_TOKENS = { graph: 6000, patch: 3000, improve: 4000 } as const;
const TEMPERATURE = 0.2;

export async function assist(
  provider: LlmProvider,
  request: AssistRequest,
  signal?: AbortSignal,
): Promise<AssistResult> {
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
      provider,
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
        (answer) => readGraphAnswer(answer, empty),
      );
      return { task: request.task, proposals: [value], attempts, warnings: [...warnings] };
    }
    case 'edit': {
      const { graph } = request;
      const { value, attempts, warnings } = await ask(
        editMessage(request.prompt, graph, jsonSchemaOf(PatchAnswerSchema)),
        jsonSchemaOf(PatchAnswerSchema),
        MAX_TOKENS.patch,
        (answer) => readPatchAnswer(answer, graph),
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
        (answer) => readRedesignAnswer(answer, graph, task),
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

type Titled = { title: string; rationale: string };

function readTitle(answer: Record<string, unknown>, problems: string[], prefix = ''): Titled {
  const title = text(answer['title'], ASSIST_LIMITS.titleLength);
  if (title === undefined) problems.push(`${prefix}"title" must be a non-empty string.`);
  return {
    title: title ?? '',
    rationale: text(answer['rationale'], ASSIST_LIMITS.textLength) ?? '',
  };
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
