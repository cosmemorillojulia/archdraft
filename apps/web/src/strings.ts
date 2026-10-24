import type { CloudProvider, NodeCategory } from '@archdraft/core';

/**
 * Every user-facing string lives here (ADR 0009), so that a second language
 * can be added later without touching the components.
 */
export const strings = {
  appName: 'Archdraft',
  tagline: 'Describe a cloud architecture and get a diagram you can edit and review',
  header: {
    themeToDark: 'Switch to dark theme',
    themeToLight: 'Switch to light theme',
    sourceCode: 'Source code',
  },
  panes: {
    switcher: 'Visible panel',
    build: 'Build',
    diagram: 'Diagram',
    details: 'Details',
  },
  prompt: {
    title: 'Describe',
    label: 'Describe your system',
    placeholder:
      'An online store on AWS: a web front end, an API on containers, a PostgreSQL database and a queue that sends order emails.',
    hint: 'Generating a diagram from text is not available yet.',
    generate: 'Generate diagram',
  },
  palette: {
    title: 'Components',
    hint: 'Building blocks you can place on the diagram.',
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
  canvas: {
    label: 'Diagram',
    unavailable: 'The interactive canvas is not available yet.',
    title: 'Title',
    provider: 'Provider',
    components: 'Components',
    connections: 'Connections',
    providers: {
      generic: 'Any cloud',
      aws: 'AWS',
      gcp: 'Google Cloud',
      azure: 'Azure',
    } satisfies Record<CloudProvider, string>,
  },
  details: {
    label: 'Details',
    inspector: 'Inspector',
    review: 'Review',
    inspectorEmpty: 'Select a component on the diagram to see and edit its details.',
    reviewEmpty:
      'Design review checks the diagram for availability, security and coupling risks as you edit it.',
  },
} as const;
