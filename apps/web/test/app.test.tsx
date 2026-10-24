import { ARCHITECTURE_TEMPLATES, NODE_CATALOG, isContainerKind } from '@archdraft/core';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../src/App.tsx';
import { strings } from '../src/strings.ts';

const diagramOf = (title: string) =>
  screen.findByRole('img', { name: strings.canvas.diagramLabel(title) });

describe('App', () => {
  it('has a header with only the product name, its purpose and the settings', () => {
    render(<App />);
    const header = screen.getByRole('banner');
    expect(within(header).getByRole('heading', { level: 1 })).toHaveTextContent(strings.appName);
    expect(header).toHaveTextContent(strings.tagline);
    expect(within(header).getByRole('link', { name: strings.header.sourceCode })).toBeVisible();
    expect(header.querySelector('svg:not(.lucide)')).toBeNull();
  });

  it('summarises the current diagram in a card', () => {
    render(<App />);
    const graph = ARCHITECTURE_TEMPLATES['three-tier-web'];
    const card = screen.getByRole('region', { name: graph.title });
    const components = graph.nodes.filter((node) => !isContainerKind(node.kind)).length;
    expect(card).toHaveTextContent(`${components}${strings.card.components}`);
    expect(card).toHaveTextContent(`${graph.edges.length}${strings.card.connections}`);
    expect(within(card).getByText(strings.providers.aws)).toBeInTheDocument();
    expect(within(card).getByRole('status')).toHaveTextContent(strings.review.clean);
  });

  it('draws every component of the diagram', async () => {
    render(<App />);
    const diagram = await diagramOf(ARCHITECTURE_TEMPLATES['three-tier-web'].title);
    expect(within(diagram).getByText('Web application')).toBeInTheDocument();
    expect(within(diagram).getByText('Amazon Aurora')).toBeInTheDocument();
  });

  it('shows the labels of the connections of the component under the pointer', async () => {
    render(<App />);
    const diagram = await diagramOf(ARCHITECTURE_TEMPLATES['three-tier-web'].title);
    const node = within(diagram).getByText('Web application').closest('g[transform]');
    if (!node) throw new Error('component group not found');

    fireEvent.pointerEnter(node);
    expect(within(diagram).getByText('Read credentials')).toBeInTheDocument();
    expect(within(diagram).getByText('SQL')).toBeInTheDocument();

    fireEvent.pointerLeave(node);
    await waitFor(() =>
      expect(within(diagram).queryByText('Read credentials')).not.toBeInTheDocument(),
    );
  });

  it('switches the diagram from the template selector', async () => {
    const user = userEvent.setup();
    render(<App />);
    const templates = screen.getByRole('group', { name: strings.prompt.templates });
    const rag = within(templates).getByRole('button', {
      name: strings.prompt.templateNames['rag-chatbot'],
    });

    await user.click(rag);
    const graph = ARCHITECTURE_TEMPLATES['rag-chatbot'];
    expect(rag).toHaveAttribute('aria-pressed', 'true');
    expect(await screen.findByRole('region', { name: graph.title })).toBeInTheDocument();
    expect(await diagramOf(graph.title)).toBeInTheDocument();
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
    const palette = await screen.findByRole('region', { name: strings.components.title });
    for (const definition of Object.values(NODE_CATALOG)) {
      expect(within(palette).getByText(definition.label)).toBeInTheDocument();
    }
  });

  it('filters the palette and says when nothing matches', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: strings.components.open }));
    const palette = await screen.findByRole('region', { name: strings.components.title });
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

  it('hides and shows the palette', async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(
      screen.queryByRole('region', { name: strings.components.title }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: strings.components.open }));
    expect(
      await screen.findByRole('region', { name: strings.components.title }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: strings.components.close }));
    await waitFor(() =>
      expect(
        screen.queryByRole('region', { name: strings.components.title }),
      ).not.toBeInTheDocument(),
    );
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

  it('starts from the theme applied before the first paint', () => {
    document.documentElement.dataset.theme = 'dark';
    render(<App />);
    expect(screen.getByRole('button', { name: strings.header.themeToLight })).toBeInTheDocument();
  });
});
