import {
  applyPatch,
  type ArchitectureGraph,
  type AssistRequest,
  type AssistTask,
  diffGraphs,
  type DiagramLayout,
  type GraphChanges,
  isContainerKind,
  layoutEntry,
  parseArchitectureGraph,
  type Proposal,
} from '@archdraft/shared';
import { layoutDiagram } from '../canvas/layout-client.ts';
import { editorStore } from '../editor/store.ts';
import { currentStrings, localeStore } from '../i18n/locale.ts';
import type { LayoutDirection } from '../layout/compute-layout.ts';
import { reviewStore } from '../review/review-store.ts';
import { AssistError, requestAssist } from './client.ts';
import { assistantStore } from './assistant-store.ts';

/** How long what the assistant changed stays pointed out on the canvas. */
export const HIGHLIGHT_MS = 4000;

let highlightTimer: ReturnType<typeof setTimeout> | undefined;

function highlight(changes: GraphChanges): void {
  clearTimeout(highlightTimer);
  const nodes = new Set([...changes.nodes.added, ...changes.nodes.updated]);
  const edges = new Set([...changes.edges.added, ...changes.edges.updated]);
  if (nodes.size + edges.size === 0) return;
  assistantStore.setState({ highlight: { nodes, edges } });
  highlightTimer = setTimeout(() => assistantStore.setState({ highlight: null }), HIGHLIGHT_MS);
}

/** Points out on the canvas what a proposal would change of the open diagram, or stops. */
export function previewProposal(proposal: Proposal | null): void {
  clearTimeout(highlightTimer);
  if (proposal === null) {
    assistantStore.setState({ highlight: null });
    return;
  }
  const { nodes, edges } = proposal.changes;
  // What it adds is not on the canvas yet; what it changes or removes is.
  assistantStore.setState({
    highlight: {
      nodes: new Set([...nodes.updated, ...nodes.removed]),
      edges: new Set([...edges.updated, ...edges.removed]),
    },
  });
}

function requestFor(
  task: AssistTask,
  prompt: string | undefined,
  graph: ArchitectureGraph | undefined,
): AssistRequest | null {
  const locale = localeStore.getState().locale;
  switch (task) {
    case 'generate':
      return prompt === undefined ? null : { task, locale, prompt };
    case 'edit':
      return prompt === undefined || graph === undefined ? null : { task, locale, prompt, graph };
    case 'improve':
    case 'simplify':
    case 'extend':
      return graph === undefined
        ? null
        : { task, locale, graph, ...(prompt === undefined ? {} : { prompt }) };
  }
}

/**
 * The layout of the diagram before, for the diagram after: what stays where it
 * was keeps its place, and what is new or moved into another group is placed
 * by ELK. A group that gains or loses members lets go of its size, so it can
 * grow around them.
 */
export function carryLayout(
  before: ArchitectureGraph,
  after: ArchitectureGraph,
  layout: DiagramLayout,
): DiagramLayout {
  const parentBefore = new Map(before.nodes.map((node) => [node.id, node.parentId]));
  const members = (graph: ArchitectureGraph, id: string) =>
    graph.nodes
      .filter((node) => node.parentId === id)
      .map((node) => node.id)
      .sort()
      .join(',');
  const positions: DiagramLayout['positions'] = {};
  const sizes: DiagramLayout['sizes'] = {};
  for (const node of after.nodes) {
    if (!parentBefore.has(node.id) || parentBefore.get(node.id) !== node.parentId) continue;
    const position = layoutEntry(layout.positions, node.id);
    if (position) positions[node.id] = position;
    const size = layoutEntry(layout.sizes, node.id);
    const regrouped =
      isContainerKind(node.kind) && members(before, node.id) !== members(after, node.id);
    if (size && !regrouped) sizes[node.id] = size;
  }

  // Styles and routes drawn by hand stay with the connections that are still there, unchanged.
  const edgesBefore = new Map(before.edges.map((edge) => [edge.id, edge]));
  const kept = new Set(
    after.edges
      .filter((edge) => {
        const old = edgesBefore.get(edge.id);
        return old?.source === edge.source && old.target === edge.target;
      })
      .map((edge) => edge.id),
  );
  const keep = <T>(record: Readonly<Record<string, T>> | undefined) => {
    if (record === undefined) return undefined;
    const entries = Object.entries(record).filter(([id]) => kept.has(id));
    return entries.length > 0 ? Object.fromEntries(entries) : undefined;
  };
  const edgeStyles = keep(layout.edgeStyles);
  const edgeRoutes = keep(layout.edgeRoutes);
  return {
    positions,
    sizes,
    ...(layout.edgeStyle === undefined ? {} : { edgeStyle: layout.edgeStyle }),
    ...(edgeStyles === undefined ? {} : { edgeStyles }),
    ...(edgeRoutes === undefined ? {} : { edgeRoutes }),
  };
}

/**
 * Puts a proposal into the open diagram as one step of the history. One made
 * for an older version of it is applied again to the current one when it is a
 * list of edits; a whole new design cannot be, and the editor says so.
 * Returns whether it was applied.
 */
