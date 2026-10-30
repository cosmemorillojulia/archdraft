import {
  type DiagramDocument,
  documentToJson,
  getNodeDefinition,
  SHAPE_KINDS,
} from '@archdraft/core';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { App } from '../src/App.tsx';
import { PanelSlot } from '../src/components/PanelSlot.tsx';
import { editorStore } from '../src/editor/store.ts';
import { SAVED_DOCUMENT_KEY } from '../src/persist/autosave.ts';
import { FLOW_ANIMATION_KEY, preferencesStore } from '../src/preferences.ts';
import { en as strings } from '../src/i18n/en.ts';

/** A small flowchart drawn with generic shapes, and one component. */
const flowchart: DiagramDocument = {
  graph: {
    schemaVersion: 1,
    title: 'Approval flow',
    provider: 'generic',
    nodes: [
      { id: 'start', kind: 'circle', label: 'Start' },
      { id: 'review', kind: 'box', label: 'Review the request' },
      { id: 'approved', kind: 'diamond', label: 'Approved?' },
      { id: 'mail', kind: 'service', label: 'Mailer' },
    ],
    edges: [
      { id: 'start-review', source: 'start', target: 'review' },
      { id: 'review-approved', source: 'review', target: 'approved' },
      { id: 'approved-mail', source: 'approved', target: 'mail' },
    ],
  },
  layout: {
    positions: {
      start: { x: 0, y: 0 },
      review: { x: 200, y: 16 },
      approved: { x: 420, y: 0 },
      mail: { x: 640, y: 16 },
    },
    sizes: {
      start: { width: 96, height: 96 },
      review: { width: 160, height: 64 },
      approved: { width: 140, height: 96 },
      mail: { width: 180, height: 64 },
    },
  },
};

async function openFlowchart() {
  localStorage.setItem(SAVED_DOCUMENT_KEY, documentToJson(flowchart));
  render(<App />);
  return screen.findByRole('group', { name: strings.canvas.diagramLabel('Approval flow') });
}

describe('generic shapes', () => {
  it('come first in the palette', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: strings.components.open }));
    const palette = await screen.findByRole('dialog', { name: strings.components.title });
    const tiles = within(palette)
      .getAllByRole('button')
      .map((button) => button.getAttribute('aria-label'))
      .filter((name) => name?.startsWith('Add '));
    expect(tiles.slice(0, SHAPE_KINDS.length)).toEqual(
      SHAPE_KINDS.map((kind) => strings.components.add(getNodeDefinition(kind).label)),
    );
  });

  it('are drawn with their label and counted apart from components', async () => {
    const diagram = await openFlowchart();
    expect(within(diagram).getByText('Approved?')).toBeInTheDocument();
    expect(
      within(diagram).getByText('Approved?').closest('.react-flow__node-shape'),
    ).not.toBeNull();
    const card = screen.getByRole('region', { name: 'Approval flow' });
    expect(card).toHaveTextContent(`1${strings.card.components(1)}`);
    expect(card).toHaveTextContent(`3${strings.card.shapes(3)}`);
  });

  it('have a name and a description, but no product, provider or operations', () => {
    editorStore.getState().load(flowchart, { direction: 'LR', templateId: null });
    render(<PanelSlot placement="side" />);
    act(() => editorStore.getState().select({ type: 'node', id: 'approved' }));
    const panel = screen.getByRole('region', { name: 'Approved?' });
    expect(within(panel).getByLabelText(strings.inspector.name)).toHaveValue('Approved?');
    expect(within(panel).getByLabelText(strings.inspector.description)).toBeInTheDocument();
    expect(within(panel).queryByLabelText(strings.inspector.product)).not.toBeInTheDocument();
    expect(within(panel).queryByLabelText(strings.inspector.provider)).not.toBeInTheDocument();
    expect(within(panel).queryByText(strings.inspector.operations)).not.toBeInTheDocument();
    expect(
      within(panel).getByRole('button', { name: strings.inspector.connect }),
    ).toBeInTheDocument();
  });
});

describe('flow animation', () => {
  const particles = (diagram: HTMLElement) => diagram.querySelectorAll('.react-flow__edge circle');

  it('can be turned off and on, and the choice is remembered', async () => {
    const user = userEvent.setup();
    const diagram = await openFlowchart();
    await waitFor(() => expect(particles(diagram)).toHaveLength(flowchart.graph.edges.length));
    const view = screen.getByRole('group', { name: strings.canvas.zoom.label });
    const toggle = within(view).getByRole('button', { name: strings.canvas.flow.label });
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(toggle).toHaveAttribute('title', strings.canvas.flow.hide);

    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    expect(toggle).toHaveAttribute('title', strings.canvas.flow.show);
    expect(particles(diagram)).toHaveLength(0);
    expect(localStorage.getItem(FLOW_ANIMATION_KEY)).toBe('off');

    await user.click(toggle);
    await waitFor(() => expect(particles(diagram)).toHaveLength(flowchart.graph.edges.length));
    expect(preferencesStore.getState().flowAnimation).toBe(true);
    expect(localStorage.getItem(FLOW_ANIMATION_KEY)).toBe('on');
  });
});

