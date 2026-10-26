import {
  ARCHITECTURE_TEMPLATES,
  DEFAULT_NODE_SIZE,
  type DiagramDocument,
  documentToJson,
} from '@archdraft/core';
import { computeLayout } from '@archdraft/layout';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fileNameFor } from '../src/export/files.ts';
import {
  inferDirection,
  openDocumentText,
  openFileText,
  openLink,
} from '../src/editor/open-document.ts';
import { createEditorStore } from '../src/editor/store.ts';
import { readSavedDocument, SAVED_DOCUMENT_KEY, startAutosave } from '../src/persist/autosave.ts';
import {
  decodeDocument,
  encodeDocument,
  linkPayload,
  shareLink,
  ShareLinkError,
} from '../src/persist/share-link.ts';
import { en as strings } from '../src/i18n/en.ts';

/** A user calling an API placed below it, so the flow runs top to bottom. */
const document: DiagramDocument = {
  graph: {
    schemaVersion: 1,
    title: 'Saved diagram',
    provider: 'aws',
    nodes: [
      { id: 'user', kind: 'user', label: 'User' },
      { id: 'api', kind: 'service', label: 'API' },
    ],
    edges: [{ id: 'user-api', source: 'user', target: 'api', protocol: 'https' }],
  },
  layout: {
    positions: { user: { x: 0, y: 0 }, api: { x: 0, y: 200 } },
    sizes: { user: DEFAULT_NODE_SIZE, api: DEFAULT_NODE_SIZE },
  },
};

