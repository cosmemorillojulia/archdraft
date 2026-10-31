/**
 * The JSON object in a model's answer. Small models wrap it in a code block or
 * talk around it even when asked not to, so this looks, in order, at the whole
 * text, inside a fenced block, and from the first `{` to the last `}`.
 * Undefined when there is no object to be found.
 */
export function extractJson(text: string): Record<string, unknown> | undefined {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text)?.[1];
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  const candidates = [
    text,
    fenced,
    first !== -1 && last > first ? text.slice(first, last + 1) : undefined,
  ];
  for (const candidate of candidates) {
    if (candidate === undefined) continue;
    const parsed = parseObject(candidate.trim());
    if (parsed !== undefined) return parsed;
  }
  return undefined;
}

function parseObject(text: string): Record<string, unknown> | undefined {
  if (!text.startsWith('{')) return undefined;
  try {
    const value: unknown = JSON.parse(text);
    return isObject(value) ? value : undefined;
  } catch {
    // Not JSON as it stands; the next candidate may be.
    return undefined;
  }
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
