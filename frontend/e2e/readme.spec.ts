import { fileURLToPath } from 'node:url';
import type { Page, Route } from '@playwright/test';
import { card, expect, openGraph, settled, SHOP_WITH_ISSUES, test } from './fixtures.ts';

/**
 * Screenshots of the README (docs/desarrollo.md, Capturas del README). They are not tests: the
 * `readme` project of playwright.config.ts only exists with `README_SCREENSHOTS` set, and
 * `pnpm --filter @archdraft/web screenshots` sets it and writes the images to `docs/capturas`.
 */

const OUTPUT = fileURLToPath(new URL('../../docs/capturas/', import.meta.url));

/** Answers "Suggest improvements" on the default template: background jobs through a queue. */
async function answerWithQueue(route: Route): Promise<void> {
  const { graph } = route.request().postDataJSON() as {
    graph: { nodes: object[]; edges: object[] };
  };
  const added = {
    nodes: [
      { id: 'jobs', kind: 'queue', label: 'Jobs queue', parentId: 'app-subnet' },
      {
        id: 'worker',
        kind: 'service',
        label: 'Worker',
        parentId: 'app-subnet',
        attributes: { replicas: 2, autoscaling: true },
      },
    ],
    edges: [
      { id: 'app-jobs', source: 'app', target: 'jobs', label: 'Slow tasks' },
      { id: 'worker-jobs', source: 'worker', target: 'jobs' },
      { id: 'worker-database', source: 'worker', target: 'database', protocol: 'sql' },
    ],
  };
  await route.fulfill({
    json: {
      task: 'improve',
      attempts: 1,
      warnings: [],
      proposals: [
        {
          title: 'Move slow work to a queue',
          rationale:
            'Requests wait for reports and emails today; a queue and a worker answer them at once.',
          assumptions: ['Reports can be ready a few seconds later.'],
          graph: {
            ...graph,
            nodes: [...graph.nodes, ...added.nodes],
            edges: [...graph.edges, ...added.edges],
          },
          changes: {
            diagram: false,
            nodes: { added: ['jobs', 'worker'], updated: [], removed: [] },
            edges: {
              added: ['app-jobs', 'worker-jobs', 'worker-database'],
              updated: [],
              removed: [],
            },
          },
        },
      ],
    },
  });
}

async function capture(page: Page, name: string): Promise<void> {
  await settled(page);
  await page.screenshot({ path: `${OUTPUT}${name}.png` });
}

test('the editor with the default template', async ({ editor }) => {
  await capture(editor, 'editor');
});

test('a proposal of the assistant, previewed on the diagram', async ({ editor }) => {
  await editor.route('**/api/v1/assist', answerWithQueue);
  await editor.getByRole('button', { name: 'Assistant' }).click();
  await editor.getByRole('menuitem', { name: /Suggest improvements/ }).click();
  await expect(editor.getByText('Preview, not applied yet')).toBeVisible();
  await capture(editor, 'propuesta');
});

test('the design review, with findings of every severity', async ({ editor }) => {
  await openGraph(editor, SHOP_WITH_ISSUES);
  await card(editor).getByRole('button', { name: '7 design issues' }).click();
  await expect(editor.getByRole('region', { name: 'Design review' })).toBeVisible();
  await capture(editor, 'revision');
});

test.describe('in the dark theme', () => {
  test.use({ colorScheme: 'dark' });

  test('the editor', async ({ editor }) => {
    await capture(editor, 'oscuro');
  });
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('the editor', async ({ editor }) => {
    await capture(editor, 'movil');
  });
});
