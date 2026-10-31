import { describe, expect, it } from 'vitest';
import {
  ASSIST_LIMITS,
  ASSIST_PROBLEMS,
  AssistRequestSchema,
  AssistResultSchema,
  problemType,
} from '../src/index.ts';
import { threeTierGraph } from './fixtures.ts';

describe('AssistRequestSchema', () => {
  it('accepts each task with what it needs', () => {
    const graph = threeTierGraph();
    for (const request of [
      { task: 'generate', locale: 'es', prompt: 'Una tienda', provider: 'aws' },
      { task: 'edit', locale: 'en', prompt: 'Add a cache', graph },
      { task: 'improve', locale: 'en', graph },
      { task: 'simplify', locale: 'en', graph, prompt: 'Keep the queue' },
      { task: 'extend', locale: 'es', graph },
    ]) {
      expect(AssistRequestSchema.safeParse(request).success).toBe(true);
    }
  });

  it('refuses a request without what its task needs, or with too long a prompt', () => {
    for (const request of [
      { task: 'generate', locale: 'en' },
      { task: 'edit', locale: 'en', prompt: 'Add a cache' },
      { task: 'improve', locale: 'fr', graph: threeTierGraph() },
      { task: 'paint', locale: 'en' },
      { task: 'generate', locale: 'en', prompt: 'x'.repeat(ASSIST_LIMITS.promptLength + 1) },
      { task: 'generate', locale: 'en', prompt: '   ' },
    ]) {
      expect(AssistRequestSchema.safeParse(request).success).toBe(false);
    }
  });
});

describe('AssistResultSchema', () => {
  it('needs at least one proposal and known warnings', () => {
    const proposal = {
      title: 'Shop',
      rationale: '',
      graph: threeTierGraph(),
      changes: {
        diagram: true,
        nodes: { added: [], updated: [], removed: [] },
        edges: { added: [], updated: [], removed: [] },
      },
    };
    const result = { task: 'generate', proposals: [proposal], attempts: 1, warnings: [] };
    expect(AssistResultSchema.safeParse(result).success).toBe(true);
    expect(AssistResultSchema.safeParse({ ...result, proposals: [] }).success).toBe(false);
    expect(AssistResultSchema.safeParse({ ...result, warnings: ['odd'] }).success).toBe(false);
  });
});

describe('problemType', () => {
  it('gives every problem a relative type URI of its own', () => {
    const types = ASSIST_PROBLEMS.map(problemType);
    expect(types[0]).toBe('/problems/invalid-request');
    expect(new Set(types).size).toBe(ASSIST_PROBLEMS.length);
  });
});
