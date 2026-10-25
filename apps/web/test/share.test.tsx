import {
  ARCHITECTURE_TEMPLATES,
  DEFAULT_NODE_SIZE,
  type DiagramDocument,
  documentToJson,
  toDrawio,
  toMermaid,
} from '@archdraft/core';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App.tsx';
import { editorStore } from '../src/editor/store.ts';
import { SAVED_DOCUMENT_KEY } from '../src/persist/autosave.ts';
import { decodeDocument, encodeDocument, linkPayload } from '../src/persist/share-link.ts';
import { en as strings } from '../src/i18n/en.ts';

const document: DiagramDocument = {
  graph: {
    schemaVersion: 1,
    title: 'Shared diagram',
    provider: 'gcp',
    nodes: [
      { id: 'user', kind: 'user', label: 'User' },
      { id: 'api', kind: 'service', label: 'Orders API' },
    ],
    edges: [{ id: 'user-api', source: 'user', target: 'api', protocol: 'https' }],
  },
  layout: {
    positions: { user: { x: 0, y: 0 }, api: { x: 300, y: 0 } },
    sizes: { user: DEFAULT_NODE_SIZE, api: DEFAULT_NODE_SIZE },
  },
};

const diagramNamed = (title: string) =>
  screen.findByRole('group', { name: strings.canvas.diagramLabel(title) });

afterEach(() => {
  window.history.replaceState(null, '', '/');
  vi.restoreAllMocks();
});

describe('opening the editor', () => {
  it('restores the diagram saved in this browser', async () => {
    localStorage.setItem(SAVED_DOCUMENT_KEY, documentToJson(document));
    render(<App />);
    expect(await diagramNamed('Shared diagram')).toBeInTheDocument();
  });

  it('opens the diagram of a shared link and takes it out of the address', async () => {
    window.history.replaceState(null, '', `/#d=${await encodeDocument(document)}`);
    render(<App />);
    expect(await diagramNamed('Shared diagram')).toBeInTheDocument();
    await waitFor(() => expect(window.location.hash).toBe(''));
  });

  it('explains a manipulated link and opens the default template instead', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    window.history.replaceState(null, '', '/#d=bm90LWEtZGlhZ3JhbQ');
    render(<App />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/^This link could not be opened\./);
    expect(await diagramNamed(ARCHITECTURE_TEMPLATES['three-tier-web'].title)).toBeInTheDocument();
  });

  it('saves edits in this browser', async () => {
    render(<App />);
    await diagramNamed(ARCHITECTURE_TEMPLATES['three-tier-web'].title);
    editorStore.getState().updateNode('app', { label: 'Storefront' });
    await waitFor(() => expect(localStorage.getItem(SAVED_DOCUMENT_KEY)).toContain('Storefront'));
  });
});

describe('share menu', () => {
  async function openMenu() {
    const user = userEvent.setup();
    localStorage.setItem(SAVED_DOCUMENT_KEY, documentToJson(document));
    render(<App />);
    await diagramNamed('Shared diagram');
    await user.click(screen.getByRole('button', { name: strings.share.open }));
    const dialog = screen.getByRole('dialog', { name: strings.share.title });
    return { user, dialog };
  }

  it('offers a link that opens the same diagram', async () => {
    const { dialog } = await openMenu();
    const field = within(dialog).getByLabelText(strings.share.link);
    await waitFor(() => expect(field).not.toHaveValue(strings.share.creating));
    const link = (field as HTMLInputElement).value;
    expect(link.startsWith(`${window.location.origin}/#d=`)).toBe(true);
    const payload = linkPayload(link.slice(link.indexOf('#')));
    expect(await decodeDocument(payload ?? '')).toBe(documentToJson(document, { indent: 0 }));
    expect(within(dialog).queryByText(/characters long/)).not.toBeInTheDocument();
  });

  it('copies the link', async () => {
    const { user, dialog } = await openMenu();
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const copy = within(dialog).getByRole('button', { name: strings.share.copy });
    await waitFor(() => expect(copy).toBeEnabled());
    await user.click(copy);
    expect(writeText).toHaveBeenCalledWith(
      within(dialog).getByLabelText<HTMLInputElement>(strings.share.link).value,
    );
    expect(within(dialog).getByRole('button', { name: strings.share.copied })).toBeInTheDocument();
  });

  it('downloads the diagram as a JSON file', async () => {
    const { user, dialog } = await openMenu();
    const createObjectURL = vi.fn((_blob: Blob) => 'blob:diagram');
    Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() });
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    await user.click(within(dialog).getByRole('button', { name: strings.share.download }));
    expect(click).toHaveBeenCalledOnce();
    const anchor = click.mock.contexts[0] as HTMLAnchorElement;
    expect(anchor.download).toBe('shared-diagram.archdraft.json');
    const blob = createObjectURL.mock.calls[0]?.[0];
    expect(await blob?.text()).toBe(documentToJson(document));
  });

  it('copies the diagram as Mermaid, in the direction it is drawn', async () => {
    const { user, dialog } = await openMenu();
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    await user.click(within(dialog).getByRole('button', { name: strings.share.copyMermaid }));
    expect(writeText).toHaveBeenCalledWith(toMermaid(document.graph, { direction: 'LR' }));
    expect(
      within(dialog).getByRole('button', { name: strings.share.mermaidCopied }),
    ).toBeInTheDocument();
  });

  it('downloads Mermaid, draw.io and SVG files named after the diagram', async () => {
    const { user, dialog } = await openMenu();
    const createObjectURL = vi.fn((_blob: Blob) => 'blob:export');
    Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() });
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    const downloaded = async (format: 'mermaid' | 'drawio' | 'svg') => {
      const name = strings.share.downloadAs(strings.share.formats[format]);
      await user.click(within(dialog).getByRole('button', { name }));
      await waitFor(() => expect(click).toHaveBeenCalledTimes(createObjectURL.mock.calls.length));
      const anchor = click.mock.contexts.at(-1) as HTMLAnchorElement;
      const blob = createObjectURL.mock.calls.at(-1)?.[0];
      return { name: anchor.download, text: (await blob?.text()) ?? '' };
    };

    const mermaid = await downloaded('mermaid');
    expect(mermaid.name).toBe('shared-diagram.mmd');
    expect(mermaid.text).toBe(toMermaid(document.graph, { direction: 'LR' }));

    const drawio = await downloaded('drawio');
    expect(drawio.name).toBe('shared-diagram.drawio');
    expect(drawio.text).toBe(toDrawio(document.graph, document.layout));

    const svg = await downloaded('svg');
    expect(svg.name).toBe('shared-diagram.svg');
    expect(svg.text.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(svg.text).toContain('>Orders API<');
  });

  it('says so when an image cannot be created', async () => {
    const { user, dialog } = await openMenu();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    // jsdom cannot decode images, as a browser that fails would not.
    await user.click(
      within(dialog).getByRole('button', {
        name: strings.share.downloadAs(strings.share.formats.png),
      }),
    );
    expect(await within(dialog).findByText(strings.share.exportFailed)).toBeInTheDocument();
  });

  it('opens a JSON file in place of the diagram', async () => {
    const { user, dialog } = await openMenu();
    const graph = { ...document.graph, title: 'From a file' };
    const file = new File([JSON.stringify(graph)], 'from-a-file.json', {
      type: 'application/json',
    });
    await user.upload(within(dialog).getByLabelText(strings.share.openFile), file);
    expect(await diagramNamed('From a file')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('closes with Escape and gives the focus back', async () => {
    const { user } = await openMenu();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: strings.share.open })).toHaveFocus();
  });
});
