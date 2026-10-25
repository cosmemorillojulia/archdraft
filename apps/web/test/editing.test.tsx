import { ARCHITECTURE_TEMPLATES } from '@archdraft/core';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App.tsx';
import { KIND_MIME } from '../src/canvas/palette-drop.ts';
import { editorStore } from '../src/editor/store.ts';
import { WIDE_SCREEN } from '../src/media.ts';
import { strings } from '../src/strings.ts';

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
    const inspector = await screen.findByRole('region', { name: 'Queue' });
    expect(within(inspector).getByLabelText(strings.inspector.name)).toHaveValue('Queue');
    // The inspector takes the place of the prompt.
    await waitFor(() =>
      expect(screen.queryByRole('textbox', { name: strings.prompt.label })).not.toBeInTheDocument(),
    );
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

  it('adds a component where a palette tile is dropped', async () => {
    const user = userEvent.setup();
    render(<App />);
    const canvas = await diagram();
    await user.click(screen.getByRole('button', { name: strings.components.open }));
    const tile = await screen.findByRole('button', { name: strings.components.add('Cache') });
    expect(tile).toHaveAttribute('draggable', 'true');

    const data = new Map<string, string>();
    const dataTransfer = {
      types: [KIND_MIME],
      setData: (type: string, value: string) => data.set(type, value),
      getData: (type: string) => data.get(type) ?? '',
      effectAllowed: '',
      dropEffect: '',
    };
    fireEvent.dragStart(tile, { dataTransfer });
    const pane = canvas.querySelector('.react-flow__pane');
    if (!pane) throw new Error('No pane');
    fireEvent.dragOver(pane, { dataTransfer });
    fireEvent.drop(pane, { dataTransfer, clientX: 40, clientY: 600 });

    expect(await within(canvas).findByText('Cache')).toBeInTheDocument();
    expect(nodeIds()).toContain('cache-2');
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
