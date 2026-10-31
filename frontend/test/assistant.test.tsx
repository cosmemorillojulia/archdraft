import {
  applyPatch,
  type ArchitectureGraph,
  type AssistResult,
  createEmptyGraph,
  DEFAULT_NODE_SIZE,
  diffGraphs,
  type DiagramDocument,
  type GraphOperation,
  type Proposal,
} from '@archdraft/shared';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { assistantStore } from '../src/ai/assistant-store.ts';
import { apiUrl, AssistError, requestAssist } from '../src/ai/client.ts';
import {
  applyOffered,
  cancelAssistant,
  carryLayout,
  closeOffer,
  previewProposal,
  runAssistant,
} from '../src/ai/run-assistant.ts';
import { PanelSlot } from '../src/components/PanelSlot.tsx';
import { PromptDock } from '../src/components/PromptDock.tsx';
import { editorStore } from '../src/editor/store.ts';
import { en as strings } from '../src/i18n/en.ts';
import { reviewStore } from '../src/review/review-store.ts';

const API = 'https://api.test';

const GRAPH: ArchitectureGraph = {
  schemaVersion: 1,
  title: 'Shop',
  provider: 'aws',
  nodes: [
    { id: 'user', kind: 'user', label: 'Customer' },
    { id: 'api', kind: 'service', label: 'API' },
    { id: 'db', kind: 'relational-db', label: 'Orders' },
  ],
  edges: [
    { id: 'user-api', source: 'user', target: 'api', mode: 'sync' },
    { id: 'api-db', source: 'api', target: 'db', mode: 'sync' },
  ],
};

const DOCUMENT: DiagramDocument = {
  graph: GRAPH,
  layout: {
    positions: { user: { x: 0, y: 0 }, api: { x: 260, y: 0 }, db: { x: 520, y: 0 } },
    sizes: { user: DEFAULT_NODE_SIZE, api: DEFAULT_NODE_SIZE, db: DEFAULT_NODE_SIZE },
    edgeStyles: { 'api-db': 'square' },
  },
};

const ADD_CACHE: GraphOperation[] = [
  { op: 'addNode', node: { id: 'cache', kind: 'cache', label: 'Cache' } },
  { op: 'addEdge', edge: { id: 'api-cache', source: 'api', target: 'cache', mode: 'sync' } },
];
const RENAME_DB: GraphOperation[] = [
  { op: 'updateNode', id: 'db', changes: { label: 'Orders DB' } },
];

function patchProposal(title: string, operations: GraphOperation[], on = GRAPH): Proposal {
  const result = applyPatch(on, operations);
  if (!result.success) throw new Error(title);
  return {
    title,
    rationale: `Why ${title}`,
    graph: result.graph,
    changes: result.changes,
    operations,
  };
}

function graphProposal(title: string, graph: ArchitectureGraph, before = GRAPH): Proposal {
  return { title, rationale: '', graph, changes: diffGraphs(before, graph) };
}

function result(
  task: AssistResult['task'],
  proposals: Proposal[],
  warnings: AssistResult['warnings'] = [],
): AssistResult {
  return { task, proposals, attempts: 1, warnings };
}

/** The API answers each call with the next response; returns what it was sent. */
function apiAnswering(...responses: (() => Response)[]) {
  vi.stubEnv('VITE_API_URL', `${API}/`);
  const bodies: unknown[] = [];
  const fetchMock = vi.fn((_url: string, init: RequestInit) => {
    if (typeof init.body !== 'string') throw new Error('Expected a text body');
    bodies.push(JSON.parse(init.body));
    const next = responses.shift();
    return next ? Promise.resolve(next()) : Promise.reject(new TypeError('No more answers'));
  });
  vi.stubGlobal('fetch', fetchMock);
  return { bodies, fetchMock };
}

const ok = (value: AssistResult) => () => Response.json(value);
const problem =
  (type: string, status: number, headers: Record<string, string> = {}) =>
  () =>
    new Response(JSON.stringify({ type: `/problems/${type}`, status }), {
      status,
      headers: { 'Content-Type': 'application/problem+json', ...headers },
    });

function openShop() {
  editorStore.getState().load(DOCUMENT, { direction: 'LR', templateId: null });
}

const currentGraph = () => editorStore.getState().current?.document.graph;
const message = () => editorStore.getState().message?.text;

