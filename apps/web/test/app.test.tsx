import { ARCHITECTURE_TEMPLATES, NODE_CATALOG, isContainerKind } from '@archdraft/core';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { App } from '../src/App.tsx';
import { strings } from '../src/strings.ts';

describe('App', () => {
  it('renders the header, both side panels and the diagram', () => {
    render(<App />);
    expect(screen.getByRole('heading', { level: 1, name: strings.appName })).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: strings.panes.build })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: strings.canvas.label })).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: strings.panes.details })).toBeInTheDocument();
  });

  it('has a labelled description field and a generate button that is disabled for now', () => {
    render(<App />);
    expect(screen.getByRole('textbox', { name: strings.prompt.label })).toHaveAccessibleDescription(
      strings.prompt.hint,
    );
    expect(screen.getByRole('button', { name: strings.prompt.generate })).toBeDisabled();
  });

  it('shows the default template in the title block', () => {
    const graph = ARCHITECTURE_TEMPLATES['three-tier-web'];
    render(<App />);
    const titleBlock = screen.getByRole('region', { name: graph.title });
    const components = graph.nodes.filter((node) => !isContainerKind(node.kind)).length;
    expect(within(titleBlock).getByText('AWS')).toBeInTheDocument();
    expect(within(titleBlock).getByText(String(components))).toBeInTheDocument();
    expect(within(titleBlock).getByText(String(graph.edges.length))).toBeInTheDocument();
  });

  it('lists every kind of the catalog in the palette', () => {
    render(<App />);
    const palette = screen.getByRole('region', { name: strings.palette.title });
    for (const definition of Object.values(NODE_CATALOG)) {
      expect(within(palette).getByText(definition.label)).toBeInTheDocument();
    }
  });

  it('switches the details tabs with the mouse and the keyboard', async () => {
    const user = userEvent.setup();
    render(<App />);
    const inspector = screen.getByRole('tab', { name: strings.details.inspector });
    const review = screen.getByRole('tab', { name: strings.details.review });
    expect(inspector).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText(strings.details.inspectorEmpty)).toBeVisible();

    await user.click(review);
    expect(review).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText(strings.details.reviewEmpty)).toBeVisible();
    expect(screen.getByText(strings.details.inspectorEmpty)).not.toBeVisible();

    await user.keyboard('{ArrowRight}');
    expect(inspector).toHaveAttribute('aria-selected', 'true');
    expect(inspector).toHaveFocus();

    await user.keyboard('{End}');
    expect(review).toHaveFocus();
    await user.keyboard('{Home}');
    expect(inspector).toHaveFocus();
    await user.keyboard('{ArrowLeft}');
    expect(review).toHaveFocus();
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

  it('marks the pane chosen in the small-screen switcher', async () => {
    const user = userEvent.setup();
    render(<App />);
    const switcher = screen.getByRole('navigation', { name: strings.panes.switcher });
    const diagram = within(switcher).getByRole('button', { name: strings.panes.diagram });
    const build = within(switcher).getByRole('button', { name: strings.panes.build });
    expect(diagram).toHaveAttribute('aria-pressed', 'true');

    await user.click(build);
    expect(build).toHaveAttribute('aria-pressed', 'true');
    expect(diagram).toHaveAttribute('aria-pressed', 'false');
  });
});
