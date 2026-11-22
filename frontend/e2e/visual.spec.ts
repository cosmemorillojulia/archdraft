import type { Page } from '@playwright/test';
import {
  answerWithImprovement,
  card,
  expect,
  openBlankDiagram,
  openGraph,
  settled,
  SHOP_WITH_ISSUES,
  test,
} from './fixtures.ts';

/**
 * Visual regression of the key screens (docs/modulos/web.md, Regresión visual). Each test
 * compares the page with a reference image in `e2e/__screenshots__`; after an intended change
 * of the design, the images are made again with `pnpm test:e2e --update-snapshots` and reviewed
 * in the diff like any other change.
 *
 * The `visual` project (playwright.config.ts) asks for reduced motion, so the diagram appears
 * at once and the connections carry no particles, and renders text without hinting, so that
 * small differences between machines stay below the tolerance.
 */

async function expectScreen(page: Page, name: string): Promise<void> {
  await settled(page);
  await expect(page).toHaveScreenshot(name);
}

test.describe('on a wide screen', () => {
  test('the editor with the default template', async ({ editor }) => {
    await expectScreen(editor, 'editor.png');
  });

  test('the design review beside the diagram', async ({ editor }) => {
    await card(editor)
      .getByRole('button', { name: /design issues?$/ })
      .click();
    await expect(editor.getByRole('region', { name: 'Design review' })).toBeVisible();
    await expectScreen(editor, 'review.png');
  });

  test('a proposal of the assistant, previewed on the diagram', async ({ editor }) => {
    await editor.route('**/api/v1/assist', answerWithImprovement);
    await editor.getByRole('button', { name: 'Assistant' }).click();
    await editor.getByRole('menuitem', { name: /Suggest improvements/ }).click();
    await expect(editor.getByText('Preview, not applied yet')).toBeVisible();
    await expectScreen(editor, 'proposal.png');
  });

  test('the template gallery', async ({ editor }) => {
    await editor.getByRole('button', { name: 'New', exact: true }).click();
    await editor.getByRole('menuitem', { name: 'Template gallery' }).click();
    await expect(editor.getByRole('dialog', { name: 'Start from a template' })).toBeVisible();
    await expectScreen(editor, 'gallery.png');
  });

  test('an empty diagram', async ({ editor }) => {
    await openBlankDiagram(editor);
    await expect(editor.getByText('Start your diagram')).toBeVisible();
    await expectScreen(editor, 'empty.png');
  });
});

test.describe('in the dark theme', () => {
  test.use({ colorScheme: 'dark' });

  test('the editor with the components panel open', async ({ editor }) => {
    await editor.getByRole('button', { name: 'Show components' }).click();
    await expect(editor.getByRole('searchbox', { name: 'Search components' })).toBeVisible();
    await expectScreen(editor, 'components-dark.png');
  });
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('the editor', async ({ editor }) => {
    await expectScreen(editor, 'phone-editor.png');
  });

  test('a proposal of the assistant, with the panel folded', async ({ editor }) => {
    await editor.route('**/api/v1/assist', answerWithImprovement);
    await editor.getByRole('button', { name: 'Assistant' }).click();
    await editor.getByRole('menuitem', { name: /Suggest improvements/ }).click();
    await expect(editor.getByRole('region', { name: 'Cache the hottest reads' })).toBeVisible();
    await expect(editor.getByText('Preview, not applied yet')).toHaveCount(1);
    await expectScreen(editor, 'phone-proposal.png');
  });

  test.describe('in the dark theme', () => {
    test.use({ colorScheme: 'dark' });

    test('the design review sheet, with findings of every severity', async ({ editor }) => {
      await openGraph(editor, SHOP_WITH_ISSUES);
      await card(editor).getByRole('button', { name: '7 design issues' }).click();
      await expect(editor.getByRole('region', { name: 'Design review' })).toBeVisible();
      await expectScreen(editor, 'phone-review-dark.png');
    });

    test('the components sheet', async ({ editor }) => {
      await editor.getByRole('button', { name: 'Show components' }).click();
      await expect(editor.getByRole('searchbox', { name: 'Search components' })).toBeVisible();
      await expectScreen(editor, 'phone-components-dark.png');
    });
  });
});
