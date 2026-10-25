import { ARCHITECTURE_TEMPLATES, type TemplateId } from '@archdraft/core';
import type { LayoutDirection } from '@archdraft/layout';
import { layoutDiagram } from '../canvas/layout-client.ts';
import { strings } from '../strings.ts';
import { editorStore } from './store.ts';

let latestRequest = 0;

/**
 * Lays out a template and opens it in the editor. When templates are picked
 * in quick succession only the last one opens, whichever layout ends first.
 */
export async function openTemplate(
  id: TemplateId,
  direction: LayoutDirection,
  store = editorStore,
): Promise<void> {
  const request = ++latestRequest;
  const graph = ARCHITECTURE_TEMPLATES[id];
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
      store.getState().notify(strings.canvas.layoutFailed);
    }
  }
}