describe('edge style', () => {
  const lines = (diagram: HTMLElement) =>
    [...diagram.querySelectorAll('.react-flow__edge path[fill="none"]')].map(
      (path) => path.getAttribute('d') ?? '',
    );

  it('switches every connection between curves and right angles, one undoable step each', async () => {
    const user = userEvent.setup();
    const diagram = await openFlowchart();
    const view = screen.getByRole('group', { name: strings.canvas.zoom.label });
    const layout = () => editorStore.getState().current?.document.layout;
    await waitFor(() => expect(lines(diagram).length).toBeGreaterThan(0));
    expect(lines(diagram).every((d) => d.includes('C'))).toBe(true);

    await user.click(within(view).getByRole('button', { name: strings.canvas.edgeStyle.toSquare }));
    expect(layout()?.edgeStyle).toBe('square');
    await waitFor(() => expect(lines(diagram).some((d) => d.includes('C'))).toBe(false));

    await user.click(within(view).getByRole('button', { name: strings.canvas.edgeStyle.toCurved }));
    expect(layout()).not.toHaveProperty('edgeStyle');
    await waitFor(() => expect(lines(diagram).every((d) => d.includes('C'))).toBe(true));

    act(() => editorStore.getState().undo());
    expect(layout()?.edgeStyle).toBe('square');
  });
});

describe('connections', () => {
  it('have a point to leave from and a point to arrive at on every side of every node', async () => {
    const diagram = await openFlowchart();
    await waitFor(() =>
      expect(
        diagram.querySelectorAll('.react-flow__node:not(.react-flow__node-container)'),
      ).toHaveLength(4),
    );
    for (const node of diagram.querySelectorAll('.react-flow__node')) {
      const handles = [...node.querySelectorAll('.react-flow__handle')].map(
        (handle) =>
          `${handle.classList.contains('source') ? 'source' : 'target'}:${handle.getAttribute('data-handleid')}`,
      );
      expect(handles.sort()).toEqual([
        'source:bottom',
        'source:left',
        'source:right',
        'source:top',
        'target:bottom',
        'target:left',
        'target:right',
        'target:top',
      ]);
    }
  });

  it('end in an arrowhead whose tip is the end of the edge', async () => {
    const diagram = await openFlowchart();
    await waitFor(() =>
      expect(diagram.querySelectorAll('.react-flow__edge')).toHaveLength(
        flowchart.graph.edges.length,
      ),
    );
    for (const edge of diagram.querySelectorAll('.react-flow__edge')) {
      const paths = [...edge.querySelectorAll('path')].map((path) => path.getAttribute('d') ?? '');
      const outline = paths.find((d) => d.endsWith('Z'));
      const line = paths[0] ?? '';
      expect(outline).toBeDefined();
      // The line stops at the middle of the base of the arrowhead.
      const base = outline?.match(/^M ([\d.-]+) ([\d.-]+) L [\d.-]+ [\d.-]+ L ([\d.-]+) ([\d.-]+)/);
      const end = line.trim().split(/[ ,]+/).slice(-2).map(Number);
      expect(base).not.toBeNull();
      const [, x1, y1, x2, y2] = (base ?? []).map(Number);
      expect(end[0]).toBeCloseTo(((x1 ?? 0) + (x2 ?? 0)) / 2);
      expect(end[1]).toBeCloseTo(((y1 ?? 0) + (y2 ?? 0)) / 2);
    }
  });

  it('stay drawn when a node is selected', async () => {
    const diagram = await openFlowchart();
    await waitFor(() => expect(diagram.querySelectorAll('.react-flow__edge')).toHaveLength(3));
    const before = diagram.querySelector('.react-flow__edge path');
    act(() => editorStore.getState().select({ type: 'node', id: 'review' }));
    act(() => editorStore.getState().updateNode('review', { label: 'Check the request' }));
    expect(await within(diagram).findByText('Check the request')).toBeInTheDocument();
    expect(diagram.querySelector('.react-flow__edge path')).toBe(before);
  });
});

describe('resizing', () => {
  it('offers handles on the selected node only, whatever it is', async () => {
    const diagram = await openFlowchart();
    const handlesOf = (id: string) =>
      diagram.querySelectorAll(`.react-flow__node[data-id="${id}"] .react-flow__resize-control`);
    expect(handlesOf('mail')).toHaveLength(0);
    act(() => editorStore.getState().select({ type: 'node', id: 'mail' }));
    await waitFor(() => expect(handlesOf('mail').length).toBeGreaterThan(0));
    expect(handlesOf('approved')).toHaveLength(0);
    act(() => editorStore.getState().select({ type: 'node', id: 'approved' }));
    await waitFor(() => expect(handlesOf('approved').length).toBeGreaterThan(0));
    expect(handlesOf('mail')).toHaveLength(0);
  });

  it('shows the selection as the one outline the node has on hover, with no second line', async () => {
    const diagram = await openFlowchart();
    const selectedPart = (id: string) =>
      diagram.querySelector(`.react-flow__node[data-id="${id}"] div[data-state][data-selected]`);

    act(() => editorStore.getState().select({ type: 'node', id: 'mail' }));
    await waitFor(() => expect(selectedPart('mail')).not.toBeNull());
    const card = selectedPart('mail');
    expect(card?.className).not.toMatch(/outline|ring/);
    expect(card?.getAttribute('style')).toContain('var(--cat-');

    act(() => editorStore.getState().select({ type: 'node', id: 'review' }));
    await waitFor(() => expect(selectedPart('review')).not.toBeNull());
    const body = selectedPart('review')?.querySelector('span[aria-hidden="true"]');
    expect(body?.className).not.toMatch(/shadow|outline|ring/);
  });
});
