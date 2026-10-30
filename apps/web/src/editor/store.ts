import {
  type ArchitectureGraph,
  ArchitectureGraphSchema,
  isShapeKind,
  CONTAINMENT_RULES,
  type DiagramDocument,
  type EdgeStyle,
  isContainerKind,
  type NodeKind,
  type Point,
  type Size,
  type TemplateId,
  type ValidationIssue,
  validateGraph,
} from '@archdraft/core';
import type { LayoutDirection } from '@archdraft/layout';
import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';
import { currentStrings } from '../i18n/locale.ts';
import {
  addNode,
  connect,
  duplicate,
  type Edit,
  type EdgePatch,
  exists,
  moveNode,
  moveNodes,
  type NodePatch,
  resizeNode,
  remove,
  removeNodes,
  type Selection,
  setDefaultEdgeStyle,
  setEdgeStyle,
  type DiagramPatch,
  type StackMove,
  stackNode,
  updateDiagram,
  updateEdge,
  updateNode,
} from './operations.ts';

/** Steps that undo can go back. */
export const HISTORY_LIMIT = 100;

/** A state of the diagram that undo and redo move between. */
export interface Snapshot {
  readonly document: DiagramDocument;
  /** Flow direction the document was laid out in; it orients the connection points. */
  readonly direction: LayoutDirection;
  /** Changes when another diagram is loaded, so the canvas starts afresh. */
  readonly key: number;
  /** Template the diagram was loaded from. */
  readonly templateId: TemplateId | null;
}

export interface EditorMessage {
  readonly id: number;
  readonly text: string;
}

export interface EditorState {
  /** Null until the first diagram has been laid out. */
  readonly current: Snapshot | null;
  readonly past: readonly Snapshot[];
  readonly future: readonly Snapshot[];
  readonly selection: Selection | null;
  /**
   * Nodes chosen together with Ctrl, Cmd or Shift and a click, when there are two or more.
   * They move and are deleted together; `selection` is the last one chosen.
   */
  readonly group: readonly string[];
  /** Component that a connection started from the inspector leaves from. */
  readonly connectingFrom: string | null;
  /** Node whose name is being edited in its own box on the canvas. */
  readonly renaming: string | null;
  /** Node just placed by hand, until something else is selected. */
  readonly placed: string | null;
  /**
   * Selection whose inspector was expanded on a narrow screen. Any other
   * selection opens it collapsed, as a strip with its name and quick actions.
   */
  readonly expandedSelection: Selection | null;
  /** Why the last edit was not made, until it is dismissed. */
  readonly message: EditorMessage | null;
  /** Template being laid out to open next, shown as chosen straight away. */
  readonly opening: TemplateId | null;
}

export interface EditorActions {
  /** Marks a template as chosen while it is laid out. */
  beginOpening: (templateId: TemplateId | null) => void;
  /**
   * Puts `graph` in place of the graph of the open diagram, keeping its layout
   * and without a step in the history: the same diagram in another language.
   */
  replaceGraph: (graph: ArchitectureGraph) => void;
  /** Opens a diagram. Undo returns to the previous one. */
  load: (
    document: DiagramDocument,
    origin: { direction: LayoutDirection; templateId: TemplateId | null },
  ) => void;
  /**
   * Adds a node centred on `centre`. A node placed `exact`ly stays where it is put, even over
   * others, and is not scrolled into view; its `size` is the one drawn by dragging.
   */
  addNode: (kind: NodeKind, centre: Point, options?: { size?: Size; exact?: boolean }) => void;
  connect: (source: string, target: string) => void;
  moveNode: (id: string, position: Point) => void;
  resizeNode: (id: string, box: Point & Size) => void;
  updateNode: (id: string, patch: NodePatch) => void;
  updateEdge: (id: string, patch: EdgePatch) => void;
  /** Draws every connection without a style of its own as curves or as right-angled lines. */
  setDefaultEdgeStyle: (style: EdgeStyle) => void;
  /** Draws one connection in `style`; `undefined` makes it follow the diagram again. */
  setEdgeStyle: (id: string, style: EdgeStyle | undefined) => void;
  /** Renames the diagram or changes its cloud provider. */
  updateDiagram: (patch: DiagramPatch) => void;
  /** Moves a node in front of or behind the nodes it is stacked with. */
  stackNode: (id: string, move: StackMove) => void;
  removeSelection: () => void;
  duplicateSelection: () => void;
  select: (selection: Selection | null) => void;
  /** Adds a node to the group of chosen nodes, or takes it out if it is in it. */
  toggleSelected: (id: string) => void;
  /** Moves the nodes of the group, or any others, together. */
  moveNodes: (moves: readonly { id: string; position: Point }[]) => void;
  /** Expands or collapses the inspector of the current selection on narrow screens. */
  expandInspector: (expanded: boolean) => void;
  /** Selects a node and edits its name in place. */
  startRename: (id: string) => void;
  stopRename: () => void;
  startConnection: (source: string) => void;
  cancelConnection: () => void;
  undo: () => void;
  redo: () => void;
  notify: (text: string) => void;
  dismissMessage: () => void;
}

