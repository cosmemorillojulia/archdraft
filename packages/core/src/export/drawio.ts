import { getNodeDefinition } from '../catalog.ts';
import {
  DEFAULT_CONTAINER_SIZE,
  DEFAULT_NODE_SIZE,
  type DiagramLayout,
  layoutEntry,
} from '../document.ts';
import { indexGraph, resolveEdgeMode } from '../graph.ts';
import { isContainerKind, type NodeCategory } from '../kinds.ts';
import type { ArchEdge, ArchitectureGraph, ArchNode } from '../schema.ts';
import { edgeText, nodeSubtitle } from './labels.ts';

/**
 * Exports a graph and its layout as an uncompressed draw.io file (`mxfile`).
 *
 * Containers become draw.io containers and their children cells with
 * `parent` pointing at them, so moving a container in draw.io moves its
 * contents. Layout positions are already relative to the parent container,
 * which is also how draw.io stores child geometry.
 */

/** Cells `0` and `1` are the root and the default layer of every draw.io page. */
const LAYER_ID = '1';

const COMPONENT_STYLE = 'whiteSpace=wrap;html=1;';

const CATEGORY_STYLES: Readonly<Record<NodeCategory, string>> = {
  actor: 'rounded=1;arcSize=50;fillColor=#f5f5f5;strokeColor=#666666;',
  edge: 'rounded=1;fillColor=#dae8fc;strokeColor=#6c8ebf;',
  compute: 'rounded=1;fillColor=#d5e8d4;strokeColor=#82b366;',
  data: 'shape=cylinder3;boundedLbl=1;size=10;fillColor=#fff2cc;strokeColor=#d6b656;',
  messaging: 'rounded=1;fillColor=#ffe6cc;strokeColor=#d79b00;',
  security: 'rounded=1;fillColor=#f8cecc;strokeColor=#b85450;',
  observability: 'rounded=1;fillColor=#e1d5e7;strokeColor=#9673a6;',
  ai: 'rounded=1;fillColor=#d0cee2;strokeColor=#56517e;',
  external: 'rounded=1;dashed=1;fillColor=#f5f5f5;strokeColor=#666666;',
  // Title in the top left corner, inside the padding the layout leaves for it.
  container:
    'container=1;collapsible=0;rounded=1;arcSize=4;absoluteArcSize=1;dashed=1;' +
    'fillColor=none;strokeColor=#666666;verticalAlign=top;align=left;' +
    'spacingLeft=8;spacingTop=4;fontStyle=1;',
};

const EDGE_STYLE = 'edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;endArrow=block;endFill=1;';

/**
 * Expects a structurally valid graph, see `parseArchitectureGraph`. A node
 * without a position in `layout` is placed at the origin of its parent and a
 * node without a size gets the default size, so a stale layout still exports.
 */
export function toDrawio(graph: ArchitectureGraph, layout: DiagramLayout): string {
  const index = indexGraph(graph);
  const lines = [
    '<mxfile host="Archdraft">',
    `  <diagram id="archdraft" name="${escapeXml(graph.title)}">`,
    '    <mxGraphModel>',
    '      <root>',
    '        <mxCell id="0" />',
    `        <mxCell id="${LAYER_ID}" parent="0" />`,
  ];

  // Parents are written before their children: draw.io draws cells in
  // document order, so children stay on top of their container.
  const emit = (node: ArchNode, parent: string): void => {
    lines.push(...vertexCell(node, parent, graph, layout));
    for (const child of index.childrenOf.get(node.id) ?? []) emit(child, nodeCellId(node.id));
  };
  for (const root of index.roots) emit(root, LAYER_ID);

  for (const edge of graph.edges) {
    for (const end of [edge.source, edge.target]) {
      if (!index.nodesById.has(end)) {
        throw new Error(`Unknown node "${end}"; validate the graph first`);
      }
    }
    lines.push(...edgeCell(edge));
  }

  lines.push('      </root>', '    </mxGraphModel>', '  </diagram>', '</mxfile>');
  return lines.join('\n');
}

/**
 * Node and edge ids share one namespace in draw.io and `0` and `1` are
 * reserved, while a domain node and edge may both be called `e1` and a slug
 * may be `1`. Prefixes keep every cell id unique.
 */
function nodeCellId(id: string): string {
  return `n-${id}`;
}

function vertexCell(
  node: ArchNode,
  parent: string,
  graph: ArchitectureGraph,
  layout: DiagramLayout,
): string[] {
  const { category } = getNodeDefinition(node.kind);
  const position = layoutEntry(layout.positions, node.id) ?? { x: 0, y: 0 };
  const size =
    layoutEntry(layout.sizes, node.id) ??
    (isContainerKind(node.kind) ? DEFAULT_CONTAINER_SIZE : DEFAULT_NODE_SIZE);
  const subtitle = isContainerKind(node.kind) ? undefined : nodeSubtitle(node, graph);
  const value =
    subtitle === undefined
      ? htmlText(node.label)
      : `${htmlText(node.label)}<br>${htmlText(subtitle)}`;
  const style = COMPONENT_STYLE + CATEGORY_STYLES[category];
  return [
    `        <mxCell id="${escapeXml(nodeCellId(node.id))}" value="${escapeXml(value)}" ` +
      `style="${style}" vertex="1" parent="${escapeXml(parent)}">`,
    `          <mxGeometry x="${position.x}" y="${position.y}" ` +
      `width="${size.width}" height="${size.height}" as="geometry" />`,
    '        </mxCell>',
  ];
}

function edgeCell(edge: ArchEdge): string[] {
  const style = EDGE_STYLE + (resolveEdgeMode(edge) === 'async' ? 'dashed=1;' : '');
  // Edges live in the default layer: draw.io resolves the absolute position of
  // both ends, even when they sit in different containers.
  return [
    `        <mxCell id="${escapeXml(`e-${edge.id}`)}" value="${escapeXml(htmlText(edgeText(edge)))}" ` +
      `style="${style}" edge="1" parent="${LAYER_ID}" ` +
      `source="${escapeXml(nodeCellId(edge.source))}" target="${escapeXml(nodeCellId(edge.target))}">`,
    '          <mxGeometry relative="1" as="geometry" />',
    '        </mxCell>',
  ];
}

/**
 * Labels use `html=1` so that long names wrap inside the node. draw.io then
 * reads the value as HTML, so user text is HTML escaped first (a label can
 * never inject markup) and line breaks become `<br>`. The result is XML
 * escaped again when written as an attribute.
 */
function htmlText(text: string): string {
  return text
    .replace(/[&<>"']/g, (character) => `&#${character.charCodeAt(0)};`)
    .replace(/\r\n|\r|\n/g, '<br>');
}

/**
 * Characters XML 1.0 does not allow anywhere, not even as references: C0
 * controls other than tab, line feed and carriage return, unpaired
 * surrogates and U+FFFE, U+FFFF. A single one makes draw.io reject the file,
 * so they are dropped.
 */
// eslint-disable-next-line no-control-regex -- matching control characters is the point
const INVALID_XML_CHARACTERS = /[\0-\x08\x0B\x0C\x0E-\x1F￾￿\p{Cs}]/gu;

const XML_ENTITIES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
  // A literal tab, line feed or carriage return in an attribute is normalised
  // to a space by XML parsers; references keep the character.
  '\t': '&#9;',
  '\n': '&#10;',
  '\r': '&#13;',
};

function escapeXml(text: string): string {
  return text
    .replace(INVALID_XML_CHARACTERS, '')
    .replace(/[&<>"'\t\n\r]/g, (character) => XML_ENTITIES[character] ?? character);
}