describe('requestAssist', () => {
  const request = { task: 'generate', locale: 'en', prompt: 'A shop' } as const;

  it('reads the address of the API from the build, without a trailing slash', () => {
    expect(apiUrl()).toBeUndefined();
    vi.stubEnv('VITE_API_URL', ' https://api.test// ');
    expect(apiUrl()).toBe(API);
  });

  it('posts the request and returns an answer that follows the contract', async () => {
    const answer = result('generate', [graphProposal('Shop', GRAPH, createEmptyGraph(''))]);
    const { bodies, fetchMock } = apiAnswering(ok(answer));
    expect(await requestAssist(request, new AbortController().signal)).toEqual(answer);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${API}/v1/assist`);
    expect(bodies[0]).toEqual(request);
  });

  it('turns problems into failures, with the wait of a rate limit', async () => {
    apiAnswering(
      problem('rate-limited', 429, { 'Retry-After': '120' }),
      problem('unheard-of', 500),
    );
    const signal = new AbortController().signal;
    await expect(requestAssist(request, signal)).rejects.toMatchObject({
      failure: 'rate-limited',
      retryAfter: 120,
    });
    await expect(requestAssist(request, signal)).rejects.toMatchObject({ failure: 'model-error' });
  });

  it('refuses an answer outside the contract', async () => {
    apiAnswering(() => Response.json({ task: 'generate', proposals: [] }));
    await expect(requestAssist(request, new AbortController().signal)).rejects.toMatchObject({
      failure: 'invalid-model-output',
    });
  });

  it('tells an unreachable API from a cancelled request', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    apiAnswering();
    await expect(requestAssist(request, new AbortController().signal)).rejects.toBeInstanceOf(
      AssistError,
    );
    const controller = new AbortController();
    controller.abort();
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new DOMException('Aborted', 'AbortError'))),
    );
    await expect(requestAssist(request, controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    });
    // A build without an API cannot reach one at all.
    vi.unstubAllEnvs();
    await expect(requestAssist(request, new AbortController().signal)).rejects.toMatchObject({
      failure: 'network',
    });
  });
});

describe('carryLayout', () => {
  it('keeps the place of what stays, and lets ELK place what is new or moved', () => {
    const after: ArchitectureGraph = {
      ...GRAPH,
      nodes: [
        { id: 'zone', kind: 'boundary', label: 'Zone' },
        { id: 'user', kind: 'user', label: 'Customer' },
        { id: 'api', kind: 'function', label: 'API', parentId: 'zone' },
        { id: 'db', kind: 'relational-db', label: 'Orders' },
      ],
      edges: [{ id: 'user-api', source: 'user', target: 'api', mode: 'sync' }],
    };
    const layout = carryLayout(GRAPH, after, DOCUMENT.layout);
    expect(Object.keys(layout.positions)).toEqual(['user', 'db']);
    expect(layout.edgeStyles).toBeUndefined();
  });

  it('keeps the styles of connections that are still there, and the style of the diagram', () => {
    const layout = carryLayout(GRAPH, GRAPH, { ...DOCUMENT.layout, edgeStyle: 'square' });
    expect(layout.edgeStyles).toEqual({ 'api-db': 'square' });
    expect(layout.edgeStyle).toBe('square');
  });

  it('lets a group that gains members grow around them', () => {
    const before: ArchitectureGraph = {
      ...GRAPH,
      nodes: [...GRAPH.nodes, { id: 'zone', kind: 'boundary', label: 'Zone' }],
    };
    const after: ArchitectureGraph = {
      ...before,
      nodes: [...before.nodes, { id: 'cache', kind: 'cache', label: 'Cache', parentId: 'zone' }],
    };
    const sized = {
      ...DOCUMENT.layout,
      sizes: { ...DOCUMENT.layout.sizes, zone: { width: 300, height: 200 } },
    };
    expect(carryLayout(before, after, sized).sizes).not.toHaveProperty('zone');
    expect(carryLayout(before, before, sized).sizes).toHaveProperty('zone');
  });
});

describe('runAssistant', () => {
  it('opens a generated diagram, which undo takes back', async () => {
    openShop();
    const generated: ArchitectureGraph = { ...GRAPH, title: 'New shop' };
    const { bodies } = apiAnswering(ok(result('generate', [graphProposal('New shop', generated)])));
    await runAssistant('generate', 'A new shop', 'LR');
    expect(bodies[0]).toEqual({ task: 'generate', locale: 'en', prompt: 'A new shop' });
    expect(currentGraph()?.title).toBe('New shop');
    editorStore.getState().undo();
    expect(currentGraph()).toBe(GRAPH);
  });

  it('applies an edit, keeps the layout and points out what changed', async () => {
    openShop();
    const { bodies } = apiAnswering(ok(result('edit', [patchProposal('Cache', ADD_CACHE)])));
    await runAssistant('edit', 'Add a cache', 'LR');
    expect(bodies[0]).toMatchObject({ task: 'edit', prompt: 'Add a cache', graph: GRAPH });
    expect(currentGraph()?.nodes.map((node) => node.id)).toContain('cache');
    expect(editorStore.getState().current?.document.layout.positions['db']).toEqual({
      x: 520,
      y: 0,
    });
    expect(assistantStore.getState().highlight?.nodes).toEqual(new Set(['cache']));
    expect(assistantStore.getState().working).toBeNull();
  });

  it('offers improvements in the panel, in place of the review', async () => {
    openShop();
    reviewStore.getState().setOpen(true);
    const proposals = [patchProposal('Cache', ADD_CACHE), patchProposal('Rename', RENAME_DB)];
    const { bodies } = apiAnswering(ok(result('improve', proposals, ['more-findings'])));
    await runAssistant('improve', undefined, 'LR');
    expect(bodies[0]).toEqual({ task: 'improve', locale: 'en', graph: GRAPH });
    expect(assistantStore.getState().offer?.proposals).toHaveLength(2);
    expect(reviewStore.getState().open).toBe(false);
    expect(currentGraph()).toBe(GRAPH);
    expect(message()).toBe(strings.assistant.warnings['more-findings']);
  });

  it('applies one improvement after another, each on the diagram as it is', async () => {
    openShop();
    apiAnswering(
      ok(
        result('improve', [patchProposal('Cache', ADD_CACHE), patchProposal('Rename', RENAME_DB)]),
      ),
    );
    await runAssistant('improve', undefined, 'LR');
    await applyOffered(0);
    expect(assistantStore.getState().offer?.proposals.map((proposal) => proposal.title)).toEqual([
      'Rename',
    ]);
    await applyOffered(0);
    expect(assistantStore.getState().offer).toBeNull();
    const nodes = currentGraph()?.nodes ?? [];
    expect(nodes.find((node) => node.id === 'db')?.label).toBe('Orders DB');
    expect(nodes.some((node) => node.id === 'cache')).toBe(true);
  });

  it('does not apply a new design made for a diagram that has changed since', async () => {
    openShop();
    const simpler: ArchitectureGraph = {
      ...GRAPH,
      nodes: GRAPH.nodes.slice(0, 2),
      edges: GRAPH.edges.slice(0, 1),
    };
    apiAnswering(ok(result('simplify', [graphProposal('Simpler', simpler)])));
    await runAssistant('simplify', undefined, 'LR');
    editorStore.getState().updateNode('api', { label: 'Store API' });
    await applyOffered(0);
    expect(message()).toBe(strings.assistant.stale);
    expect(currentGraph()?.nodes).toHaveLength(3);
    expect(assistantStore.getState().offer?.proposals).toHaveLength(1);
  });

  it('says why the assistant could not answer', async () => {
    openShop();
    apiAnswering(problem('rate-limited', 429, { 'Retry-After': '300' }));
    await runAssistant('extend', undefined, 'LR');
    expect(message()).toBe(strings.assistant.failed['rate-limited'](300));
    expect(message()).toContain('5 minutes');
  });

  it('stops quietly when cancelled', async () => {
    openShop();
    vi.stubEnv('VITE_API_URL', API);
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise((_, reject) => {
            init.signal?.addEventListener('abort', () =>
              reject(new DOMException('Aborted', 'AbortError')),
            );
          }),
      ),
    );
    const running = runAssistant('edit', 'Add a cache', 'LR');
    expect(assistantStore.getState().working).toBe('edit');
    cancelAssistant();
    await running;
    expect(assistantStore.getState().working).toBeNull();
    expect(message()).toBeUndefined();
    expect(currentGraph()).toBe(GRAPH);
  });

  it('does nothing without a diagram to work on', async () => {
    const { fetchMock } = apiAnswering();
    await runAssistant('improve', undefined, 'LR');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('previews what a proposal touches, and stops', () => {
    previewProposal(patchProposal('Rename', RENAME_DB));
    expect(assistantStore.getState().highlight?.nodes).toEqual(new Set(['db']));
    previewProposal(null);
    expect(assistantStore.getState().highlight).toBeNull();
  });
});

describe('PromptDock', () => {
  it('says the assistant is not available in a build without an API', () => {
    openShop();
    render(<PromptDock direction="LR" />);
    expect(screen.getByRole('textbox', { name: strings.prompt.label })).toHaveAccessibleDescription(
      strings.prompt.unavailable,
    );
    expect(screen.getByRole('button', { name: strings.prompt.generate })).toBeDisabled();
    expect(screen.queryByRole('button', { name: strings.assistant.menu })).toBeNull();
  });

  it('asks for a change of the open diagram, or for a new one', async () => {
    openShop();
    const { bodies } = apiAnswering(
      ok(result('edit', [patchProposal('Cache', ADD_CACHE)])),
      ok(result('generate', [graphProposal('Other', { ...GRAPH, title: 'Other' })])),
    );
    const user = userEvent.setup();
    render(<PromptDock direction="LR" />);

    await user.type(
      screen.getByRole('textbox', { name: strings.assistant.editLabel }),
      'Add a cache{Enter}',
    );
    await waitFor(() => expect(currentGraph()?.nodes).toHaveLength(4));
    expect(bodies[0]).toMatchObject({ task: 'edit' });

    await user.click(screen.getByRole('button', { name: strings.assistant.newDiagram }));
    await user.type(screen.getByRole('textbox', { name: strings.prompt.label }), 'Another shop');
    await user.click(screen.getByRole('button', { name: strings.prompt.generate }));
    await waitFor(() => expect(currentGraph()?.title).toBe('Other'));
    expect(bodies[1]).toMatchObject({ task: 'generate', prompt: 'Another shop' });
  });

  it('asks for improvements from the assistant menu', async () => {
    openShop();
    const { bodies } = apiAnswering(ok(result('improve', [patchProposal('Cache', ADD_CACHE)])));
    const user = userEvent.setup();
    render(<PromptDock direction="LR" />);
    await user.click(screen.getByRole('button', { name: strings.assistant.menu }));
    await user.click(
      screen.getByRole('menuitem', { name: new RegExp(strings.assistant.actions.improve) }),
    );
    await waitFor(() => expect(assistantStore.getState().offer).not.toBeNull());
    expect(bodies[0]).toMatchObject({ task: 'improve' });
  });
});

describe('AssistantPanel', () => {
  it('lists the proposals with what they change, and applies or discards them', async () => {
    openShop();
    assistantStore.setState({
      offer: {
        task: 'improve',
        proposals: [patchProposal('Add a cache', ADD_CACHE), patchProposal('Rename', RENAME_DB)],
        basedOn: GRAPH,
        warnings: [],
      },
    });
    const user = userEvent.setup();
    render(<PanelSlot placement="side" />);

    expect(
      screen.getByRole('heading', { name: strings.assistant.titles.improve }),
    ).toBeInTheDocument();
    expect(screen.getByText('Why Add a cache')).toBeInTheDocument();
    expect(
      screen.getByText(strings.assistant.changes({ added: 2, updated: 0, removed: 0 })),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: strings.assistant.discardLabel('Rename') }),
    );
    await user.click(
      screen.getByRole('button', { name: strings.assistant.applyLabel('Add a cache') }),
    );
    await waitFor(() => expect(assistantStore.getState().offer).toBeNull());
    expect(currentGraph()?.nodes.some((node) => node.id === 'cache')).toBe(true);
  });

  it('closes without changing the diagram', async () => {
    openShop();
    assistantStore.setState({
      offer: {
        task: 'extend',
        proposals: [patchProposal('More', ADD_CACHE)],
        basedOn: GRAPH,
        warnings: [],
      },
    });
    const user = userEvent.setup();
    render(<PanelSlot placement="side" />);
    await user.click(screen.getByRole('button', { name: strings.assistant.close }));
    expect(assistantStore.getState().offer).toBeNull();
    expect(currentGraph()).toBe(GRAPH);
    closeOffer();
  });
});
