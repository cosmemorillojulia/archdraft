import type { ArchitectureGraph } from '../schema.ts';

export const serverlessApi = {
  schemaVersion: 1,
  title: 'Serverless REST API',
  description:
    'Mobile backend built only from managed services. An API gateway checks the tokens issued by the identity provider and invokes functions, data lives in a key-value table, and slow work such as sending emails runs from a queue with a dead-letter queue for failures.',
  provider: 'aws',
  nodes: [
    { id: 'mobile-app', kind: 'mobile-client', label: 'Mobile app' },
    { id: 'region', kind: 'region', label: 'us-east-1' },
    { id: 'identity', kind: 'identity-provider', label: 'User sign-in', parentId: 'region' },
    { id: 'api-gateway', kind: 'api-gateway', label: 'REST API', parentId: 'region' },
    { id: 'api-handler', kind: 'function', label: 'API handler', parentId: 'region' },
    {
      id: 'orders-table',
      kind: 'nosql-db',
      label: 'Orders table',
      parentId: 'region',
      attributes: { encryptedAtRest: true, managed: true },
    },
    { id: 'jobs-queue', kind: 'queue', label: 'Jobs queue', parentId: 'region' },
    { id: 'dead-letters', kind: 'queue', label: 'Dead-letter queue', parentId: 'region' },
    { id: 'worker', kind: 'function', label: 'Background worker', parentId: 'region' },
    { id: 'monitoring', kind: 'monitoring', label: 'Logs and metrics', parentId: 'region' },
    { id: 'email', kind: 'external-system', label: 'Email service', provider: 'generic' },
  ],
  edges: [
    {
      id: 'app-identity',
      source: 'mobile-app',
      target: 'identity',
      label: 'Sign in',
      protocol: 'https',
    },
    { id: 'app-api', source: 'mobile-app', target: 'api-gateway', protocol: 'https' },
    {
      id: 'api-identity',
      source: 'api-gateway',
      target: 'identity',
      label: 'Validate token',
      protocol: 'https',
    },
    { id: 'api-invoke', source: 'api-gateway', target: 'api-handler', label: 'Invoke' },
    { id: 'handler-table', source: 'api-handler', target: 'orders-table', protocol: 'https' },
    {
      id: 'handler-enqueue',
      source: 'api-handler',
      target: 'jobs-queue',
      label: 'Enqueue job',
      mode: 'async',
    },
    { id: 'queue-worker', source: 'jobs-queue', target: 'worker', label: 'Trigger', mode: 'async' },
    {
      id: 'queue-dead-letters',
      source: 'jobs-queue',
      target: 'dead-letters',
      label: 'After 3 failed attempts',
      mode: 'async',
    },
    { id: 'worker-email', source: 'worker', target: 'email', protocol: 'https' },
  ],
} satisfies ArchitectureGraph;