export type EditorStore = EditorState & EditorActions;

const INITIAL_STATE: EditorState = {
  current: null,
  past: [],
  future: [],
  selection: null,
  group: [],
  connectingFrom: null,
  renaming: null,
  placed: null,
  expandedSelection: null,
  message: null,
  opening: null,
};

/** Whether the inspector of the current selection is expanded on narrow screens. */
export function isInspectorExpanded(state: EditorState): boolean {
  const { selection, expandedSelection } = state;
  return (
    selection !== null &&
    expandedSelection?.type === selection.type &&
    expandedSelection.id === selection.id
  );
}

/** A sentence for the person editing, from a validation issue of the edited graph. */
export function describeIssue(issue: ValidationIssue, graph: ArchitectureGraph): string {
  const strings = currentStrings();
  switch (issue.code) {
    case 'EDGE_SELF_LOOP':
      return strings.edit.selfLoop;
    case 'EDGE_ENDPOINT_IS_CONTAINER':
      return strings.edit.groupEndpoint;
    case 'INVALID_CONTAINMENT': {
      const node = graph.nodes.find((candidate) => candidate.id === issue.nodeIds?.[0]);
      if (node && isContainerKind(node.kind)) {
        return strings.edit.placement(node.kind, CONTAINMENT_RULES[node.kind].parents);
      }
      return strings.edit.invalid(issue.message);
    }
    default:
      return strings.edit.invalid(issue.message);
  }
}

/** The first reason the graph cannot be accepted, or null if it is valid. */
function firstProblem(graph: ArchitectureGraph): string | null {
  const parsed = ArchitectureGraphSchema.safeParse(graph);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return currentStrings().edit.invalid(issue?.message ?? '');
  }
  const error = validateGraph(graph).find((issue) => issue.severity === 'error');
  return error ? describeIssue(error, graph) : null;
}

/**
 * The editor state (ADR 0017): the diagram, its history, the selection and
 * the last rejected edit. Every edit is a pure function of the document
 * (operations.ts); the store validates its result and records it, so the
 * diagram is always valid and every change can be undone.
 */
