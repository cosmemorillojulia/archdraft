import {
  ARCHITECTURE_TEMPLATES,
  DEFAULT_NODE_SIZE,
  type DiagramDocument,
  NODE_CATEGORIES,
} from '@archdraft/core';
import { computeLayout } from '@archdraft/layout';
import { describe, expect, it } from 'vitest';
import {
  diagramToSvg,
  DRAWING_MARGIN,
  type DrawingOptions,
  escapeXml,
  type ExportPalette,
  mixColours,
  wrapText,
} from '../src/export/diagram-svg.ts';
import { fileNameFor } from '../src/export/files.ts';
import { iconMarkup } from '../src/export/icon-markup.tsx';
import { en } from '../src/i18n/en.ts';
import { es } from '../src/i18n/es.ts';

const palette: ExportPalette = {
  canvas: '#f3f4f6',
  surface: '#ffffff',
  ink: '#171a20',
  muted: '#5d6471',
  line: '#e2e5ea',
  edge: '#9aa3b2',
  groupLine: '#c9d0db',
  accent: '#2e5bff',
  shapeLine: '#6b7280',
  note: '#fff7d1',
  categories: Object.fromEntries(
    NODE_CATEGORIES.map((category) => [category, { fg: '#111111', bg: '#eeeeee' }]),
  ) as ExportPalette['categories'],
};

/** Every character 7 px wide: enough to test wrapping without a browser. */
const measure: DrawingOptions['measure'] = (text) => text.length * 7;

const options: DrawingOptions = {
  direction: 'LR',
  palette,
  kinds: en.kinds,
  protocols: en.protocols,
  providerBadges: en.canvas.providerBadges,
  icon: (kind) => `<path data-kind="${kind}" d="M0 0h24"/>`,
  measure,
};

/** A user calling an API in a network, which writes to a queue asynchronously, and a note. */
const document: DiagramDocument = {
  graph: {
    schemaVersion: 1,
    title: 'Orders & <payments>',
    provider: 'aws',
    nodes: [
      { id: 'user', kind: 'user', label: 'Customer' },
      { id: 'vpc', kind: 'network', label: 'VPC' },
      { id: 'api', kind: 'service', label: 'Orders API', parentId: 'vpc' },
      { id: 'queue', kind: 'queue', label: 'Jobs', provider: 'gcp' },
      { id: 'note', kind: 'note', label: 'Retries "3" times' },
    ],
    edges: [
      { id: 'user-api', source: 'user', target: 'api', protocol: 'https' },
      { id: 'api-queue', source: 'api', target: 'queue', protocol: 'amqp', label: 'Enqueue' },
    ],
  },
  layout: {
    positions: {
      user: { x: 0, y: 40 },
      vpc: { x: 260, y: 0 },
      api: { x: 24, y: 48 },
      queue: { x: 620, y: 40 },
      note: { x: 0, y: 220 },
    },
    sizes: {
      user: DEFAULT_NODE_SIZE,
      vpc: { width: 240, height: 140 },
      api: DEFAULT_NODE_SIZE,
      queue: DEFAULT_NODE_SIZE,
      note: { width: 160, height: 96 },
    },
  },
};

function parse(svg: string): Document {
  const parsed = new DOMParser().parseFromString(svg, 'image/svg+xml');
  expect(parsed.querySelector('parsererror')).toBeNull();
  return parsed;
}

