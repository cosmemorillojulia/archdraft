import {
  applyPatch,
  type ArchitectureGraph,
  type AssistRequest,
  type AssistTask,
  type AssistWarning,
  createEmptyGraph,
  diffGraphs,
  type DiagramDocument,
  type DiagramLayout,
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
import {
  assistantStore,
  type AssistantState,
  type Offer,
  type ReviewTask,
} from './assistant-store.ts';
import { marksOf, needsReview, previewDocument, shouldTidy } from './changes.ts';

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
  const edgeLabels = keep(layout.edgeLabels);
  return {
    positions,
    sizes,
    ...(layout.edgeStyle === undefined ? {} : { edgeStyle: layout.edgeStyle }),
    ...(edgeStyles === undefined ? {} : { edgeStyles }),
    ...(edgeRoutes === undefined ? {} : { edgeRoutes }),
    ...(edgeLabels === undefined ? {} : { edgeLabels }),
  };
}

/**
 * The diagram a proposal gives on the open diagram `current`. One made for an
 * older version is applied again to the current one when it is a list of
 * edits; a whole new design cannot be. Null when it no longer fits, or when
 * the answer, which came over the network, is not a valid diagram.
 */
export function candidateGraph(
  proposal: Proposal,
  basedOn: ArchitectureGraph,
  current: ArchitectureGraph,
): ArchitectureGraph | null {
  let candidate = proposal.graph;
  if (current !== basedOn) {
    const rebased = proposal.operations ? applyPatch(current, proposal.operations) : undefined;
    if (!rebased?.success) return null;
    candidate = rebased.graph;
  }
  const parsed = parseArchitectureGraph(candidate);
  return parsed.success ? parsed.graph : null;
}

/**
 * Layouts of proposals, by the document they are laid out on: the preview and
 * the change applied are the same drawing, and pointing at proposals in turn
 * lays each out once.
 */
const layouts = new WeakMap<
  DiagramDocument,
  WeakMap<Proposal, Map<boolean, Promise<DiagramLayout>>>
>();

/**
 * Where everything goes once `graph` takes the place of the graph of `before`.
 * Kept in place, only what is new is placed; tidied, the whole diagram is laid
 * out again, with the connection styles chosen by hand.
 */
function layoutFor(
  before: DiagramDocument,
  proposal: Proposal,
  graph: ArchitectureGraph,
  direction: LayoutDirection,
  tidy: boolean,
): Promise<DiagramLayout> {
  let byProposal = layouts.get(before);
  if (!byProposal) layouts.set(before, (byProposal = new WeakMap()));
  let byMode = byProposal.get(proposal);
  if (!byMode) byProposal.set(proposal, (byMode = new Map<boolean, Promise<DiagramLayout>>()));
  const cached = byMode.get(tidy);
  if (cached) return cached;

  const carried = carryLayout(before.graph, graph, before.layout);
  const laidOut = tidy
    ? layoutDiagram(graph, direction).then((fresh) => {
        const { edgeStyle, edgeStyles, edgeLabels } = carried;
        return {
          ...fresh,
          ...(edgeStyle === undefined ? {} : { edgeStyle }),
          ...(edgeStyles === undefined ? {} : { edgeStyles }),
          ...(edgeLabels === undefined ? {} : { edgeLabels }),
        };
      })
    : layoutDiagram(graph, direction, carried).then((placed) => ({ ...carried, ...placed }));
  byMode.set(tidy, laidOut);
  laidOut.catch(() => byMode.delete(tidy));
  return laidOut;
}

/** Only the latest preview asked for is shown. */
let previewRun = 0;

/** Draws the active proposal of the panel over the diagram, as it is now. */
async function refreshPreview(): Promise<void> {
  const run = ++previewRun;
  const { offer } = assistantStore.getState();
  const current = editorStore.getState().current;
  const proposal = offer?.proposals[offer.active];
  const graph =
    offer && current && proposal
      ? candidateGraph(proposal, offer.basedOn, current.document.graph)
      : null;
  if (!offer || !current || !proposal || !graph) {
    assistantStore.setState({ preview: null });
    return;
  }
  let layout: DiagramLayout;
  try {
    layout = await layoutFor(current.document, proposal, graph, current.direction, offer.tidy);
  } catch (error) {
    console.error('Could not lay out the preview', error);
    if (run === previewRun) assistantStore.setState({ preview: null });
    return;
  }
  if (run !== previewRun) return;
  const changes = diffGraphs(current.document.graph, graph);
  assistantStore.setState({
    preview: {
      proposal,
      document: previewDocument(current.document, { graph, layout }, changes, offer.tidy),
      marks: marksOf(changes),
    },
  });
}

