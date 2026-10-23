import { DOMParser, type Element } from '@xmldom/xmldom';
import { describe, expect, it } from 'vitest';
import {
  type ArchEdge,
  type ArchitectureGraph,
  type ArchNode,
  createEmptyLayout,
  DEFAULT_CONTAINER_SIZE,
  DEFAULT_NODE_SIZE,
  type DiagramLayout,
  toDrawio,
  validateGraph,
} from '../src/index.ts';
import { threeTierGraph } from './fixtures.ts';

function graphOf(nodes: ArchNode[], edges: ArchEdge[] = [], title = 'Test'): ArchitectureGraph {
  const graph: ArchitectureGraph = { schemaVersion: 1, title, provider: 'generic', nodes, edges };
  expect(validateGraph(graph).filter((issue) => issue.severity === 'error')).toEqual([]);
  return graph;
}

const node = (id: string, kind: ArchNode['kind'], extra: Partial<ArchNode> = {}): ArchNode => ({
  id,
  kind,
  label: id,
  ...extra,
});

/** A layout that places every node at (10, 20) with a 100 × 50 size. */
function uniformLayout(graph: ArchitectureGraph): DiagramLayout {
  const layout = createEmptyLayout();
  for (const { id } of graph.nodes) {
    layout.positions[id] = { x: 10, y: 20 };
    layout.sizes[id] = { width: 100, height: 50 };
  }
  return layout;
}

/** Parses strictly: any warning or error of the XML parser fails the test. */
function parse(xml: string) {
  const parser = new DOMParser({
    onError: (level, message) => {
      throw new Error(`XML ${level}: ${message}`);
    },
  });
  return parser.parseFromString(xml, 'text/xml');
}

function cells(xml: string): Map<string, Element> {
  const result = new Map<string, Element>();
  for (const cell of Array.from(parse(xml).getElementsByTagName('mxCell'))) {
    const id = cell.getAttribute('id');
    if (id === null) throw new Error('Cell without id');
    expect(result.has(id)).toBe(false);
    result.set(id, cell);
  }
  return result;
}

function cell(xml: string, id: string): Element {
  const found = cells(xml).get(id);
  if (!found) throw new Error(`Missing cell ${id}`);
  return found;
}

function geometry(element: Element): Record<string, string | null> {
  const geo = element.getElementsByTagName('mxGeometry')[0];
  if (!geo) throw new Error('Cell without geometry');
  return Object.fromEntries(
    ['x', 'y', 'width', 'height', 'relative', 'as'].map((name) => [name, geo.getAttribute(name)]),
  );
}

