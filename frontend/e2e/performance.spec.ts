import {
  type ArchEdge,
  type ArchitectureGraph,
  type ArchNode,
  LIMITS,
  SCHEMA_VERSION,
} from '@archdraft/shared';
import { card, diagram, expect, node, test } from './fixtures.ts';

/** The largest diagram the schema accepts: 20 networks of 9 services, chained (as in backend/bench). */
function largestGraph(): ArchitectureGraph {
  const nodes: ArchNode[] = [];
  const edges: ArchEdge[] = [];
  const networks = LIMITS.maxNodes / 10;
  for (let n = 0; n < networks; n++) {
    nodes.push({ id: `net${n}`, kind: 'network', label: `Network ${n}` });
    for (let s = 0; s < 9; s++) {
      nodes.push({
        id: `s${n}-${s}`,
        kind: 'service',
        label: `Service ${n}.${s}`,
        parentId: `net${n}`,
      });
      if (s > 0)
        edges.push({
          id: `e${n}-${s}`,
          source: `s${n}-${s - 1}`,
          target: `s${n}-${s}`,
          mode: 'sync',
        });
    }
    if (n > 0) edges.push({ id: `x${n}`, source: `s${n - 1}-8`, target: `s${n}-0`, mode: 'async' });
  }
  return { schemaVersion: SCHEMA_VERSION, title: 'Largest diagram', provider: 'aws', nodes, edges };
}

/**
 * Generous bounds for a slow CI machine: they catch an editor that hangs or
 * grows much slower with a large diagram, not small regressions.
 */
const OPEN_MS = 15_000;
const EDIT_MS = 2_000;

test('opens, lays out and edits a diagram of 200 components', async ({ editor }) => {
  const graph = largestGraph();
  await editor.getByRole('button', { name: 'Share' }).click();
  const share = editor.getByRole('dialog', { name: 'Share and export' });

  const started = Date.now();
  // A file without a layout: ELK places all 200 nodes in the worker.
  await share.locator('input[type="file"]').setInputFiles({
    name: 'largest.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(graph)),
  });
  await expect(diagram(editor, 'Largest diagram')).toBeVisible({ timeout: OPEN_MS });
  // The 20 networks are groups; the card counts the 180 services in them.
  await expect(card(editor)).toContainText(/180\s*components\s*179\s*connections/);
  const openMs = Date.now() - started;
  expect(openMs, 'time to open and lay out').toBeLessThan(OPEN_MS);

  // Selecting a component and renaming it stays responsive. With the whole diagram fitted to the
  // view, Playwright finds the component outside the viewport, so it is selected from the keyboard.
  await node(editor, 'Service 0.0, Amazon ECS').press('Enter');
  const name = editor.getByRole('textbox', { name: 'Name', exact: true });
  const editStarted = Date.now();
  await name.fill('Entry service');
  await name.press('Enter');
  await expect(node(editor, 'Entry service, Amazon ECS')).toBeVisible();
  expect(Date.now() - editStarted, 'time to rename').toBeLessThan(EDIT_MS);

  test.info().annotations.push({ type: 'open (ms)', description: String(openMs) });
});