export async function applyProposal(
  proposal: Proposal,
  basedOn: ArchitectureGraph,
): Promise<boolean> {
  const strings = currentStrings();
  const editor = editorStore.getState();
  const current = editor.current;
  if (!current) return false;
  const before = current.document.graph;

  let candidate = proposal.graph;
  if (before !== basedOn) {
    const rebased = proposal.operations ? applyPatch(before, proposal.operations) : undefined;
    if (!rebased?.success) {
      editor.notify(strings.assistant.stale);
      return false;
    }
    candidate = rebased.graph;
  }
  // Checked once more here: the answer came over the network.
  const parsed = parseArchitectureGraph(candidate);
  if (!parsed.success) {
    editor.notify(strings.assistant.failed['invalid-model-output']());
    return false;
  }
  const graph = parsed.graph;

  let layout: DiagramLayout;
  try {
    const pinned = carryLayout(before, graph, current.document.layout);
    layout = { ...pinned, ...(await layoutDiagram(graph, current.direction, pinned)) };
  } catch (error) {
    console.error('Could not lay out the proposal', error);
    editor.notify(strings.canvas.layoutFailed);
    return false;
  }
  if (editorStore.getState().current?.document.graph !== before) {
    editor.notify(strings.assistant.stale);
    return false;
  }
  editorStore.getState().replaceDocument({ graph, layout });
  if (editorStore.getState().current?.document.graph !== graph) return false;
  highlight(diffGraphs(before, graph));
  return true;
}

async function openGenerated(proposal: Proposal, direction: LayoutDirection): Promise<void> {
  const parsed = parseArchitectureGraph(proposal.graph);
  if (!parsed.success) {
    editorStore.getState().notify(currentStrings().assistant.failed['invalid-model-output']());
    return;
  }
  try {
    const layout = await layoutDiagram(parsed.graph, direction);
    editorStore.getState().load({ graph: parsed.graph, layout }, { direction, templateId: null });
  } catch (error) {
    console.error('Could not lay out the generated diagram', error);
    editorStore.getState().notify(currentStrings().canvas.layoutFailed);
  }
}

/** Stops the request in flight, if there is one. */
export function cancelAssistant(): void {
  assistantStore.getState().controller?.abort();
  assistantStore.setState({ working: null, controller: null });
}

/**
 * Asks the assistant to do `task` on the open diagram. Creating and editing
 * change the diagram straight away; improving and redesigning leave proposals
 * in the panel. Only the latest request counts: a new one cancels the last.
 */
export async function runAssistant(
  task: AssistTask,
  prompt: string | undefined,
  direction: LayoutDirection,
): Promise<void> {
  const strings = currentStrings();
  const graph = editorStore.getState().current?.document.graph;
  const request = requestFor(task, prompt, graph);
  if (request === null) return;

  cancelAssistant();
  const controller = new AbortController();
  assistantStore.setState({ working: task, controller, offer: null, highlight: null });
  const isLatest = () => assistantStore.getState().controller === controller;

  try {
    const result = await requestAssist(request, controller.signal);
    if (!isLatest()) return;
    const [first] = result.proposals;
    if (task === 'generate') {
      if (first !== undefined) await openGenerated(first, direction);
    } else if (task === 'edit') {
      if (first !== undefined && graph !== undefined) await applyProposal(first, graph);
    } else if (graph !== undefined) {
      // The proposals take the place of the review in the panel slot.
      reviewStore.getState().setOpen(false);
      assistantStore.setState({
        offer: { task, proposals: result.proposals, basedOn: graph, warnings: result.warnings },
      });
    }
    if (result.warnings.length > 0) {
      editorStore
        .getState()
        .notify(result.warnings.map((warning) => strings.assistant.warnings[warning]).join(' '));
    }
  } catch (error) {
    if (controller.signal.aborted) return;
    if (error instanceof AssistError) {
      editorStore.getState().notify(strings.assistant.failed[error.failure](error.retryAfter));
    } else {
      console.error('The assistant failed', error);
      editorStore.getState().notify(strings.assistant.failed['internal-error']());
    }
  } finally {
    if (isLatest()) assistantStore.setState({ working: null, controller: null });
  }
}

/** Applies a proposal of the panel; once applied, it leaves the panel. */
export async function applyOffered(index: number): Promise<void> {
  const offer = assistantStore.getState().offer;
  const proposal = offer?.proposals[index];
  if (!offer || !proposal) return;
  if (!(await applyProposal(proposal, offer.basedOn))) return;
  discardOffered(proposal);
}

/** Takes a proposal out of the panel, which closes when none is left. */
export function discardOffered(proposal: Proposal): void {
  const offer = assistantStore.getState().offer;
  if (!offer) return;
  const proposals = offer.proposals.filter((other) => other !== proposal);
  assistantStore.setState({ offer: proposals.length > 0 ? { ...offer, proposals } : null });
}

export function closeOffer(): void {
  previewProposal(null);
  assistantStore.setState({ offer: null });
}
