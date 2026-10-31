import { z } from 'zod';
import { CloudProviderSchema, ArchitectureGraphSchema, LIMITS } from '../schema.ts';
import { GraphPatchSchema } from '../patch.ts';

/**
 * Contract of `POST /v1/assist`, shared by the backend that answers it and
 * the editor that calls it (ADR 0022). Both sides validate with these schemas.
 */

/** What the assistant can be asked to do with a diagram. */
export const ASSIST_TASKS = ['generate', 'edit', 'improve', 'simplify', 'extend'] as const;
export type AssistTask = (typeof ASSIST_TASKS)[number];

/**
 * Tasks whose proposals the editor offers for the person to choose. The single
 * proposal of `generate` and `edit` is applied straight away.
 */
export type OfferTask = Exclude<AssistTask, 'generate' | 'edit'>;

/** Languages the names and explanations can be written in. */
export const ASSIST_LOCALES = ['en', 'es'] as const;
export type AssistLocale = (typeof ASSIST_LOCALES)[number];

export const ASSIST_LIMITS = {
  promptLength: 4000,
  /** A request body is the prompt plus a diagram; this leaves room for the largest one. */
  bodyBytes: 64 * 1024,
  maxProposals: 5,
  titleLength: 120,
  textLength: 1000,
} as const;

const PromptSchema = z.string().trim().min(1).max(ASSIST_LIMITS.promptLength);
const LocaleSchema = z.enum(ASSIST_LOCALES);

export const AssistRequestSchema = z.discriminatedUnion('task', [
  z.strictObject({
    task: z.literal('generate'),
    locale: LocaleSchema,
    prompt: PromptSchema,
    provider: CloudProviderSchema.optional(),
  }),
  z.strictObject({
    task: z.literal('edit'),
    locale: LocaleSchema,
    prompt: PromptSchema,
    graph: ArchitectureGraphSchema,
  }),
  ...(['improve', 'simplify', 'extend'] as const).map((task) =>
    z.strictObject({
      task: z.literal(task),
      locale: LocaleSchema,
      /** What to focus on, if the person said. */
      prompt: PromptSchema.optional(),
      graph: ArchitectureGraphSchema,
    }),
  ),
]);

const IdsSchema = z.array(z.string()).max(LIMITS.maxNodes + LIMITS.maxEdges);
const ChangedIdsSchema = z.strictObject({
  added: IdsSchema,
  updated: IdsSchema,
  removed: IdsSchema,
});

export const GraphChangesSchema = z.strictObject({
  diagram: z.boolean(),
  nodes: ChangedIdsSchema,
  edges: ChangedIdsSchema,
});

/** One way of changing the diagram, ready to apply. */
export const ProposalSchema = z.strictObject({
  title: z.string().min(1).max(ASSIST_LIMITS.titleLength),
  /** Why this change, in the language asked for. */
  rationale: z.string().max(ASSIST_LIMITS.textLength),
  /** The diagram once the proposal is applied, already validated. */
  graph: ArchitectureGraphSchema,
  /** What it adds, changes and removes, to highlight it. */
  changes: GraphChangesSchema,
  /** The edits, for proposals made as edits of the current diagram. */
  operations: GraphPatchSchema.optional(),
});

/**
 * Things worth knowing about an answer that is still usable, as codes the editor words:
 * - `proposals-dropped`: some improvements were not valid and were left out.
 * - `not-simpler`: a simplification has more components than the diagram had.
 * - `not-more-complete`: a more complete design has fewer components than the diagram had.
 * - `more-findings`: applying a proposal gives the design rules more to report.
 */
export const ASSIST_WARNINGS = [
  'proposals-dropped',
  'not-simpler',
  'not-more-complete',
  'more-findings',
] as const;
export type AssistWarning = (typeof ASSIST_WARNINGS)[number];

export const AssistResultSchema = z.strictObject({
  task: z.enum(ASSIST_TASKS),
  /** One for `generate`, `edit`, `simplify` and `extend`; up to five for `improve`. */
  proposals: z.array(ProposalSchema).min(1).max(ASSIST_LIMITS.maxProposals),
  /** Calls to the model it took, retries included. */
  attempts: z.number().int().min(1),
  warnings: z.array(z.enum(ASSIST_WARNINGS)),
});

export type AssistRequest = z.infer<typeof AssistRequestSchema>;
export type Proposal = z.infer<typeof ProposalSchema>;
export type AssistResult = z.infer<typeof AssistResultSchema>;

/**
 * Problem types (RFC 9457) the API answers with, by the `type` member.
 * The editor turns each into a message; anything else counts as `model-error`.
 */
export const ASSIST_PROBLEMS = [
  'invalid-request',
  'payload-too-large',
  'rate-limited',
  'model-timeout',
  'model-error',
  'invalid-model-output',
  'not-found',
  'internal-error',
] as const;
export type AssistProblem = (typeof ASSIST_PROBLEMS)[number];

/** The `type` URI of a problem; relative, as RFC 9457 allows. */
export function problemType(problem: AssistProblem): string {
  return `/problems/${problem}`;
}
