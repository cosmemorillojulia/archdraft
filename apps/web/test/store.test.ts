import { ARCHITECTURE_TEMPLATES, type DiagramDocument, DEFAULT_NODE_SIZE } from '@archdraft/core';
import { describe, expect, it } from 'vitest';
import { createEditorStore, HISTORY_LIMIT } from '../src/editor/store.ts';
import { strings } from '../src/strings.ts';

/** A user and a service in a network. */
const document: DiagramDocument = {
  graph: {
    schemaVersion: 1,
    title: 'Test',
    provider: 'aws',
    nodes: [
      { id: 'user', kind: 'user', label: 'User' },
      { id: 'vpc', kind: 'network', label: 'VPC' },
      { id: 'api', kind: 'service', label: 'API', parentId: 'vpc' },
    ],
    edges: [{ id: 'user-api', source: 'user', target: 'api' }],
  },
  layout: {
    positions: { user: { x: 0, y: 0 }, vpc: { x: 300, y: 0 }, api: { x: 24, y: 48 } },
    sizes: { user: DEFAULT_NODE_SIZE, vpc: { width: 240, height: 140 }, api: DEFAULT_NODE_SIZE },
  },
};

function loaded() {
  const store = createEditorStore();
  store.getState().load(document, { direction: 'LR', templateId: null });
  return store;
}

const labels = (store: ReturnType<typeof createEditorStore>) =>
  store.getState().current?.document.graph.nodes.map((node) => node.label);

describe('editor store', () => {
  it('starts empty and ignores edits until a diagram is loaded', () => {
    const store = createEditorStore();
    store.getState().addNode('cache', { x: 0, y: 0 });
    expect(store.getState()).toMatchObject({ current: null, past: [], message: null });
  });

  it('loads a diagram with a fresh key, no selection and no history', () => {
    const store = loaded();
    expect(store.getState()).toMatchObject({
      current: { document, direction: 'LR', key: 1, templateId: null },
      past: [],
      future: [],
      selection: null,
    });
  });

  it('records an edit, selects what it creates and undoes and redoes it', () => {
    const store = loaded();
    store.getState().addNode('cache', { x: 100, y: 400 });
    expect(labels(store)).toContain('Cache');
    expect(store.getState().selection).toEqual({ type: 'node', id: 'cache' });
    expect(store.getState().past).toHaveLength(1);

    store.getState().undo();
    expect(labels(store)).not.toContain('Cache');
    // The selected node no longer exists, so nothing is selected.
    expect(store.getState().selection).toBeNull();
    expect(store.getState().future).toHaveLength(1);

    store.getState().redo();
    expect(labels(store)).toContain('Cache');
    expect(store.getState().future).toHaveLength(0);
  });

  it('starts a new branch of history after an undo', () => {
    const store = loaded();
    store.getState().addNode('cache', { x: 100, y: 400 });
    store.getState().undo();
    store.getState().addNode('queue', { x: 100, y: 400 });
    expect(store.getState().future).toEqual([]);
    store.getState().redo();
    expect(labels(store)).not.toContain('Cache');
  });

  it(`keeps the last ${HISTORY_LIMIT} steps`, () => {
    const store = loaded();
    for (let step = 0; step < HISTORY_LIMIT + 5; step++) {
      store.getState().updateNode('api', { label: `API ${step}` });
    }
    expect(store.getState().past).toHaveLength(HISTORY_LIMIT);
    for (let step = 0; step < HISTORY_LIMIT; step++) store.getState().undo();
    // The oldest steps are gone: undo stops at the state after the fifth edit.
    expect(labels(store)).toContain('API 4');
  });

  it('does not record edits that change nothing', () => {
    const store = loaded();
    store.getState().updateNode('api', { label: 'API' });
    store.getState().moveNode('api', { x: 24, y: 48 });
    expect(store.getState().past).toEqual([]);
  });

  it('rejects an edit that would make the graph invalid and says why', () => {
    const store = loaded();
    store.getState().connect('user', 'vpc');
    expect(store.getState().current?.document).toBe(document);
    expect(store.getState().past).toEqual([]);
    expect(store.getState().message?.text).toBe(strings.edit.groupEndpoint);
  });

  it('explains where a group can go when it is placed where it cannot', () => {
    const store = loaded();
    store.getState().addNode('subnet', { x: 0, y: 600 });
    expect(store.getState().message?.text).toBe(
      'A subnet goes inside a virtual network or an availability zone.',
    );
  });

  it('rejects values the schema does not allow', () => {
    const store = loaded();
    store.getState().updateNode('api', { label: '   ' });
    expect(labels(store)).toContain('API');
    expect(store.getState().message?.text).toMatch(/^That change would make the diagram invalid/);
  });

  it('gives every message its own id, so a repeated one shows again', () => {
    const store = loaded();
    store.getState().connect('user', 'api');
    const first = store.getState().message;
    store.getState().connect('user', 'api');
    expect(store.getState().message?.text).toBe(strings.edit.alreadyConnected);
    expect(store.getState().message?.id).not.toBe(first?.id);
    store.getState().dismissMessage();
    expect(store.getState().message).toBeNull();
  });

  it('deletes and duplicates the selection', () => {
    const store = loaded();
    store.getState().select({ type: 'node', id: 'api' });
    store.getState().duplicateSelection();
    expect(store.getState().selection).toEqual({ type: 'node', id: 'api-2' });
    store.getState().removeSelection();
    expect(labels(store)).toEqual(['User', 'VPC', 'API']);
    expect(store.getState().selection).toBeNull();
    // Nothing selected: nothing to delete.
    store.getState().removeSelection();
    expect(store.getState().past).toHaveLength(2);
  });

  it('connects from the inspector to the next component chosen', () => {
    const store = loaded();
    store.getState().addNode('relational-db', { x: 100, y: 400 });
    store.getState().startConnection('api');
    expect(store.getState().connectingFrom).toBe('api');
    store.getState().connect('api', 'relational-db');
    expect(store.getState().connectingFrom).toBeNull();
    expect(store.getState().selection).toEqual({ type: 'edge', id: 'api-relational-db' });
  });

  it('cancels a pending connection when the selection changes', () => {
    const store = loaded();
    store.getState().startConnection('api');
    store.getState().select(null);
    expect(store.getState().connectingFrom).toBeNull();
  });

  it('makes opening another diagram undoable, with a new key', () => {
    const store = loaded();
    const template = ARCHITECTURE_TEMPLATES['serverless-api'];
    store.getState().beginOpening('serverless-api');
    expect(store.getState().opening).toBe('serverless-api');
    store
      .getState()
      .load(
        { graph: template, layout: { positions: {}, sizes: {} } },
        { direction: 'TB', templateId: 'serverless-api' },
      );
    expect(store.getState().current).toMatchObject({ key: 2, templateId: 'serverless-api' });
    expect(store.getState().opening).toBeNull();
    store.getState().undo();
    expect(store.getState().current).toMatchObject({ key: 1, document });
  });
});
