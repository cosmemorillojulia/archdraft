import { deflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { importDrawio, importMermaid, toDrawio, toMermaid } from '../src/index.ts';
import { threeTierGraph } from './fixtures.ts';

const ok = (result: ReturnType<typeof importMermaid>) => {
  if (!result.success) throw new Error(result.message);
  return result;
};

describe('importMermaid', () => {
  it('reads shapes, labels, chains, groups and dashed arrows', () => {
    const { document, placed } = ok(
      importMermaid(`flowchart LR
  %% a comment
  start((Start)) --> check{Valid?}
  check -->|yes| work["Do the <br/>work"]
  check -. no .-> stop>Stopped]
  subgraph team ["The team"]
    work --> review[Review]
  end
  a & b --> review
  classDef x fill:#f00
  style work fill:#fff`),
    );
    const { nodes, edges } = document.graph;
    const kinds = Object.fromEntries(nodes.map((node) => [node.id, node.kind]));
    expect(kinds).toMatchObject({
      start: 'circle',
      check: 'diamond',
      work: 'box',
      stop: 'note',
      team: 'boundary',
    });
    expect(nodes.find((node) => node.id === 'work')).toMatchObject({
      label: 'Do the work',
      parentId: 'team',
    });
    expect(nodes.find((node) => node.id === 'review')?.parentId).toBe('team');
    expect(edges.find((edge) => edge.source === 'check' && edge.target === 'work')?.label).toBe(
      'yes',
    );
    expect(edges.find((edge) => edge.target === 'stop')).toMatchObject({
      mode: 'async',
      label: 'no',
    });
    expect(edges.filter((edge) => edge.target === 'review')).toHaveLength(3);
    expect(placed).toBe(false);
    expect(document.layout.positions).toEqual({});
  });

  it('reads what toMermaid writes', () => {
    const graph = threeTierGraph();
    const { document } = ok(importMermaid(toMermaid(graph)));
    const labels = document.graph.nodes.map((node) => node.label).sort();
    // The product shown under a name comes back as part of it.
    for (const node of graph.nodes) {
      expect(labels.some((label) => label.startsWith(node.label))).toBe(true);
    }
    expect(document.graph.edges.length).toBe(graph.edges.length);
  });

  it('takes the title from the front matter and refuses other kinds of diagram', () => {
    expect(
      ok(importMermaid('---\ntitle: My flow\n---\nflowchart TD\n A-->B')).document.graph.title,
    ).toBe('My flow');
    expect(importMermaid('sequenceDiagram\n A->>B: hi')).toMatchObject({ success: false });
    expect(importMermaid('flowchart TD')).toMatchObject({ success: false });
  });

  it('leaves out loops, repeats and arrows to a group, and says so', () => {
    const result = ok(
      importMermaid('flowchart TD\n subgraph g\n A\n end\n A --> A\n A --> B\n A --> B\n B --> g'),
    );
    expect(result.document.graph.edges).toHaveLength(1);
    expect(result.warnings.join(' ')).toMatch(/left out/);
  });
});

const PAGE = `<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>
  <mxCell id="g" value="Team" style="swimlane;" vertex="1" parent="1"><mxGeometry x="40" y="40" width="300" height="200" as="geometry"/></mxCell>
  <mxCell id="a" value="Start &lt;b&gt;here&lt;/b&gt;" style="ellipse;whiteSpace=wrap;" vertex="1" parent="g"><mxGeometry x="20" y="50" width="80" height="80" as="geometry"/></mxCell>
  <mxCell id="b" value="Decide" style="rhombus;" vertex="1" parent="g"><mxGeometry x="160" y="40" width="100" height="100" as="geometry"/></mxCell>
  <mxCell id="t" value="Free text" style="text;html=1;strokeColor=none;" vertex="1" parent="1"><mxGeometry x="400" y="60" width="120" height="30" as="geometry"/></mxCell>
  <mxCell id="e1" value="go" style="edgeStyle=orthogonalEdgeStyle;dashed=1;" edge="1" parent="1" source="a" target="b"><mxGeometry relative="1" as="geometry"/></mxCell>
  <mxCell id="e2" style="endArrow=block;" edge="1" parent="1" source="a"><mxGeometry relative="1" as="geometry"/></mxCell>
</root></mxGraphModel>`;

describe('importDrawio', () => {
  it('reads shapes, groups, positions, text and connectors', async () => {
    const result = await importDrawio(
      `<mxfile><diagram name="Flow" id="p">${PAGE}</diagram></mxfile>`,
    );
    if (!result.success) throw new Error(result.message);
    const { graph, layout } = result.document;
    expect(graph.title).toBe('Flow');
    expect(graph.nodes.map((node) => [node.id, node.kind, node.label, node.parentId])).toEqual([
      ['g', 'boundary', 'Team', undefined],
      ['a', 'circle', 'Start here', 'g'],
      ['b', 'diamond', 'Decide', 'g'],
      ['t', 'text', 'Free text', undefined],
    ]);
    expect(layout.positions.a).toEqual({ x: 20, y: 50 });
    expect(layout.sizes.t).toEqual({ width: 120, height: 30 });
    expect(graph.edges).toMatchObject([{ source: 'a', target: 'b', label: 'go', mode: 'async' }]);
    expect(result.placed).toBe(true);
    expect(result.warnings.join(' ')).toMatch(/1 connectors/);
  });

  it('reads a compressed page', async () => {
    const packed = deflateRawSync(Buffer.from(encodeURIComponent(PAGE))).toString('base64');
    const result = await importDrawio(`<mxfile><diagram name="Z">${packed}</diagram></mxfile>`);
    expect(result.success && result.document.graph.nodes).toHaveLength(4);
  });

  it('reads what toDrawio writes', async () => {
    const graph = threeTierGraph();
    const layout = {
      positions: Object.fromEntries(
        graph.nodes.map((node, i) => [node.id, { x: i * 10, y: i * 5 }]),
      ),
      sizes: Object.fromEntries(graph.nodes.map((node) => [node.id, { width: 180, height: 64 }])),
    };
    const result = await importDrawio(toDrawio(graph, layout));
    if (!result.success) throw new Error(result.message);
    expect(result.document.graph.nodes).toHaveLength(graph.nodes.length);
    expect(result.document.graph.edges.length).toBeGreaterThan(0);
  });

  it('refuses text that is not a draw.io diagram', async () => {
    expect(await importDrawio('hello')).toMatchObject({ success: false });
    expect(
      await importDrawio('<mxfile><diagram>%%%not-base64%%%</diagram></mxfile>'),
    ).toMatchObject({
      success: false,
    });
  });
});
