import { ARCHITECTURE_TEMPLATES, defaultSizeOf } from '@archdraft/core';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App.tsx';
import { HOLD_MS } from '../src/palette/palette-drag.ts';
import { editorStore } from '../src/editor/store.ts';
import { WIDE_SCREEN } from '../src/media.ts';
import { en as strings } from '../src/i18n/en.ts';

const template = ARCHITECTURE_TEMPLATES['three-tier-web'];

const diagram = () =>
  screen.findByRole('group', { name: strings.canvas.diagramLabel(template.title) });

/** The React Flow node that shows a component or group with this label. */
function flowNode(container: HTMLElement, label: string): HTMLElement {
  const node = within(container).getByText(label).closest<HTMLElement>('.react-flow__node');
  if (!node) throw new Error(`No canvas node for ${label}`);
  return node;
}

const nodeIds = () => editorStore.getState().current?.document.graph.nodes.map((node) => node.id);

/** The tile that follows the pointer while dragged from the palette. */
const ghost = () => document.querySelector('[data-palette-ghost]');

/** jsdom has no layout, so the element under the pointer is the one given. */
function pointAt(element: Element | null) {
  Object.defineProperty(document, 'elementFromPoint', {
    configurable: true,
    value: () => element,
  });
}

afterEach(() => {
  Reflect.deleteProperty(document, 'elementFromPoint');
});

