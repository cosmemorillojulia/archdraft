/**
 * Size budget of what the editor downloads before it can draw (docs/modulos/web.md,
 * Rendimiento): the entry script, the modules it preloads and the style sheets that
 * `index.html` links. Modules loaded on demand, like ELK or the exporters, do not count.
 */

/** Largest gzip size allowed, in bytes, for each kind of initial asset. */
export const BUDGET = { script: 280 * 1024, style: 15 * 1024 } as const;

export type AssetKind = keyof typeof BUDGET;

export interface InitialAsset {
  readonly kind: AssetKind;
  /** Path as written in `index.html`, from the base of the site. */
  readonly path: string;
}

const TAG = /<(script|link)\b[^>]*>/g;
const attribute = (tag: string, name: string) => new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];

/** The scripts and style sheets the page fetches as it loads, in the order of `index.html`. */
export function initialAssets(html: string): InitialAsset[] {
  const assets: InitialAsset[] = [];
  for (const [tag, name] of html.matchAll(TAG)) {
    if (name === 'script') {
      const src = attribute(tag, 'src');
      if (src !== undefined && attribute(tag, 'type') === 'module') {
        assets.push({ kind: 'script', path: src });
      }
      continue;
    }
    const rel = attribute(tag, 'rel');
    const href = attribute(tag, 'href');
    if (href === undefined) continue;
    if (rel === 'modulepreload') assets.push({ kind: 'script', path: href });
    if (rel === 'stylesheet') assets.push({ kind: 'style', path: href });
  }
  return assets;
}

export interface BudgetLine {
  readonly kind: AssetKind;
  readonly bytes: number;
  readonly budget: number;
}

/** Gzip bytes of each kind against its budget. */
export function checkBudget(
  sizes: readonly { readonly kind: AssetKind; readonly bytes: number }[],
): BudgetLine[] {
  return (Object.keys(BUDGET) as AssetKind[]).map((kind) => ({
    kind,
    bytes: sizes.filter((size) => size.kind === kind).reduce((sum, size) => sum + size.bytes, 0),
    budget: BUDGET[kind],
  }));
}
