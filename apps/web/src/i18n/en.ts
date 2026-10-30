import {
  type CloudProvider,
  type ContainerKind,
  type EdgeProtocol,
  LIMITS,
  LINT_RULES,
  type LintFinding,
  type LintRuleId,
  type LintSeverity,
  NODE_CATALOG,
  NODE_KINDS,
  type NodeAttributes,
  type NodeCategory,
  type NodeKind,
  type TemplateId,
} from '@archdraft/core';
import type { ExportFormat } from '../export/files.ts';

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

/** Name and one-line description of a kind of node, as the palette and the inspector show them. */
export interface KindText {
  readonly label: string;
  readonly description: string;
}

/** What a finding is about, so that each language can word it. */
export interface FindingFacts {
  readonly finding: LintFinding;
  /** Labels of `finding.nodeIds`, in the same order. */
  readonly labels: readonly string[];
  /** Attributes of the first node of the finding. */
  readonly attributes: NodeAttributes | undefined;
}

/** English names come from the catalog in @archdraft/core, which is written in English. */
const KINDS = Object.fromEntries(
  NODE_KINDS.map((kind) => [
    kind,
    { label: NODE_CATALOG[kind].label, description: NODE_CATALOG[kind].description },
  ]),
) as Record<NodeKind, KindText>;

const RULES = Object.fromEntries(
  LINT_RULES.map((rule) => [rule.id, { title: rule.title, description: rule.description }]),
) as Record<LintRuleId, { readonly title: string; readonly description: string }>;

const kindNoun = (kind: NodeKind) => withArticle(KINDS[kind].label.toLowerCase());

/**
 * English texts of the interface. Every user-facing string lives in a
 * dictionary (ADR 0009, ADR 0020); `es.ts` has the same keys in Spanish.
 * Kind names and design rules reuse the English texts of @archdraft/core.
 */
