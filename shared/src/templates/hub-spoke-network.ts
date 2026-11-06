import type { ArchitectureGraph } from '../schema.ts';

/**
 * After "Hub-spoke network topology in Azure" of the Azure Architecture Center:
 * https://learn.microsoft.com/azure/architecture/networking/architecture/hub-spoke
 */
export const hubSpokeNetwork = {
  schemaVersion: 1,
  title: 'Hub and spoke network',
  description:
    'A company network extended to the cloud. The office connects over a VPN to a hub network that holds what every workload shares: the gateway, a firewall that inspects traffic between networks and to the internet, and monitoring. Each workload lives in its own spoke network, peered to the hub, so it reaches the office and the internet only through the firewall.',
  provider: 'azure',
  nodes: [
    { id: 'office', kind: 'boundary', label: 'Office network' },
    { id: 'employees', kind: 'user', label: 'Employees', parentId: 'office' },
    { id: 'internet', kind: 'external-system', label: 'Allowed internet services' },
    { id: 'region', kind: 'region', label: 'westeurope' },
    { id: 'hub', kind: 'network', label: 'Hub network', parentId: 'region' },
    { id: 'gateway-subnet', kind: 'subnet', label: 'GatewaySubnet', parentId: 'hub' },
    { id: 'vpn', kind: 'vpn-gateway', label: 'VPN gateway', parentId: 'gateway-subnet' },
    { id: 'firewall-subnet', kind: 'subnet', label: 'AzureFirewallSubnet', parentId: 'hub' },
    { id: 'firewall', kind: 'firewall', label: 'Firewall', parentId: 'firewall-subnet' },
    { id: 'monitoring', kind: 'monitoring', label: 'Network monitoring', parentId: 'hub' },
    { id: 'production', kind: 'network', label: 'Production spoke', parentId: 'region' },
    { id: 'app-subnet', kind: 'subnet', label: 'Application', parentId: 'production' },
    {
      id: 'app',
      kind: 'vm',
      label: 'Line-of-business app',
      parentId: 'app-subnet',
      attributes: { replicas: 2, autoscaling: true },
    },
    { id: 'data-subnet', kind: 'subnet', label: 'Data', parentId: 'production' },
    {
      id: 'database',
      kind: 'relational-db',
      label: 'Database',
      parentId: 'data-subnet',
      attributes: {
        multiAz: true,
        encryptedAtRest: true,
        managed: true,
        publiclyAccessible: false,
      },
    },
    { id: 'development', kind: 'network', label: 'Development spoke', parentId: 'region' },
    { id: 'build-subnet', kind: 'subnet', label: 'Build agents', parentId: 'development' },
    {
      id: 'agents',
      kind: 'vm',
      label: 'Build agents',
      parentId: 'build-subnet',
      attributes: { replicas: 2, autoscaling: true },
    },
  ],
  edges: [
    {
      id: 'employees-vpn',
      source: 'employees',
      target: 'vpn',
      label: 'Site-to-site VPN',
      protocol: 'other',
    },
    { id: 'vpn-firewall', source: 'vpn', target: 'firewall', label: 'Inspect', protocol: 'other' },
    {
      id: 'firewall-app',
      source: 'firewall',
      target: 'app',
      label: 'Allowed ports',
      protocol: 'https',
    },
    { id: 'app-database', source: 'app', target: 'database', protocol: 'sql' },
    {
      id: 'agents-firewall',
      source: 'agents',
      target: 'firewall',
      label: 'All outbound traffic',
      protocol: 'https',
      mode: 'async',
    },
    {
      id: 'firewall-internet',
      source: 'firewall',
      target: 'internet',
      label: 'Allowed domains',
      protocol: 'https',
    },
  ],
} satisfies ArchitectureGraph;