export function createEditorStore() {
  let messages = 0;
  return createStore<EditorStore>()((set, get) => {
    const notify = (text: string) => set({ message: { id: ++messages, text } });

    /** Records `edit` as a new step of the history, unless it fails or changes nothing. */
    const apply = (edit: (document: DiagramDocument) => Edit) => {
      const { current, past, selection, group } = get();
      if (!current) return;
      const result = edit(current.document);
      if (!result.ok) {
        set({ connectingFrom: null });
        notify(result.reason);
        return;
      }
      if (result.document === current.document) return;
      const problem = firstProblem(result.document.graph);
      if (problem !== null) {
        set({ connectingFrom: null });
        notify(problem);
        return;
      }
      set({
        current: { ...current, document: result.document },
        past: [...past, current].slice(-HISTORY_LIMIT),
        future: [],
        selection: result.selection === undefined ? selection : result.selection,
        // An edit that chooses something else ends the group; one that keeps the choice keeps it.
        group:
          result.selection === undefined &&
          group.every((id) => exists(result.document, { type: 'node', id }))
            ? group
            : [],
        connectingFrom: null,
        renaming: null,
        placed: null,
      });
    };

    /** Moves to `target`, keeping the selection only if it still exists there. */
    const travel = (target: Snapshot, past: readonly Snapshot[], future: readonly Snapshot[]) => {
      const { selection } = get();
      set({
        current: target,
        past,
        future,
        selection: selection && exists(target.document, selection) ? selection : null,
        group: [],
        connectingFrom: null,
        renaming: null,
        placed: null,
      });
    };

    return {
      ...INITIAL_STATE,
      beginOpening: (opening) => set({ opening }),
      load: (document, { direction, templateId }) => {
        const { current, past } = get();
        set({
          current: { document, direction, templateId, key: (current?.key ?? 0) + 1 },
          past: current ? [...past, current].slice(-HISTORY_LIMIT) : [],
          future: [],
          selection: null,
          group: [],
          connectingFrom: null,
          renaming: null,
          placed: null,
          expandedSelection: null,
          opening: null,
        });
      },
      replaceGraph: (graph) => {
        const { current } = get();
        if (current) set({ current: { ...current, document: { ...current.document, graph } } });
      },
      addNode: (kind, centre, options = {}) => {
        const before = get().current?.document.graph.nodes.length;
        apply((document) =>
          addNode(document, kind, centre, {
            name: isShapeKind(kind) ? '' : currentStrings().kinds[kind].label,
            ...options,
          }),
        );
        const { current, selection } = get();
        if (selection?.type !== 'node' || current?.document.graph.nodes.length === before) return;
        // Text is typed where it is placed, as in Excalidraw.
        if (kind === 'text') set({ renaming: selection.id });
        if (options.exact === true) set({ placed: selection.id });
      },
      connect: (source, target) => apply((document) => connect(document, source, target)),
      moveNode: (id, position) => apply((document) => moveNode(document, id, position)),
      resizeNode: (id, box) => apply((document) => resizeNode(document, id, box)),
      updateNode: (id, patch) => apply((document) => updateNode(document, id, patch)),
      updateEdge: (id, patch) => apply((document) => updateEdge(document, id, patch)),
      setDefaultEdgeStyle: (style) => apply((document) => setDefaultEdgeStyle(document, style)),
      setEdgeStyle: (id, style) => apply((document) => setEdgeStyle(document, id, style)),
      updateDiagram: (patch) => apply((document) => updateDiagram(document, patch)),
      stackNode: (id, move) => apply((document) => stackNode(document, id, move)),
      removeSelection: () => {
        const { selection, group } = get();
        if (group.length > 1) apply((document) => removeNodes(document, group));
        else if (selection) apply((document) => remove(document, selection));
      },
      duplicateSelection: () => {
        const { selection } = get();
        const { group } = get();
        if (selection?.type === 'node' && group.length < 2) {
          apply((document) => duplicate(document, selection.id));
        }
      },
      select: (selection) =>
        set({ selection, group: [], connectingFrom: null, renaming: null, placed: null }),
      toggleSelected: (id) => {
        const { selection, group } = get();
        const chosen = group.length > 1 ? group : selection?.type === 'node' ? [selection.id] : [];
        const next = chosen.includes(id) ? chosen.filter((other) => other !== id) : [...chosen, id];
        const last = next.at(-1);
        set({
          selection: last === undefined ? null : { type: 'node', id: last },
          group: next.length > 1 ? next : [],
          connectingFrom: null,
          renaming: null,
          placed: null,
        });
      },
      moveNodes: (moves) => apply((document) => moveNodes(document, moves)),
      startRename: (id) =>
        set({ selection: { type: 'node', id }, group: [], connectingFrom: null, renaming: id }),
      stopRename: () => set({ renaming: null }),
      expandInspector: (expanded) => set({ expandedSelection: expanded ? get().selection : null }),
      startConnection: (source) => set({ connectingFrom: source, message: null }),
      cancelConnection: () => set({ connectingFrom: null }),
      undo: () => {
        const { current, past, future } = get();
        const previous = past.at(-1);
        if (current && previous) travel(previous, past.slice(0, -1), [current, ...future]);
      },
      redo: () => {
        const { current, past, future } = get();
        const next = future[0];
        if (current && next) travel(next, [...past, current], future.slice(1));
      },
      notify,
      dismissMessage: () => set({ message: null }),
    };
  });
}

/** The store of the running editor. */
export const editorStore = createEditorStore();

/** Reads the editor state; the component re-renders when the selected value changes. */
export function useEditor<T>(selector: (state: EditorStore) => T): T {
  return useStore(editorStore, selector);
}