describe('editing on narrow screens', () => {
  it('adds a tapped component at the centre of the view, selects it and closes the sheet', async () => {
    const user = userEvent.setup();
    render(<App />);
    await diagram();
    await user.click(screen.getByRole('button', { name: strings.components.open }));
    const sheet = await screen.findByRole('dialog', { name: strings.components.title });

    await user.click(within(sheet).getByRole('button', { name: strings.components.add('Queue') }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(nodeIds()).toContain('queue');
    // The inspector takes the place of the prompt, as a strip that expands from its handle.
    const inspector = await screen.findByRole('region', { name: 'Queue' });
    await waitFor(() =>
      expect(screen.queryByRole('textbox', { name: strings.prompt.label })).not.toBeInTheDocument(),
    );
    expect(within(inspector).queryByLabelText(strings.inspector.name)).not.toBeInTheDocument();
    await user.click(within(inspector).getByRole('button', { name: strings.inspector.expand }));
    expect(await within(inspector).findByLabelText(strings.inspector.name)).toHaveValue('Queue');
  });
});

describe('dragging from the palette with a finger', () => {
  const hold = () => new Promise((resolve) => setTimeout(resolve, HOLD_MS + 30));

  it('picks a tile up after holding it, moves the sheet away and adds it where it is let go', async () => {
    const user = userEvent.setup();
    render(<App />);
    const canvas = await diagram();
    pointAt(canvas.querySelector('.react-flow__pane'));
    await user.click(screen.getByRole('button', { name: strings.components.open }));
    const sheet = await screen.findByRole('dialog', { name: strings.components.title });
    const tile = within(sheet).getByRole('button', { name: strings.components.add('Queue') });

    fireEvent.pointerDown(tile, {
      pointerId: 5,
      pointerType: 'touch',
      button: 0,
      clientX: 100,
      clientY: 700,
    });
    await hold();
    // The sheet stays mounted, so the finger keeps the drag, but out of the way of the diagram.
    await waitFor(() => expect(sheet).toHaveStyle({ pointerEvents: 'none' }));
    expect(document.querySelector('[inert]')).toBeNull();
    fireEvent.pointerMove(window, { pointerId: 5, clientX: 180, clientY: 300 });
    expect(ghost()).toHaveTextContent('Queue');
    fireEvent.pointerUp(window, { pointerId: 5, clientX: 180, clientY: 300 });
    expect(nodeIds()).toContain('queue');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('brings the sheet back when the tile is let go off the diagram', async () => {
    const user = userEvent.setup();
    render(<App />);
    await diagram();
    pointAt(null);
    await user.click(screen.getByRole('button', { name: strings.components.open }));
    const sheet = await screen.findByRole('dialog', { name: strings.components.title });
    const tile = within(sheet).getByRole('button', { name: strings.components.add('Queue') });

    fireEvent.pointerDown(tile, {
      pointerId: 7,
      pointerType: 'touch',
      button: 0,
      clientX: 100,
      clientY: 700,
    });
    await hold();
    fireEvent.pointerMove(window, { pointerId: 7, clientX: 120, clientY: 20 });
    fireEvent.pointerUp(window, { pointerId: 7, clientX: 120, clientY: 20 });
    await waitFor(() => expect(sheet).toHaveStyle({ pointerEvents: 'auto' }));
    expect(nodeIds()).not.toContain('queue');
  });

  it('lets a swipe scroll the palette instead of picking the tile up', async () => {
    const user = userEvent.setup();
    render(<App />);
    const canvas = await diagram();
    pointAt(canvas.querySelector('.react-flow__pane'));
    await user.click(screen.getByRole('button', { name: strings.components.open }));
    const sheet = await screen.findByRole('dialog', { name: strings.components.title });
    const tile = within(sheet).getByRole('button', { name: strings.components.add('Queue') });

    fireEvent.pointerDown(tile, {
      pointerId: 6,
      pointerType: 'touch',
      button: 0,
      clientX: 100,
      clientY: 700,
    });
    fireEvent.pointerMove(window, { pointerId: 6, clientX: 100, clientY: 640 });
    await hold();
    expect(ghost()).toBeNull();
    expect(screen.getByRole('dialog', { name: strings.components.title })).toBeInTheDocument();
    fireEvent.pointerUp(window, { pointerId: 6, clientX: 100, clientY: 600 });
    expect(nodeIds()).not.toContain('queue');
  });
});

describe('editing on wide screens', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({
        matches: query === WIDE_SCREEN,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );
  });

  it('opens the inspector on click and renames the component', async () => {
    const user = userEvent.setup();
    render(<App />);
    const canvas = await diagram();
    fireEvent.click(flowNode(canvas, 'Web application'));

    const inspector = await screen.findByRole('region', { name: 'Web application' });
    const name = within(inspector).getByLabelText(strings.inspector.name);
    await user.clear(name);
    await user.type(name, 'Storefront{Enter}');
    expect(within(canvas).getByText('Storefront')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: strings.header.undo })).toBeEnabled();
  });

  it('selects a focused node with Enter', async () => {
    render(<App />);
    const canvas = await diagram();
    const node = flowNode(canvas, 'Load balancer');
    expect(node).toHaveAttribute('tabindex', '0');
    expect(node).toHaveAccessibleName('Load balancer, Application Load Balancer');
    node.focus();
    fireEvent.keyDown(node, { key: 'Enter' });
    expect(await screen.findByRole('region', { name: 'Load balancer' })).toBeInTheDocument();
  });

  describe('renaming in the box', () => {
    const open = async () => {
      render(<App />);
      const canvas = await diagram();
      fireEvent.doubleClick(flowNode(canvas, 'Web application'));
      const field = await within(canvas).findByRole('textbox', { name: strings.canvas.rename });
      return { canvas, field };
    };
    const history = () => editorStore.getState().past.length;

    it('opens a field with the name selected on double click, and keeps what is typed with Enter', async () => {
      const user = userEvent.setup();
      const { canvas, field } = await open();
      expect(field).toHaveValue('Web application');
      expect(field).toHaveFocus();
      const before = history();
      await user.keyboard('Storefront{Enter}');
      expect(within(canvas).getByText('Storefront')).toBeInTheDocument();
      expect(within(canvas).queryByRole('textbox', { name: strings.canvas.rename })).toBeNull();
      expect(history()).toBe(before + 1);
    });

    it('keeps the name when the field loses focus', async () => {
      const user = userEvent.setup();
      const { canvas } = await open();
      await user.keyboard('Gateway');
      await user.click(document.body);
      expect(within(canvas).getByText('Gateway')).toBeInTheDocument();
    });

    it('drops what was typed with Escape and ignores an empty name', async () => {
      const user = userEvent.setup();
      const { canvas } = await open();
      const before = history();
      await user.keyboard('Something else{Escape}');
      expect(within(canvas).getByText('Web application')).toBeInTheDocument();
      expect(history()).toBe(before);

      fireEvent.doubleClick(flowNode(canvas, 'Web application'));
      await within(canvas).findByRole('textbox', { name: strings.canvas.rename });
      await user.keyboard('{Backspace}{Enter}');
      expect(within(canvas).getByText('Web application')).toBeInTheDocument();
      expect(history()).toBe(before);
    });

    it('does not take the keys for shortcuts: Delete types instead of deleting the node', async () => {
      const user = userEvent.setup();
      const { canvas } = await open();
      await user.keyboard('{Delete}{Backspace}');
      expect(
        editorStore.getState().current?.document.graph.nodes.map((node) => node.label),
      ).toContain('Web application');
      expect(canvas.querySelector('input')).not.toBeNull();
    });

    it('also opens with Enter on the selected node, and F2', async () => {
      render(<App />);
      const canvas = await diagram();
      const node = flowNode(canvas, 'Load balancer');
      node.focus();
      // Not selected yet: Enter only selects, as before.
      fireEvent.keyDown(node, { key: 'Enter' });
      await screen.findByRole('region', { name: 'Load balancer' });
      expect(within(canvas).queryByRole('textbox', { name: strings.canvas.rename })).toBeNull();
      fireEvent.keyDown(node, { key: 'F2' });
      expect(
        await within(canvas).findByRole('textbox', { name: strings.canvas.rename }),
      ).toHaveValue('Load balancer');
    });
  });

  it('deletes the selection with the keyboard, and undoes and redoes it', async () => {
    const user = userEvent.setup();
    render(<App />);
    const canvas = await diagram();
    const undo = screen.getByRole('button', { name: strings.header.undo });
    const redo = screen.getByRole('button', { name: strings.header.redo });
    expect(undo).toBeDisabled();

    fireEvent.click(flowNode(canvas, 'Session cache'));
    await screen.findByRole('region', { name: 'Session cache' });
    await user.keyboard('{Delete}');
    await waitFor(() =>
      expect(within(canvas).queryByText('Session cache')).not.toBeInTheDocument(),
    );
    expect(nodeIds()).not.toContain('cache');

    await user.keyboard('{Control>}z{/Control}');
    expect(await within(canvas).findByText('Session cache')).toBeInTheDocument();
    expect(redo).toBeEnabled();

    await user.click(redo);
    await waitFor(() =>
      expect(within(canvas).queryByText('Session cache')).not.toBeInTheDocument(),
    );
  });

  it('duplicates the selection with Ctrl+D', async () => {
    const user = userEvent.setup();
    render(<App />);
    const canvas = await diagram();
    fireEvent.click(flowNode(canvas, 'Database'));
    await screen.findByRole('region', { name: 'Database' });

    await user.keyboard('{Control>}d{/Control}');
    expect(await within(canvas).findByText('Database 2')).toBeInTheDocument();
    expect(await screen.findByRole('region', { name: 'Database 2' })).toBeInTheDocument();
  });

  it('adds a component where a palette tile is dragged to with the mouse', async () => {
    const user = userEvent.setup();
    render(<App />);
    const canvas = await diagram();
    const pane = canvas.querySelector('.react-flow__pane');
    pointAt(pane);
    await user.click(screen.getByRole('button', { name: strings.components.open }));
    const tile = await screen.findByRole('button', { name: strings.components.add('Cache') });

    fireEvent.pointerDown(tile, {
      pointerId: 1,
      pointerType: 'mouse',
      button: 0,
      clientX: 20,
      clientY: 90,
    });
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 22, clientY: 92 });
    // A few pixels are still a click.
    expect(ghost()).toBeNull();
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 40, clientY: 400 });
    expect(await waitFor(() => ghost())).toHaveTextContent('Cache');
    fireEvent.pointerUp(window, { pointerId: 1, clientX: 40, clientY: 600 });
    // The click that ends the drag does not add a second one at the centre.
    fireEvent.click(tile);

    expect(await within(canvas).findByText('Cache')).toBeInTheDocument();
    expect(nodeIds()?.filter((id) => id.startsWith('cache'))).toEqual(['cache', 'cache-2']);
    await waitFor(() => expect(ghost()).toBeNull());
  });

  it('adds nothing when a dragged tile is let go over a panel or with Escape', async () => {
    const user = userEvent.setup();
    render(<App />);
    await diagram();
    await user.click(screen.getByRole('button', { name: strings.components.open }));
    const tile = await screen.findByRole('button', { name: strings.components.add('Cache') });
    pointAt(tile);
    const before = nodeIds();

    fireEvent.pointerDown(tile, {
      pointerId: 1,
      pointerType: 'mouse',
      button: 0,
      clientX: 20,
      clientY: 90,
    });
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 60, clientY: 120 });
    fireEvent.pointerUp(window, { pointerId: 1, clientX: 60, clientY: 120 });
    fireEvent.pointerDown(tile, {
      pointerId: 2,
      pointerType: 'mouse',
      button: 0,
      clientX: 20,
      clientY: 90,
    });
    fireEvent.pointerMove(window, { pointerId: 2, clientX: 60, clientY: 120 });
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.pointerUp(window, { pointerId: 2, clientX: 60, clientY: 120 });
    expect(nodeIds()).toEqual(before);
  });
  describe('placing a tile stuck to the pointer', () => {
    const discardBox = () => document.querySelector<HTMLElement>('[data-discard-drop]');
    const layoutOf = (id: string) => editorStore.getState().current?.document.layout.sizes[id];

    /** Opens the palette and clicks the tile of this kind with the mouse. */
    async function pickUp(label: string, point = { x: 40, y: 200 }) {
      const user = userEvent.setup();
      render(<App />);
      const canvas = await diagram();
      const pane = canvas.querySelector('.react-flow__pane');
      pointAt(pane);
      await user.click(screen.getByRole('button', { name: strings.components.open }));
      const tile = await screen.findByRole('button', { name: strings.components.add(label) });
      fireEvent.pointerDown(tile, {
        pointerId: 1,
        pointerType: 'mouse',
        button: 0,
        clientX: point.x,
        clientY: point.y,
      });
      fireEvent.pointerUp(window, { pointerId: 1, clientX: point.x, clientY: point.y });
      fireEvent.click(tile, { detail: 1, clientX: point.x, clientY: point.y });
      return { canvas, pane, tile };
    }

    const press = (point: { x: number; y: number }, type: 'Down' | 'Up' | 'Move') =>
      type === 'Move'
        ? fireEvent.pointerMove(window, { pointerId: 2, clientX: point.x, clientY: point.y })
        : fireEvent[`pointer${type}`](window, {
            pointerId: 2,
            pointerType: 'mouse',
            button: 0,
            clientX: point.x,
            clientY: point.y,
          });

    it('sticks the component to the pointer, with a box to discard it, and places it with a click', async () => {
      const { canvas } = await pickUp('Cache');
      expect(await waitFor(() => ghost())).toHaveTextContent('Cache');
      expect(discardBox()).not.toBeNull();
      expect(nodeIds()).not.toContain('cache-2');

      press({ x: 500, y: 300 }, 'Move');
      press({ x: 500, y: 300 }, 'Down');
      press({ x: 500, y: 300 }, 'Up');
      expect(await within(canvas).findByText('Cache')).toBeInTheDocument();
      expect(nodeIds()?.filter((id) => id.startsWith('cache'))).toEqual(['cache', 'cache-2']);
      await waitFor(() => expect(ghost()).toBeNull());
      expect(discardBox()).toBeNull();
      // Placed once: another click on the diagram adds nothing.
      press({ x: 600, y: 300 }, 'Down');
      press({ x: 600, y: 300 }, 'Up');
      expect(nodeIds()?.filter((id) => id.startsWith('cache'))).toEqual(['cache', 'cache-2']);
    });

    it('is thrown away with Escape, the discard box, or the right button', async () => {
      await pickUp('Cache');
      const before = nodeIds();
      fireEvent.keyDown(window, { key: 'Escape' });
      await waitFor(() => expect(ghost()).toBeNull());
      expect(nodeIds()).toEqual(before);

      const tile = screen.getByRole('button', { name: strings.components.add('Cache') });
      fireEvent.click(tile, { detail: 1, clientX: 40, clientY: 200 });
      await waitFor(() => expect(ghost()).not.toBeNull());
      fireEvent.click(discardBox() as HTMLElement);
      await waitFor(() => expect(ghost()).toBeNull());

      fireEvent.click(tile, { detail: 1, clientX: 40, clientY: 200 });
      await waitFor(() => expect(ghost()).not.toBeNull());
      fireEvent.pointerDown(window, { pointerId: 3, pointerType: 'mouse', button: 2 });
      await waitFor(() => expect(ghost()).toBeNull());
      expect(nodeIds()).toEqual(before);
    });

    it('adds nothing when the click is on a panel, and keeps the tile stuck', async () => {
      const { tile } = await pickUp('Cache');
      const before = nodeIds();
      pointAt(tile);
      press({ x: 40, y: 200 }, 'Down');
      press({ x: 40, y: 200 }, 'Up');
      expect(nodeIds()).toEqual(before);
      expect(ghost()).not.toBeNull();
    });

    it('is thrown away when a dragged tile is let go over the discard box', async () => {
      const { tile } = await pickUp('Cache');
      fireEvent.keyDown(window, { key: 'Escape' });
      await waitFor(() => expect(ghost()).toBeNull());
      const before = nodeIds();
      fireEvent.pointerDown(tile, {
        pointerId: 5,
        pointerType: 'mouse',
        button: 0,
        clientX: 20,
        clientY: 90,
      });
      fireEvent.pointerMove(window, { pointerId: 5, clientX: 400, clientY: 70 });
      await waitFor(() => expect(discardBox()).not.toBeNull());
      pointAt(discardBox());
      fireEvent.pointerMove(window, { pointerId: 5, clientX: 410, clientY: 72 });
      fireEvent.pointerUp(window, { pointerId: 5, clientX: 410, clientY: 72 });
      expect(nodeIds()).toEqual(before);
    });

    it('adds a tile at the centre when it is activated with the keyboard', async () => {
      const user = userEvent.setup();
      render(<App />);
      await diagram();
      await user.click(screen.getByRole('button', { name: strings.components.open }));
      const tile = await screen.findByRole('button', { name: strings.components.add('Cache') });
      fireEvent.click(tile, { detail: 0 });
      expect(nodeIds()).toContain('cache-2');
      expect(ghost()).toBeNull();
    });

    it('draws a shape at the size dragged', async () => {
      await pickUp('Box');
      press({ x: 100, y: 100 }, 'Down');
      press({ x: 300, y: 260 }, 'Move');
      expect(document.querySelector('[data-palette-drawing]')).not.toBeNull();
      press({ x: 300, y: 260 }, 'Up');
      await waitFor(() => expect(nodeIds()).toContain('box'));
      const size = layoutOf('box');
      expect(size).toBeDefined();
      // 200 × 160 on the screen, in diagram pixels at whatever zoom the view has.
      expect((size?.width ?? 0) / (size?.height ?? 1)).toBeCloseTo(1.25, 1);
      expect(document.querySelector('[data-palette-drawing]')).toBeNull();
    });

    it('draws a circle round, and places a shape of the usual size when the press does not move', async () => {
      await pickUp('Circle');
      press({ x: 100, y: 100 }, 'Down');
      press({ x: 360, y: 200 }, 'Up');
      await waitFor(() => expect(nodeIds()).toContain('circle'));
      expect(layoutOf('circle')?.width).toBe(layoutOf('circle')?.height);

      fireEvent.click(screen.getByRole('button', { name: strings.components.add('Diamond') }), {
        detail: 1,
        clientX: 40,
        clientY: 200,
      });
      press({ x: 200, y: 200 }, 'Down');
      press({ x: 201, y: 201 }, 'Up');
      await waitFor(() => expect(nodeIds()).toContain('diamond'));
      expect(layoutOf('diamond')).toEqual(defaultSizeOf('diamond'));
    });
  });

  it('explains why an edit was not made', async () => {
    const user = userEvent.setup();
    render(<App />);
    const canvas = await diagram();
    fireEvent.click(flowNode(canvas, 'DNS'));
    const inspector = await screen.findByRole('region', { name: 'DNS' });

    await user.click(within(inspector).getByRole('button', { name: strings.inspector.connect }));
    expect(screen.getByText(strings.canvas.connecting)).toBeInTheDocument();
    fireEvent.click(flowNode(canvas, 'VPC'));

    expect(await screen.findByRole('alert')).toHaveTextContent(strings.edit.groupEndpoint);
    expect(screen.queryByText(strings.canvas.connecting)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: strings.canvas.dismiss }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });

  it('closes the inspector with Escape', async () => {
    const user = userEvent.setup();
    render(<App />);
    const canvas = await diagram();
    fireEvent.click(flowNode(canvas, 'CDN'));
    await screen.findByRole('region', { name: 'CDN' });

    await user.keyboard('{Escape}');
    await waitFor(() =>
      expect(screen.queryByRole('region', { name: 'CDN' })).not.toBeInTheDocument(),
    );
  });
});
