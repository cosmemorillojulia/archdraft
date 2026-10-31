import { describe, expect, it } from 'vitest';
import { NODE_KINDS, architectureGraphJsonSchema } from '../src/index.ts';

describe('architectureGraphJsonSchema', () => {
  const schema = architectureGraphJsonSchema();

  it('is a closed object schema with the required top-level fields', () => {
    expect(schema).toMatchObject({ type: 'object', additionalProperties: false });
    for (const field of ['schemaVersion', 'title', 'provider', 'nodes', 'edges']) {
      expect(schema.required).toContain(field);
    }
  });

  it('exposes the node kind vocabulary to the model', () => {
    const serialized = JSON.stringify(schema);
    for (const kind of NODE_KINDS) expect(serialized).toContain(`"${kind}"`);
  });

  it('carries field descriptions to guide generation', () => {
    expect(JSON.stringify(schema)).toContain('Id of the container node this node sits in');
  });

  it('is JSON serializable', () => {
    expect(() => JSON.parse(JSON.stringify(schema)) as unknown).not.toThrow();
  });
});
