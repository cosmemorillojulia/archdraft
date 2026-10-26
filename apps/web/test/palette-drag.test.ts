import { describe, expect, it } from 'vitest';
import { drawnCorner } from '../src/palette/palette-drag.ts';

describe('drawnCorner', () => {
  const from = { x: 100, y: 100 };

  it('is the pointer for every shape but the circle', () => {
    for (const kind of ['box', 'diamond', 'note'] as const) {
      expect(drawnCorner(kind, from, { x: 300, y: 160 })).toEqual({ x: 300, y: 160 });
    }
  });

  it('keeps a circle round, with the longer side, towards the pointer', () => {
    expect(drawnCorner('circle', from, { x: 300, y: 160 })).toEqual({ x: 300, y: 300 });
    expect(drawnCorner('circle', from, { x: 40, y: -100 })).toEqual({ x: -100, y: -100 });
    expect(drawnCorner('circle', from, { x: 130, y: 20 })).toEqual({ x: 180, y: 20 });
  });
});