let watching = false;

/**
 * Keeps the panel in step with the diagram: the preview follows what the
 * person changes meanwhile, and a report of a change closes once the diagram
 * moves on from it or something is chosen to edit.
 */
function watchEditor(): void {
  if (watching) return;
  watching = true;
  editorStore.subscribe((state, previous) => {
    const { offer, report } = assistantStore.getState();
    if (state.current?.document !== previous.current?.document) {
      if (offer) void refreshPreview();
      if (report && state.current?.document.graph !== report.after) closeReport();
    }
    if (report && state.selection !== null && state.selection !== previous.selection) {
      closeReport();
    }
  });
}

/** `offer` with the proposal at `index` open, kept in place or tidied as suits it. */
function activated(offer: Offer, index: number): Offer {
  const proposal = offer.proposals[index];
  if (!proposal) return offer;
  return {
    ...offer,
    active: index,
    tidy: shouldTidy(offer.basedOn, proposal.graph, proposal.changes),
  };
}

/** Opens the proposal at `index` in the panel and draws it on the canvas. */
export function showProposal(index: number): void {
  const offer = assistantStore.getState().offer;
  if (!offer || index === offer.active || !offer.proposals[index]) return;
  assistantStore.setState({ offer: activated(offer, index), focus: null });
  void refreshPreview();
}

/** Lays the whole diagram out again when the active proposal is applied, or keeps it in place. */
export function setTidy(tidy: boolean): void {
  const offer = assistantStore.getState().offer;
  if (!offer || offer.tidy === tidy) return;
  assistantStore.setState({ offer: { ...offer, tidy } });
  void refreshPreview();
}

/** Makes one node or edge stand out on the canvas, from a list of changes; null stops. */
export function focusChange(focus: AssistantState['focus']): void {
  assistantStore.setState({ focus });
}

function openOffer(
  task: ReviewTask,
  proposals: readonly Proposal[],
  basedOn: ArchitectureGraph,
  warnings: readonly AssistWarning[] = [],
) {
  if (proposals.length === 0) return;
  watchEditor();
  // The proposals take the place of the review in the panel slot.
  reviewStore.getState().setOpen(false);
  const offer: Offer = { task, proposals, basedOn, warnings, active: 0, tidy: false };
  assistantStore.setState({ offer: activated(offer, 0), preview: null, focus: null });
  void refreshPreview();
}

function openReport(
  task: AssistTask,
  proposal: Proposal,
  before: ArchitectureGraph,
  after: ArchitectureGraph,
): void {
  watchEditor();
  reviewStore.getState().setOpen(false);
  assistantStore.setState({
    report: { task, proposal, before, after },
    // A new diagram is new all over: there is nothing to tell apart on it.
    marks: task === 'generate' ? null : marksOf(diffGraphs(before, after)),
    focus: null,
  });
}

/** Leaves the report of the last change; what it marked on the canvas goes with it. */
export function closeReport(): void {
  assistantStore.setState({ report: null, marks: null, focus: null });
}

/** Takes back the change in the report, which closes it. */
export function undoReported(): void {
  closeReport();
  editorStore.getState().undo();
}

/**
 * Puts a proposal into the open diagram as one step of the history, laid out
 * as its preview was. Returns the diagram before and after, or null if it was
 * not applied, with the reason told to the person.
 */
