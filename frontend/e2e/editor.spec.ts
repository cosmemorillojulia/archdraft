import { readFile } from 'node:fs/promises';
import {
  type ArchitectureGraph,
  ARCHITECTURE_TEMPLATES,
  type AssistResult,
  AssistResultSchema,
  problemType,
} from '@archdraft/shared';
import {
  card,
  diagram,
  expect,
  node,
  openBlankDiagram,
  openGraph,
  openTemplate,
  SHOP_WITH_ISSUES,
  test,
} from './fixtures.ts';

test('opens a template from the New menu', async ({ editor }) => {
  await openTemplate(editor, 'Serverless API');

  await expect(diagram(editor, 'Serverless REST API')).toBeVisible();
  await expect(node(editor, 'REST API, Amazon API Gateway')).toBeVisible();
  await expect(card(editor)).toContainText('Serverless REST API');
});

test('adds two components, connects them and shows the finding in the review', async ({
  editor,
}) => {
  await openBlankDiagram(editor);
  await expect(diagram(editor, 'Untitled diagram')).toBeVisible();

  await editor.getByRole('button', { name: 'Show components' }).click();
  const components = editor.getByRole('region', { name: 'Components' });
  // With the mouse, a tile follows the pointer until a click on the diagram places it.
  await components.getByRole('button', { name: 'Add User' }).click();
  await editor.getByRole('main', { name: 'Diagram' }).click({ position: { x: 420, y: 200 } });
  await expect(node(editor, 'User')).toBeVisible();
  // From the keyboard, a tile adds the component at the centre of the view.
  await components.getByRole('button', { name: 'Add Service' }).press('Enter');
  await expect(card(editor)).toContainText(/2\s*components/);

  await node(editor, 'User').click();
  // The inspector of the service slides out as the one of the user comes in.
  const connect = editor.getByRole('button', { name: 'Connect', exact: true });
  await expect(connect).toHaveCount(1);
  await connect.click();
  await expect(editor.getByText('Choose a component to connect')).toBeVisible();
  await node(editor, 'Service').click();

  await expect(card(editor)).toContainText(/1\s*connection(?!s)/);
  await expect(diagram(editor).getByRole('group', { name: /^Edge from / })).toHaveCount(1);

  // A user calling a service directly, with nothing in front of it.
  await card(editor)
    .getByRole('button', { name: /design issues?$/ })
    .click();
  const review = editor.getByRole('region', { name: 'Design review' });
  await expect(review).toBeVisible();
  await expect(review).toContainText('"User" calls "Service" directly');
});

