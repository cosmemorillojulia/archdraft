import type { ArchitectureGraph } from '../src/index.ts';

/** Three-tier web application on AWS, used across the test suite. */
export function threeTierGraph(): ArchitectureGraph {
  return {
    schemaVersion: 1,
    title: 'Online store',
    description: 'Web storefront with an API, a relational database and async order processing',
    provider: 'aws',
    nodes: [
      { id: 'customer', kind: 'user', label: 'Customer' },
      { id: 'cdn', kind: 'cdn', label: 'CDN' },
      { id: 'assets', kind: 'object-storage', label: 'Static assets' },
      { id: 'region', kind: 'region', label: 'eu-west-1' },
      { id: 'vpc', kind: 'network', label: 'VPC', parentId: 'region' },
      { id: 'public', kind: 'subnet', label: 'Public subnet', parentId: 'vpc' },
      { id: 'private', kind: 'subnet', label: 'Private subnet', parentId: 'vpc' },
      { id: 'alb', kind: 'load-balancer', label: 'ALB', parentId: 'public' },
      {
        id: 'api',
        kind: 'service',
        label: 'Store API',
        parentId: 'private',
        attributes: { replicas: 2, autoscaling: true },
      },
      {
        id: 'db',
        kind: 'relational-db',
        label: 'Orders DB',
        service: 'Amazon Aurora',
        parentId: 'private',
        attributes: { multiAz: true, encryptedAtRest: true },
      },
      { id: 'cache', kind: 'cache', label: 'Session cache', parentId: 'private' },
      { id: 'orders-queue', kind: 'queue', label: 'Orders queue' },
      { id: 'worker', kind: 'function', label: 'Order worker' },
      { id: 'payments', kind: 'external-system', label: 'Payment provider', provider: 'generic' },
    ],
    edges: [
      { id: 'e1', source: 'customer', target: 'cdn', protocol: 'https', mode: 'sync' },
      { id: 'e2', source: 'cdn', target: 'assets', protocol: 'https', mode: 'sync' },
      { id: 'e3', source: 'cdn', target: 'alb', protocol: 'https', mode: 'sync' },
      { id: 'e4', source: 'alb', target: 'api', protocol: 'http', mode: 'sync' },
      { id: 'e5', source: 'api', target: 'db', protocol: 'sql', mode: 'sync' },
      { id: 'e6', source: 'api', target: 'cache', protocol: 'tcp', mode: 'sync' },
      { id: 'e7', source: 'api', target: 'orders-queue', protocol: 'amqp', mode: 'async' },
      { id: 'e8', source: 'orders-queue', target: 'worker', protocol: 'event', mode: 'async' },
      { id: 'e9', source: 'worker', target: 'db', protocol: 'sql', mode: 'sync' },
      { id: 'e10', source: 'worker', target: 'payments', protocol: 'https', mode: 'sync' },
    ],
  };
}
