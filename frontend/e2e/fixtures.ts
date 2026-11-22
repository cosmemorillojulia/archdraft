import type { ArchitectureGraph } from '@archdraft/shared';
import { expect, test as base, type Page, type Route } from '@playwright/test';

/**
 * `test` with a page that fails the test on any uncaught error or `console.error`, and opens
 * the editor with nothing saved: every test starts from the default template.
 */
export const test = base.extend<{ editor: Page }>({
  editor: async ({ page }, provide) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      // Answers with an error status are part of some tests; the browser logs each one.
      if (message.type() === 'error' && !message.text().startsWith('Failed to load resource')) {
        errors.push(message.text());
      }
    });
    await page.goto('./');
    await expect(diagram(page)).toBeVisible();
    await provide(page);
    expect(errors, 'errors in the page').toEqual([]);
  },
});

export { expect };

/** The diagram drawn on the canvas, named after its title. */
export function diagram(page: Page, title?: string) {
  return page.getByRole('group', {
    name: title === undefined ? /^Diagram: / : `Diagram: ${title}`,
  });
}

/** A component or group on the canvas, by its accessible name ("Name, product"). */
export function node(page: Page, name: string) {
  return diagram(page).getByRole('group', { name, exact: true });
}

/** The diagram card, with the title, the counts and the review status. */
export function card(page: Page) {
  return page.getByRole('region', { name: /^Diagram name: / });
}

function newMenu(page: Page) {
  return page.getByRole('menu', { name: 'New' });
}

/** Opens a template, by its short name, from the New menu of the header. */
export async function openTemplate(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await newMenu(page).getByRole('menuitemradio', { name }).click();
}

/** Opens an empty diagram from the New menu of the header. */
export async function openBlankDiagram(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await newMenu(page).getByRole('menuitem', { name: 'Blank diagram' }).click();
}

/**
 * A small shop with findings of the three severities: a database called by its clients (error),
 * a single replica, a direct entry, one zone and no encryption (warnings), and a cache of unknown
 * zones and a component with no connections (notes).
 */
export const SHOP_WITH_ISSUES: ArchitectureGraph = {
  schemaVersion: 1,
  title: 'Shop with design issues',
  provider: 'aws',
  nodes: [
    { id: 'shopper', kind: 'user', label: 'Shopper' },
    { id: 'api', kind: 'service', label: 'Orders API', attributes: { replicas: 1 } },
    {
      id: 'db',
      kind: 'relational-db',
      label: 'Orders DB',
      attributes: { multiAz: false, encryptedAtRest: false },
    },
    { id: 'cache', kind: 'cache', label: 'Session cache' },
    { id: 'reports', kind: 'service', label: 'Reports job' },
  ],
  edges: [
    { id: 'shopper-api', source: 'shopper', target: 'api', label: 'HTTPS' },
    { id: 'api-db', source: 'api', target: 'db' },
    { id: 'shopper-db', source: 'shopper', target: 'db' },
    { id: 'api-cache', source: 'api', target: 'cache' },
  ],
};

/** Opens `graph` as an Archdraft JSON file, from the share menu of the header. */
export async function openGraph(page: Page, graph: ArchitectureGraph): Promise<void> {
  await page.getByRole('button', { name: 'Share' }).click();
  await page.getByLabel('Open or import a file').setInputFiles({
    name: 'diagram.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(graph)),
  });
  await expect(diagram(page, graph.title)).toBeVisible();
}

/** Answers "Suggest improvements" with one proposal that adds a cache next to the first component. */
export async function answerWithImprovement(route: Route): Promise<void> {
  const { graph } = route.request().postDataJSON() as {
    graph: { nodes: { id: string }[]; edges: object[] };
  };
  const [first] = graph.nodes;
  if (first === undefined) throw new Error('The diagram sent to the assistant has no components.');
  const improved = {
    ...graph,
    nodes: [...graph.nodes, { id: 'cache-1', kind: 'cache', label: 'Cache' }],
    edges: [...graph.edges, { id: 'cache-edge', source: first.id, target: 'cache-1' }],
  };
  await route.fulfill({
    json: {
      task: 'improve',
      attempts: 1,
      warnings: [],
      proposals: [
        {
          title: 'Cache the hottest reads',
          rationale: 'Most requests read the same records; a cache cuts latency and load.',
          assumptions: ['The data can be a few seconds stale.'],
          graph: improved,
          changes: {
            diagram: false,
            nodes: { added: ['cache-1'], updated: [], removed: [] },
            edges: { added: ['cache-edge'], updated: [], removed: [] },
          },
        },
      ],
    },
  });
}

/** Waits for the glides of the view and the entrances of panels to end before a screenshot. */
export async function settled(page: Page): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .every(
        (animation) =>
          animation.playState !== 'running' ||
          animation.effect?.getComputedTiming().endTime === Infinity,
      ),
  );
  // React Flow glides the view with a timer, not with the Web Animations API.
  await page.waitForTimeout(600);
}
