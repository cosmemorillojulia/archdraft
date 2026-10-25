import {
  ARCHITECTURE_TEMPLATES,
  type DiagramDocument,
  DEFAULT_NODE_SIZE,
  lintGraph,
} from '@archdraft/core';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from '../src/App.tsx';
import { DiagramCard } from '../src/components/DiagramCard.tsx';
import { PanelSlot } from '../src/components/PanelSlot.tsx';
import { editorStore } from '../src/editor/store.ts';
import { findingKey, findingsOf, severityByNode, worstSeverity } from '../src/review/findings.ts';
import {
  createReviewStore,
  DISABLED_RULES_KEY,
  loadDisabledRules,
  reviewStore,
} from '../src/review/review-store.ts';
import { strings } from '../src/strings.ts';

/*
 * A user calls a database directly (public-database, error), the database
 * runs in one zone (database-single-az, warning) and a queue is connected to
 * nothing (orphan-component, note).
 */
const document: DiagramDocument = {
  graph: {
    schemaVersion: 1,
    title: 'Review',
    provider: 'aws',
    nodes: [
      { id: 'user', kind: 'user', label: 'User' },
      {
        id: 'db',
        kind: 'relational-db',
        label: 'Orders DB',
        attributes: { multiAz: false, encryptedAtRest: true },
      },
      { id: 'queue', kind: 'queue', label: 'Jobs' },
    ],
    edges: [{ id: 'user-db', source: 'user', target: 'db', protocol: 'sql' }],
  },
  layout: {
    positions: { user: { x: 0, y: 0 }, db: { x: 300, y: 0 }, queue: { x: 300, y: 200 } },
    sizes: { user: DEFAULT_NODE_SIZE, db: DEFAULT_NODE_SIZE, queue: DEFAULT_NODE_SIZE },
  },
};

const graph = document.graph;

describe('review findings', () => {
  it('runs the rules once per version of the document and set of turned off rules', () => {
    const disabled = [] as const;
    const first = findingsOf(graph, disabled);
    expect(first).toEqual(lintGraph(graph));
    expect(findingsOf(graph, disabled)).toBe(first);
    expect(findingsOf({ ...graph }, disabled)).not.toBe(first);
    expect(findingsOf(graph, ['orphan-component'])).not.toContainEqual(
      expect.objectContaining({ ruleId: 'orphan-component' }),
    );
  });

  it('summarises severities overall and per component', () => {
    const findings = lintGraph(graph);
    expect(worstSeverity(findings)).toBe('error');
    expect(worstSeverity([])).toBeNull();
    expect(severityByNode(findings)).toEqual(
      new Map([
        ['db', 'error'],
        ['user', 'error'],
        ['queue', 'info'],
      ]),
    );
  });

  it('keys a finding by its rule and what it points at', () => {
    const [finding] = lintGraph(graph);
    expect(finding && findingKey(finding)).toBe('public-database|db,user|user-db');
  });
});

describe('review store', () => {
  it('keeps turned off rules in this browser, in rule order', () => {
    const store = createReviewStore();
    store.getState().disableRule('orphan-component');
    store.getState().disableRule('public-database');
    store.getState().disableRule('public-database');
    expect(store.getState().disabledRules).toEqual(['public-database', 'orphan-component']);
    expect(JSON.parse(localStorage.getItem(DISABLED_RULES_KEY) ?? '')).toEqual([
      'public-database',
      'orphan-component',
    ]);
    expect(loadDisabledRules()).toEqual(['public-database', 'orphan-component']);
    store.getState().enableRule('public-database');
    expect(loadDisabledRules()).toEqual(['orphan-component']);
  });

  it('ignores unknown or malformed saved rules', () => {
    localStorage.setItem(DISABLED_RULES_KEY, JSON.stringify(['sync-cycle', 'made-up', 3]));
    expect(loadDisabledRules()).toEqual(['sync-cycle']);
    localStorage.setItem(DISABLED_RULES_KEY, '{not json');
    expect(loadDisabledRules()).toEqual([]);
  });

  it('forgets the chosen finding when it closes, and counts every choice', () => {
    const store = createReviewStore();
    store.getState().setOpen(true);
    store.getState().focusFinding('a');
    store.getState().focusFinding('a');
    expect(store.getState()).toMatchObject({ activeKey: 'a', focusCount: 2 });
    store.getState().setOpen(false);
    expect(store.getState().activeKey).toBeNull();
  });
});

