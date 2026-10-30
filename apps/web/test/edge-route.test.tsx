import { type DiagramDocument, documentToJson } from '@archdraft/core';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { App } from '../src/App.tsx';
import { editorStore } from '../src/editor/store.ts';
import { SAVED_DOCUMENT_KEY } from '../src/persist/autosave.ts';
import { en as strings } from '../src/i18n/en.ts';

/** Two components side by side with a connection from the first to the second. */
const pair: DiagramDocument = {
  graph: {
    schemaVersion: 1,
    title: 'Pair',
    provider: 'generic',
    nodes: [
      { id: 'web', kind: 'service', label: 'Web' },
      { id: 'api', kind: 'service', label: 'Api' },
    ],
    edges: [{ id: 'web-api', source: 'web', target: 'api' }],
  },
  layout: {
    positions: { web: { x: 0, y: 0 }, api: { x: 400, y: 200 } },
    sizes: { web: { width: 180, height: 64 }, api: { width: 180, height: 64 } },
  },
};

async function openSelected(document: DiagramDocument = pair) {
  localStorage.setItem(SAVED_DOCUMENT_KEY, documentToJson(document));
  render(<App />);
  const diagram = await screen.findByRole('group', { name: strings.canvas.diagramLabel('Pair') });
  await waitFor(() => expect(diagram.querySelectorAll('.react-flow__edge')).toHaveLength(1));
  act(() => editorStore.getState().select({ type: 'edge', id: 'web-api' }));
  return diagram;
}

const route = () => editorStore.getState().current?.document.layout.edgeRoutes?.['web-api'];
const handle = (name: string) => screen.findByRole('button', { name });

/** Where a point of the diagram is on the screen, read from the transform React Flow applied. */
function onScreen(diagram: HTMLElement, point: { x: number; y: number }) {
  const viewport = diagram.querySelector<HTMLElement>('.react-flow__viewport');
  const match = /translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\) scale\((-?[\d.]+)\)/.exec(
    viewport?.style.transform ?? '',
  );
  const [x, y, zoom] = [match?.[1], match?.[2], match?.[3]].map(Number);
  return { clientX: point.x * (zoom ?? 1) + (x ?? 0), clientY: point.y * (zoom ?? 1) + (y ?? 0) };
}

function drag(element: HTMLElement, to: { clientX: number; clientY: number }) {
  fireEvent.pointerDown(element, { button: 0, pointerId: 1, clientX: 0, clientY: 0 });
  fireEvent.pointerMove(element, { pointerId: 1, ...to });
  fireEvent.pointerUp(element, { pointerId: 1, ...to });
}

describe('the handles of a selected connection', () => {
  it('show a dot at each end and one in the middle, only while it is selected', async () => {
    const diagram = await openSelected();
    expect(await handle(strings.canvas.edgeHandles.source)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: strings.canvas.edgeHandles.target })).toBeVisible();
    expect(screen.getByRole('button', { name: strings.canvas.edgeHandles.bend })).toBeVisible();

    act(() => editorStore.getState().select(null));
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: strings.canvas.edgeHandles.bend }),
      ).not.toBeInTheDocument(),
    );
    expect(diagram.querySelectorAll('.react-flow__edge')).toHaveLength(1);
  });

  it('bend a curve through the point the middle dot is let go at, as one edit that can be undone', async () => {
    const diagram = await openSelected();
    const dot = await handle(strings.canvas.edgeHandles.bend);
    drag(dot, onScreen(diagram, { x: 300, y: 40 }));

    const bend = route()?.bend;
    expect(bend).toBeDefined();
    expect(Math.hypot(bend?.x ?? 0, bend?.y ?? 0)).toBeGreaterThan(1);
    const path = diagram.querySelector('.react-flow__edge path[fill="none"]');
    // Two parts of a curve now meet at the point, instead of the one the default curve has.
    expect(path?.getAttribute('d')?.match(/C/g)).toHaveLength(2);

    act(() => editorStore.getState().undo());
    expect(route()).toBeUndefined();
  });

  it('move the crossing segment of a right-angled connection, and only along its direction', async () => {
    const diagram = await openSelected({
      ...pair,
      layout: { ...pair.layout, edgeStyle: 'square' },
    });
    const dot = await handle(strings.canvas.edgeHandles.bend);
    drag(dot, onScreen(diagram, { x: 330, y: 500 }));
    // `web` leaves by the right and `api` is entered from the left, so the segment moves sideways.
    expect(route()?.bend?.y).toBe(0);
    expect(route()?.bend?.x).toBeGreaterThan(0);
  });

  it('attach an end to the side of its node the dot is let go nearest to', async () => {
    const diagram = await openSelected();
    const dot = await handle(strings.canvas.edgeHandles.target);
    // Above the middle of `api`, whose box is at (400, 200).
    drag(dot, onScreen(diagram, { x: 490, y: 150 }));

    expect(route()).toEqual({ target: 'top' });
    const edge = editorStore.getState().current?.document.layout;
    expect(edge?.edgeRoutes).toEqual({ 'web-api': { target: 'top' } });
    await waitFor(() =>
      expect(diagram.querySelector('.react-flow__edge')).toHaveAttribute('data-id', 'web-api'),
    );
  });

  it('show the line on the other side while the dot is held, and store nothing until it is let go', async () => {
    const diagram = await openSelected();
    const line = () =>
      diagram.querySelector('.react-flow__edge path[fill="none"]')?.getAttribute('d');
    const before = line();
    const dot = await handle(strings.canvas.edgeHandles.target);
    const to = onScreen(diagram, { x: 490, y: 150 });
    fireEvent.pointerDown(dot, { button: 0, pointerId: 1, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(dot, { pointerId: 1, ...to });
    await waitFor(() => expect(line()).not.toBe(before));
    expect(route()).toBeUndefined();
    // Cancelling, as when the pointer is lost, puts the line back.
    fireEvent.pointerCancel(dot, { pointerId: 1 });
    await waitFor(() => expect(line()).toBe(before));
    expect(route()).toBeUndefined();
  });

  it('forget the bend when an end changes side, and ignore a drop on the side it already has', async () => {
    const diagram = await openSelected();
    act(() => editorStore.getState().setEdgeRoute('web-api', { bend: { x: 20, y: 20 } }));
    // `web` leaves by its right side: letting its dot go beside that side changes nothing.
    drag(await handle(strings.canvas.edgeHandles.source), onScreen(diagram, { x: 200, y: 32 }));
    expect(route()).toEqual({ bend: { x: 20, y: 20 } });
    drag(await handle(strings.canvas.edgeHandles.source), onScreen(diagram, { x: 90, y: -40 }));
    expect(route()).toEqual({ source: 'top' });
  });

  it('can all be taken back from the inspector', async () => {
    const user = userEvent.setup();
    await openSelected();
    act(() =>
      editorStore.getState().setEdgeRoute('web-api', { source: 'top', bend: { x: 5, y: 5 } }),
    );
    const panel = await screen.findByRole('region', { name: strings.inspector.connection });
    await user.click(within(panel).getByRole('button', { name: strings.inspector.expand }));
    await user.click(within(panel).getByRole('button', { name: strings.inspector.edgeRouteReset }));
    expect(route()).toBeUndefined();
    expect(
      within(panel).queryByRole('button', { name: strings.inspector.edgeRouteReset }),
    ).not.toBeInTheDocument();
  });
});
