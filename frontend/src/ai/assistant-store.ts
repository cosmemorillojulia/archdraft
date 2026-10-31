import type {
  ArchitectureGraph,
  AssistTask,
  AssistWarning,
  OfferTask,
  Proposal,
} from '@archdraft/shared';
import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';

/** Proposals waiting in the panel for the person to apply or discard. */
export interface Offer {
  readonly task: OfferTask;
  readonly proposals: readonly Proposal[];
  /** The diagram they were made for. */
  readonly basedOn: ArchitectureGraph;
  readonly warnings: readonly AssistWarning[];
}

export interface AssistantState {
  /** The task the assistant is working on, while it is. */
  readonly working: AssistTask | null;
  /** Cancels the request in flight. */
  readonly controller: AbortController | null;
  readonly offer: Offer | null;
  /**
   * Nodes and edges to point out on the canvas: what a proposal under the
   * pointer would touch, or what the last change applied.
   */
  readonly highlight: {
    readonly nodes: ReadonlySet<string>;
    readonly edges: ReadonlySet<string>;
  } | null;
}

export const assistantStore = createStore<AssistantState>()(() => ({
  working: null,
  controller: null,
  offer: null,
  highlight: null,
}));

export function useAssistant<T>(selector: (state: AssistantState) => T): T {
  return useStore(assistantStore, selector);
}
