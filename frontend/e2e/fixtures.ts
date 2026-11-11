import { expect, test as base, type Page } from '@playwright/test';

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
