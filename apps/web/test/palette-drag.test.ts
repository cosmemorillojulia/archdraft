import { describe, expect, it } from 'vitest';
import { drawnBox } from '../src/palette/palette-drag.ts';

const none = { shift: false, alt: false };
const from = { x: 100, y: 100 };

describe('drawnBox', () => {
  it('goes from the press to the pointer', () => {
    expect(drawnBox('box', from, { x: 300, y: 160 }, none)).toEqual({
      from,
      to: { x: 300, y: 160 },
    });
  });

  it('keeps a circle round, towards the pointer, on its longer side', () => {
    expect(drawnBox('circle', from, { x: 300, y: 160 }, none).to).toEqual({ x: 300, y: 300 });
    expect(drawnBox('circle', from, { x: 40, y: -100 }, none).to).toEqual({ x: -100, y: -100 });
  });

  it('makes any shape square with Shift', () => {
    expect(drawnBox('box', from, { x: 130, y: 20 }, { shift: true, alt: false }).to).toEqual({
      x: 180,
      y: 20,
    });
  });

  it('grows from the centre with Alt', () => {
    expect(drawnBox('box', from, { x: 160, y: 130 }, { shift: false, alt: true })).toEqual({
      from: { x: 40, y: 70 },
      to: { x: 160, y: 130 },
    });
  });
});
