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
  type AssistStage,
  type AssistTask,
  type AssistWarning,
  type OfferTask,
} from '@archdraft/shared';
import type { AssistFailure } from '../ai/client.ts';
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

/** "45 seconds", "3 minutes", "2 hours". */
function waitFor(seconds: number): string {
  if (seconds < 90) return `${Math.max(1, Math.round(seconds))} seconds`;
  if (seconds < 90 * 60) return `${Math.round(seconds / 60)} minutes`;
  return `${Math.round(seconds / 3600)} hours`;
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

/** English names come from the catalog in @archdraft/shared, which is written in English. */
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
 * Kind names and design rules reuse the English texts of @archdraft/shared.
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
  help: {
    label: 'Help',
  },
  dialogs: {
    close: 'Close',
  },
  gallery: {
    open: 'Template gallery',
    title: 'Start from a template',
    subtitle: 'Reference architectures to adapt, or a blank diagram.',
    groups: {
      web: 'Web and APIs',
      services: 'Services and processes',
      data: 'Data and AI',
      platform: 'Platform and networks',
      blank: 'From scratch',
    },
    levels: { simple: 'Simple', intermediate: 'Intermediate', complex: 'Complex' },
    blank: 'An empty canvas: describe it to the assistant or add the components yourself.',
  },
  empty: {
    title: 'Start your diagram',
    withAssistant: 'Describe your system in the box below, or try one of these:',
    withoutAssistant: 'Start from a template, or add the components yourself.',
    examples: 'Example descriptions',
    templates: 'Browse templates',
    components: 'Add components',
  },
  shortcuts: {
    open: 'Keyboard shortcuts',
    title: 'Keyboard shortcuts',
    subtitle: 'They work anywhere on the page except while you type in a field.',
    groups: [
      {
        title: 'General',
        items: [
          { action: 'Show these shortcuts', keys: ['?'] },
          { action: 'Undo', keys: ['Ctrl/⌘ + Z'] },
          { action: 'Redo', keys: ['Ctrl/⌘ + Shift + Z', 'Ctrl + Y'] },
        ],
      },
      {
        title: 'Selection',
        items: [
          { action: 'Delete what is selected', keys: ['Delete', 'Backspace'] },
          { action: 'Select everything', keys: ['Ctrl/⌘ + A'] },
          { action: 'Duplicate the selection', keys: ['Ctrl/⌘ + D'] },
          { action: 'Drag a copy of the selection', keys: ['Alt + drag'] },
          { action: 'Drag in a straight line', keys: ['Shift while dragging'] },
          { action: 'Rename the selected node', keys: ['Enter', 'F2', 'Double click'] },
          { action: 'Move the selection 10 px', keys: ['Alt + arrows'] },
          { action: 'Move the selection 1 px', keys: ['Alt + Shift + arrows'] },
          { action: 'Add a node to the selection', keys: ['Ctrl/⌘/Shift + click'] },
          { action: 'Select with a box', keys: ['Ctrl/⌘/Shift + drag on the background'] },
          { action: 'Line the chosen nodes up on a side', keys: ['Ctrl/⌘ + Shift + arrows'] },
          { action: 'Clear the selection or close the review', keys: ['Esc'] },
        ],
      },
      {
        title: 'Canvas',
        items: [
          { action: 'Zoom in or out', keys: ['Wheel', 'Pinch'] },
          { action: 'Show the whole diagram', keys: ['Shift + 1'] },
          { action: 'Show the selection', keys: ['Shift + 2'] },
          { action: 'Move around', keys: ['Drag the background'] },
          { action: 'Draw a shape with equal sides', keys: ['Shift while drawing'] },
          { action: 'Draw a shape from its centre', keys: ['Alt while drawing'] },
        ],
      },
      {
        title: 'Assistant',
        items: [
          { action: 'Send the description', keys: ['Enter'] },
          { action: 'New line', keys: ['Shift + Enter'] },
          { action: 'Stop the assistant', keys: ['Esc'] },
        ],
      },
    ],
  },
  about: {
    open: 'About and privacy',
    title: 'About Archdraft',
    subtitle: 'What it does and what happens to your diagrams.',
    intro:
      'Archdraft turns a description of a cloud architecture into a diagram you can edit, review against design rules and export. It is free and open source, under the MIT licence.',
    privacyTitle: 'Privacy',
    privacy: [
      'There are no accounts and no database. Your diagram is saved only in this browser, and so are your preferences, such as the theme, the language and the design rules you turn off.',
      'A share link carries the diagram compressed in the part of the address after #, which browsers do not send to any server. Anyone with the link can open the diagram.',
      'When you use the assistant, your description and the diagram go to the Archdraft API, which passes them to the model provider to get the answer. The API does not keep them: its logs record only an id of the request, the task, the model, how long it took and why it failed, if it did.',
      'To share the free quota of the model, each address may use the assistant a few times a day. The API counts the requests of each address under a hash of it, never the address itself, and forgets the count at midnight UTC.',
      'The model provider handles what it receives under its own terms. GitHub Pages and Cloudflare, which host the editor and the API, may log technical data of each visit, such as the IP address.',
      'Archdraft uses no cookies, analytics or trackers.',
    ],
    source: 'The code is public on',
    sourceLink: 'GitHub',
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
    hintWide: 'Click a component to pick it up and click again to place it, or drag it onto the diagram.',
    hintNarrow: 'Tap to add to the diagram, or hold and drag to place it.',
    categories: {
      actor: 'People and clients',
      edge: 'Entry and traffic',
      compute: 'Compute',
      data: 'Data',
      messaging: 'Messaging',
      security: 'Security',
      observability: 'Observability',
      devops: 'Delivery',
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
    unavailable: 'The AI assistant is not available in this version',
    templateNames: {
      'three-tier-web': 'Three-tier web',
      'serverless-api': 'Serverless API',
      'event-driven-microservices': 'Microservices',
      'rag-chatbot': 'RAG chatbot',
      'analytics-pipeline': 'Data pipeline',
      'static-site-cms': 'Static site',
      'web-app-on-vms': 'Web app on VMs',
      'scheduled-job': 'Scheduled job',
      'websocket-chat': 'Real-time chat',
      'container-delivery': 'Container delivery',
      'iot-analytics': 'IoT analytics',
      'video-on-demand': 'Video on demand',
      'aks-microservices': 'Kubernetes microservices',
      'mlops-pipeline': 'MLOps',
      'multi-region-dr': 'Multi-region DR',
      'hub-spoke-network': 'Hub and spoke',
    } satisfies Record<TemplateId, string>,
  },
  assistant: {
    editLabel: 'Describe a change to this diagram',
    editExamples: [
      'Put a cache in front of the database',
      'Move the API to serverless functions',
      'Add a queue between the API and the worker',
      'Run the database in two availability zones',
    ],
    newDiagram: 'New diagram',
    newDiagramHint: 'Describe a new diagram instead of changing this one',
    edit: 'Change diagram',
    stop: 'Stop',
    stages: {
      thinking: 'Thinking…',
      drawing: 'Writing the proposal…',
      checking: 'Checking the design…',
      fixing: 'Fixing the proposal…',
    } satisfies Record<AssistStage, string>,
    elapsed: (seconds: number) => `${seconds} s`,
    showThought: 'Show reasoning',
    hideThought: 'Hide reasoning',
    componentsDrawn: (count: number) => (count === 1 ? '1 component' : `${count} components`),
    working: {
      generate: 'Drawing the diagram…',
      edit: 'Changing the diagram…',
      improve: 'Looking for improvements…',
      simplify: 'Designing a simpler version…',
      extend: 'Designing a more complete version…',
    } satisfies Record<AssistTask, string>,
    menu: 'Assistant',
    actions: {
      improve: 'Suggest improvements',
      simplify: 'Make it simpler',
      extend: 'Make it more complete',
    } satisfies Record<OfferTask, string>,
    actionHints: {
      edit: 'It removes or changes a good part: look before applying it',
      improve: 'Fixes for the design review and what an architect would raise',
      simplify: 'Fewer parts for the same job',
      extend: 'What it needs for production',
    } satisfies Record<Exclude<AssistTask, 'generate'>, string>,
    titles: {
      edit: 'Check this change',
      improve: 'Suggested improvements',
      simplify: 'A simpler design',
      extend: 'A more complete design',
    } satisfies Record<Exclude<AssistTask, 'generate'>, string>,
    close: 'Close the proposals',
    showProposal: (title: string) => `Show ${title} on the diagram`,
    previewing: 'Preview, not applied yet',
    marks: { added: 'New', updated: 'Changes', removed: 'Removed' },
    assumptions: 'Decided by the assistant',
    resolves: 'Solves',
    introduces: 'Worth checking',
    changeList: 'What changes',
    moreChanges: (count: number) => `Show ${count} more`,
    diagramDetails: 'Title or provider of the diagram',
    connection: (source: string, target: string) => `${source} → ${target}`,
    details: {
      renamed: (from: string, to: string) => `"${from}" becomes "${to}"`,
      kind: (from: string, to: string) => `From ${from.toLowerCase()} to ${to.toLowerCase()}`,
      moved: (into: string | null) => (into === null ? 'Leaves its group' : `Moves into "${into}"`),
      reconnected: 'Connects other parts',
      details: 'Other details',
    },
    tidy: 'Tidy the whole diagram',
    tidyHint:
      'Lays everything out again for this change, instead of keeping in place what is already there',
    staleProposal: 'It no longer fits the diagram as it is now. Ask the assistant again.',
    reported: { generate: 'Diagram drawn', change: 'Change applied' },
    closeReport: 'Close the summary',
    undo: 'Undo',
    done: 'Done',
    apply: 'Apply',
    applyLabel: (title: string) => `Apply ${title}`,
    discard: 'Discard',
    discardLabel: (title: string) => `Discard ${title}`,
    changes: ({ added, updated, removed }: { added: number; updated: number; removed: number }) =>
      [
        added > 0 ? `${added} added` : '',
        updated > 0 ? `${updated} changed` : '',
        removed > 0 ? `${removed} removed` : '',
      ]
        .filter((part) => part !== '')
        .join(' · ') || 'Changes the diagram details',
    stale:
      'The diagram changed since this was proposed and it no longer fits. Ask the assistant again.',
    warnings: {
      'proposals-dropped': 'Some suggestions were not valid and were left out.',
      'not-simpler': 'This proposal has more components than the diagram, not fewer.',
      'not-more-complete': 'This proposal has fewer components than the diagram.',
      'more-findings':
        'A suggestion gives the design review more to report: check it before applying.',
    } satisfies Record<AssistWarning, string>,
    failed: {
      network: () => 'Could not reach the assistant. Check the connection and try again.',
      'rate-limited': (seconds?: number) =>
        seconds === undefined
          ? 'The assistant has reached its limit for now. Try again later.'
          : `The assistant has reached its limit for now. Try again in ${waitFor(seconds)}.`,
      'model-timeout': () =>
        'The assistant took too long. Try again, or ask for something smaller.',
      'model-error': () => 'The assistant is not available right now. Try again in a moment.',
      'invalid-model-output': () =>
        'The assistant did not manage a valid diagram this time. Try again, or put it another way.',
      'invalid-request': () => 'The assistant could not take this request.',
      'payload-too-large': () => 'The diagram is too large for the assistant.',
      'not-found': () => 'The assistant is not where this editor expects it.',
      'internal-error': () => 'Something went wrong with the assistant. Try again.',
    } satisfies Record<AssistFailure, (seconds?: number) => string>,
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
    shortcuts: { label: 'Shortcuts' },
    tidy: 'Reorder the whole diagram',
    edgeLabels: {
      label: 'Connection labels',
      hide: 'Hide the labels of every connection',
      show: 'Show the labels of every connection',
    },
    edgeStyle: {
      toSquare: 'Draw connections with right angles',
      toCurved: 'Draw connections as curves',
    },
    edgeHandles: {
      source: 'Move where the connection leaves: drag it to another side or onto another box',
      target: 'Move where the connection arrives: drag it to another side or onto another box',
      segment: 'Move this part of the connection',
      point: 'Move this point of the connection; double-click to remove it',
      addPoint: 'Drag to bend the connection through a new point',
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
    exportersFailed:
      'The export formats could not be downloaded. Check your connection and open this menu again.',
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
    readersFailed:
      'Part of the editor could not be downloaded. Check your connection and try again.',
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
    labelVisibility: 'Show label',
    labelVisibilities: { hidden: 'Never', shown: 'Always' },
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
    edgeRouteHint: 'Drag the dots on the connection to change its sides or move its middle.',
    edgeRouteReset: 'Restore the automatic route',
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
