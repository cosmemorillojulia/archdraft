import {
  type CloudProvider,
  type EdgeProtocol,
  LIMITS,
  type LintSeverity,
  type NodeAttributes,
  type NodeCategory,
  type TemplateId,
} from '@archdraft/core';

/** "a subnet", "an availability zone". */
function withArticle(noun: string): string {
  return `${/^[aeiou]/i.test(noun) ? 'an' : 'a'} ${noun}`;
}

/** "a, b or c". */
function listOf(items: readonly string[], conjunction: string): string {
  return items.length <= 1
    ? (items[0] ?? '')
    : `${items.slice(0, -1).join(', ')} ${conjunction} ${items.at(-1) ?? ''}`;
}

const capitalised = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

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
    undo: 'Undo',
    redo: 'Redo',
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
    title: 'Design review',
    close: 'Close design review',
    summary: (count: number) =>
      count === 0 ? 'Nothing to review' : count === 1 ? '1 finding' : `${count} findings`,
    filters: 'Show findings by severity',
    groups: { error: 'Errors', warning: 'Warnings', info: 'Notes' } satisfies Record<
      LintSeverity,
      string
    >,
    severities: { error: 'Error', warning: 'Warning', info: 'Note' } satisfies Record<
      LintSeverity,
      string
    >,
    empty: 'The design follows every active rule: availability, exposure, encryption and coupling.',
    filteredOut: 'No findings match the filters.',
    why: 'Why it matters',
    edit: 'Edit',
    editLabel: (label: string) => `Edit ${label}`,
    turnOff: 'Turn off rule',
    turnOffLabel: (title: string) => `Turn off the rule ${title}`,
    turnOn: 'Turn on',
    turnOnLabel: (title: string) => `Turn on the rule ${title}`,
    disabled: (count: number) => `Rules turned off (${count})`,
    disabledNote: 'Turned off rules stay off in this browser.',
  },
  components: {
    title: 'Components',
    open: 'Show components',
    close: 'Hide components',
    search: 'Search components',
    noMatches: (query: string) => `No components match “${query}”.`,
    add: (label: string) => `Add ${label}`,
    hintWide: 'Click to add at the centre, or drag onto the diagram.',
    hintNarrow: 'Tap to add to the diagram.',
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
    miniMap: 'Overview of the diagram',
    zoom: {
      label: 'Zoom',
      in: 'Zoom in',
      out: 'Zoom out',
      fit: 'Fit diagram to screen',
    },
    connecting: 'Choose a component to connect',
    cancelConnecting: 'Cancel',
    dismiss: 'Dismiss',
    /** Badge on components that run outside the provider of the diagram. */
    providerBadges: {
      generic: 'External',
      aws: 'AWS',
      gcp: 'GCP',
      azure: 'Azure',
    } satisfies Record<CloudProvider, string>,
  },
  protocols: {
    https: 'HTTPS',
    http: 'HTTP',
    grpc: 'gRPC',
    websocket: 'WebSocket',
    sql: 'SQL',
    tcp: 'TCP',
    amqp: 'AMQP',
    kafka: 'Kafka',
    event: 'Event',
    other: 'Other',
  } satisfies Record<EdgeProtocol, string>,
  /** Why an edit was not made. */
  edit: {
    tooManyNodes: `A diagram can have up to ${LIMITS.maxNodes} components and groups.`,
    tooManyEdges: `A diagram can have up to ${LIMITS.maxEdges} connections.`,
    alreadyConnected: 'These components are already connected.',
    selfLoop: 'A component cannot connect to itself.',
    groupEndpoint: 'Groups cannot be connected. Connect the components inside them.',
    /** Where a group of `kind` may go, e.g. "A subnet goes inside a virtual network or an availability zone." */
    placement: (kind: string, parents: readonly string[]) =>
      `${capitalised(withArticle(kind))} goes inside ${listOf(parents.map(withArticle), 'or')}.`,
    invalid: (detail: string) => `That change would make the diagram invalid: ${detail}`,
  },
  inspector: {
    close: 'Close',
    connection: 'Connection',
    name: 'Name',
    product: 'Product',
    provider: 'Runs on',
    providerDefault: (provider: string) => `Diagram default (${provider})`,
    description: 'Description',
    operations: 'Operations',
    replicas: 'Instances',
    notSet: 'Not set',
    yes: 'Yes',
    no: 'No',
    attributes: {
      multiAz: 'Several zones',
      autoscaling: 'Autoscaling',
      publiclyAccessible: 'Public access',
      encryptedAtRest: 'Encrypted at rest',
      managed: 'Managed service',
    } satisfies Record<Exclude<keyof NodeAttributes, 'replicas'>, string>,
    label: 'Label',
    protocol: 'Protocol',
    protocolNone: 'Not specified',
    mode: 'Mode',
    modes: { auto: 'Auto', sync: 'Sync', async: 'Async' },
    modeHint: (mode: 'sync' | 'async') =>
      mode === 'sync' ? 'The source waits for a reply.' : 'The source does not wait for a reply.',
    connect: 'Connect',
    duplicate: 'Duplicate',
    delete: 'Delete',
    errors: {
      required: 'Enter a name.',
      tooLong: (max: number) => `Use ${max} characters or fewer.`,
      replicas: `Enter a whole number from 1 to ${LIMITS.maxReplicas}.`,
    },
  },
} as const;
