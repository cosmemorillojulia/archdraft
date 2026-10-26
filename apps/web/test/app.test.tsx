import { ARCHITECTURE_TEMPLATES, NODE_CATALOG, isContainerKind } from '@archdraft/core';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App.tsx';
import { WIDE_SCREEN } from '../src/media.ts';
import { en as strings } from '../src/i18n/en.ts';

const diagramOf = (title: string) =>
  screen.findByRole('group', { name: strings.canvas.diagramLabel(title) });

/** The React Flow node that shows a component with this label. */
function flowNode(diagram: HTMLElement, label: string): HTMLElement {
  const node = within(diagram).getByText(label).closest<HTMLElement>('.react-flow__node');
  if (!node) throw new Error(`No canvas node for ${label}`);
  return node;
}

const stateOf = (node: HTMLElement) =>
  node.querySelector('[data-state]')?.getAttribute('data-state');

describe('App', () => {
  it('has a header with only the product name, its purpose and the settings', () => {
    render(<App />);
    const header = screen.getByRole('banner');
    expect(within(header).getByRole('heading', { level: 1 })).toHaveTextContent(strings.appName);
    expect(header).toHaveTextContent(strings.tagline);
    expect(within(header).queryByRole('link')).not.toBeInTheDocument();
    expect(
      within(header).getByRole('button', { name: strings.header.language.label }),
    ).toBeInTheDocument();
    expect(header.querySelector('svg:not(.lucide)')).toBeNull();
  });

  it('summarises the current diagram in a card', async () => {
    render(<App />);
    const graph = ARCHITECTURE_TEMPLATES['three-tier-web'];
    const card = await screen.findByRole('region', { name: graph.title });
    const components = graph.nodes.filter((node) => !isContainerKind(node.kind)).length;
    expect(card).toHaveTextContent(`${components}${strings.card.components(components)}`);
    expect(card).toHaveTextContent(
      `${graph.edges.length}${strings.card.connections(graph.edges.length)}`,
    );
    expect(within(card).getByText(strings.providers.aws)).toBeInTheDocument();
    expect(within(card).getByRole('status')).toHaveTextContent(strings.review.clean);
  });

  it('draws every component of the diagram', async () => {
    render(<App />);
    const diagram = await diagramOf(ARCHITECTURE_TEMPLATES['three-tier-web'].title);
    expect(within(diagram).getByText('Web application')).toBeInTheDocument();
    expect(within(diagram).getByText('Amazon Aurora')).toBeInTheDocument();
  });

  it('highlights a component and what it connects to while the pointer is over it', async () => {
    render(<App />);
    const diagram = await diagramOf(ARCHITECTURE_TEMPLATES['three-tier-web'].title);
    const app = flowNode(diagram, 'Web application');

    fireEvent.mouseEnter(app);
    expect(stateOf(app)).toBe('focused');
    expect(stateOf(flowNode(diagram, 'Database'))).toBe('idle');
    expect(stateOf(flowNode(diagram, 'DNS'))).toBe('dimmed');

    fireEvent.mouseLeave(app);
    expect(stateOf(flowNode(diagram, 'DNS'))).toBe('idle');
  });

  it('marks components that run outside the provider of the diagram', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: strings.header.new }));
    await user.click(
      screen.getByRole('menuitemradio', { name: strings.prompt.templateNames['serverless-api'] }),
    );
    const diagram = await diagramOf(ARCHITECTURE_TEMPLATES['serverless-api'].title);
    expect(flowNode(diagram, 'Email service')).toHaveTextContent(
      strings.canvas.providerBadges.generic,
    );
    expect(flowNode(diagram, 'API handler')).not.toHaveTextContent(
      strings.canvas.providerBadges.generic,
    );
  });

  it('has zoom controls', async () => {
    render(<App />);
    await diagramOf(ARCHITECTURE_TEMPLATES['three-tier-web'].title);
    const zoom = screen.getByRole('group', { name: strings.canvas.zoom.label });
    for (const name of [strings.canvas.zoom.in, strings.canvas.zoom.out, strings.canvas.zoom.fit]) {
      expect(within(zoom).getByRole('button', { name })).toBeInTheDocument();
    }
  });

  it('switches the diagram from the templates menu in the header', async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(screen.queryByRole('group', { name: strings.prompt.templates })).toBeNull();
    const button = within(screen.getByRole('banner')).getByRole('button', {
      name: strings.header.new,
    });
    await user.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    const menu = screen.getByRole('menu', { name: strings.header.new });
    expect(within(menu).getAllByRole('menuitemradio')).toHaveLength(6);
    const rag = within(menu).getByRole('menuitemradio', {
      name: strings.prompt.templateNames['rag-chatbot'],
    });
    expect(rag).toHaveAttribute('aria-checked', 'false');

    await user.click(rag);
    const graph = ARCHITECTURE_TEMPLATES['rag-chatbot'];
    expect(await screen.findByRole('region', { name: graph.title })).toBeInTheDocument();
    expect(await diagramOf(graph.title)).toBeInTheDocument();
    // Choosing closes the menu; the template that was opened is the checked one.
    expect(screen.queryByRole('menu')).toBeNull();
    await user.click(button);
    expect(
      screen.getByRole('menuitemradio', { name: strings.prompt.templateNames['rag-chatbot'] }),
    ).toHaveAttribute('aria-checked', 'true');
  });

  it('opens an empty diagram from the plus button, and undo brings the previous one back', async () => {
    const user = userEvent.setup();
    render(<App />);
    const title = ARCHITECTURE_TEMPLATES['three-tier-web'].title;
    await diagramOf(title);
    await user.click(screen.getByRole('button', { name: strings.header.new }));
    await user.click(screen.getByRole('menuitem', { name: strings.header.newDiagram }));
    expect(
      await screen.findByRole('group', {
        name: strings.canvas.diagramLabel(strings.header.newDiagramTitle),
      }),
    ).toBeInTheDocument();
    expect(document.querySelectorAll('.react-flow__node')).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: strings.header.undo }));
    expect(await diagramOf(title)).toBeInTheDocument();
  });

  it('closes the templates menu with Escape and returns the focus to its button', async () => {
    const user = userEvent.setup();
    render(<App />);
    const button = screen.getByRole('button', { name: strings.header.new });
    await user.click(button);
    expect(screen.getByRole('menu')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    expect(button).toHaveFocus();
  });

  it('has a labelled prompt whose generate button explains that it is not available yet', async () => {
    const user = userEvent.setup();
    render(<App />);
    const prompt = screen.getByRole('textbox', { name: strings.prompt.label });
    expect(prompt).toHaveAccessibleDescription(strings.prompt.soon);
    expect(screen.getByRole('button', { name: strings.prompt.generate })).toBeDisabled();
    expect(screen.getByText(strings.prompt.examples[0])).toBeInTheDocument();

    await user.type(prompt, 'A queue');
    expect(screen.queryByText(strings.prompt.examples[0])).not.toBeInTheDocument();
  });

  it('rotates the example prompts while the field is empty', async () => {
    // Only the interval is faked: Motion keeps its real frame loop to finish the exit.
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    try {
      render(<App />);
      expect(screen.getByText(strings.prompt.examples[0])).toBeInTheDocument();
      act(() => {
        vi.advanceTimersByTime(3600);
      });
      expect(await screen.findByText(strings.prompt.examples[1])).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('lists every kind of the catalog in the palette', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: strings.components.open }));
    const palette = await screen.findByRole('dialog', { name: strings.components.title });
    for (const definition of Object.values(NODE_CATALOG)) {
      expect(within(palette).getByText(definition.label)).toBeInTheDocument();
    }
  });

  it('filters the palette and says when nothing matches', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: strings.components.open }));
    const palette = await screen.findByRole('dialog', { name: strings.components.title });
    const search = within(palette).getByRole('searchbox', { name: strings.components.search });

    await user.type(search, 'data');
    expect(within(palette).getByText('Relational database')).toBeInTheDocument();
    await waitFor(() => expect(within(palette).queryByText('Function')).not.toBeInTheDocument());

    await user.clear(search);
    await user.type(search, 'zzz');
    expect(
      await within(palette).findByText(strings.components.noMatches('zzz')),
    ).toBeInTheDocument();
  });

  describe('on narrow screens', () => {
    it('opens the palette as a modal sheet and makes the rest of the page inert', async () => {
      const user = userEvent.setup();
      render(<App />);
      const toggle = screen.getByRole('button', { name: strings.components.open });
      expect(toggle).toHaveAttribute('aria-expanded', 'false');

      await user.click(toggle);
      const sheet = await screen.findByRole('dialog', { name: strings.components.title });
      expect(sheet).toHaveAttribute('aria-modal', 'true');
      expect(sheet).toHaveFocus();
      expect(screen.getByRole('banner').closest('[inert]')).not.toBeNull();
    });

    it('closes the sheet with Escape and returns the focus to its button', async () => {
      const user = userEvent.setup();
      render(<App />);
      const toggle = screen.getByRole('button', { name: strings.components.open });
      await user.click(toggle);
      await screen.findByRole('dialog', { name: strings.components.title });

      await user.keyboard('{Escape}');
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(toggle).toHaveFocus();
      expect(document.querySelector('[inert]')).toBeNull();
    });

    it('closes the sheet with its button and with a tap outside it', async () => {
      const user = userEvent.setup();
      render(<App />);
      await user.click(screen.getByRole('button', { name: strings.components.open }));
      const sheet = await screen.findByRole('dialog', { name: strings.components.title });
      await user.click(within(sheet).getByRole('button', { name: strings.components.close }));
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

      await user.click(screen.getByRole('button', { name: strings.components.open }));
      await screen.findByRole('dialog', { name: strings.components.title });
      const backdrop = document.querySelector('.fixed.inset-0');
      if (!backdrop) throw new Error('backdrop not found');
      await user.click(backdrop);
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    });
  });

  describe('on wide screens', () => {
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

    it('shows the palette beside the diagram without blocking the page', async () => {
      const user = userEvent.setup();
      render(<App />);
      expect(
        screen.queryByRole('region', { name: strings.components.title }),
      ).not.toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: strings.components.open }));
      expect(
        await screen.findByRole('region', { name: strings.components.title }),
      ).toBeInTheDocument();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(document.querySelector('[inert]')).toBeNull();

      await user.click(screen.getByRole('button', { name: strings.components.close }));
      await waitFor(() =>
        expect(
          screen.queryByRole('region', { name: strings.components.title }),
        ).not.toBeInTheDocument(),
      );
    });

    it('closes the side panel with Escape', async () => {
      const user = userEvent.setup();
      render(<App />);
      await user.click(screen.getByRole('button', { name: strings.components.open }));
      const panel = await screen.findByRole('region', { name: strings.components.title });
      await user.click(within(panel).getByRole('searchbox'));

      await user.keyboard('{Escape}');
      await waitFor(() =>
        expect(
          screen.queryByRole('region', { name: strings.components.title }),
        ).not.toBeInTheDocument(),
      );
    });
  });

  it('toggles the theme and remembers the choice', async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(document.documentElement.dataset.theme).toBe('light');

    await user.click(screen.getByRole('button', { name: strings.header.themeToDark }));
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem('archdraft:theme')).toBe('dark');

    await user.click(screen.getByRole('button', { name: strings.header.themeToLight }));
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('cross-fades the theme with a view transition where the browser has them', async () => {
    const user = userEvent.setup();
    const startViewTransition = vi.fn((update: () => void) => {
      update();
      return {};
    });
    Object.defineProperty(document, 'startViewTransition', {
      value: startViewTransition,
      configurable: true,
    });
    try {
      render(<App />);
      await user.click(screen.getByRole('button', { name: strings.header.themeToDark }));
      expect(startViewTransition).toHaveBeenCalledOnce();
      expect(document.documentElement.dataset.theme).toBe('dark');
      expect(document.documentElement).not.toHaveClass('theme-fade');
      expect(
        await screen.findByRole('button', { name: strings.header.themeToLight }),
      ).toBeInTheDocument();
    } finally {
      Reflect.deleteProperty(document, 'startViewTransition');
    }
  });

  it('blends every colour instead where view transitions are missing', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: strings.header.themeToDark }));
    expect(document.documentElement).toHaveClass('theme-fade');
    await waitFor(() => expect(document.documentElement).not.toHaveClass('theme-fade'));
  });

  it('starts from the theme applied before the first paint', () => {
    document.documentElement.dataset.theme = 'dark';
    render(<App />);
    expect(screen.getByRole('button', { name: strings.header.themeToLight })).toBeInTheDocument();
  });
});
