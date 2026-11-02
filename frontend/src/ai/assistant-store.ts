import type {
  ArchitectureGraph,
  AssistStage,
  AssistTask,
  AssistWarning,
  DiagramDocument,
  Proposal,
} from '@archdraft/shared';
import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';

/** Tasks whose proposals wait in the panel: an edit too, when it removes or changes a lot. */
export type ReviewTask = Exclude<AssistTask, 'generate'>;

/** What a change does to one node or edge. */
export type ChangeMark = 'added' | 'updated' | 'removed';

/** What a change does, by node and by edge, to mark it on the canvas. */
export interface ChangeMarks {
  readonly nodes: ReadonlyMap<string, ChangeMark>;
  readonly edges: ReadonlyMap<string, ChangeMark>;
}

/** Proposals waiting in the panel for the person to apply or discard. */
export interface Offer {
  readonly task: ReviewTask;
  readonly proposals: readonly Proposal[];
  /** The diagram they were made for. */
  readonly basedOn: ArchitectureGraph;
  readonly warnings: readonly AssistWarning[];
  /** The proposal drawn on the canvas, which the panel shows open. */
  readonly active: number;
  /** Whether applying lays the whole diagram out again, instead of keeping what stays in place. */
  readonly tidy: boolean;
}

/** A proposal drawn over the open diagram before it is applied. */
export interface Preview {
  readonly proposal: Proposal;
  /** The diagram once applied, with what it removes still in it, to show it going. */
  readonly document: DiagramDocument;
  readonly marks: ChangeMarks;
}

/** What the assistant has just changed, kept in the panel until the person is done with it. */
export interface Report {
  readonly task: AssistTask;
  readonly proposal: Proposal;
  readonly before: ArchitectureGraph;
  readonly after: ArchitectureGraph;
}

/** How far the assistant has got with the request in flight. */
export interface Progress {
  readonly stage: AssistStage;
  /** The reasoning of the model so far, its latest part, for the models that show theirs. */
  readonly thought: string;
  /** The components its answer has written so far. */
  readonly components: readonly string[];
  /** When the request went out, in milliseconds since the epoch. */
  readonly startedAt: number;
}

/** Most of the reasoning kept: what the panel shows is its end. */
export const MAX_THOUGHT = 2000;

export interface AssistantState {
  /** The task the assistant is working on, while it is. */
  readonly working: AssistTask | null;
  /** What it is doing on that task. */
  readonly progress: Progress | null;
  /** Cancels the request in flight. */
  readonly controller: AbortController | null;
  readonly offer: Offer | null;
  /** The active proposal of the offer, once it is laid out; null when it no longer fits. */
  readonly preview: Preview | null;
  readonly report: Report | null;
  /** What the change in the report did, marked on the canvas while the report is open. */
  readonly marks: ChangeMarks | null;
  /** The node or edge pointed at in a list of changes: it stands out on the canvas. */
  readonly focus: { readonly type: 'node' | 'edge'; readonly id: string } | null;
}

export const assistantStore = createStore<AssistantState>()(() => ({
  working: null,
  progress: null,
  controller: null,
  offer: null,
  preview: null,
  report: null,
  marks: null,
  focus: null,
}));

export function useAssistant<T>(selector: (state: AssistantState) => T): T {
  return useStore(assistantStore, selector);
}
