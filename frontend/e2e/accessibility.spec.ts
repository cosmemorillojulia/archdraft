import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { card, expect, node, openTemplate, test } from './fixtures.ts';

/** The WCAG 2.1 A and AA rules of axe-core. */
const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

/**
 * Serious and critical violations of WCAG 2.1 AA on the page as it is now. Minor and moderate
 * ones are left to the design reviews (docs/modulos/web.md, Accesibilidad).
 */
async function seriousViolations(page: Page) {
  // Colours caught halfway through a transition, such as the change of theme, are not the page's.
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .every(
        (animation) =>
          animation.playState !== 'running' ||
          animation.effect?.getComputedTiming().endTime === Infinity,
      ),
  );
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  return violations
    .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
    .map(({ id, impact, help, nodes }) => ({
      id,
      impact,
      help,
      targets: nodes.map((item) => item.target.join(' ')),
    }));
}

test.describe('no serious accessibility violations', () => {
  test('in the editor, light and dark', async ({ editor }) => {
    expect(await seriousViolations(editor)).toEqual([]);

    await editor.getByRole('button', { name: 'Switch to dark theme' }).click();
    await expect(editor.locator('html')).toHaveAttribute('data-theme', 'dark');
    expect(await seriousViolations(editor)).toEqual([]);
  });

  test('with the components panel open', async ({ editor }) => {
    await editor.getByRole('button', { name: 'Show components' }).click();
    await expect(editor.getByRole('searchbox', { name: 'Search components' })).toBeVisible();
    expect(await seriousViolations(editor)).toEqual([]);
  });

  test('with a component selected in the inspector', async ({ editor }) => {
    await node(editor, 'Database, Amazon Aurora').click();
    await expect(editor.getByRole('textbox', { name: 'Name', exact: true })).toBeVisible();
    expect(await seriousViolations(editor)).toEqual([]);
  });

  test('with the design review open', async ({ editor }) => {
    // The serverless template has findings to list.
    await openTemplate(editor, 'Serverless API');
    await card(editor)
      .getByRole('button', { name: /design issues?$/ })
      .click();
    await expect(editor.getByRole('region', { name: 'Design review' })).toBeVisible();
    expect(await seriousViolations(editor)).toEqual([]);
  });

  test('in the share menu', async ({ editor }) => {
    await editor.getByRole('button', { name: 'Share' }).click();
    await expect(editor.getByRole('textbox', { name: 'Link to this diagram' })).toHaveValue(/#d=/);
    expect(await seriousViolations(editor)).toEqual([]);
  });

  test('in the template gallery', async ({ editor }) => {
    await editor.getByRole('button', { name: 'New', exact: true }).click();
    await editor.getByRole('menuitem', { name: 'Template gallery' }).click();
    await expect(editor.getByRole('dialog', { name: 'Start from a template' })).toBeVisible();
    expect(await seriousViolations(editor)).toEqual([]);
  });

  test('on a phone, with the components sheet open', async ({ editor }) => {
    await editor.setViewportSize({ width: 390, height: 844 });
    expect(await seriousViolations(editor)).toEqual([]);

    await editor.getByRole('button', { name: 'Show components' }).click();
    await expect(editor.getByRole('searchbox', { name: 'Search components' })).toBeVisible();
    expect(await seriousViolations(editor)).toEqual([]);
  });
});