export const en = {
  /** BCP 47 tag of the language, for the `lang` attribute and number formats. */
  lang: 'en',
  appName: 'Archdraft',
  tagline: 'Describe a cloud architecture and get a diagram you can edit and review',
  header: {
    themeToDark: 'Switch to dark theme',
    themeToLight: 'Switch to light theme',
    /** The language switch: the code of the current language, and what pressing it does. */
    language: { code: 'EN', label: 'EN, switch to Spanish', hint: 'Switch to Spanish' },
    new: 'New',
    newDiagram: 'Blank diagram',
    newDiagramTitle: 'Untitled diagram',
    undo: 'Undo',
    redo: 'Redo',
  },
  card: {
    components: (count: number) => (count === 1 ? 'component' : 'components'),
    connections: (count: number) => (count === 1 ? 'connection' : 'connections'),
    shapes: (count: number) => (count === 1 ? 'shape' : 'shapes'),
    rename: 'Diagram name',
    provider: 'Cloud',
    showDescription: 'Show description',
    hideDescription: 'Hide description',
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
    discard: 'Drop here to discard',
    carryHint: 'Click on the diagram to place it. Esc cancels.',
    carryShapeHint:
      'Click on the diagram to place it, or drag to draw it at the size you want. Esc cancels.',
    carrying: (label: string) =>
      `Placing ${label}. Click on the diagram to place it, or press Escape to cancel.`,
    title: 'Components',
    open: 'Show components',
    close: 'Hide components',
    search: 'Search components',
    noMatches: (query: string) => `No components match “${query}”.`,
    add: (label: string) => `Add ${label}`,
    hintWide: 'Click to add at the centre, or drag onto the diagram.',
    hintNarrow: 'Tap to add to the diagram, or hold and drag to place it.',
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
      shape: 'Shapes',
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
    flow: {
      label: 'Flow animation',
      hide: 'Hide the particles on connections',
      show: 'Show the particles on connections',
    },
    edgeStyle: {
      toSquare: 'Draw connections with right angles',
      toCurved: 'Draw connections as curves',
    },
    zoom: {
      label: 'View',
      in: 'Zoom in',
      out: 'Zoom out',
      fit: 'Fit diagram to screen',
    },
    rename: 'Name',
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
  share: {
    open: 'Share',
    title: 'Share and export',
    close: 'Close',
    link: 'Link to this diagram',
    creating: 'Creating the link…',
    copy: 'Copy link',
    copied: 'Copied',
    copyFailed: 'Copying is blocked here: select the link and copy it.',
    linkNote: 'The diagram travels inside the link; nothing is stored on a server.',
    longLink: (length: number) =>
      `This link is ${length.toLocaleString('en')} characters long and some apps cut long links. To share a large diagram, download the JSON file.`,
    export: 'Export',
    copyMermaid: 'Copy Mermaid',
    mermaidCopied: 'Mermaid copied',
    formats: {
      json: 'JSON',
      mermaid: 'Mermaid',
      drawio: 'draw.io',
      svg: 'SVG',
      png: 'PNG',
    } satisfies Record<ExportFormat, string>,
    downloadAs: (format: string) => `Download ${format}`,
    exportHint:
      'Mermaid for READMEs and documents, draw.io to keep editing there, SVG and PNG as images.',
    exportFailed: 'The image could not be created. Try again, or export SVG.',
    file: 'File',
    download: 'Download JSON',
    openFile: 'Open or import a file',
    fileHint:
      'Opens Archdraft JSON, Mermaid flowcharts and draw.io files. It replaces the diagram; undo brings it back.',
  },
  persist: {
    importedTitle: 'Imported diagram',
    importedWithNotes: (notes: string) => `Imported. ${notes}`,
    openFailed: {
      file: (reason: string) => `This file could not be opened. ${reason}`,
      link: (reason: string) => `This link could not be opened. ${reason}`,
      saved: (reason: string) =>
        `The diagram saved in this browser could not be restored. ${reason}`,
    },
    linkDamaged: 'It is incomplete or damaged.',
    linkTooLarge: 'It is too large.',
    saveFailed:
      'Changes cannot be saved in this browser and will be lost when the page closes. Download the JSON file to keep them.',
  },
  /** Why an edit was not made. */
  edit: {
    tooManyNodes: `A diagram can have up to ${LIMITS.maxNodes} components and groups.`,
    tooManyEdges: `A diagram can have up to ${LIMITS.maxEdges} connections.`,
    alreadyConnected: 'These components are already connected.',
    selfLoop: 'A component cannot connect to itself.',
    groupEndpoint: 'Groups cannot be connected. Connect the components inside them.',
    /** Where a group of `kind` may go, e.g. "A subnet goes inside a virtual network or an availability zone." */
    placement: (kind: ContainerKind, parents: readonly ContainerKind[]) =>
      `${capitalised(kindNoun(kind))} goes inside ${listOf(parents.map(kindNoun), 'or')}.`,
    invalid: (detail: string) => `That change would make the diagram invalid: ${detail}`,
  },
  inspector: {
    close: 'Close',
    expand: 'Show properties',
    collapse: 'Hide properties',
    connection: 'Connection',
    name: 'Name',
    chosen: (count: number) => `${count} selected`,
    chosenHint: 'Drag one to move them all',
    fixedTo: (host: string) => `Fixed to ${host}`,
    detach: 'Detach',
    order: 'Order',
    bringToFront: 'Bring to front',
    bringForward: 'Bring forward',
    sendBackward: 'Send backward',
    sendToBack: 'Send to back',
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
    edgeStyle: 'Line',
    edgeStyles: { auto: 'Auto', curved: 'Curved', square: 'Square' },
    edgeStyleFollows: (style: 'curved' | 'square') =>
      style === 'curved' ? 'Follows the diagram: curved.' : 'Follows the diagram: right angles.',
    connect: 'Connect',
    duplicate: 'Duplicate',
    delete: 'Delete',
    errors: {
      required: 'Enter a name.',
      tooLong: (max: number) => `Use ${max} characters or fewer.`,
      replicas: `Enter a whole number from 1 to ${LIMITS.maxReplicas}.`,
    },
  },
  kinds: KINDS,
  lint: {
    rules: RULES,
    finding: ({ finding }: FindingFacts): { message: string; suggestion: string } => ({
      message: finding.message,
      suggestion: finding.suggestion,
    }),
  },
} as const;

type Widen<T> = T extends string
  ? string
  : T extends (...args: infer A) => infer R
    ? (...args: A) => Widen<R>
    : T extends object
      ? { readonly [K in keyof T]: Widen<T[K]> }
      : T;

/** Shape of a dictionary: the keys of the English one, with any text. */
export type Strings = Widen<typeof en>;