test('downloads and copies the diagram as Mermaid', async ({ editor, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await editor.getByRole('button', { name: 'Share' }).click();
  const share = editor.getByRole('dialog', { name: 'Share and export' });

  const downloading = editor.waitForEvent('download');
  await share.getByRole('button', { name: 'Download Mermaid' }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe('three-tier-web-application.mmd');
  const file = await readFile(await download.path(), 'utf8');
  expect(file).toContain('flowchart LR');
  expect(file).toContain('Load balancer');

  await share.getByRole('button', { name: 'Copy Mermaid' }).click();
  await expect(share.getByRole('button', { name: 'Mermaid copied' })).toBeVisible();
  const copied = await editor.evaluate(() => navigator.clipboard.readText());
  expect(copied).toBe(file);
});

test('shares a link that opens the same diagram in another browser', async ({
  editor,
  browser,
}) => {
  await openTemplate(editor, 'RAG chatbot');
  await editor.getByRole('button', { name: 'Share' }).click();
  const field = editor.getByRole('textbox', { name: 'Link to this diagram' });
  await expect(field).toHaveValue(/#d=/);
  const link = await field.inputValue();

  // Another browser has nothing saved: what it shows can only come from the link.
  const other = await browser.newContext({ locale: 'en-US' });
  const page = await other.newPage();
  await page.goto(link);
  await expect(diagram(page, ARCHITECTURE_TEMPLATES['rag-chatbot'].title)).toBeVisible();
  await expect(card(page)).toContainText(ARCHITECTURE_TEMPLATES['rag-chatbot'].title);
  // Reloading opens the work saved in this browser, not the link again.
  await expect(page).not.toHaveURL(/#d=/);
  await other.close();
});

/** What the API answers to a description, as the backend would: the template, validated. */
function generated(): AssistResult {
  const graph = ARCHITECTURE_TEMPLATES['serverless-api'];
  return AssistResultSchema.parse({
    task: 'generate',
    proposals: [
      {
        title: graph.title,
        rationale: 'Functions behind an API gateway, with a managed table.',
        graph,
        changes: {
          diagram: true,
          nodes: { added: graph.nodes.map((item) => item.id), updated: [], removed: [] },
          edges: { added: graph.edges.map((item) => item.id), updated: [], removed: [] },
        },
      },
    ],
    attempts: 1,
    warnings: [],
  });
}

test('generates a diagram from a description with the assistant', async ({ editor }) => {
  const requests: unknown[] = [];
  await editor.route('**/api/v1/assist', async (route) => {
    requests.push(route.request().postDataJSON());
    await route.fulfill({ json: generated() });
  });
  await openBlankDiagram(editor);

  const prompt = editor.getByRole('textbox', { name: 'Describe your architecture' });
  await prompt.fill('A serverless API with a database');
  await prompt.press('Enter');

  await expect(diagram(editor, 'Serverless REST API')).toBeVisible();
  await expect(node(editor, 'REST API, Amazon API Gateway')).toBeVisible();
  expect(requests).toEqual([
    expect.objectContaining({ task: 'generate', prompt: 'A serverless API with a database' }),
  ]);
  // Undo brings back the blank diagram.
  await editor.getByRole('banner').getByRole('button', { name: 'Undo' }).click();
  await expect(diagram(editor, 'Untitled diagram')).toBeVisible();
});

test('says how long to wait when the assistant reached its limit', async ({ editor }) => {
  await editor.route('**/api/v1/assist', (route) =>
    route.fulfill({
      status: 429,
      headers: { 'Retry-After': '120' },
      contentType: 'application/problem+json',
      json: { type: problemType('rate-limited'), title: 'Too many requests', status: 429 },
    }),
  );
  await openBlankDiagram(editor);

  const prompt = editor.getByRole('textbox', { name: 'Describe your architecture' });
  await prompt.fill('A serverless API');
  await prompt.press('Enter');

  await expect(editor.getByText('Try again in 2 minutes.')).toBeVisible();
  await expect(diagram(editor, 'Untitled diagram')).toBeVisible();
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('opens the diagram clear of the canvas controls', async ({ editor }) => {
    const controls = await editor.getByRole('group', { name: 'View' }).boundingBox();
    if (controls === null) throw new Error('The canvas controls are not on the page.');
    // Every component and group ends left of the column of controls on the right edge.
    await expect
      .poll(async () => {
        // The controls are groups inside the diagram too; only React Flow's nodes count here.
        const boxes = await diagram(editor)
          .locator('.react-flow__node')
          .evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect()));
        return boxes.length > 0 ? Math.max(...boxes.map((box) => box.right)) : Infinity;
      })
      .toBeLessThanOrEqual(controls.x);
  });

  test('hides the canvas controls while the design review covers them', async ({ editor }) => {
    const view = editor.getByRole('group', { name: 'View' });
    const review = editor.getByRole('region', { name: 'Design review' });
    await card(editor)
      .getByRole('button', { name: /design issues?$/ })
      .click();
    await expect(review).toBeVisible();
    await expect(view).toBeHidden();
    await review.getByRole('button', { name: 'Close' }).click();
    await expect(view).toBeVisible();
  });

  test('keeps the diagram and a chosen finding above the design review sheet', async ({
    editor,
  }) => {
    const review = editor.getByRole('region', { name: 'Design review' });
    /** Space between the bottom of a box on the canvas and the top of the review sheet. */
    const clearance = async (box: ReturnType<typeof node>) => {
      const [drawn, sheet] = await Promise.all([box.boundingBox(), review.boundingBox()]);
      return drawn && sheet ? sheet.y - (drawn.y + drawn.height) : -1;
    };
    await openGraph(editor, SHOP_WITH_ISSUES);
    await card(editor).getByRole('button', { name: '7 design issues' }).click();
    await expect(review).toBeVisible();
    // The whole diagram is fitted again above the sheet; the lowest components show it.
    await expect.poll(() => clearance(node(editor, 'Orders DB, Amazon RDS'))).toBeGreaterThan(0);

    // A finding further down the list brings its component into view, above the sheet too.
    await review.getByText('"Reports job" has no connections').click();
    await expect.poll(() => clearance(node(editor, 'Reports job, Amazon ECS'))).toBeGreaterThan(0);
  });

  test('folds the proposals into a strip that leaves the preview and the controls in view', async ({
    editor,
  }) => {
    // One proposal that renames the first component of the diagram it is sent.
    await editor.route('**/api/v1/assist', async (route) => {
      const { graph } = route.request().postDataJSON() as { graph: ArchitectureGraph };
      const [first, ...rest] = graph.nodes;
      if (first === undefined) throw new Error('The diagram sent to the assistant is empty.');
      await route.fulfill({
        json: AssistResultSchema.parse({
          task: 'improve',
          proposals: [
            {
              title: 'Name the entry point',
              rationale: 'Says who comes in.',
              graph: { ...graph, nodes: [{ ...first, label: 'Visitors' }, ...rest] },
              changes: {
                diagram: false,
                nodes: { added: [], updated: [first.id], removed: [] },
                edges: { added: [], updated: [], removed: [] },
              },
            },
          ],
          attempts: 1,
          warnings: [],
        }),
      });
    });
    await editor.getByRole('button', { name: 'Assistant' }).click();
    await editor.getByRole('menuitem', { name: /Suggest improvements/ }).click();

    const strip = editor.getByRole('region', { name: 'Name the entry point' });
    const legend = editor.getByRole('status').filter({ hasText: 'Preview, not applied yet' });
    const view = editor.getByRole('group', { name: 'View' });
    await expect(strip.getByRole('button', { name: 'Apply Name the entry point' })).toBeVisible();
    // The prompt, with a legend of its own, may still be on its way out.
    await expect(legend).toHaveCount(1);
    await expect(legend).toBeVisible();
    await expect(view).toBeVisible();
    // The controls end above the legend, which stands above the strip.
    await expect
      .poll(async () => {
        const [controls, above] = await Promise.all([view.boundingBox(), legend.boundingBox()]);
        return controls && above ? above.y - (controls.y + controls.height) : -1;
      })
      .toBeGreaterThanOrEqual(0);

    await editor.getByRole('button', { name: 'Show every proposal' }).click();
    await expect(editor.getByText('Says who comes in.')).toBeVisible();
    await expect(view).toBeHidden();
    await editor.getByRole('button', { name: 'Hide the proposals' }).click();
    await expect(view).toBeVisible();
  });
});