export async function applyProposal(
  proposal: Proposal,
  basedOn: ArchitectureGraph,
  tidy?: boolean,
): Promise<{ before: ArchitectureGraph; after: ArchitectureGraph } | null> {
  const strings = currentStrings();
  const editor = editorStore.getState();
  const current = editor.current;
  if (!current) return null;
  const before = current.document.graph;

  const graph = candidateGraph(proposal, basedOn, before);
  if (graph === null) {
    const stale = before !== basedOn;
    editor.notify(
      stale ? strings.assistant.stale : strings.assistant.failed['invalid-model-output'](),
    );
    return null;
  }

  let layout: DiagramLayout;
  try {
    const whole = tidy ?? shouldTidy(before, graph, diffGraphs(before, graph));
    layout = await layoutFor(current.document, proposal, graph, current.direction, whole);
  } catch (error) {
    console.error('Could not lay out the proposal', error);
    editor.notify(strings.canvas.layoutFailed);
    return null;
  }
  if (editorStore.getState().current?.document.graph !== before) {
    editor.notify(strings.assistant.stale);
    return null;
  }
  editorStore.getState().replaceDocument({ graph, layout });
  const after = editorStore.getState().current?.document.graph;
  return after === graph ? { before, after } : null;
}

async function openGenerated(proposal: Proposal, direction: LayoutDirection): Promise<boolean> {
  const parsed = parseArchitectureGraph(proposal.graph);
  if (!parsed.success) {
    editorStore.getState().notify(currentStrings().assistant.failed['invalid-model-output']());
    return false;
  }
  try {
    const layout = await layoutDiagram(parsed.graph, direction);
    editorStore.getState().load({ graph: parsed.graph, layout }, { direction, templateId: null });
    return true;
  } catch (error) {
    console.error('Could not lay out the generated diagram', error);
    editorStore.getState().notify(currentStrings().canvas.layoutFailed);
    return false;
  }
}

/** Stops the request in flight, if there is one. */
export function cancelAssistant(): void {
  assistantStore.getState().controller?.abort();
  assistantStore.setState({ working: null, controller: null });
}

/**
 * Asks the assistant to do `task` on the open diagram. Creating changes the
 * diagram straight away, and so does an edit unless it removes or changes a
 * lot; then the panel tells what was done. Improving and redesigning, and the
 * larger edits, leave proposals in the panel, drawn on the canvas before they
 * are applied. Only the latest request counts: a new one cancels the last.
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
  assistantStore.setState({
    working: task,
    controller,
    offer: null,
    preview: null,
    report: null,
    marks: null,
    focus: null,
  });
  const isLatest = () => assistantStore.getState().controller === controller;

  try {
    const result = await requestAssist(request, controller.signal);
    if (!isLatest()) return;
    const [first] = result.proposals;
    if (task === 'generate') {
      if (first !== undefined && (await openGenerated(first, direction))) {
        const after = editorStore.getState().current?.document.graph;
        if (after) openReport(task, first, createEmptyGraph(''), after);
      }
    } else if (task === 'edit') {
      if (first !== undefined && graph !== undefined) {
        if (needsReview(first)) openOffer(task, [first], graph);
        else {
          const applied = await applyProposal(first, graph);
          if (applied) openReport(task, first, applied.before, applied.after);
        }
      }
    } else if (graph !== undefined) {
      openOffer(task, result.proposals, graph, result.warnings);
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

/**
 * Applies a proposal of the panel; once applied, it leaves the panel. With
 * none left, the panel tells what the last one did.
 */
export async function applyOffered(index: number): Promise<void> {
  const offer = assistantStore.getState().offer;
  const proposal = offer?.proposals[index];
  if (!offer || !proposal) return;
  const applied = await applyProposal(
    proposal,
    offer.basedOn,
    index === offer.active ? offer.tidy : undefined,
  );
  if (!applied) return;
  const left = assistantStore.getState().offer?.proposals.filter((other) => other !== proposal);
  if (!left || left.length === 0) {
    closeOffer();
    openReport(offer.task, proposal, applied.before, applied.after);
    return;
  }
  discardOffered(proposal);
}

/** Takes a proposal out of the panel, which closes when none is left. */
export function discardOffered(proposal: Proposal): void {
  const offer = assistantStore.getState().offer;
  if (!offer) return;
  const index = offer.proposals.indexOf(proposal);
  const proposals = offer.proposals.filter((other) => other !== proposal);
  if (proposals.length === 0) {
    closeOffer();
    return;
  }
  const active =
    index < offer.active ? offer.active - 1 : Math.min(offer.active, proposals.length - 1);
  assistantStore.setState({ offer: activated({ ...offer, proposals }, active), focus: null });
  void refreshPreview();
}

export function closeOffer(): void {
  previewRun++;
  assistantStore.setState({ offer: null, preview: null, focus: null });
}
