import {
  type ArchEdge,
  type ArchitectureGraph,
  type ArchNode,
  type CloudProvider,
  type DiagramDocument,
  type EdgeProtocol,
  getNodeDefinition,
  isContainerKind,
  isShapeKind,
  type NodeCategory,
  type NodeKind,
  resolveEdgeMode,
} from '@archdraft/core';
import type { LayoutDirection } from '@archdraft/layout';
import { getBezierPath } from '@xyflow/react';
import { FLOW_HANDLES, groupTint } from '../canvas/appearance.ts';
import { absoluteBoxes, arrowhead, type Box, boundsOf, nestingDepths } from '../canvas/geometry.ts';
import type { KindText } from '../i18n/en.ts';
import { productName } from '../i18n/labels.ts';

/** Colours of the drawing, the same tokens the canvas uses (styles.css). */
export interface ExportPalette {
  readonly canvas: string;
  readonly surface: string;
  readonly ink: string;
  readonly muted: string;
  readonly line: string;
  readonly edge: string;
  readonly groupLine: string;
  readonly accent: string;
  readonly shapeLine: string;
  readonly note: string;
  readonly categories: Readonly<Record<NodeCategory, { readonly fg: string; readonly bg: string }>>;
}

export interface TextStyle {
  readonly size: number;
  readonly weight: number;
}

export interface DrawingOptions {
  /** Flow direction of the layout: which sides edges leave from and arrive at. */
  readonly direction: LayoutDirection;
  readonly palette: ExportPalette;
  readonly kinds: Readonly<Record<NodeKind, KindText>>;
  readonly protocols: Readonly<Record<EdgeProtocol, string>>;
  readonly providerBadges: Readonly<Record<CloudProvider, string>>;
  /** Inner markup of the 24 × 24 icon of a kind, drawn with `currentColor`. */
  readonly icon: (kind: NodeKind) => string;
  /** Width of a text in pixels. */
  readonly measure: (text: string, style: TextStyle) => number;
  /** CSS with an `@font-face` to embed, so that a rasterised drawing keeps the font. */
  readonly fontFace?: string;
}

export interface Drawing {
  readonly svg: string;
  readonly width: number;
  readonly height: number;
}

/** Space around the diagram, in diagram pixels. */
export const DRAWING_MARGIN = 32;
export const FONT_FAMILY = "'Instrument Sans Variable', 'Instrument Sans', system-ui, sans-serif";

const LABEL: TextStyle = { size: 13, weight: 600 };
const PRODUCT: TextStyle = { size: 11, weight: 400 };
const SHAPE_LABEL: TextStyle = { size: 13, weight: 500 };
const GROUP_LABEL: TextStyle = { size: 12, weight: 600 };
const EDGE_LABEL: TextStyle = { size: 10.5, weight: 600 };
const BADGE: TextStyle = { size: 9.5, weight: 500 };

/** `&`, `<`, `>` and quotes as XML entities, for text and attribute values. */
export function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

const round = (value: number) => Math.round(value * 100) / 100;

/**
 * `text` in at most `maxLines` lines of at most `width` pixels, breaking at
 * spaces, and inside a word only when the word alone is too long. The last
 * line ends with an ellipsis when something is left out.
 */
export function wrapText(
  text: string,
  width: number,
  maxLines: number,
  style: TextStyle,
  measure: DrawingOptions['measure'],
): string[] {
  const fits = (candidate: string) => measure(candidate, style) <= width;
  const lines: string[] = [];
  let current = '';
  const pieces = text.trim().split(/\s+/).filter(Boolean);
  for (const word of pieces) {
    const joined = current === '' ? word : `${current} ${word}`;
    if (fits(joined)) {
      current = joined;
      continue;
    }
    if (current !== '') lines.push(current);
    // A word wider than the line is split where it stops fitting.
    let rest = word;
    while (!fits(rest) && rest.length > 1) {
      let cut = rest.length - 1;
      while (cut > 1 && !fits(rest.slice(0, cut))) cut--;
      lines.push(rest.slice(0, cut));
      rest = rest.slice(cut);
    }
    current = rest;
  }
  if (current !== '') lines.push(current);
  if (lines.length <= maxLines) return lines;

  const kept = lines.slice(0, maxLines);
  let last = `${kept[maxLines - 1] ?? ''} ${lines.slice(maxLines).join(' ')}`;
  while (last.length > 1 && !fits(`${last}…`)) last = last.slice(0, -1).trimEnd();
  kept[maxLines - 1] = `${last}…`;
  return kept;
}

