import type {
  ArchitectureGraph,
  AssistLocale,
  AssistRequest,
  CloudProvider,
  ComponentKind,
  OfferTask,
} from '@archdraft/shared';

/** A connection between a component of one kind and a component of another, in that direction. */
export type KindPair = readonly [ComponentKind, ComponentKind];

/**
 * What a good answer to a case has, by kinds of component rather than by names or ids, so that
 * any reasonable design can pass (docs/evaluacion.md):
 *
 * - `required`: kinds the design must have.
 * - `optional`: kinds it may have without being penalised. Actors are always allowed.
 * - `connections`: pairs that must be joined by a path of connections from the first to the second.
 * - `forbidden`: kinds the design must not have, and pairs that must not be joined directly.
 */
export interface Expectations {
  readonly required?: readonly ComponentKind[];
  readonly optional?: readonly ComponentKind[];
  readonly connections?: readonly KindPair[];
  readonly forbidden?: {
    readonly kinds?: readonly ComponentKind[];
    readonly connections?: readonly KindPair[];
  };
}

interface CaseBase {
  /** Unique and stable, so that reports can be compared: `generate-es-shop`. */
  readonly id: string;
  readonly locale: AssistLocale;
  readonly expect: Expectations;
}

export interface GenerateCase extends CaseBase {
  readonly task: 'generate';
  readonly prompt: string;
  readonly provider?: CloudProvider;
}

/** A task on a diagram: a template, or a variant of one with the risks to fix. */
export interface DiagramCase extends CaseBase {
  readonly task: 'edit' | OfferTask;
  readonly graph: ArchitectureGraph;
  /** Required for `edit`; what to focus on for the others. */
  readonly prompt?: string;
}

export type EvalCase = GenerateCase | DiagramCase;

/** The request the agent gets for a case, as the editor would send it. */
export function requestOf(evalCase: EvalCase): AssistRequest {
  const { task, locale } = evalCase;
  if (task === 'generate') {
    const { prompt, provider } = evalCase;
    return { task, locale, prompt, ...(provider === undefined ? {} : { provider }) };
  }
  const { graph, prompt } = evalCase;
  if (task === 'edit') {
    if (prompt === undefined) throw new Error(`Case ${evalCase.id} is an edit without a prompt`);
    return { task, locale, prompt, graph };
  }
  return { task, locale, graph, ...(prompt === undefined ? {} : { prompt }) };
}
