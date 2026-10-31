import { describe, expect, it } from 'vitest';
import {
  COMPONENT_KINDS,
  CONTAINER_KINDS,
  CONTAINMENT_RULES,
  NODE_CATALOG,
  NODE_KINDS,
  getNodeDefinition,
  isContainerKind,
} from '../src/index.ts';

describe('NODE_CATALOG', () => {
  it('defines every node kind exactly once', () => {
    expect(Object.keys(NODE_CATALOG).sort()).toEqual([...NODE_KINDS].sort());
  });

  it.each(NODE_KINDS)('%s has a consistent definition', (kind) => {
    const definition = getNodeDefinition(kind);
    expect(definition.kind).toBe(kind);
    expect(definition.label.length).toBeGreaterThan(0);
    expect(definition.description.length).toBeGreaterThan(0);
    expect(definition.icon).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it('puts exactly the container kinds in the container category', () => {
    const containers = NODE_KINDS.filter((kind) => NODE_CATALOG[kind].category === 'container');
    expect(containers.sort()).toEqual([...CONTAINER_KINDS].sort());
  });

  it('is frozen', () => {
    expect(Object.isFrozen(NODE_CATALOG)).toBe(true);
    expect(Object.isFrozen(NODE_CATALOG.vm)).toBe(true);
  });
});

describe('isContainerKind', () => {
  it('separates containers from components', () => {
    for (const kind of CONTAINER_KINDS) expect(isContainerKind(kind)).toBe(true);
    for (const kind of COMPONENT_KINDS) expect(isContainerKind(kind)).toBe(false);
  });
});

describe('CONTAINMENT_RULES', () => {
  it('covers every container kind', () => {
    expect(Object.keys(CONTAINMENT_RULES).sort()).toEqual([...CONTAINER_KINDS].sort());
  });

  it('only references container kinds as parents', () => {
    for (const rule of Object.values(CONTAINMENT_RULES)) {
      for (const parent of rule.parents) expect(isContainerKind(parent)).toBe(true);
    }
  });
});