/** One line of at most `width` pixels, with an ellipsis if it had to be cut. */
function truncate(
  text: string,
  width: number,
  style: TextStyle,
  measure: DrawingOptions['measure'],
) {
  return wrapText(text, width, 1, style, measure)[0] ?? '';
}

/** `#rrggbb` mixed with another one, `amount` (0 to 100) of the first. */
export function mixColours(first: string, second: string, amount: number): string {
  const parse = (hex: string) => {
    const value = hex.trim().replace('#', '');
    const full = value.length === 3 ? [...value].map((digit) => digit + digit).join('') : value;
    return [0, 2, 4].map((index) => Number.parseInt(full.slice(index, index + 2), 16));
  };
  const a = parse(first);
  const b = parse(second);
  const mixed = a.map((channel, index) =>
    Math.round((channel * amount + (b[index] ?? 0) * (100 - amount)) / 100),
  );
  return `#${mixed.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

function textLines(
  lines: readonly string[],
  x: number,
  top: number,
  lineHeight: number,
  style: TextStyle,
  fill: string,
  anchor: 'start' | 'middle' = 'start',
): string {
  // The baseline sits about four fifths of the font size below the top of the line box.
  return lines
    .map((line, index) => {
      const baseline = top + index * lineHeight + (lineHeight - style.size) / 2 + style.size * 0.8;
      return `<text x="${round(x)}" y="${round(baseline)}" font-size="${style.size}" font-weight="${style.weight}" fill="${fill}"${
        anchor === 'middle' ? ' text-anchor="middle"' : ''
      }>${escapeXml(line)}</text>`;
    })
    .join('');
}

function icon(markup: string, x: number, y: number, size: number, colour: string, stroke = 1.75) {
  return `<svg x="${round(x)}" y="${round(y)}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${colour}" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round">${markup}</svg>`;
}

function group(node: ArchNode, box: Box, depth: number, options: DrawingOptions): string {
  const { palette, measure } = options;
  const fill = mixColours(palette.accent, palette.canvas, groupTint(depth));
  const dashed = node.kind === 'boundary' ? ' stroke-dasharray="6 4"' : '';
  const label = truncate(node.label, box.width - 34 - 14, GROUP_LABEL, measure);
  return [
    `<g transform="translate(${round(box.x)} ${round(box.y)})">`,
    `<rect width="${box.width}" height="${box.height}" rx="14" fill="${fill}" stroke="${palette.groupLine}"${dashed}/>`,
    icon(options.icon(node.kind), 14, 12.5, 14, palette.muted),
    textLines([label], 34, 12, 15, GROUP_LABEL, palette.muted),
    '</g>',
  ].join('');
}

