import { describe, expect, it } from 'vitest';
import { particleTravel } from '../src/canvas/ArchitectureEdge.tsx';

describe('particleTravel', () => {
  it('takes the length of the whole line, corners included, at an even speed', () => {
    // 220 px straight, and 220 px with a corner: the same time, unlike the distance between the ends.
    const straight = particleTravel([
      { x: 0, y: 0 },
      { x: 220, y: 0 },
    ]);
    const bent = particleTravel([
      { x: 0, y: 0 },
      { x: 110, y: 0 },
      { x: 110, y: 110 },
    ]);
    expect(straight).toBe(2);
    expect(bent).toBe(2);
  });

  it('keeps short and long lines within limits', () => {
    expect(particleTravel([{ x: 0, y: 0 }])).toBe(1.2);
    expect(particleTravel([])).toBe(1.2);
    expect(
      particleTravel([
        { x: 0, y: 0 },
        { x: 5000, y: 0 },
      ]),
    ).toBe(6);
  });

  it('rounds to tenths of a second, so a line that changes a little keeps its pace', () => {
    const before = particleTravel([
      { x: 0, y: 0 },
      { x: 300, y: 0 },
    ]);
    const after = particleTravel([
      { x: 0, y: 0 },
      { x: 302, y: 0 },
    ]);
    expect(before).toBe(after);
  });
});
