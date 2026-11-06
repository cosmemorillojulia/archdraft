import { ARCHITECTURE_TEMPLATES, isContainerKind } from '@archdraft/shared';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../src/App.tsx';
import { absoluteBoxes } from '../src/canvas/geometry.ts';
import { registerViewCommands } from '../src/canvas/view-commands.ts';
import { editorStore } from '../src/editor/store.ts';
import { openBlank } from '../src/editor/open-document.ts';
import { en as strings } from '../src/i18n/en.ts';

const TEMPLATE = ARCHITECTURE_TEMPLATES['three-tier-web'];

async function openEditor() {
  const user = userEvent.setup();
  render(<App />);
  await screen.findByRole('group', { name: `Diagram: ${TEMPLATE.title}` });
  return user;
}

const document = () => {
  const current = editorStore.getState().current;
  if (!current) throw new Error('No diagram');
  return current.document;
};

describe('Excalidraw shortcuts', () => {
  it('chooses every node but the groups with Ctrl+A', async () => {
    const user = await openEditor();
    await user.keyboard('{Control>}a{/Control}');
    const expected = TEMPLATE.nodes
      .filter((node) => !isContainerKind(node.kind))
      .map((node) => node.id);
    expect(editorStore.getState().group).toEqual(expected);
  });

  it('duplicates the chosen nodes together with Ctrl+D', async () => {
    const user = await openEditor();
    editorStore.getState().selectNodes(['user', 'dns']);
    const before = document().graph.nodes.length;
    await user.keyboard('{Control>}d{/Control}');
    expect(document().graph.nodes.length).toBe(before + 2);
    expect(editorStore.getState().group).toEqual(['user-2', 'dns-2']);
  });

  it('lines the chosen nodes up with Ctrl+Shift and an arrow', async () => {
    const user = await openEditor();
    editorStore.getState().selectNodes(['user', 'dns', 'cdn']);
    await user.keyboard('{Control>}{Shift>}{ArrowLeft}{/Shift}{/Control}');
    const boxes = absoluteBoxes(document().graph, document().layout);
    const lefts = ['user', 'dns', 'cdn'].map((id) => boxes.get(id)?.x);
    expect(new Set(lefts).size).toBe(1);
  });

  it('shows the whole diagram with Shift+1 and the selection with Shift+2', async () => {
    const user = await openEditor();
    const commands = { fit: vi.fn(), zoomToSelection: vi.fn() };
    const unregister = registerViewCommands(commands);
    await user.keyboard('{Shift>}1{/Shift}');
    expect(commands.fit).toHaveBeenCalledOnce();
    await user.keyboard('{Shift>}2{/Shift}');
    expect(commands.zoomToSelection).toHaveBeenCalledOnce();
    unregister();
  });
});

describe('the button that reorders the whole diagram', () => {
  it('lays the diagram out again as one step, and is off on an empty diagram', async () => {
    const user = await openEditor();
    const shortcuts = screen.getByRole('group', { name: strings.canvas.shortcuts.label });
    const button = within(shortcuts).getByRole('button', { name: strings.canvas.tidy });
    editorStore.getState().moveNode('monitoring', { x: 5000, y: 5000 });
    const moved = document();
    await user.click(button);
    await waitFor(() => expect(document()).not.toBe(moved));
    expect(document().layout.positions.monitoring).not.toEqual({ x: 5000, y: 5000 });
    editorStore.getState().undo();
    expect(document()).toBe(moved);

    openBlank('LR');
    await waitFor(() => expect(button).toBeDisabled());
  });
});

describe('selectAll in the store', () => {
  it('chooses one node as the selection, and nothing in an empty diagram', () => {
    editorStore.getState().load(
      {
        graph: {
          ...TEMPLATE,
          nodes: TEMPLATE.nodes.filter((node) => node.id === 'user'),
          edges: [],
        },
        layout: { positions: {}, sizes: {} },
      },
      { direction: 'LR', templateId: null },
    );
    editorStore.getState().selectAll();
    expect(editorStore.getState()).toMatchObject({
      selection: { type: 'node', id: 'user' },
      group: [],
    });
  });
});