function component(
  node: ArchNode,
  box: Box,
  graph: ArchitectureGraph,
  options: DrawingOptions,
): string {
  const { palette, measure } = options;
  const category = getNodeDefinition(node.kind).category;
  const colours = palette.categories[category];
  const textX = 12 + 36 + 10;
  const textWidth = Math.max(box.width - textX - 12, 20);
  const label = wrapText(node.label, textWidth, 2, LABEL, measure);
  const product = truncate(productName(node, graph, options.kinds), textWidth, PRODUCT, measure);
  const labelHeight = LABEL.size * 1.25;
  const productHeight = PRODUCT.size * 1.25;
  const top = (box.height - label.length * labelHeight - productHeight) / 2;
  const parts = [
    `<g transform="translate(${round(box.x)} ${round(box.y)})">`,
    `<rect width="${box.width}" height="${box.height}" rx="12" fill="${palette.surface}" stroke="${palette.line}"/>`,
    `<rect x="12" y="${round((box.height - 36) / 2)}" width="36" height="36" rx="10" fill="${colours.bg}"/>`,
    icon(options.icon(node.kind), 21, (box.height - 18) / 2, 18, colours.fg),
    textLines(label, textX, top, labelHeight, LABEL, palette.ink),
    textLines(
      [product],
      textX,
      top + label.length * labelHeight,
      productHeight,
      PRODUCT,
      palette.muted,
    ),
  ];
  // A badge like the canvas one when the component runs outside the provider of the diagram.
  if (node.provider !== undefined && node.provider !== graph.provider) {
    const text = options.providerBadges[node.provider];
    const width = measure(text, BADGE) + 12;
    const x = box.width - 8 - width;
    parts.push(
      `<rect x="${round(x)}" y="-8" width="${round(width)}" height="16" rx="8" fill="${palette.surface}" stroke="${palette.line}"/>`,
      textLines([text], x + 6, -8, 16, BADGE, palette.muted),
    );
  }
  parts.push('</g>');
  return parts.join('');
}

function shape(node: ArchNode, box: Box, options: DrawingOptions): string {
  const { palette, measure } = options;
  const { width: w, height: h } = box;
  const fill = node.kind === 'note' ? palette.note : palette.surface;
  const paint = `fill="${fill}" stroke="${palette.shapeLine}" stroke-width="1.5" stroke-linejoin="round"`;
  const outline =
    node.kind === 'circle'
      ? `<ellipse cx="${w / 2}" cy="${h / 2}" rx="${w / 2}" ry="${h / 2}" ${paint}/>`
      : node.kind === 'diamond'
        ? `<path d="M${w / 2} 0L${w} ${h / 2}L${w / 2} ${h}L0 ${h / 2}Z" ${paint}/>`
        : node.kind === 'note'
          ? `<path d="M0 0H${round(w * 0.85)}L${w} ${round(h * 0.15)}V${h}H0Z" ${paint}/><path d="M${round(w * 0.85)} 0V${round(h * 0.15)}H${w}" fill="none" stroke="${palette.shapeLine}" stroke-width="1.5" stroke-linejoin="round"/>`
          : `<rect width="${w}" height="${h}" rx="8" ${paint}/>`;
  const share = node.kind === 'diamond' ? 0.62 : node.kind === 'circle' ? 0.74 : 0.88;
  const lineHeight = SHAPE_LABEL.size * 1.375;
  const lines = wrapText(node.label, w * share, 3, SHAPE_LABEL, measure);
  const top = (h - lines.length * lineHeight) / 2;
  return [
    `<g transform="translate(${round(box.x)} ${round(box.y)})">`,
    outline,
    textLines(lines, w / 2, top, lineHeight, SHAPE_LABEL, palette.ink, 'middle'),
    '</g>',
  ].join('');
}

/** Point where an edge leaves or reaches a node on this side: the middle of that side. */
function sidePoint(box: Box, side: string): { x: number; y: number } {
  switch (side) {
    case 'left':
      return { x: box.x, y: box.y + box.height / 2 };
    case 'right':
      return { x: box.x + box.width, y: box.y + box.height / 2 };
    case 'top':
      return { x: box.x + box.width / 2, y: box.y };
    default:
      return { x: box.x + box.width / 2, y: box.y + box.height };
  }
}

const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

