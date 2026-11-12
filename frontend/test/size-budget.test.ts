import { describe, expect, it } from 'vitest';
import { BUDGET, checkBudget, initialAssets } from '../scripts/size-budget.ts';

const HTML = `<!doctype html>
<html>
  <head>
    <script>document.documentElement.dataset.theme = 'dark';</script>
    <script type="module" crossorigin src="/archdraft/assets/index-a.js"></script>
    <link rel="modulepreload" crossorigin href="/archdraft/assets/runtime-b.js">
    <link rel="stylesheet" crossorigin href="/archdraft/assets/index-c.css">
    <link rel="icon" href="/archdraft/favicon.svg">
    <link rel="preconnect" href="https://example.com">
  </head>
</html>`;

describe('initialAssets', () => {
  it('lists the entry script, the preloaded modules and the style sheets', () => {
    expect(initialAssets(HTML)).toEqual([
      { kind: 'script', path: '/archdraft/assets/index-a.js' },
      { kind: 'script', path: '/archdraft/assets/runtime-b.js' },
      { kind: 'style', path: '/archdraft/assets/index-c.css' },
    ]);
  });

  it('ignores inline scripts, classic scripts and other links', () => {
    const html =
      '<script src="/legacy.js"></script><script>1</script><link rel="icon" href="/i.svg">';
    expect(initialAssets(html)).toEqual([]);
  });
});

describe('checkBudget', () => {
  it('adds up the assets of each kind', () => {
    expect(
      checkBudget([
        { kind: 'script', bytes: 100 },
        { kind: 'script', bytes: 50 },
        { kind: 'style', bytes: 10 },
      ]),
    ).toEqual([
      { kind: 'script', bytes: 150, budget: BUDGET.script },
      { kind: 'style', bytes: 10, budget: BUDGET.style },
    ]);
  });

  it('reports zero for a kind with no assets', () => {
    expect(checkBudget([])).toEqual([
      { kind: 'script', bytes: 0, budget: BUDGET.script },
      { kind: 'style', bytes: 0, budget: BUDGET.style },
    ]);
  });
});
