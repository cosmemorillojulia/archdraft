/**
 * Closed vocabularies of the domain model.
 *
 * Every list is declared `as const` so that it is the single source for both
 * the TypeScript union types and the runtime Zod enums in `schema.ts`.
 */

/** Cloud vendors a diagram can target. `generic` means provider-agnostic. */
export const CLOUD_PROVIDERS = ['generic', 'aws', 'gcp', 'azure'] as const;
export type CloudProvider = (typeof CLOUD_PROVIDERS)[number];

/** Functional grouping used by the palette, the legend and the lint rules. */
export const NODE_CATEGORIES = [
  'actor',
  'edge',
  'compute',
  'data',
  'messaging',
  'security',
  'observability',
  'ai',
  'external',
  'container',
] as const;
export type NodeCategory = (typeof NODE_CATEGORIES)[number];

/** Nodes that represent a deployable or external building block. */
export const COMPONENT_KINDS = [
  // actors
  'user',
  'web-client',
  'mobile-client',
  // edge and traffic management
  'dns',
  'cdn',
  'load-balancer',
  'api-gateway',
  // compute
  'service',
  'function',
  'vm',
  'kubernetes-cluster',
  'batch-job',
  // data
  'relational-db',
  'nosql-db',
  'cache',
  'object-storage',
  'search-index',
  'data-warehouse',
  'vector-db',
  // messaging
  'queue',
  'topic',
  'stream',
  'event-bus',
  // security
  'waf',
  'identity-provider',
  'secrets-manager',
  // observability
  'monitoring',
  // ai
  'llm',
  // external
  'external-system',
] as const;
export type ComponentKind = (typeof COMPONENT_KINDS)[number];

/** Nodes that group other nodes. They never take part in edges. */
export const CONTAINER_KINDS = [
  'region',
  'availability-zone',
  'network',
  'subnet',
  'boundary',
] as const;
export type ContainerKind = (typeof CONTAINER_KINDS)[number];

export const NODE_KINDS = [...COMPONENT_KINDS, ...CONTAINER_KINDS] as const;
export type NodeKind = (typeof NODE_KINDS)[number];

/** Transport or interaction style of an edge. */
export const EDGE_PROTOCOLS = [
  'https',
  'http',
  'grpc',
  'websocket',
  'sql',
  'tcp',
  'amqp',
  'kafka',
  'event',
  'other',
] as const;
export type EdgeProtocol = (typeof EDGE_PROTOCOLS)[number];

/** Whether the caller waits for the callee (`sync`) or not (`async`). */
export const EDGE_MODES = ['sync', 'async'] as const;
export type EdgeMode = (typeof EDGE_MODES)[number];

const CONTAINER_KIND_SET: ReadonlySet<string> = new Set(CONTAINER_KINDS);

export function isContainerKind(kind: NodeKind): kind is ContainerKind {
  return CONTAINER_KIND_SET.has(kind);
}
