import { ARCHITECTURE_TEMPLATES, TEMPLATE_IDS } from '@archdraft/shared';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../src/App.tsx';
import { assistantStore } from '../src/ai/assistant-store.ts';
import { openBlank } from '../src/editor/open-document.ts';
import { editorStore } from '../src/editor/store.ts';
import { en as strings } from '../src/i18n/en.ts';
import { SOURCE_URL } from '../src/onboarding/AboutDialog.tsx';
import { dialogStore } from '../src/onboarding/dialog-store.ts';

/** The editor with its first diagram open. */
async function openEditor() {
  const user = userEvent.setup();
  render(<App />);
  await screen.findByRole('group', {
    name: `Diagram: ${ARCHITECTURE_TEMPLATES['three-tier-web'].title}`,
  });
  return user;
}

async function openHelp(user: ReturnType<typeof userEvent.setup>, item: string) {
  await user.click(screen.getByRole('button', { name: strings.help.label }));
  await user.click(screen.getByRole('menuitem', { name: new RegExp(item) }));
  return screen.findByRole('dialog');
}

describe('help menu and dialogs', () => {
  it('shows the keyboard shortcuts, and gives the focus back to the menu when closed', async () => {
    const user = await openEditor();
    const dialog = await openHelp(user, strings.shortcuts.open);
    expect(dialog).toHaveAccessibleName(strings.shortcuts.title);
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveFocus();
    for (const group of strings.shortcuts.groups) {
      expect(within(dialog).getByRole('heading', { name: group.title })).toBeInTheDocument();
    }
    expect(within(dialog).getByText('Ctrl/⌘ + D')).toBeInTheDocument();
    // The editor behind is out of reach while the dialog is open.
    expect(screen.getByRole('banner').closest('[inert]')).not.toBeNull();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: strings.help.label })).toHaveFocus();
    expect(screen.getByRole('banner').closest('[inert]')).toBeNull();
  });

  it('opens the shortcuts with ?, and the editor ignores its keys meanwhile', async () => {
    const user = await openEditor();
    editorStore.getState().select({ type: 'node', id: 'app' });
    await user.keyboard('?');
    const dialog = await screen.findByRole('dialog', { name: strings.shortcuts.title });
    await user.keyboard('{Delete}');
    expect(
      editorStore.getState().current?.document.graph.nodes.some((node) => node.id === 'app'),
    ).toBe(true);
    await user.click(within(dialog).getByRole('button', { name: strings.dialogs.close }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('says what Archdraft is and what happens to the diagrams', async () => {
    const user = await openEditor();
    const dialog = await openHelp(user, strings.about.open);
    expect(dialog).toHaveAccessibleName(strings.about.title);
    expect(
      within(dialog).getByRole('heading', { name: strings.about.privacyTitle }),
    ).toBeInTheDocument();
    expect(within(dialog).getAllByRole('listitem')).toHaveLength(strings.about.privacy.length);
    expect(within(dialog).getByRole('link', { name: strings.about.sourceLink })).toHaveAttribute(
      'href',
      SOURCE_URL,
    );
  });

  it('closes a dialog with a click on the backdrop', async () => {
    const user = await openEditor();
    const dialog = await openHelp(user, strings.about.open);
    const backdrop = dialog.parentElement?.querySelector('[aria-hidden="true"]');
    expect(backdrop).not.toBeNull();
    await user.click(backdrop as Element);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});

describe('template gallery', () => {
  it('describes every template and opens the one chosen', async () => {
    const user = await openEditor();
    await user.click(screen.getByRole('button', { name: strings.header.new }));
    await user.click(screen.getByRole('menuitem', { name: strings.gallery.open }));
    const gallery = await screen.findByRole('dialog', { name: strings.gallery.title });

    for (const id of TEMPLATE_IDS) {
      expect(
        within(gallery).getByRole('button', { name: new RegExp(strings.prompt.templateNames[id]) }),
      ).toBeInTheDocument();
    }
    const current = within(gallery).getByRole('button', {
      name: new RegExp(strings.prompt.templateNames['three-tier-web']),
    });
    expect(current).toHaveAttribute('aria-current', 'true');
    expect(current).toHaveTextContent(ARCHITECTURE_TEMPLATES['three-tier-web'].description);
    expect(current).toHaveTextContent(
      `${strings.providers.aws} · 10 ${strings.card.components(10)}`,
    );

    await user.click(
      within(gallery).getByRole('button', {
        name: new RegExp(strings.prompt.templateNames['rag-chatbot']),
      }),
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => expect(editorStore.getState().current?.templateId).toBe('rag-chatbot'));
  });

  it('also opens a blank diagram', async () => {
    const user = await openEditor();
    dialogStore.getState().show('templates');
    const gallery = await screen.findByRole('dialog', { name: strings.gallery.title });
    await user.click(
      within(gallery).getByRole('button', { name: new RegExp(strings.header.newDiagram) }),
    );
    expect(editorStore.getState().current?.document.graph.nodes).toEqual([]);
  });
});

describe('empty state', () => {
  it('shows only on an empty diagram, and without the assistant offers templates and components', async () => {
    const user = await openEditor();
    expect(screen.queryByRole('region', { name: strings.empty.title })).not.toBeInTheDocument();
    openBlank('TB');
    const empty = await screen.findByRole('region', { name: strings.empty.title });
    expect(empty).toHaveTextContent(strings.empty.withoutAssistant);
    expect(within(empty).queryByRole('list')).not.toBeInTheDocument();

    await user.click(within(empty).getByRole('button', { name: strings.empty.templates }));
    expect(await screen.findByRole('dialog', { name: strings.gallery.title })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await user.click(within(empty).getByRole('button', { name: strings.empty.components }));
    expect(
      await screen.findByRole('dialog', { name: strings.components.title }),
    ).toBeInTheDocument();
  });

  it('draws an example with the assistant, and goes while it works', async () => {
    vi.stubEnv('VITE_API_URL', 'https://api.test');
    const bodies: unknown[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init: RequestInit) => {
        bodies.push(JSON.parse(init.body as string));
        return new Promise<Response>(() => undefined);
      }),
    );
    const user = await openEditor();
    openBlank('TB');
    const empty = await screen.findByRole('region', { name: strings.empty.title });
    expect(empty).toHaveTextContent(strings.empty.withAssistant);
    const examples = within(empty).getByRole('list', { name: strings.empty.examples });
    const first = strings.prompt.examples[0];
    await user.click(within(examples).getByRole('button', { name: first }));

    await waitFor(() =>
      expect(bodies).toEqual([expect.objectContaining({ task: 'generate', prompt: first })]),
    );
    expect(assistantStore.getState().working).not.toBeNull();
    await waitFor(() =>
      expect(screen.queryByRole('region', { name: strings.empty.title })).not.toBeInTheDocument(),
    );
    assistantStore.getState().controller?.abort();
  });
});