function connection(
  edge: ArchEdge,
  source: Box,
  target: Box,
  obstacles: readonly Box[],
  options: DrawingOptions,
): { line: string; label: string } {
  const { palette, measure, direction } = options;
  const handles = FLOW_HANDLES[direction];
  const from = sidePoint(source, handles.source);
  const to = sidePoint(target, handles.target);
  const arrow = arrowhead(to.x, to.y, handles.target);
  const [path, labelX, labelY] = getBezierPath({
    sourceX: from.x,
    sourceY: from.y,
    targetX: arrow.base.x,
    targetY: arrow.base.y,
    sourcePosition: handles.source,
    targetPosition: handles.target,
  });
  const dashed = resolveEdgeMode(edge) === 'async' ? ' stroke-dasharray="5 5"' : '';
  const line =
    `<path d="${path}" fill="none" stroke="${palette.edge}" stroke-width="1.5"${dashed}/>` +
    `<path d="${arrow.outline}" fill="${palette.edge}" stroke="${palette.edge}" stroke-width="1.5" stroke-linejoin="round"/>`;
  const text =
    edge.label ?? (edge.protocol === undefined ? undefined : options.protocols[edge.protocol]);
  if (text === undefined) return { line, label: '' };
  const shown = truncate(text, 160, EDGE_LABEL, measure);
  const width = measure(shown, EDGE_LABEL) + 14;
  // A curve can pass behind a node, and its label would cover the node's name: it is left out.
  const box = { x: labelX - width / 2, y: labelY - 9, width, height: 18 };
  if (obstacles.some((obstacle) => overlaps(box, obstacle))) return { line, label: '' };
  const label =
    `<rect x="${round(labelX - width / 2)}" y="${round(labelY - 9)}" width="${round(width)}" height="18" rx="9" fill="${palette.surface}" stroke="${palette.line}"/>` +
    textLines([shown], labelX, labelY - 9, 18, EDGE_LABEL, palette.muted, 'middle');
  return { line, label };
}

/**
 * The diagram as a standalone SVG, drawn like the canvas at rest: groups,
 * then connections with their arrowheads, then components and shapes, then
 * the labels of the connections, except those that would cover a node. Pure: colours, names, icons and text widths come in the options,
 * so the drawing follows the theme and language of the editor and can be
 * tested without a browser.
 */
export function diagramToSvg(document: DiagramDocument, options: DrawingOptions): Drawing {
  const { graph, layout } = document;
  const boxes = absoluteBoxes(graph, layout);
  const bounds = boundsOf(boxes.values()) ?? { x: 0, y: 0, width: 0, height: 0 };
  const x = bounds.x - DRAWING_MARGIN;
  const y = bounds.y - DRAWING_MARGIN;
  const width = Math.ceil(bounds.width + DRAWING_MARGIN * 2);
  const height = Math.ceil(bounds.height + DRAWING_MARGIN * 2);
  const depths = nestingDepths(graph);

  const groups = graph.nodes
    .filter((node) => isContainerKind(node.kind) && boxes.has(node.id))
    .sort((a, b) => (depths.get(a.id) ?? 0) - (depths.get(b.id) ?? 0))
    .map((node) => group(node, boxes.get(node.id) as Box, depths.get(node.id) ?? 0, options));
  const obstacles = graph.nodes.flatMap((node) => {
    const box = boxes.get(node.id);
    return box && !isContainerKind(node.kind) ? [box] : [];
  });
  const connections = graph.edges.flatMap((edge) => {
    const source = boxes.get(edge.source);
    const target = boxes.get(edge.target);
    return source && target ? [connection(edge, source, target, obstacles, options)] : [];
  });
  const nodes = graph.nodes
    .filter((node) => !isContainerKind(node.kind) && boxes.has(node.id))
    .map((node) => {
      const box = boxes.get(node.id) as Box;
      return isShapeKind(node.kind)
        ? shape(node, box, options)
        : component(node, box, graph, options);
    });

  const style = options.fontFace === undefined ? '' : `<style>${options.fontFace}</style>`;
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${round(x)} ${round(y)} ${width} ${height}" font-family="${escapeXml(FONT_FAMILY)}">`,
    `<title>${escapeXml(graph.title)}</title>`,
    style,
    `<rect x="${round(x)}" y="${round(y)}" width="${width}" height="${height}" fill="${options.palette.canvas}"/>`,
    ...groups,
    ...connections.map(({ line }) => line),
    ...nodes,
    ...connections.map(({ label }) => label),
    '</svg>',
  ].join('\n');
  return { svg, width, height };
}
