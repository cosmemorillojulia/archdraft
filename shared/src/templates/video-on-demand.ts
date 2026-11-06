import type { ArchitectureGraph } from '../schema.ts';

/**
 * After the "Video on Demand on AWS" solution:
 * https://docs.aws.amazon.com/solutions/video-on-demand-on-aws/
 */
export const videoOnDemand = {
  schemaVersion: 1,
  title: 'Video on demand',
  description:
    'Uploaded videos are encoded for every screen and served worldwide. A new file in the source bucket starts a workflow that inspects it, runs a transcoding job into adaptive streaming formats and records each step in a table; when the job ends, an event resumes the workflow, which tells the operators and publishes the result behind a CDN.',
  provider: 'aws',
  nodes: [
    { id: 'studio', kind: 'external-system', label: 'Studio upload tool', provider: 'generic' },
    { id: 'viewer', kind: 'user', label: 'Viewer' },
    { id: 'operators', kind: 'user', label: 'Operators' },
    { id: 'cdn', kind: 'cdn', label: 'CDN' },
    { id: 'region', kind: 'region', label: 'us-east-1' },
    { id: 'ingest', kind: 'boundary', label: 'Ingest and processing', parentId: 'region' },
    {
      id: 'source',
      kind: 'object-storage',
      label: 'Source videos',
      parentId: 'ingest',
      attributes: { publiclyAccessible: false, encryptedAtRest: true },
    },
    { id: 'workflow', kind: 'workflow', label: 'Ingest, process, publish', parentId: 'ingest' },
    { id: 'steps', kind: 'function', label: 'Workflow steps', parentId: 'ingest' },
    {
      id: 'transcoding',
      kind: 'data-processing',
      label: 'Transcoding',
      service: 'AWS Elemental MediaConvert',
      parentId: 'ingest',
    },
    { id: 'job-events', kind: 'event-bus', label: 'Job events', parentId: 'ingest' },
    {
      id: 'metadata',
      kind: 'nosql-db',
      label: 'Video metadata',
      parentId: 'ingest',
      attributes: { encryptedAtRest: true, managed: true },
    },
    { id: 'delivery', kind: 'boundary', label: 'Delivery', parentId: 'region' },
    {
      id: 'renditions',
      kind: 'object-storage',
      label: 'HLS and DASH renditions',
      parentId: 'delivery',
      attributes: { publiclyAccessible: false, encryptedAtRest: true },
    },
    { id: 'notifications', kind: 'topic', label: 'Job notifications', parentId: 'region' },
    { id: 'monitoring', kind: 'monitoring', label: 'Metrics and logs', parentId: 'region' },
  ],
  edges: [
    { id: 'studio-source', source: 'studio', target: 'source', label: 'Upload', protocol: 'https' },
    {
      id: 'source-workflow',
      source: 'source',
      target: 'workflow',
      label: 'New file',
      protocol: 'event',
    },
    { id: 'workflow-steps', source: 'workflow', target: 'steps', label: 'Inspect and plan' },
    {
      id: 'steps-metadata',
      source: 'steps',
      target: 'metadata',
      label: 'Record progress',
      protocol: 'https',
    },
    { id: 'workflow-transcoding', source: 'workflow', target: 'transcoding', label: 'Start job' },
    {
      id: 'transcoding-source',
      source: 'transcoding',
      target: 'source',
      label: 'Read source',
      protocol: 'https',
    },
    {
      id: 'transcoding-renditions',
      source: 'transcoding',
      target: 'renditions',
      label: 'Write renditions',
      protocol: 'https',
    },
    {
      id: 'transcoding-events',
      source: 'transcoding',
      target: 'job-events',
      label: 'Job complete',
      protocol: 'event',
    },
    {
      id: 'events-workflow',
      source: 'job-events',
      target: 'workflow',
      label: 'Resume',
      protocol: 'event',
    },
    {
      id: 'workflow-notifications',
      source: 'workflow',
      target: 'notifications',
      label: 'Published',
      protocol: 'event',
    },
    {
      id: 'notifications-operators',
      source: 'notifications',
      target: 'operators',
      label: 'Email',
      protocol: 'event',
    },
    { id: 'viewer-cdn', source: 'viewer', target: 'cdn', protocol: 'https' },
    {
      id: 'cdn-renditions',
      source: 'cdn',
      target: 'renditions',
      label: 'Segments',
      protocol: 'https',
    },
  ],
} satisfies ArchitectureGraph;
