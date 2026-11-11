import { readFile } from 'node:fs/promises';
import {
  ARCHITECTURE_TEMPLATES,
  type AssistResult,
  AssistResultSchema,
  problemType,
} from '@archdraft/shared';
import { card, diagram, expect, node, openBlankDiagram, openTemplate, test } from './fixtures.ts';

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
