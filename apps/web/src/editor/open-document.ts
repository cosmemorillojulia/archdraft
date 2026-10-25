import {
  type ArchitectureGraph,
  type DiagramDocument,
  type DiagramLayout,
  importDocument,
  layoutEntry,
  type TemplateId,
} from '@archdraft/core';
import type { LayoutDirection } from '@archdraft/layout';
import { absoluteBoxes } from '../canvas/geometry.ts';
import { layoutDiagram } from '../canvas/layout-client.ts';
import { decodeDocument, linkPayload, ShareLinkError } from '../persist/share-link.ts';
import { currentStrings, localeStore, type Locale } from '../i18n/locale.ts';
import { localizedTemplate } from '../i18n/templates.ts';
import { editorStore } from './store.ts';

/** Where a diagram comes from, for the message when it cannot be opened. */
export type DocumentSource = 'file' | 'link' | 'saved';

/** Every opening takes a number; only the latest one is shown, whichever finishes first. */
let latestRequest = 0;

/**
 * Lays out a template, in the language of the interface, and opens it in the
 * editor. When templates are picked in quick succession only the last one opens.
 */
export async function openTemplate(
  id: TemplateId,
  direction: LayoutDirection,
  store = editorStore,
): Promise<void> {
  const request = ++latestRequest;
  const graph = localizedTemplate(id, localeStore.getState().locale);
  store.getState().beginOpening(id);
  try {
    const layout = await layoutDiagram(graph, direction);
    if (request === latestRequest) {
      store.getState().load({ graph, layout }, { direction, templateId: id });
    }
  } catch (error) {
    console.error('Could not lay out the template', error);
    if (request === latestRequest) {
      store.getState().beginOpening(null);
      store.getState().notify(currentStrings().canvas.layoutFailed);
    }
  }
}

/**
 * After the language changes from `previous`, a template that has not been
 * edited is shown in the new language, where it stays. Moving its nodes does
 * not count as editing it: the layout is kept.
 */
export function followLanguage(previous: Locale, store = editorStore): void {
  const current = store.getState().current;
  const templateId = current?.templateId ?? null;
  if (!current || templateId === null) return;
  if (current.document.graph !== localizedTemplate(templateId, previous)) return;
  store.getState().replaceGraph(localizedTemplate(templateId, localeStore.getState().locale));
}

/**
 * Direction of the flow of a laid out diagram: top to bottom when its
 * connections mostly run vertically, left to right otherwise. Null when no
 * connection has both ends placed.
 */
export function inferDirection(document: DiagramDocument): LayoutDirection | null {
  const boxes = absoluteBoxes(document.graph, document.layout);
  let horizontal = 0;
  let vertical = 0;
  for (const edge of document.graph.edges) {
    const source = boxes.get(edge.source);
    const target = boxes.get(edge.target);
    if (!source || !target) continue;
    horizontal += Math.abs(target.x + target.width / 2 - (source.x + source.width / 2));
    vertical += Math.abs(target.y + target.height / 2 - (source.y + source.height / 2));
  }
  if (horizontal === 0 && vertical === 0) return null;
  return vertical > horizontal ? 'TB' : 'LR';
}

function isComplete(graph: ArchitectureGraph, layout: DiagramLayout): boolean {
  return graph.nodes.every(
    (node) =>
      layoutEntry(layout.positions, node.id) !== undefined &&
      layoutEntry(layout.sizes, node.id) !== undefined,
  );
}

/**
 * Opens a diagram from text: a downloaded file, a shared link or the copy
 * saved in this browser. Everything goes through importDocument; a diagram
 * without a layout, or with nodes missing from it, is laid out with ELK,
 * keeping the positions it has. Returns whether it opened; when it does not,
 * the editor says why.
 */
export async function openDocumentText(
  text: string,
  source: DocumentSource,
  direction: LayoutDirection,
  store = editorStore,
): Promise<boolean> {
  const request = ++latestRequest;
  const result = importDocument(text);
  if (!result.success) {
    console.warn(`Could not open the ${source} diagram`, result.issues);
    store
      .getState()
      .notify(currentStrings().persist.openFailed[source](result.issues[0]?.message ?? ''));
    return false;
  }

  const { graph } = result;
  let layout = result.layout;
  let shown = layout ? (inferDirection({ graph, layout }) ?? direction) : direction;
  if (!layout || !isComplete(graph, layout)) {
    try {
      layout = await layoutDiagram(graph, shown, layout ?? undefined);
    } catch (error) {
      console.error('Could not lay out the diagram', error);
      if (request === latestRequest) store.getState().notify(currentStrings().canvas.layoutFailed);
      return false;
    }
    shown = inferDirection({ graph, layout }) ?? shown;
  }
  if (request !== latestRequest) return false;
  store.getState().load({ graph, layout }, { direction: shown, templateId: null });
  return true;
}

/** Opens the diagram of a `#d=…` link. Returns whether it opened. */
export async function openLink(
  encoded: string,
  direction: LayoutDirection,
  store = editorStore,
): Promise<boolean> {
  let text: string;
  try {
    text = await decodeDocument(encoded);
  } catch (error) {
    console.warn('Could not decode the shared link', error);
    const strings = currentStrings();
    const reason =
      error instanceof ShareLinkError && error.reason === 'too-large'
        ? strings.persist.linkTooLarge
        : strings.persist.linkDamaged;
    store.getState().notify(strings.persist.openFailed.link(reason));
    return false;
  }
  return openDocumentText(text, 'link', direction, store);
}

/** Removes the shared diagram from the address, so a reload opens the saved work instead. */
export function clearLinkFromAddress(): void {
  if (linkPayload(window.location.hash) === null) return;
  window.history.replaceState(
    window.history.state,
    '',
    `${window.location.pathname}${window.location.search}`,
  );
}
