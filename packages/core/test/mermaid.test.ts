import { describe, expect, it } from 'vitest';
import {
  type ArchEdge,
  type ArchitectureGraph,
  type ArchNode,
  MERMAID_DIRECTIONS,
  toMermaid,
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

/** Lines of the chart body, without the front matter and the header. */
function body(mermaid: string): string[] {
  return mermaid.split('\n').slice(4);
}

describe('toMermaid', () => {
  it('exports the three-tier fixture', () => {
    expect(toMermaid(threeTierGraph())).toMatchInlineSnapshot(`
      "---
      title: "Online store"
      ---
      flowchart LR
        n_customer(["Customer"])
        n_cdn["CDN<br/>Amazon CloudFront"]
        n_assets[("Static assets<br/>Amazon S3")]
        subgraph n_region ["eu-west-1"]
          subgraph n_vpc ["VPC"]
            subgraph n_public ["Public subnet"]
              n_alb["ALB<br/>Elastic Load Balancing"]
            end
            subgraph n_private ["Private subnet"]
              n_api["Store API<br/>Amazon ECS"]
              n_db[("Orders DB<br/>Amazon Aurora")]
              n_cache[("Session cache<br/>Amazon ElastiCache")]
            end
          end
        end
        n_orders_queue["Orders queue<br/>Amazon SQS"]
        n_worker["Order worker<br/>AWS Lambda"]
        n_payments["Payment provider"]
        n_customer -->|"https"| n_cdn
        n_cdn -->|"https"| n_assets
        n_cdn -->|"https"| n_alb
        n_alb -->|"http"| n_api
        n_api -->|"sql"| n_db
        n_api -->|"tcp"| n_cache
        n_api -.->|"amqp"| n_orders_queue
        n_orders_queue -.->|"event"| n_worker
        n_worker -->|"sql"| n_db
        n_worker -->|"https"| n_payments"
    `);
  });

  it('uses LR by default and accepts every direction', () => {
    expect(toMermaid(graphOf([])).split('\n')[3]).toBe('flowchart LR');
    for (const direction of MERMAID_DIRECTIONS) {
      expect(toMermaid(graphOf([]), { direction }).split('\n')[3]).toBe(`flowchart ${direction}`);
    }
  });

  it('writes the title as a quoted YAML scalar', () => {
    const mermaid = toMermaid(graphOf([], [], 'Shop: "v2"\n---'));
    expect(mermaid.split('\n').slice(0, 3)).toEqual([
      '---',
      'title: "Shop: \\"v2\\"\\n---"',
      '---',
    ]);
  });

  it('chooses the node shape from the category', () => {
    const graph = graphOf([node('user', 'user'), node('db', 'nosql-db'), node('queue', 'queue')]);
    expect(body(toMermaid(graph))).toEqual([
      '  n_user(["user"])',
      '  n_db[("db")]',
      '  n_queue["queue"]',
    ]);
  });

  it('adds the product as a second line only when it adds information', () => {
    const graph: ArchitectureGraph = {
      ...graphOf([]),
      provider: 'aws',
      nodes: [
        node('fn', 'function', { label: 'Resize' }),
        node('same', 'function', { label: 'AWS Lambda' }),
        node('generic', 'function', { label: 'Generic', provider: 'generic' }),
        node('custom', 'service', { label: 'Billing', service: 'Fargate' }),
      ],
    };
    expect(body(toMermaid(graph))).toEqual([
      '  n_fn["Resize<br/>AWS Lambda"]',
      '  n_same["AWS Lambda"]',
      '  n_generic["Generic"]',
      '  n_custom["Billing<br/>Fargate"]',
    ]);
  });

  it('nests containers as subgraphs, including empty ones', () => {
    const graph = graphOf([
      node('region', 'region'),
      node('vpc', 'network', { parentId: 'region' }),
      node('api', 'service', { parentId: 'vpc' }),
      node('team', 'boundary'),
    ]);
    expect(body(toMermaid(graph))).toEqual([
      '  subgraph n_region ["region"]',
      '    subgraph n_vpc ["vpc"]',
      '      n_api["api"]',
      '    end',
      '  end',
      '  subgraph n_team ["team"]',
      '  end',
    ]);
  });

  it('draws sync edges solid and async edges dashed, using the effective mode', () => {
    const graph = graphOf(
      [node('a', 'service'), node('b', 'service'), node('q', 'queue')],
      [
        { id: 'e1', source: 'a', target: 'b' },
        { id: 'e2', source: 'a', target: 'q', protocol: 'kafka' },
        { id: 'e3', source: 'q', target: 'b', mode: 'async' },
        { id: 'e4', source: 'b', target: 'q', protocol: 'event', mode: 'sync' },
      ],
    );
    expect(body(toMermaid(graph)).slice(3)).toEqual([
      '  n_a --> n_b',
      '  n_a -.->|"kafka"| n_q',
      '  n_q -.-> n_b',
      '  n_b -->|"event"| n_q',
    ]);
  });

  it('labels edges with the label and the protocol', () => {
    const graph = graphOf(
      [node('a', 'service'), node('b', 'service')],
      [
        { id: 'e1', source: 'a', target: 'b', label: 'Reads', protocol: 'grpc' },
        { id: 'e2', source: 'b', target: 'a', label: 'Notifies' },
      ],
    );
    expect(body(toMermaid(graph)).slice(2)).toEqual([
      '  n_a -->|"Reads · grpc"| n_b',
      '  n_b -->|"Notifies"| n_a',
    ]);
  });

  it('declares every edge after the nodes and subgraphs', () => {
    const lines = toMermaid(threeTierGraph()).split('\n');
    const lastEnd = lines.lastIndexOf('  end');
    const firstEdge = lines.findIndex((line) => line.includes('-->') || line.includes('-.->'));
    expect(firstEdge).toBeGreaterThan(lastEnd);
  });

  describe('identifiers', () => {
    it('prefixes ids so that Mermaid keywords cannot clash', () => {
      const graph = graphOf(
        ['end', 'subgraph', 'style', 'graph', 'click', 'default', 'o', 'x1', '9'].map((id) =>
          node(id, 'service'),
        ),
      );
      expect(body(toMermaid(graph)).map((line) => line.trim().split('[')[0])).toEqual([
        'n_end',
        'n_subgraph',
        'n_style',
        'n_graph',
        'n_click',
        'n_default',
        'n_o',
        'n_x1',
        'n_9',
      ]);
    });

    it('replaces hyphens, which Mermaid can read as part of an arrow', () => {
      const graph = graphOf(
        [node('a--b', 'service'), node('c-d', 'service')],
        [{ id: 'e', source: 'a--b', target: 'c-d' }],
      );
      expect(body(toMermaid(graph))).toEqual([
        '  n_a__b["a--b"]',
        '  n_c_d["c-d"]',
        '  n_a__b --> n_c_d',
      ]);
    });

    it('keeps ids unique when two domain ids map to the same text', () => {
      const graph = graphOf(
        [node('a-b', 'service'), node('a_b', 'service'), node('a_b_2', 'service')],
        [{ id: 'e', source: 'a_b', target: 'a_b_2' }],
      );
      expect(body(toMermaid(graph))).toEqual([
        '  n_a_b["a-b"]',
        '  n_a_b_2["a_b"]',
        '  n_a_b_2_2["a_b_2"]',
        '  n_a_b_2 --> n_a_b_2_2',
      ]);
    });

    it('throws a clear error on an edge to an unknown node', () => {
      const graph: ArchitectureGraph = {
        ...graphOf([node('a', 'service')]),
        edges: [{ id: 'e', source: 'a', target: 'missing' }],
      };
      expect(() => toMermaid(graph)).toThrow('Unknown node "missing"; validate the graph first');
    });
  });

  describe('escaping', () => {
    const labelOf = (label: string): string =>
      body(toMermaid(graphOf([node('a', 'service', { label })])))[0] ?? '';

    it('escapes double quotes', () => {
      expect(labelOf('Say "hi"')).toBe('  n_a["Say #34;hi#34;"]');
    });

    it('leaves brackets, braces and parentheses alone inside quotes', () => {
      expect(labelOf('a [b] {c} (d)')).toBe('  n_a["a [b] {c} (d)"]');
    });

    it('turns line breaks into <br/>', () => {
      expect(labelOf('one\ntwo\r\nthree\rfour')).toBe('  n_a["one<br/>two<br/>three<br/>four"]');
    });

    it('escapes HTML, entity, Markdown and pipe characters', () => {
      expect(labelOf('<b>x</b> & #35; `md` a|b')).toBe(
        '  n_a["#60;b#62;x#60;/b#62; #38; #35;35; #96;md#96; a#124;b"]',
      );
    });

    it('escapes container and edge labels too', () => {
      const graph = graphOf(
        [node('b', 'boundary', { label: 'Team "A"' }), node('x', 'service'), node('y', 'service')],
        [{ id: 'e', source: 'x', target: 'y', label: 'a|b "c"\nd' }],
      );
      const lines = body(toMermaid(graph));
      expect(lines[0]).toBe('  subgraph n_b ["Team #34;A#34;"]');
      expect(lines.at(-1)).toBe('  n_x -->|"a#124;b #34;c#34;<br/>d"| n_y');
    });
  });
});
