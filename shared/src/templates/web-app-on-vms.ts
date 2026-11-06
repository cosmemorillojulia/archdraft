import type { ArchitectureGraph } from '../schema.ts';

/**
 * After the reference architecture of "Best Practices for WordPress on AWS":
 * https://docs.aws.amazon.com/whitepapers/latest/best-practices-wordpress/reference-architecture.html
 */
export const webAppOnVms = {
  schemaVersion: 1,
  title: 'Web application on virtual machines',
  description:
    'A content site such as WordPress on servers you manage. A CDN caches pages and serves media from object storage, a load balancer spreads the rest over an autoscaling group of virtual machines in private subnets, and the servers share a database, a cache and a file system for uploads. A NAT gateway lets them fetch updates without being reachable from the internet.',
  provider: 'aws',
  nodes: [
    { id: 'visitor', kind: 'user', label: 'Visitor' },
    { id: 'dns', kind: 'dns', label: 'DNS' },
    { id: 'cdn', kind: 'cdn', label: 'CDN' },
    {
      id: 'media',
      kind: 'object-storage',
      label: 'Media and static files',
      attributes: { publiclyAccessible: false, encryptedAtRest: true },
    },
    { id: 'region', kind: 'region', label: 'us-east-1' },
    { id: 'vpc', kind: 'network', label: 'VPC', parentId: 'region' },
    { id: 'public-subnet', kind: 'subnet', label: 'Public subnets', parentId: 'vpc' },
    { id: 'app-subnet', kind: 'subnet', label: 'Application subnets', parentId: 'vpc' },
    { id: 'data-subnet', kind: 'subnet', label: 'Data subnets', parentId: 'vpc' },
    {
      id: 'load-balancer',
      kind: 'load-balancer',
      label: 'Load balancer',
      service: 'Application Load Balancer',
      parentId: 'public-subnet',
    },
    { id: 'nat', kind: 'nat-gateway', label: 'NAT gateway', parentId: 'public-subnet' },
    {
      id: 'web',
      kind: 'vm',
      label: 'Web servers',
      parentId: 'app-subnet',
      attributes: { replicas: 2, autoscaling: true },
    },
    {
      id: 'database',
      kind: 'relational-db',
      label: 'Database',
      service: 'Amazon Aurora MySQL',
      parentId: 'data-subnet',
      attributes: { multiAz: true, encryptedAtRest: true, managed: true },
    },
    {
      id: 'cache',
      kind: 'cache',
      label: 'Object cache',
      parentId: 'data-subnet',
      attributes: { multiAz: true, encryptedAtRest: true, managed: true },
    },
    {
      id: 'uploads',
      kind: 'file-storage',
      label: 'Shared uploads',
      parentId: 'data-subnet',
      attributes: { encryptedAtRest: true, managed: true },
    },
    { id: 'monitoring', kind: 'monitoring', label: 'Metrics and alarms', parentId: 'region' },
    { id: 'updates', kind: 'external-system', label: 'Plugin and core updates' },
  ],
  edges: [
    { id: 'visitor-dns', source: 'visitor', target: 'dns', label: 'Resolve domain' },
    { id: 'visitor-cdn', source: 'visitor', target: 'cdn', protocol: 'https' },
    {
      id: 'cdn-media',
      source: 'cdn',
      target: 'media',
      label: 'Media and static files',
      protocol: 'https',
    },
    {
      id: 'cdn-load-balancer',
      source: 'cdn',
      target: 'load-balancer',
      label: 'Dynamic pages',
      protocol: 'https',
    },
    { id: 'load-balancer-web', source: 'load-balancer', target: 'web', protocol: 'http' },
    { id: 'web-cache', source: 'web', target: 'cache', protocol: 'tcp' },
    { id: 'web-database', source: 'web', target: 'database', protocol: 'sql' },
    { id: 'web-uploads', source: 'web', target: 'uploads', label: 'Mount', protocol: 'other' },
    {
      id: 'web-media',
      source: 'web',
      target: 'media',
      label: 'Offload uploads',
      protocol: 'https',
    },
    {
      id: 'web-nat',
      source: 'web',
      target: 'nat',
      label: 'Background updates',
      protocol: 'https',
      mode: 'async',
    },
    { id: 'nat-updates', source: 'nat', target: 'updates', protocol: 'https' },
  ],
} satisfies ArchitectureGraph;
