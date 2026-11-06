import type { ArchitectureGraph } from '../schema.ts';

/**
 * After "CI/CD pipeline for developing and delivering containerized apps" of the Google Cloud
 * Architecture Center:
 * https://docs.cloud.google.com/architecture/app-development-and-delivery-with-cloud-code-gcb-cd-and-gke
 */
export const containerDelivery = {
  schemaVersion: 1,
  title: 'Continuous delivery of containers',
  description:
    'Every change to the main branch is built, tested and shipped to Kubernetes. A build service makes the container image, stores it in a registry and creates a release; the delivery pipeline deploys it to staging and, once someone approves it, promotes the same image to production.',
  provider: 'gcp',
  nodes: [
    { id: 'developer', kind: 'user', label: 'Developer' },
    { id: 'repository', kind: 'external-system', label: 'Git repository', service: 'GitHub' },
    { id: 'approver', kind: 'user', label: 'Release approver' },
    { id: 'customer', kind: 'user', label: 'Customer' },
    { id: 'region', kind: 'region', label: 'europe-west1' },
    { id: 'delivery', kind: 'boundary', label: 'Delivery', parentId: 'region' },
    { id: 'build', kind: 'ci-cd', label: 'Build and test', parentId: 'delivery' },
    { id: 'images', kind: 'container-registry', label: 'Container images', parentId: 'delivery' },
    {
      id: 'artifacts',
      kind: 'object-storage',
      label: 'Build artifacts',
      parentId: 'delivery',
      attributes: { publiclyAccessible: false, encryptedAtRest: true },
    },
    {
      id: 'pipeline',
      kind: 'ci-cd',
      label: 'Delivery pipeline',
      service: 'Cloud Deploy',
      parentId: 'delivery',
    },
    { id: 'staging', kind: 'boundary', label: 'Staging', parentId: 'region' },
    {
      id: 'staging-cluster',
      kind: 'kubernetes-cluster',
      label: 'Staging cluster',
      parentId: 'staging',
      attributes: { managed: true },
    },
    { id: 'production', kind: 'boundary', label: 'Production', parentId: 'region' },
    {
      id: 'load-balancer',
      kind: 'load-balancer',
      label: 'Load balancer',
      parentId: 'production',
    },
    {
      id: 'production-cluster',
      kind: 'kubernetes-cluster',
      label: 'Production cluster',
      parentId: 'production',
      attributes: { managed: true, autoscaling: true },
    },
    { id: 'logs', kind: 'logging', label: 'Logs', parentId: 'region' },
    { id: 'monitoring', kind: 'monitoring', label: 'Metrics and alerts', parentId: 'region' },
  ],
  edges: [
    {
      id: 'developer-repository',
      source: 'developer',
      target: 'repository',
      label: 'git push',
      protocol: 'https',
    },
    {
      id: 'repository-build',
      source: 'repository',
      target: 'build',
      label: 'Trigger on main',
      protocol: 'event',
    },
    {
      id: 'build-images',
      source: 'build',
      target: 'images',
      label: 'Push image',
      protocol: 'https',
    },
    {
      id: 'build-artifacts',
      source: 'build',
      target: 'artifacts',
      label: 'Test reports',
      protocol: 'https',
    },
    {
      id: 'build-pipeline',
      source: 'build',
      target: 'pipeline',
      label: 'Create release',
      protocol: 'https',
    },
    {
      id: 'pipeline-staging',
      source: 'pipeline',
      target: 'staging-cluster',
      label: 'Deploy',
      protocol: 'https',
    },
    {
      id: 'approver-pipeline',
      source: 'approver',
      target: 'pipeline',
      label: 'Approve promotion',
      protocol: 'https',
    },
    {
      id: 'pipeline-production',
      source: 'pipeline',
      target: 'production-cluster',
      label: 'Promote',
      protocol: 'https',
    },
    {
      id: 'staging-images',
      source: 'staging-cluster',
      target: 'images',
      label: 'Pull image',
      protocol: 'https',
    },
    {
      id: 'production-images',
      source: 'production-cluster',
      target: 'images',
      label: 'Pull image',
      protocol: 'https',
    },
    {
      id: 'customer-load-balancer',
      source: 'customer',
      target: 'load-balancer',
      protocol: 'https',
    },
    {
      id: 'load-balancer-production',
      source: 'load-balancer',
      target: 'production-cluster',
      protocol: 'http',
    },
  ],
} satisfies ArchitectureGraph;
