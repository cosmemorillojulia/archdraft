import { parseArchitectureGraph } from '@archdraft/shared';
import { describe, expect, it } from 'vitest';
import { largestGraph, measureCpu } from '../bench/cpu.ts';

// Timings depend on the machine, so they are read by hand (docs/modulos/backend.md);
// what is tested is that the measure runs the requests it says it does.
describe('CPU measure', () => {
  it('uses the largest diagram the schema accepts', () => {
    const graph = largestGraph();
    expect(graph.nodes).toHaveLength(200);
    expect(parseArchitectureGraph(graph).success).toBe(true);
  });

  it('measures requests the API answers', async () => {
    const measures = await measureCpu(1);
    expect(measures.map((measure) => measure.status)).toEqual([200, 200, 200, 200]);
    for (const measure of measures) expect(measure.firstMs).toBeGreaterThan(0);
  });
});