describe('review panel', () => {
  beforeEach(() => {
    editorStore.getState().load(document, { direction: 'LR', templateId: null });
  });

  function renderPanel() {
    const user = userEvent.setup();
    render(
      <>
        <DiagramCard graph={graph} />
        <PanelSlot placement="side" />
      </>,
    );
    return user;
  }

  const panel = () => screen.getByRole('region', { name: strings.review.title });

  it('opens from the review status of the diagram card', async () => {
    const user = renderPanel();
    const status = screen.getByRole('button', { name: strings.review.issues(3) });
    expect(status).toHaveAttribute('aria-expanded', 'false');
    await user.click(status);
    expect(status).toHaveAttribute('aria-expanded', 'true');
    expect(panel()).toHaveTextContent(strings.review.summary(3));
    await user.click(status);
    await waitFor(() =>
      expect(screen.queryByRole('region', { name: strings.review.title })).not.toBeInTheDocument(),
    );
  });

  it('groups findings by severity, most severe first', async () => {
    const user = renderPanel();
    await user.click(screen.getByRole('button', { name: strings.review.issues(3) }));
    const headings = within(panel())
      .getAllByRole('heading', { level: 3 })
      .map((heading) => heading.textContent);
    expect(headings).toEqual(['Errors1', 'Warnings1', 'Notes1']);
    expect(within(panel()).getByText(/is called directly by clients/)).toBeInTheDocument();
  });

  it('filters findings by severity', async () => {
    const user = renderPanel();
    await user.click(screen.getByRole('button', { name: strings.review.issues(3) }));
    const filters = within(panel()).getByRole('group', { name: strings.review.filters });
    const errors = within(filters).getByRole('button', { name: /Errors/ });
    await user.click(errors);
    expect(errors).toHaveAttribute('aria-pressed', 'false');
    expect(within(panel()).queryByText(/is called directly by clients/)).not.toBeInTheDocument();
    await user.click(within(filters).getByRole('button', { name: /Warnings/ }));
    await user.click(within(filters).getByRole('button', { name: /Notes/ }));
    expect(within(panel()).getByText(strings.review.filteredOut)).toBeInTheDocument();
  });

  it('selects and focuses the component of a chosen finding', async () => {
    const user = renderPanel();
    await user.click(screen.getByRole('button', { name: strings.review.issues(3) }));
    const finding = within(panel()).getByRole('button', {
      name: /runs in a single availability zone/,
    });
    await user.click(finding);
    expect(finding).toHaveAttribute('aria-current', 'true');
    expect(editorStore.getState().selection).toEqual({ type: 'node', id: 'db' });
    expect(reviewStore.getState().activeKey).toBe('database-single-az|db|');
    // The review stays open: the selection shows on the canvas, not in the inspector.
    expect(panel()).toBeInTheDocument();
  });

  it('hands over to the inspector to edit a component', async () => {
    const user = renderPanel();
    await user.click(screen.getByRole('button', { name: strings.review.issues(3) }));
    await user.click(
      within(panel()).getByRole('button', { name: strings.review.editLabel('Jobs') }),
    );
    expect(await screen.findByRole('region', { name: 'Jobs' })).toBeInTheDocument();
    expect(reviewStore.getState().open).toBe(false);
  });

  it('explains the rule behind a finding', async () => {
    const user = renderPanel();
    await user.click(screen.getByRole('button', { name: strings.review.issues(3) }));
    const why = within(panel()).getAllByRole('button', { name: strings.review.why })[0];
    if (!why) throw new Error('No explanation button');
    await user.click(why);
    expect(why).toHaveAttribute('aria-expanded', 'true');
    expect(within(panel()).getByText('Data store exposed to clients')).toBeInTheDocument();
  });

  it('turns rules off and on again, and the status follows', async () => {
    const user = renderPanel();
    await user.click(screen.getByRole('button', { name: strings.review.issues(3) }));
    await user.click(
      within(panel()).getByRole('button', {
        name: strings.review.turnOffLabel('Unconnected component'),
      }),
    );
    expect(within(panel()).queryByText(/has no connections/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: strings.review.issues(2) })).toBeInTheDocument();
    expect(loadDisabledRules()).toEqual(['orphan-component']);

    await user.click(within(panel()).getByText(strings.review.disabled(1)));
    await user.click(
      within(panel()).getByRole('button', {
        name: strings.review.turnOnLabel('Unconnected component'),
      }),
    );
    expect(within(panel()).getByText(/has no connections/)).toBeInTheDocument();
    expect(loadDisabledRules()).toEqual([]);
  });

  it('says when the design follows every rule', async () => {
    const user = renderPanel();
    act(() =>
      editorStore
        .getState()
        .load(
          { graph: ARCHITECTURE_TEMPLATES['serverless-api'], layout: { positions: {}, sizes: {} } },
          { direction: 'LR', templateId: 'serverless-api' },
        ),
    );
    await user.click(screen.getByRole('button', { name: strings.review.clean }));
    expect(within(panel()).getByText(strings.review.empty)).toBeInTheDocument();
  });
});

describe('review on the canvas', () => {
  it('marks the components with findings while the review is open, and closes with Escape', async () => {
    const user = userEvent.setup();
    render(<App />);
    const canvas = await screen.findByRole('group', {
      name: strings.canvas.diagramLabel(ARCHITECTURE_TEMPLATES['three-tier-web'].title),
    });
    act(() => editorStore.getState().updateNode('database', { attributes: { multiAz: false } }));
    const status = await screen.findByRole('button', { name: strings.review.issues(1) });
    const database = within(canvas).getByText('Database').closest('.react-flow__node');
    expect(database?.querySelector('[title="Warning"]')).toBeNull();

    await user.click(status);
    expect(database?.querySelector('[title="Warning"]')).not.toBeNull();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(status).toHaveAttribute('aria-expanded', 'false'));
    expect(database?.querySelector('[title="Warning"]')).toBeNull();
  });
});
