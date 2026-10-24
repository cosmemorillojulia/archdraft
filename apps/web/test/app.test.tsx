import { ARCHITECTURE_TEMPLATES, NODE_CATALOG } from '@archdraft/core';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { App } from '../src/App.tsx';
import { strings } from '../src/strings.ts';

describe('App', () => {
  it('shows the product, the current diagram and its review status', async () => {
    render(<App />);
    const graph = ARCHITECTURE_TEMPLATES['three-tier-web'];
    expect(screen.getByRole('heading', { level: 1, name: strings.appName })).toBeInTheDocument();
    expect(screen.getByRole('banner')).toHaveTextContent(graph.title);
    expect(screen.getByRole('status')).toHaveTextContent(strings.review.clean);
    expect(
      await screen.findByRole('img', { name: strings.canvas.diagramLabel(graph.title) }),
    ).toBeInTheDocument();
  });

  it('draws every component of the diagram', async () => {
    render(<App />);
    const graph = ARCHITECTURE_TEMPLATES['three-tier-web'];
    const diagram = await screen.findByRole('img', {
      name: strings.canvas.diagramLabel(graph.title),
    });
    expect(within(diagram).getByText('Web application')).toBeInTheDocument();
    expect(within(diagram).getByText('Amazon Aurora')).toBeInTheDocument();
  });

  it('switches the diagram from the template chips', async () => {
    const user = userEvent.setup();
    render(<App />);
    const templates = screen.getByRole('group', { name: strings.prompt.templates });
    const rag = within(templates).getByRole('button', {
      name: strings.prompt.templateNames['rag-chatbot'],
    });

    await user.click(rag);
    const graph = ARCHITECTURE_TEMPLATES['rag-chatbot'];
    expect(rag).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('banner')).toHaveTextContent(graph.title);
    expect(
      await screen.findByRole('img', { name: strings.canvas.diagramLabel(graph.title) }),
    ).toBeInTheDocument();
  });

  it('has a labelled prompt whose generate button explains that it is not available yet', () => {
    render(<App />);
    expect(screen.getByRole('textbox', { name: strings.prompt.label })).toHaveAccessibleDescription(
      strings.prompt.soon,
    );
    expect(screen.getByRole('button', { name: strings.prompt.generate })).toBeDisabled();
  });

  it('lists every kind of the catalog in the palette', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: strings.components.open }));
    const palette = screen.getByRole('region', { name: strings.components.title });
    for (const definition of Object.values(NODE_CATALOG)) {
      expect(within(palette).getByText(definition.label)).toBeInTheDocument();
    }
  });

  it('filters the palette and says when nothing matches', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: strings.components.open }));
    const palette = screen.getByRole('region', { name: strings.components.title });
    const search = within(palette).getByRole('searchbox', { name: strings.components.search });

    await user.type(search, 'data');
    expect(within(palette).getByText('Relational database')).toBeInTheDocument();
    expect(within(palette).queryByText('Function')).not.toBeInTheDocument();

    await user.clear(search);
    await user.type(search, 'zzz');
    expect(within(palette).getByText(strings.components.noMatches('zzz'))).toBeInTheDocument();
  });

  it('hides and shows the palette', async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(
      screen.queryByRole('region', { name: strings.components.title }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: strings.components.open }));
    expect(screen.getByRole('region', { name: strings.components.title })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: strings.components.close }));
    expect(
      screen.queryByRole('region', { name: strings.components.title }),
    ).not.toBeInTheDocument();
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
