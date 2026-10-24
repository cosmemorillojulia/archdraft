import { NODE_CATALOG } from '@archdraft/core';
import { describe, expect, it } from 'vitest';
import { KIND_ICONS } from '../src/icons.ts';

/** `SquareFunction` → `square-function`, the naming the catalog uses. */
function kebab(name: string): string {
  return name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

describe('KIND_ICONS', () => {
  it.each(Object.values(NODE_CATALOG))('uses the catalog icon for $kind', (definition) => {
    expect(kebab(KIND_ICONS[definition.kind].displayName ?? '')).toBe(definition.icon);
  });
});