describe('diagram as SVG', () => {
  it('is well-formed, sized to the diagram with a margin, and escapes every text', () => {
    const { svg, width, height } = diagramToSvg(document, options);
    const root = parse(svg).documentElement;
    // From x 0 to 800 (the queue ends at 620 + 180) and y 0 to 316 (the note ends at 220 + 96).
    expect(width).toBe(800 + DRAWING_MARGIN * 2);
    expect(height).toBe(316 + DRAWING_MARGIN * 2);
    expect(root.getAttribute('viewBox')).toBe(`-32 -32 ${width} ${height}`);
    expect(root.querySelector('title')?.textContent).toBe('Orders & <payments>');
    expect(svg).toContain('Orders &amp; &lt;payments&gt;');
    expect(svg).toContain('Retries &quot;3&quot; times');
  });

  it('draws groups first, then connections, then components and shapes, then labels', () => {
    const { svg } = diagramToSvg(document, options);
    const order = ['>VPC<', 'stroke-dasharray="5 5"', '>Orders API<', '>Retries', '>Enqueue<'].map(
      (text) => svg.indexOf(text),
    );
    expect(order.every((position) => position >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('dashes asynchronous connections, ends each in an arrowhead and labels them', () => {
    const parsed = parse(diagramToSvg(document, options).svg);
    const paths = [...parsed.querySelectorAll('path')].map((path) => path.getAttribute('d') ?? '');
    // A line and an arrowhead per connection, plus the outline and fold of the note.
    expect(paths.filter((d) => d.endsWith('Z'))).toHaveLength(3);
    expect(parsed.querySelectorAll('[stroke-dasharray="5 5"]')).toHaveLength(1);
    const texts = [...parsed.querySelectorAll('text')].map((text) => text.textContent);
    expect(texts).toEqual(expect.arrayContaining(['HTTPS', 'Enqueue']));
  });

  it('shows the product, the kind icon and a badge for another provider', () => {
    const { svg } = diagramToSvg(document, options);
    expect(svg).toContain('>Amazon ECS<');
    expect(svg).toContain('data-kind="service"');
    expect(svg).toContain('data-kind="network"');
    // The queue runs on Google Cloud in an AWS diagram.
    expect(svg).toContain(`>${en.canvas.providerBadges.gcp}<`);
  });

  it('uses the names of the language of the editor and leaves the group outline dashed for boundaries', () => {
    const generic: DiagramDocument = {
      ...document,
      graph: {
        ...document.graph,
        provider: 'generic',
        nodes: document.graph.nodes.map((node) =>
          node.id === 'vpc' ? { ...node, kind: 'boundary' } : node,
        ),
      },
    };
    const { svg } = diagramToSvg(generic, { ...options, kinds: es.kinds });
    expect(svg).toContain(`>${es.kinds.service.label}<`);
    expect(svg).toContain('stroke-dasharray="6 4"');
  });

  it('leaves out a connection label that would cover a node', () => {
    // A third component placed where the label of the queue connection falls.
    const crowded: DiagramDocument = {
      ...document,
      graph: {
        ...document.graph,
        nodes: [...document.graph.nodes, { id: 'cache', kind: 'cache', label: 'Cache' }],
      },
      layout: {
        positions: { ...document.layout.positions, cache: { x: 500, y: 60 } },
        sizes: { ...document.layout.sizes, cache: DEFAULT_NODE_SIZE },
      },
    };
    expect(diagramToSvg(document, options).svg).toContain('>Enqueue<');
    expect(diagramToSvg(crowded, options).svg).not.toContain('>Enqueue<');
  });

  it('embeds a font only when asked to', () => {
    expect(diagramToSvg(document, options).svg).not.toContain('<style>');
    const withFont = diagramToSvg(document, { ...options, fontFace: '@font-face{}' }).svg;
    expect(withFont).toContain('<style>@font-face{}</style>');
  });

  it('draws every template without errors', async () => {
    for (const graph of Object.values(ARCHITECTURE_TEMPLATES)) {
      const layout = await computeLayout(graph);
      const { svg } = diagramToSvg({ graph, layout }, options);
      parse(svg);
      // Long names wrap or end in an ellipsis, so only their first word is sure to be whole.
      for (const node of graph.nodes) {
        expect(svg).toContain(escapeXml(node.label.split(' ')[0]?.slice(0, 8) ?? ''));
      }
    }
  });
});

describe('text in the drawing', () => {
  it('wraps at spaces, splits long words and ends with an ellipsis when it must', () => {
    // 10 characters fit in 70 px.
    expect(wrapText('Session cache', 70, 2, { size: 13, weight: 600 }, measure)).toEqual([
      'Session',
      'cache',
    ]);
    expect(wrapText('Supercalifragilistic', 70, 3, { size: 13, weight: 600 }, measure)).toEqual([
      'Supercalif',
      'ragilistic',
    ]);
    const cut = wrapText('one two three four five six', 70, 2, { size: 13, weight: 600 }, measure);
    expect(cut).toHaveLength(2);
    expect(cut[1]?.endsWith('…')).toBe(true);
    expect(measure(cut[1] ?? '', { size: 13, weight: 600 })).toBeLessThanOrEqual(70);
  });

  it('escapes the five XML characters', () => {
    expect(escapeXml(`a & b < c > d "e" 'f'`)).toBe(
      'a &amp; b &lt; c &gt; d &quot;e&quot; &apos;f&apos;',
    );
  });

  it('mixes colours like color-mix', () => {
    expect(mixColours('#000000', '#ffffff', 50)).toBe('#808080');
    expect(mixColours('#2e5bff', '#f3f4f6', 0)).toBe('#f3f4f6');
    expect(mixColours('#fff', '#000', 100)).toBe('#ffffff');
  });
});

describe('icons in the drawing', () => {
  it('are the Lucide icons of the canvas, rendered once', () => {
    const markup = iconMarkup('relational-db');
    expect(markup).toMatch(/<(path|ellipse)/);
    expect(iconMarkup('relational-db')).toBe(markup);
  });
});

describe('file names', () => {
  it('end in the extension of each format', () => {
    expect(fileNameFor('Three-tier web application', 'mermaid')).toBe(
      'three-tier-web-application.mmd',
    );
    expect(fileNameFor('Three-tier web application', 'drawio')).toBe(
      'three-tier-web-application.drawio',
    );
    expect(fileNameFor('Café', 'svg')).toBe('cafe.svg');
    expect(fileNameFor('***', 'png')).toBe('diagram.png');
    expect(fileNameFor('Plan')).toBe('plan.archdraft.json');
  });
});
