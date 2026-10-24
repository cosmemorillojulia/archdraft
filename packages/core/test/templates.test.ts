import { describe, expect, it } from 'vitest';
import {
  ARCHITECTURE_TEMPLATES,
  CLOUD_PROVIDERS,
  TEMPLATE_IDS,
  lintGraph,
  parseArchitectureGraph,
} from '../src/index.ts';

const templates = TEMPLATE_IDS.map((id) => [id, ARCHITECTURE_TEMPLATES[id]] as const);

function isDeeplyFrozen(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return true;
  return Object.isFrozen(value) && Object.values(value).every(isDeeplyFrozen);
}

describe('architecture templates', () => {
  it.each(templates)('%s is valid, without warnings and already normalised', (_id, graph) => {
    expect(parseArchitectureGraph(graph)).toEqual({ success: true, graph, warnings: [] });
  });

  it.each(templates)('%s has no design findings', (_id, graph) => {
    expect(lintGraph(graph)).toEqual([]);
  });

  it.each(templates)('%s has a description for the gallery', (_id, graph) => {
    expect(graph.description.length).toBeGreaterThan(0);
  });

  it('covers every provider, so that few-shot examples are not biased to one cloud', () => {
    const providers = new Set(templates.map(([, graph]) => graph.provider));
    expect(providers).toEqual(new Set(CLOUD_PROVIDERS));
  });

  it('cannot be modified by accident', () => {
    expect(isDeeplyFrozen(ARCHITECTURE_TEMPLATES)).toBe(true);
    const { nodes } = ARCHITECTURE_TEMPLATES['three-tier-web'];
    expect(() => nodes.push({ id: 'extra', kind: 'user', label: 'Extra' })).toThrow(TypeError);
  });

  it('can be copied for editing', () => {
    const copy = structuredClone(ARCHITECTURE_TEMPLATES['rag-chatbot']);
    copy.nodes.push({ id: 'extra', kind: 'user', label: 'Extra' });
    expect(copy.nodes).toHaveLength(ARCHITECTURE_TEMPLATES['rag-chatbot'].nodes.length + 1);
  });
});