/** Raw deflate of `text`, in URL-safe base64, to build damaged or oversized links. */
async function deflated(text: string): Promise<string> {
  const body = new Response(text).body;
  if (!body) throw new Error('no body');
  const buffer = await new Response(
    body.pipeThrough(new CompressionStream('deflate-raw')),
  ).arrayBuffer();
  let binary = '';
  for (const byte of new Uint8Array(buffer)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

describe('share links', () => {
  it('carry the whole document and give it back unchanged', async () => {
    const encoded = await encodeDocument(document);
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(await decodeDocument(encoded)).toBe(documentToJson(document, { indent: 0 }));
  });

  it('round-trip a template without losing anything', async () => {
    const graph = ARCHITECTURE_TEMPLATES['event-driven-microservices'];
    const full = { graph, layout: await computeLayout(graph) };
    const link = await shareLink(full, { origin: 'https://example.org', pathname: '/archdraft/' });
    expect(link.startsWith('https://example.org/archdraft/#d=')).toBe(true);
    const payload = linkPayload(link.slice(link.indexOf('#')));
    expect(payload).not.toBeNull();
    expect(await decodeDocument(payload ?? '')).toBe(documentToJson(full, { indent: 0 }));
  });

  it('only read `#d=` fragments', () => {
    expect(linkPayload('#d=abc')).toBe('abc');
    expect(linkPayload('#other')).toBeNull();
    expect(linkPayload('')).toBeNull();
  });

  it('reject damaged links', async () => {
    const encoded = await encodeDocument(document);
    for (const bad of ['not base64!', encoded.slice(0, encoded.length / 2), 'AAAA']) {
      await expect(decodeDocument(bad)).rejects.toThrow(ShareLinkError);
    }
  });

  it('refuse links that would expand beyond the size limit', async () => {
    const bomb = await deflated(' '.repeat(3_000_000));
    expect(bomb.length).toBeLessThan(10_000);
    await expect(decodeDocument(bomb)).rejects.toMatchObject({ reason: 'too-large' });
    await expect(decodeDocument('A'.repeat(600_000))).rejects.toMatchObject({
      reason: 'too-large',
    });
  });
});

describe('opening files from other tools', () => {
  it('opens a Mermaid flowchart laid out, titled after the file', async () => {
    const store = createEditorStore();
    const text = 'flowchart LR\n  A[Start] --> B{Ok?}\n  B -->|yes| C((Done))';
    expect(await openFileText(text, 'my-flow.mmd', 'LR', store)).toBe(true);
    const { document } = store.getState().current!;
    expect(document.graph.title).toBe('my-flow');
    expect(document.graph.nodes.map((node) => node.kind)).toEqual(['box', 'diamond', 'circle']);
    expect(Object.keys(document.layout.positions)).toHaveLength(3);
  });

  it('opens a draw.io file in place, and says what it left out', async () => {
    const store = createEditorStore();
    const xml = `<mxfile><diagram name="Plan"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>
      <mxCell id="a" value="One" style="rounded=1;" vertex="1" parent="1"><mxGeometry x="10" y="20" width="100" height="40" as="geometry"/></mxCell>
      <mxCell id="b" value="Two" style="" vertex="1" parent="1"><mxGeometry x="210" y="20" width="100" height="40" as="geometry"/></mxCell>
      <mxCell id="e" edge="1" parent="1" source="a" target="b"><mxGeometry relative="1" as="geometry"/></mxCell>
      <mxCell id="loose" edge="1" parent="1" source="a"><mxGeometry relative="1" as="geometry"/></mxCell>
      </root></mxGraphModel></diagram></mxfile>`;
    expect(await openFileText(xml, 'plan.drawio', 'LR', store)).toBe(true);
    const current = store.getState().current!;
    expect(current.document.graph.title).toBe('Plan');
    expect(current.document.layout.positions.a).toEqual({ x: 10, y: 20 });
    expect(store.getState().message?.text).toMatch(/Imported\. 1 connectors/);
  });

  it('says why a file cannot be opened', async () => {
    const store = createEditorStore();
    expect(await openFileText('sequenceDiagram\n A->>B: hi', 'x.mmd', 'LR', store)).toBe(false);
    expect(store.getState().message?.text).toMatch(/could not be opened/);
  });
});

describe('opening documents', () => {
  it('opens a document with its layout and the direction of its flow', async () => {
    const store = createEditorStore();
    expect(await openDocumentText(documentToJson(document), 'file', 'LR', store)).toBe(true);
    expect(store.getState().current).toMatchObject({
      document,
      direction: 'TB',
      templateId: null,
    });
  });

  it('lays out a bare graph, and only the nodes missing from a partial layout', async () => {
    const store = createEditorStore();
    expect(await openDocumentText(JSON.stringify(document.graph), 'file', 'LR', store)).toBe(true);
    const laidOut = store.getState().current?.document.layout;
    expect(Object.keys(laidOut?.positions ?? {}).sort()).toEqual(['api', 'user']);

    const partial = JSON.stringify({
      graph: document.graph,
      layout: { positions: { user: { x: 500, y: 40 } }, sizes: { user: DEFAULT_NODE_SIZE } },
    });
    expect(await openDocumentText(partial, 'link', 'LR', store)).toBe(true);
    const layout = store.getState().current?.document.layout;
    expect(layout?.positions.user).toEqual({ x: 500, y: 40 });
    expect(layout?.positions.api).toBeDefined();
  });

  it('says why a document cannot be opened and leaves the editor as it was', async () => {
    const store = createEditorStore();
    store.getState().load(document, { direction: 'LR', templateId: null });
    const before = store.getState().current;
    expect(await openDocumentText('{"graph": {"nodes": 3}}', 'file', 'LR', store)).toBe(false);
    expect(store.getState().current).toBe(before);
    expect(store.getState().message?.text).toMatch(/^This file could not be opened\. /);
  });

  it('explains a damaged link without breaking', async () => {
    const store = createEditorStore();
    expect(await openLink('%%%', 'LR', store)).toBe(false);
    expect(store.getState().message?.text).toBe(
      strings.persist.openFailed.link(strings.persist.linkDamaged),
    );
  });

  it('opens the diagram of a link', async () => {
    const store = createEditorStore();
    expect(await openLink(await encodeDocument(document), 'LR', store)).toBe(true);
    expect(store.getState().current?.document).toEqual(document);
  });

  it('infers the direction from the connections, if any', () => {
    expect(inferDirection(document)).toBe('TB');
    const sideways = {
      ...document,
      layout: { ...document.layout, positions: { user: { x: 0, y: 0 }, api: { x: 400, y: 20 } } },
    };
    expect(inferDirection(sideways)).toBe('LR');
    expect(inferDirection({ ...document, graph: { ...document.graph, edges: [] } })).toBeNull();
  });
});

describe('autosave', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('saves the diagram shortly after a change, and what is pending when it stops', () => {
    const store = createEditorStore();
    const stop = startAutosave(store);
    store.getState().load(document, { direction: 'LR', templateId: null });
    expect(readSavedDocument()).toBeNull();
    vi.advanceTimersByTime(500);
    expect(readSavedDocument()).toBe(documentToJson(document, { indent: 0 }));

    store.getState().updateNode('api', { label: 'Orders API' });
    stop();
    expect(readSavedDocument()).toContain('Orders API');
    store.getState().updateNode('api', { label: 'Ignored' });
    vi.advanceTimersByTime(500);
    expect(readSavedDocument()).not.toContain('Ignored');
  });

  it('warns once when the browser does not let it save', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError');
    });
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const store = createEditorStore();
    const stop = startAutosave(store);
    store.getState().load(document, { direction: 'LR', templateId: null });
    vi.advanceTimersByTime(500);
    expect(store.getState().message?.text).toBe(strings.persist.saveFailed);
    const first = store.getState().message;
    store.getState().updateNode('api', { label: 'Again' });
    vi.advanceTimersByTime(500);
    expect(store.getState().message).toBe(first);
    stop();
  });

  it('uses a versioned key', () => {
    expect(SAVED_DOCUMENT_KEY).toBe('archdraft:document:v1');
  });
});

describe('file names', () => {
  it('come from the title, in lower case with dashes', () => {
    expect(fileNameFor('Three-tier web application')).toBe(
      'three-tier-web-application.archdraft.json',
    );
    expect(fileNameFor('Café: pagos & más')).toBe('cafe-pagos-mas.archdraft.json');
    expect(fileNameFor('***')).toBe('diagram.archdraft.json');
  });
});
