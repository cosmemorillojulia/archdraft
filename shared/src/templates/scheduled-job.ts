import type { ArchitectureGraph } from '../schema.ts';

/**
 * After "Serverless scheduling with Amazon EventBridge, AWS Lambda, and Amazon DynamoDB" and
 * "Scheduling email campaigns at scale with Amazon EventBridge Scheduler":
 * https://aws.amazon.com/blogs/architecture/serverless-scheduling-with-amazon-eventbridge-aws-lambda-and-amazon-dynamodb/
 * https://aws.amazon.com/blogs/compute/scheduling-email-campaigns-at-scale-with-amazon-eventbridge-scheduler/
 */
export const scheduledJob = {
  schemaVersion: 1,
  title: 'Scheduled job',
  description:
    'Work that runs on a timetable with nothing to keep running in between. A scheduler starts a function every night; it reads the day from the database, writes a report to object storage and emails it. Failed runs go to a dead-letter queue to retry or inspect.',
  provider: 'aws',
  nodes: [
    { id: 'region', kind: 'region', label: 'eu-central-1' },
    { id: 'schedule', kind: 'scheduler', label: 'Every night at 02:00', parentId: 'region' },
    { id: 'job', kind: 'function', label: 'Daily report', parentId: 'region' },
    {
      id: 'orders',
      kind: 'nosql-db',
      label: 'Orders',
      parentId: 'region',
      attributes: { encryptedAtRest: true, managed: true },
    },
    {
      id: 'reports',
      kind: 'object-storage',
      label: 'Reports',
      parentId: 'region',
      attributes: { publiclyAccessible: false, encryptedAtRest: true },
    },
    { id: 'email', kind: 'email-service', label: 'Email', parentId: 'region' },
    { id: 'failures', kind: 'queue', label: 'Failed runs', parentId: 'region' },
    { id: 'logs', kind: 'logging', label: 'Logs', parentId: 'region' },
    { id: 'team', kind: 'user', label: 'Finance team' },
  ],
  edges: [
    { id: 'schedule-job', source: 'schedule', target: 'job', label: 'Invoke', mode: 'async' },
    { id: 'job-orders', source: 'job', target: 'orders', label: 'Read the day', protocol: 'https' },
    { id: 'job-reports', source: 'job', target: 'reports', label: 'Write CSV', protocol: 'https' },
    { id: 'job-email', source: 'job', target: 'email', label: 'Send report', protocol: 'https' },
    {
      id: 'schedule-failures',
      source: 'schedule',
      target: 'failures',
      label: 'After retries',
      mode: 'async',
    },
    { id: 'email-team', source: 'email', target: 'team', label: 'Report', mode: 'async' },
  ],
} satisfies ArchitectureGraph;
