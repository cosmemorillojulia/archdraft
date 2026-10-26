import {
  type CloudProvider,
  type ContainerKind,
  type NodeCategory,
  type NodeKind,
  CONTAINER_KINDS,
} from './kinds.ts';

/**
 * Static description of every node kind.
 *
 * `services` maps a kind to the usual managed product of each vendor. It is
 * indicative, used for labels and exports, never for validation: a user can
 * always override it with `node.service`.
 *
 * `icon` is a Lucide icon name (ISC licence). Official vendor icon sets are
 * deliberately not used, see docs/adr/0008-iconografia-neutral.md.
 */
export interface NodeDefinition {
  readonly kind: NodeKind;
  readonly category: NodeCategory;
  readonly label: string;
  readonly description: string;
  readonly icon: string;
  readonly services: Readonly<Partial<Record<Exclude<CloudProvider, 'generic'>, string>>>;
}

type CatalogInput = Omit<NodeDefinition, 'kind'>;

const definitions = {
  user: {
    category: 'actor',
    label: 'User',
    description: 'A person interacting with the system',
    icon: 'user',
    services: {},
  },
  'web-client': {
    category: 'actor',
    label: 'Web client',
    description: 'Browser application',
    icon: 'monitor',
    services: {},
  },
  'mobile-client': {
    category: 'actor',
    label: 'Mobile client',
    description: 'Native or hybrid mobile application',
    icon: 'smartphone',
    services: {},
  },
  dns: {
    category: 'edge',
    label: 'DNS',
    description: 'Domain name resolution',
    icon: 'globe',
    services: { aws: 'Amazon Route 53', gcp: 'Cloud DNS', azure: 'Azure DNS' },
  },
  cdn: {
    category: 'edge',
    label: 'CDN',
    description: 'Edge cache for static and cacheable content',
    icon: 'zap',
    services: { aws: 'Amazon CloudFront', gcp: 'Cloud CDN', azure: 'Azure Front Door' },
  },
  'load-balancer': {
    category: 'edge',
    label: 'Load balancer',
    description: 'Distributes traffic across instances',
    icon: 'split',
    services: {
      aws: 'Elastic Load Balancing',
      gcp: 'Cloud Load Balancing',
      azure: 'Azure Load Balancer',
    },
  },
  'api-gateway': {
    category: 'edge',
    label: 'API gateway',
    description: 'Managed entry point for APIs: routing, auth, throttling',
    icon: 'door-open',
    services: { aws: 'Amazon API Gateway', gcp: 'API Gateway', azure: 'Azure API Management' },
  },
  waf: {
    category: 'security',
    label: 'Web application firewall',
    description: 'Filters malicious HTTP traffic',
    icon: 'shield',
    services: {
      aws: 'AWS WAF',
      gcp: 'Google Cloud Armor',
      azure: 'Azure Web Application Firewall',
    },
  },
  service: {
    category: 'compute',
    label: 'Service',
    description: 'Long-running containerised service',
    icon: 'box',
    services: { aws: 'Amazon ECS', gcp: 'Cloud Run', azure: 'Azure Container Apps' },
  },
  function: {
    category: 'compute',
    label: 'Function',
    description: 'Event-driven serverless function',
    icon: 'square-function',
    services: { aws: 'AWS Lambda', gcp: 'Cloud Run functions', azure: 'Azure Functions' },
  },
  vm: {
    category: 'compute',
    label: 'Virtual machine',
    description: 'Self-managed virtual server',
    icon: 'server',
    services: { aws: 'Amazon EC2', gcp: 'Compute Engine', azure: 'Azure Virtual Machines' },
  },
  'kubernetes-cluster': {
    category: 'compute',
    label: 'Kubernetes cluster',
    description: 'Container orchestration cluster',
    icon: 'boxes',
    services: {
      aws: 'Amazon EKS',
      gcp: 'Google Kubernetes Engine',
      azure: 'Azure Kubernetes Service',
    },
  },
  'batch-job': {
    category: 'compute',
    label: 'Batch job',
    description: 'Scheduled or on-demand finite workload',
    icon: 'calendar-clock',
    services: { aws: 'AWS Batch', gcp: 'Google Cloud Batch', azure: 'Azure Batch' },
  },
  'relational-db': {
    category: 'data',
    label: 'Relational database',
    description: 'SQL database with transactions',
    icon: 'database',
    services: { aws: 'Amazon RDS', gcp: 'Cloud SQL', azure: 'Azure SQL Database' },
  },
  'nosql-db': {
    category: 'data',
    label: 'NoSQL database',
    description: 'Key-value or document database',
    icon: 'database-zap',
    services: { aws: 'Amazon DynamoDB', gcp: 'Firestore', azure: 'Azure Cosmos DB' },
  },
  cache: {
    category: 'data',
    label: 'Cache',
    description: 'In-memory data store for low-latency reads',
    icon: 'memory-stick',
    services: { aws: 'Amazon ElastiCache', gcp: 'Memorystore', azure: 'Azure Managed Redis' },
  },
  'object-storage': {
    category: 'data',
    label: 'Object storage',
    description: 'Durable storage for files and blobs',
    icon: 'archive',
    services: { aws: 'Amazon S3', gcp: 'Cloud Storage', azure: 'Azure Blob Storage' },
  },
  'search-index': {
    category: 'data',
    label: 'Search index',
    description: 'Full-text search engine',
    icon: 'search',
    services: { aws: 'Amazon OpenSearch Service', azure: 'Azure AI Search' },
  },
  'data-warehouse': {
    category: 'data',
    label: 'Data warehouse',
    description: 'Analytical columnar store',
    icon: 'warehouse',
    services: { aws: 'Amazon Redshift', gcp: 'BigQuery', azure: 'Azure Synapse Analytics' },
  },
  'vector-db': {
    category: 'data',
    label: 'Vector database',
    description: 'Similarity search over embeddings',
    icon: 'chart-scatter',
    services: {
      aws: 'Amazon OpenSearch Service',
      gcp: 'Vertex AI Vector Search',
      azure: 'Azure AI Search',
    },
  },
  queue: {
    category: 'messaging',
    label: 'Queue',
    description: 'Point-to-point message queue',
    icon: 'list-ordered',
    services: { aws: 'Amazon SQS', gcp: 'Cloud Tasks', azure: 'Azure Service Bus' },
  },
  topic: {
    category: 'messaging',
    label: 'Topic',
    description: 'Publish-subscribe fan-out',
    icon: 'megaphone',
    services: { aws: 'Amazon SNS', gcp: 'Pub/Sub', azure: 'Azure Service Bus' },
  },
  stream: {
    category: 'messaging',
    label: 'Event stream',
    description: 'Ordered, replayable log of events',
    icon: 'waves-horizontal',
    services: {
      aws: 'Amazon Kinesis Data Streams',
      gcp: 'Managed Service for Apache Kafka',
      azure: 'Azure Event Hubs',
    },
  },
  'event-bus': {
    category: 'messaging',
    label: 'Event bus',
    description: 'Rule-based event router',
    icon: 'route',
    services: { aws: 'Amazon EventBridge', gcp: 'Eventarc', azure: 'Azure Event Grid' },
  },
  'identity-provider': {
    category: 'security',
    label: 'Identity provider',
    description: 'Authentication and user directory',
    icon: 'key-round',
    services: { aws: 'Amazon Cognito', gcp: 'Identity Platform', azure: 'Microsoft Entra ID' },
  },
  'secrets-manager': {
    category: 'security',
    label: 'Secrets manager',
    description: 'Stores credentials and keys',
    icon: 'lock-keyhole',
    services: { aws: 'AWS Secrets Manager', gcp: 'Secret Manager', azure: 'Azure Key Vault' },
  },
  monitoring: {
    category: 'observability',
    label: 'Monitoring',
    description: 'Metrics, logs and alerts',
    icon: 'activity',
    services: { aws: 'Amazon CloudWatch', gcp: 'Cloud Monitoring', azure: 'Azure Monitor' },
  },
  llm: {
    category: 'ai',
    label: 'LLM',
    description: 'Hosted large language model endpoint',
    icon: 'brain',
    services: { aws: 'Amazon Bedrock', gcp: 'Vertex AI', azure: 'Azure AI Foundry' },
  },
  'external-system': {
    category: 'external',
    label: 'External system',
    description: 'Third-party API or system outside your control',
    icon: 'plug',
    services: {},
  },
  box: {
    category: 'shape',
    label: 'Box',
    description: 'A step, a thing or anything else; no architecture meaning',
    icon: 'square',
    services: {},
  },
  circle: {
    category: 'shape',
    label: 'Circle',
    description: 'A start, an end or an event; no architecture meaning',
    icon: 'circle',
    services: {},
  },
  diamond: {
    category: 'shape',
    label: 'Diamond',
    description: 'A decision or a branch; no architecture meaning',
    icon: 'diamond',
    services: {},
  },
  note: {
    category: 'shape',
    label: 'Note',
    description: 'A comment on the diagram; no architecture meaning',
    icon: 'sticky-note',
    services: {},
  },
  text: {
    category: 'shape',
    label: 'Text',
    description: 'Free text anywhere on the diagram; no architecture meaning',
    icon: 'type',
    services: {},
  },
  region: {
    category: 'container',
    label: 'Region',
    description: 'Geographic cloud region',
    icon: 'map',
    services: { aws: 'AWS Region', gcp: 'Google Cloud region', azure: 'Azure region' },
  },
  'availability-zone': {
    category: 'container',
    label: 'Availability zone',
    description: 'Isolated location within a region',
    icon: 'map-pin',
    services: { aws: 'Availability Zone', gcp: 'Zone', azure: 'Availability Zone' },
  },
  network: {
    category: 'container',
    label: 'Virtual network',
    description: 'Private network boundary',
    icon: 'network',
    services: { aws: 'Amazon VPC', gcp: 'VPC network', azure: 'Azure Virtual Network' },
  },
  subnet: {
    category: 'container',
    label: 'Subnet',
    description: 'Address range inside a virtual network',
    icon: 'layout-grid',
    services: { aws: 'Subnet', gcp: 'Subnet', azure: 'Subnet' },
  },
  boundary: {
    category: 'container',
    label: 'Boundary',
    description: 'Logical grouping: team, domain, account or trust zone',
    icon: 'square-dashed',
    services: {},
  },
} as const satisfies Record<NodeKind, CatalogInput>;

export const NODE_CATALOG: Readonly<Record<NodeKind, NodeDefinition>> = Object.freeze(
  Object.fromEntries(
    Object.entries(definitions).map(([kind, def]) => [kind, Object.freeze({ kind, ...def })]),
  ) as Record<NodeKind, NodeDefinition>,
);

export function getNodeDefinition(kind: NodeKind): NodeDefinition {
  return NODE_CATALOG[kind];
}

export interface ContainmentRule {
  /** Whether the container may sit at the top level of the diagram. */
  readonly topLevel: boolean;
  /** Container kinds allowed as its direct parent. */
  readonly parents: readonly ContainerKind[];
}

/**
 * Nesting rules between containers. Components (non-containers) may live in
 * any container or at the top level, so they need no rule.
 */
export const CONTAINMENT_RULES: Readonly<Record<ContainerKind, ContainmentRule>> = {
  region: { topLevel: true, parents: ['boundary'] },
  network: { topLevel: true, parents: ['region', 'boundary'] },
  'availability-zone': { topLevel: false, parents: ['region', 'network', 'boundary'] },
  subnet: { topLevel: false, parents: ['network', 'availability-zone'] },
  boundary: { topLevel: true, parents: CONTAINER_KINDS },
};
