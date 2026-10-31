import { LIMITS, type ArchEdge, type ArchNode } from '../schema.ts';

/** What reading a diagram made in another tool gives: the diagram and what was left out. */
export interface ImportedParts {
  readonly nodes: ArchNode[];
  readonly edges: ArchEdge[];
  /** Things the source had that Archdraft cannot show, for the person to read. */
  readonly warnings: string[];
}

/** An identifier Archdraft accepts, made from `text`, and not in `taken`. */
export function freshId(text: string, taken: ReadonlySet<string>, fallback = 'node'): string {
  const base =
    text
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Za-z0-9_-]+/g, '-')
      .replace(/^[^A-Za-z0-9]+/, '')
      .slice(0, LIMITS.idLength - 4) || fallback;
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/** A name that fits a label: tags and entities gone, lines joined, cut to the limit. */
export function cleanLabel(text: string): string {
  return text
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, LIMITS.labelLength);
}
