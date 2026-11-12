import { DEFAULT_NODE_SIZE, type DiagramDocument, documentToJson } from '@archdraft/shared';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App.tsx';
import { en as strings } from '../src/i18n/en.ts';
import { SAVED_DOCUMENT_KEY } from '../src/persist/autosave.ts';

// The modules the editor downloads on demand (T22), as when the network fails.
vi.mock('../src/export/save.ts', () => Promise.reject(new Error('offline')));
vi.mock('../src/editor/foreign-formats.ts', () => Promise.reject(new Error('offline')));

const document: DiagramDocument = {
  graph: {
    schemaVersion: 1,
    title: 'Offline diagram',
    provider: 'aws',
    nodes: [{ id: 'api', kind: 'service', label: 'Orders API' }],
    edges: [],
  },
  layout: { positions: { api: { x: 0, y: 0 } }, sizes: { api: DEFAULT_NODE_SIZE } },
};

async function openMenu() {
  const user = userEvent.setup();
  localStorage.setItem(SAVED_DOCUMENT_KEY, documentToJson(document));
  render(<App />);
  await screen.findByRole('group', { name: strings.canvas.diagramLabel('Offline diagram') });
  await user.click(screen.getByRole('button', { name: strings.share.open }));
  return { user, dialog: screen.getByRole('dialog', { name: strings.share.title }) };
}

describe('modules loaded on demand', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('keeps the exports off and says why when the exporters cannot be downloaded', async () => {
    const { dialog } = await openMenu();
    expect(await within(dialog).findByText(strings.share.exportersFailed)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: strings.share.copyMermaid })).toBeDisabled();
    expect(
      within(dialog).getByRole('button', {
        name: strings.share.downloadAs(strings.share.formats.drawio),
      }),
    ).toBeDisabled();
  });

  it('says why a Mermaid file cannot be opened when its reader cannot be downloaded', async () => {
    const { user, dialog } = await openMenu();
    const file = new File(['flowchart LR\n  a --> b'], 'flow.mmd', { type: 'text/plain' });
    await user.upload(within(dialog).getByLabelText(strings.share.openFile), file);
    expect(
      await screen.findByText(strings.persist.openFailed.file(strings.persist.readersFailed)),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('group', { name: strings.canvas.diagramLabel('Offline diagram') }),
    ).toBeInTheDocument();
  });
});
