import { z } from 'zod';
import { CLOUD_PROVIDERS, EDGE_MODES, EDGE_PROTOCOLS, NODE_KINDS } from './kinds.ts';

/**
 * Zod schemas are the single source of truth for the shape of a diagram.
 * The same definitions produce the TypeScript types, validate user and
 * model input at runtime, and generate the JSON Schema sent to the LLM.
 */

export const SCHEMA_VERSION = 1;

export const LIMITS = {
  maxNodes: 200,
  maxEdges: 400,
  idLength: 64,
  labelLength: 80,
  descriptionLength: 500,
  titleLength: 120,
  serviceLength: 60,
  tagLength: 32,
  maxTags: 10,
  maxReplicas: 1000,
} as const;

/** Identifiers are human readable slugs, e.g. `orders-db`. */
export const IdSchema = z
  .string()
  .regex(
    new RegExp(`^[A-Za-z0-9][A-Za-z0-9_-]{0,${LIMITS.idLength - 1}}$`),
    'Use letters, digits, "-" or "_" and start with a letter or digit',
  )
  .describe('Stable slug identifier, unique within its collection, e.g. "orders-db"');

export const CloudProviderSchema = z.enum(CLOUD_PROVIDERS);
export const NodeKindSchema = z.enum(NODE_KINDS);
export const EdgeProtocolSchema = z.enum(EDGE_PROTOCOLS);
export const EdgeModeSchema = z.enum(EDGE_MODES);

/** Operational facts the lint rules reason about. All optional: unknown is not false. */
export const NodeAttributesSchema = z
  .strictObject({
    replicas: z
      .number()
      .int()
      .min(1)
      .max(LIMITS.maxReplicas)
      .optional()
      .describe('Number of running instances'),
    multiAz: z.boolean().optional().describe('Deployed across several availability zones'),
    autoscaling: z.boolean().optional().describe('Scales instances automatically with load'),
    publiclyAccessible: z
      .boolean()
      .optional()
      .describe('Reachable directly from the public internet'),
    encryptedAtRest: z.boolean().optional().describe('Stored data is encrypted at rest'),
    managed: z.boolean().optional().describe('Operated by the cloud provider as a managed service'),
  })
  .describe('Operational attributes; omit what is unknown');

export const ArchNodeSchema = z.strictObject({
  id: IdSchema,
  kind: NodeKindSchema.describe('Component or container type from the catalog'),
  label: z
    .string()
    .trim()
    .max(LIMITS.labelLength)
    .describe('Short display name; only shapes and text may leave it empty'),
  description: z.string().trim().max(LIMITS.descriptionLength).optional(),
  provider: CloudProviderSchema.optional().describe(
    'Overrides the diagram provider for this node, e.g. a SaaS outside the main cloud',
  ),
  service: z
    .string()
    .trim()
    .min(1)
    .max(LIMITS.serviceLength)
    .optional()
    .describe('Concrete product name when it differs from the catalog default, e.g. "Aurora"'),
  parentId: IdSchema.optional().describe('Id of the container node this node sits in'),
  attributes: NodeAttributesSchema.optional(),
  tags: z.array(z.string().trim().min(1).max(LIMITS.tagLength)).max(LIMITS.maxTags).optional(),
});

export const ArchEdgeSchema = z.strictObject({
  id: IdSchema,
  source: IdSchema.describe('Id of the node that initiates the interaction'),
  target: IdSchema.describe('Id of the node that receives the interaction'),
  label: z.string().trim().min(1).max(LIMITS.labelLength).optional(),
  protocol: EdgeProtocolSchema.optional(),
  mode: EdgeModeSchema.optional().describe('sync if the source waits for a response'),
});

export const ArchitectureGraphSchema = z.strictObject({
  schemaVersion: z.literal(SCHEMA_VERSION),
  title: z.string().trim().min(1).max(LIMITS.titleLength),
  description: z.string().trim().max(LIMITS.descriptionLength).optional(),
  provider: CloudProviderSchema.describe('Default cloud provider of the diagram'),
  nodes: z.array(ArchNodeSchema).max(LIMITS.maxNodes),
  edges: z.array(ArchEdgeSchema).max(LIMITS.maxEdges),
});

export type NodeAttributes = z.infer<typeof NodeAttributesSchema>;
export type ArchNode = z.infer<typeof ArchNodeSchema>;
export type ArchEdge = z.infer<typeof ArchEdgeSchema>;
export type ArchitectureGraph = z.infer<typeof ArchitectureGraphSchema>;

export function createEmptyGraph(
  title: string,
  provider: ArchitectureGraph['provider'] = 'generic',
): ArchitectureGraph {
  return { schemaVersion: SCHEMA_VERSION, title, provider, nodes: [], edges: [] };
}
