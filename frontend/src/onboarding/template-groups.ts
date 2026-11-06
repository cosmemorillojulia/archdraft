import type { TemplateId } from '@archdraft/shared';

/** How much a template has to take in, for the gallery. */
export type TemplateLevel = 'simple' | 'intermediate' | 'complex';

export type TemplateGroupId = 'web' | 'services' | 'data' | 'platform';

/**
 * The templates by what they are for, each group from the simplest to the most complex, as the
 * menu of the header and the gallery show them. Every template is in one group.
 */
export const TEMPLATE_GROUPS: readonly {
  readonly id: TemplateGroupId;
  readonly templates: readonly TemplateId[];
}[] = [
  {
    id: 'web',
    templates: [
      'static-site-cms',
      'serverless-api',
      'websocket-chat',
      'three-tier-web',
      'web-app-on-vms',
    ],
  },
  {
    id: 'services',
    templates: [
      'scheduled-job',
      'event-driven-microservices',
      'video-on-demand',
      'aks-microservices',
    ],
  },
  {
    id: 'data',
    templates: ['rag-chatbot', 'analytics-pipeline', 'iot-analytics', 'mlops-pipeline'],
  },
  { id: 'platform', templates: ['container-delivery', 'multi-region-dr', 'hub-spoke-network'] },
];

export const TEMPLATE_LEVELS: Readonly<Record<TemplateId, TemplateLevel>> = {
  'static-site-cms': 'simple',
  'serverless-api': 'simple',
  'websocket-chat': 'simple',
  'scheduled-job': 'simple',
  'three-tier-web': 'intermediate',
  'web-app-on-vms': 'intermediate',
  'event-driven-microservices': 'intermediate',
  'video-on-demand': 'intermediate',
  'rag-chatbot': 'intermediate',
  'analytics-pipeline': 'intermediate',
  'container-delivery': 'intermediate',
  'iot-analytics': 'complex',
  'aks-microservices': 'complex',
  'mlops-pipeline': 'complex',
  'multi-region-dr': 'complex',
  'hub-spoke-network': 'complex',
};