describe('toDrawio', () => {
  it('exports the three-tier fixture as well formed XML with the expected cells', () => {
    const graph = threeTierGraph();
    const xml = toDrawio(graph, uniformLayout(graph));
    const document = parse(xml);
    expect(document.documentElement?.tagName).toBe('mxfile');
    expect(document.getElementsByTagName('diagram')[0]?.getAttribute('name')).toBe('Online store');

    const all = cells(xml);
    expect(all.size).toBe(2 + graph.nodes.length + graph.edges.length);
    expect(all.get('0')?.getAttribute('parent')).toBeNull();
    expect(all.get('1')?.getAttribute('parent')).toBe('0');
    expect(xml).toMatchSnapshot();
  });

  it('sets the parent of each cell from parentId and keeps parents before children', () => {
    const graph = threeTierGraph();
    const xml = toDrawio(graph, uniformLayout(graph));
    const all = cells(xml);
    const order = [...all.keys()];
    for (const domainNode of graph.nodes) {
      const element = all.get(`n-${domainNode.id}`);
      const parent = domainNode.parentId === undefined ? '1' : `n-${domainNode.parentId}`;
      expect(element?.getAttribute('vertex')).toBe('1');
      expect(element?.getAttribute('parent')).toBe(parent);
      expect(order.indexOf(parent)).toBeLessThan(order.indexOf(`n-${domainNode.id}`));
    }
  });

  it('writes positions relative to the parent and sizes from the layout', () => {
    const graph = graphOf([node('vpc', 'network'), node('api', 'service', { parentId: 'vpc' })]);
    const layout: DiagramLayout = {
      positions: { vpc: { x: 0, y: 0 }, api: { x: 24, y: 48 } },
      sizes: { vpc: { width: 228, height: 136 }, api: { width: 180, height: 64 } },
    };
    const xml = toDrawio(graph, layout);
    expect(geometry(cell(xml, 'n-api'))).toEqual({
      x: '24',
      y: '48',
      width: '180',
      height: '64',
      relative: null,
      as: 'geometry',
    });
    expect(geometry(cell(xml, 'n-vpc'))).toMatchObject({ width: '228', height: '136' });
  });

  it('falls back to the origin and the default sizes when the layout lacks a node', () => {
    const graph = graphOf([node('constructor', 'service'), node('zone', 'boundary')]);
    const xml = toDrawio(graph, createEmptyLayout());
    expect(geometry(cell(xml, 'n-constructor'))).toMatchObject({
      x: '0',
      y: '0',
      width: String(DEFAULT_NODE_SIZE.width),
      height: String(DEFAULT_NODE_SIZE.height),
    });
    expect(geometry(cell(xml, 'n-zone'))).toMatchObject({
      width: String(DEFAULT_CONTAINER_SIZE.width),
      height: String(DEFAULT_CONTAINER_SIZE.height),
    });
  });

  it('styles nodes by category and marks containers', () => {
    const graph = graphOf([
      node('user', 'user'),
      node('db', 'relational-db'),
      node('svc', 'service'),
      node('ext', 'external-system'),
      node('region', 'region'),
    ]);
    const xml = toDrawio(graph, createEmptyLayout());
    const style = (id: string) => cell(xml, id).getAttribute('style') ?? '';
    expect(style('n-user')).toContain('arcSize=50;');
    expect(style('n-db')).toContain('shape=cylinder3;');
    expect(style('n-svc')).toContain('fillColor=#d5e8d4;');
    expect(style('n-ext')).toContain('dashed=1;');
    expect(style('n-region')).toContain('container=1;');
    expect(style('n-svc')).not.toContain('container=1;');
  });

  it('draws async edges dashed using the effective mode and labels them', () => {
    const graph = graphOf(
      [node('a', 'service'), node('b', 'service'), node('q', 'queue')],
      [
        { id: 'e1', source: 'a', target: 'b', label: 'Reads', protocol: 'grpc' },
        { id: 'e2', source: 'a', target: 'q', protocol: 'kafka' },
        { id: 'e3', source: 'q', target: 'b', mode: 'async' },
        { id: 'e4', source: 'b', target: 'q', protocol: 'event', mode: 'sync' },
      ],
    );
    const xml = toDrawio(graph, createEmptyLayout());
    const edge = (id: string) => cell(xml, `e-${id}`);
    expect(edge('e1').getAttribute('style')).not.toContain('dashed=1;');
    expect(edge('e2').getAttribute('style')).toContain('dashed=1;');
    expect(edge('e3').getAttribute('style')).toContain('dashed=1;');
    expect(edge('e4').getAttribute('style')).not.toContain('dashed=1;');
    expect(edge('e1').getAttribute('value')).toBe('Reads · grpc');
    expect(edge('e3').getAttribute('value')).toBe('');
    expect(edge('e1').getAttribute('edge')).toBe('1');
    expect(edge('e1').getAttribute('parent')).toBe('1');
    expect(edge('e1').getAttribute('source')).toBe('n-a');
    expect(edge('e1').getAttribute('target')).toBe('n-b');
    expect(geometry(edge('e1'))).toMatchObject({ relative: '1', as: 'geometry' });
  });

  it('adds the product as a second line only when it adds information', () => {
    const graph: ArchitectureGraph = {
      ...graphOf([]),
      provider: 'aws',
      nodes: [
        node('fn', 'function', { label: 'Resize' }),
        node('same', 'function', { label: 'AWS Lambda' }),
        node('vpc', 'network', { label: 'Main' }),
      ],
    };
    const xml = toDrawio(graph, createEmptyLayout());
    expect(cell(xml, 'n-fn').getAttribute('value')).toBe('Resize<br>AWS Lambda');
    expect(cell(xml, 'n-same').getAttribute('value')).toBe('AWS Lambda');
    expect(cell(xml, 'n-vpc').getAttribute('value')).toBe('Main');
  });

  it('keeps node and edge ids unique, including reserved and shared ids', () => {
    const graph = graphOf(
      [node('0', 'service'), node('1', 'service'), node('e1', 'service')],
      [{ id: 'e1', source: '0', target: '1' }],
    );
    const all = cells(toDrawio(graph, createEmptyLayout()));
    expect([...all.keys()]).toEqual(['0', '1', 'n-0', 'n-1', 'n-e1', 'e-e1']);
  });

  it('escapes labels for XML and for the HTML that draw.io renders', () => {
    const label = `<b>"Tom" & 'Jerry'</b>`;
    const graph = graphOf(
      [node('a', 'service', { label }), node('b', 'service', { label: 'Line one\nLine two' })],
      [{ id: 'e1', source: 'a', target: 'b', label: 'a<b>&c' }],
      `<Shop> & "Co"`,
    );
    const xml = toDrawio(graph, createEmptyLayout());
    expect(parse(xml).getElementsByTagName('diagram')[0]?.getAttribute('name')).toBe(
      `<Shop> & "Co"`,
    );
    // After XML parsing the value is HTML in which every special character is an entity.
    expect(cell(xml, 'n-a').getAttribute('value')).toBe(
      '&#60;b&#62;&#34;Tom&#34; &#38; &#39;Jerry&#39;&#60;/b&#62;',
    );
    expect(cell(xml, 'n-b').getAttribute('value')).toBe('Line one<br>Line two');
    expect(cell(xml, 'e-e1').getAttribute('value')).toBe('a&#60;b&#62;&#38;c');
  });

  it('keeps line breaks in the title and drops characters XML cannot represent', () => {
    const graph = graphOf(
      [node('a', 'service', { label: 'A\u0000B\u0008C￿\uD800D 😀' })],
      [],
      'One\r\nTwo\tThree',
    );
    const xml = toDrawio(graph, createEmptyLayout());
    expect(xml).not.toMatch(/[\0-\x08\x0B\x0C\x0E-\x1F￾￿\p{Cs}]/u);
    expect(cell(xml, 'n-a').getAttribute('value')).toBe('ABCD 😀');
    expect(parse(xml).getElementsByTagName('diagram')[0]?.getAttribute('name')).toBe(
      'One\r\nTwo\tThree',
    );
  });

  it('exports an empty graph', () => {
    expect([...cells(toDrawio(graphOf([]), createEmptyLayout())).keys()]).toEqual(['0', '1']);
  });

  it('rejects an edge to an unknown node as a programming error', () => {
    const graph: ArchitectureGraph = {
      ...graphOf([node('a', 'service')]),
      edges: [{ id: 'e1', source: 'a', target: 'ghost' }],
    };
    expect(() => toDrawio(graph, createEmptyLayout())).toThrow('Unknown node "ghost"');
  });
});
