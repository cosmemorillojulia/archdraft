import type { CloudProvider, NodeCategory, TemplateId } from '@archdraft/core';

/**
 * Every user-facing string lives here (ADR 0009), so that a second language
 * can be added later without touching the components. Node kind labels and
 * descriptions come from the catalog in @archdraft/core.
 */
export const strings = {
  appName: 'Archdraft',
  tagline: 'Describe a cloud architecture and get a diagram you can edit and review',
  header: {
    themeToDark: 'Switch to dark theme',
    themeToLight: 'Switch to light theme',
    sourceCode: 'Source code',
  },
  card: {
    components: 'components',
    connections: 'connections',
  },
  providers: {
    generic: 'Any cloud',
    aws: 'AWS',
    gcp: 'Google Cloud',
    azure: 'Azure',
  } satisfies Record<CloudProvider, string>,
  review: {
    clean: 'No design issues',
    issues: (count: number) => (count === 1 ? '1 design issue' : `${count} design issues`),
  },
  components: {
    title: 'Components',
    open: 'Show components',
    close: 'Hide components',
    search: 'Search components',
    noMatches: (query: string) => `No components match “${query}”.`,
    categories: {
      actor: 'People and clients',
      edge: 'Entry and traffic',
      compute: 'Compute',
      data: 'Data',
      messaging: 'Messaging',
      security: 'Security',
      observability: 'Observability',
      ai: 'AI',
      external: 'External',
      container: 'Groups',
    } satisfies Record<NodeCategory, string>,
  },
  prompt: {
    label: 'Describe your architecture',
    examples: [
      'An online store on AWS with a CDN, an API on containers and PostgreSQL',
      'A chatbot that answers from company documents, on Azure',
      'Order processing with microservices that talk through events',
      'A serverless REST API with Lambda, DynamoDB and a job queue',
      'A clickstream pipeline into BigQuery with nightly extracts',
    ],
    generate: 'Generate diagram',
    soon: 'AI generation is coming soon',
    templates: 'Templates',
    templateNames: {
      'three-tier-web': 'Three-tier web',
      'serverless-api': 'Serverless API',
      'event-driven-microservices': 'Microservices',
      'rag-chatbot': 'RAG chatbot',
      'analytics-pipeline': 'Data pipeline',
      'static-site-cms': 'Static site',
    } satisfies Record<TemplateId, string>,
  },
  canvas: {
    label: 'Diagram',
    diagramLabel: (title: string) => `Diagram: ${title}`,
    layoutFailed: 'This diagram could not be drawn. Try another template.',
  },
} as const;
