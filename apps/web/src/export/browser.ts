import { NODE_CATEGORIES } from '@archdraft/core';
import fontUrl from '@fontsource-variable/instrument-sans/files/instrument-sans-latin-wdth-normal.woff2?url';
import type { Snapshot } from '../editor/store.ts';
import type { Strings } from '../i18n/en.ts';
import {
  diagramToSvg,
  type Drawing,
  type ExportPalette,
  FONT_FAMILY,
  type TextStyle,
} from './diagram-svg.ts';
import { iconMarkup } from './icon-markup.tsx';

/** Largest side of an exported PNG, in pixels: browsers refuse larger canvases. */
export const MAX_PNG_SIDE = 8192;
/** Pixels per diagram pixel in a PNG, so it stays sharp on high-density screens. */
export const PNG_SCALE = 2;

/** The colours of the theme in use, read from the tokens of the page. */
export function readPalette(element: Element = globalThis.document.documentElement): ExportPalette {
  const style = getComputedStyle(element);
  const token = (name: string) => style.getPropertyValue(`--${name}`).trim();
  return {
    canvas: token('canvas'),
    surface: token('surface'),
    ink: token('ink'),
    muted: token('muted'),
    line: token('line'),
    edge: token('edge'),
    groupLine: token('group-line'),
    accent: token('accent'),
    shapeLine: token('shape-line'),
    note: token('note'),
    categories: Object.fromEntries(
      NODE_CATEGORIES.map((category) => [
        category,
        { fg: token(`cat-${category}`), bg: token(`cat-${category}-bg`) },
      ]),
    ) as ExportPalette['categories'],
  };
}

let context: OffscreenCanvasRenderingContext2D | null | undefined;

/**
 * Width of a text in the font of the editor. Without a canvas (tests), an
 * estimate from the number of characters.
 */
export function measureText(text: string, { size, weight }: TextStyle): number {
  if (context === undefined) {
    context =
      typeof OffscreenCanvas === 'undefined' ? null : new OffscreenCanvas(1, 1).getContext('2d');
  }
  if (!context) return text.length * size * 0.56;
  context.font = `${weight} ${size}px ${FONT_FAMILY}`;
  return context.measureText(text).width;
}

let fontFace: Promise<string> | undefined;

/** The editor's font as an `@font-face` with the file inside, for drawings turned into images. */
export function embeddedFontFace(): Promise<string> {
  fontFace ??= fetch(fontUrl)
    .then((response) => {
      if (!response.ok) throw new Error(`The font answered ${response.status}`);
      return response.arrayBuffer();
    })
    .then((buffer) => {
      let binary = '';
      for (const byte of new Uint8Array(buffer)) binary += String.fromCharCode(byte);
      return `@font-face{font-family:'Instrument Sans Variable';src:url(data:font/woff2;base64,${btoa(binary)}) format('woff2');font-weight:400 700;font-stretch:75% 100%}`;
    })
    .catch((error: unknown) => {
      // The next export tries again.
      fontFace = undefined;
      throw error;
    });
  return fontFace;
}

/** The open diagram drawn as SVG, in the theme and language of the editor. */
export async function drawSnapshot(
  snapshot: Snapshot,
  strings: Strings,
  { embedFont = false }: { embedFont?: boolean } = {},
): Promise<Drawing> {
  // Text widths must be measured with the editor's font, not a fallback.
  await globalThis.document.fonts?.load(`600 13px ${FONT_FAMILY}`).catch(() => undefined);
  const fontFace = embedFont ? await embeddedFontFace() : undefined;
  return diagramToSvg(snapshot.document, {
    direction: snapshot.direction,
    palette: readPalette(),
    kinds: strings.kinds,
    protocols: strings.protocols,
    providerBadges: strings.canvas.providerBadges,
    icon: iconMarkup,
    measure: measureText,
    ...(fontFace === undefined ? {} : { fontFace }),
  });
}

/** A drawing as a PNG, twice its size unless that would be too large for the browser. */
export async function drawingToPng({ svg, width, height }: Drawing): Promise<Blob> {
  const scale = Math.min(PNG_SCALE, MAX_PNG_SIDE / width, MAX_PNG_SIDE / height);
  const image = new Image();
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await image.decode();
  const canvas = globalThis.document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const target = canvas.getContext('2d');
  if (!target) throw new Error('No 2D canvas');
  target.drawImage(image, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('The canvas gave no PNG'))),
      'image/png',
    );
  });
}
