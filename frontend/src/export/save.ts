import { documentToJson, toDrawio, toMermaid } from '@archdraft/shared';
import type { Snapshot } from '../editor/store.ts';
import type { Strings } from '../i18n/en.ts';
import { drawingToPng, drawSnapshot } from './browser.ts';
import { type ExportFormat, fileNameFor, saveFile } from './files.ts';

/*
 * The exporters of the share panel. The panel imports this module on demand,
 * so that none of them is part of the JavaScript the editor loads at start (T22).
 */

/** The diagram as Mermaid text, in the direction it is drawn. */
export function mermaidText({ document, direction }: Snapshot): string {
  return toMermaid(document.graph, { direction });
}

/**
 * Saves the diagram in one of the formats of the editor. Images are drawn
 * from the document (export/diagram-svg.ts), not captured from the screen,
 * so they show the whole diagram at rest, without selection or particles.
 */
export async function exportAs(
  format: ExportFormat,
  snapshot: Snapshot,
  strings: Strings,
): Promise<void> {
  const { document } = snapshot;
  const name = fileNameFor(document.graph.title, format);
  switch (format) {
    case 'json':
      saveFile(documentToJson(document), name, 'application/json');
      return;
    case 'mermaid':
      saveFile(mermaidText(snapshot), name);
      return;
    case 'drawio':
      saveFile(toDrawio(document.graph, document.layout), name, 'application/xml');
      return;
    case 'svg':
      saveFile((await drawSnapshot(snapshot, strings)).svg, name, 'image/svg+xml');
      return;
    case 'png':
      saveFile(
        await drawingToPng(await drawSnapshot(snapshot, strings, { embedFont: true })),
        name,
      );
      return;
  }
}
