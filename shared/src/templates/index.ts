import type { ArchitectureGraph } from '../schema.ts';
import { analyticsPipeline } from './analytics-pipeline.ts';
import { eventDrivenMicroservices } from './event-driven-microservices.ts';
import { ragChatbot } from './rag-chatbot.ts';
import { serverlessApi } from './serverless-api.ts';
import { staticSiteCms } from './static-site-cms.ts';
import { threeTierWeb } from './three-tier-web.ts';
import { webAppOnVms } from './web-app-on-vms.ts';
import { scheduledJob } from './scheduled-job.ts';
import { websocketChat } from './websocket-chat.ts';
import { containerDelivery } from './container-delivery.ts';
import { iotAnalytics } from './iot-analytics.ts';
import { videoOnDemand } from './video-on-demand.ts';
import { aksMicroservices } from './aks-microservices.ts';
import { mlopsPipeline } from './mlops-pipeline.ts';
import { multiRegionDr } from './multi-region-dr.ts';
import { hubSpokeNetwork } from './hub-spoke-network.ts';

/** Template ids, in the order the gallery shows them. */
export const TEMPLATE_IDS = [
  'three-tier-web',
  'serverless-api',
  'event-driven-microservices',
  'rag-chatbot',
  'analytics-pipeline',
  'static-site-cms',
  'web-app-on-vms',
  'scheduled-job',
  'websocket-chat',
  'container-delivery',
  'iot-analytics',
  'video-on-demand',
  'aks-microservices',
  'mlops-pipeline',
  'multi-region-dr',
  'hub-spoke-network',
] as const;
export type TemplateId = (typeof TEMPLATE_IDS)[number];

/** A template always has the title, description and provider the gallery shows. */
export type TemplateGraph = ArchitectureGraph & { readonly description: string };

const templates = {
  'three-tier-web': threeTierWeb,
  'serverless-api': serverlessApi,
  'event-driven-microservices': eventDrivenMicroservices,
  'rag-chatbot': ragChatbot,
  'analytics-pipeline': analyticsPipeline,
  'static-site-cms': staticSiteCms,
  'web-app-on-vms': webAppOnVms,
  'scheduled-job': scheduledJob,
  'websocket-chat': websocketChat,
  'container-delivery': containerDelivery,
  'iot-analytics': iotAnalytics,
  'video-on-demand': videoOnDemand,
  'aks-microservices': aksMicroservices,
  'mlops-pipeline': mlopsPipeline,
  'multi-region-dr': multiRegionDr,
  'hub-spoke-network': hubSpokeNetwork,
} satisfies Record<TemplateId, TemplateGraph>;

function deepFreeze(value: unknown): void {
  if (typeof value !== 'object' || value === null) return;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
}

deepFreeze(templates);

/**
 * Reference architectures for the gallery and for the few-shot examples of
 * the generation prompt, see docs/modulos/plantillas.md.
 *
 * They are shared module state, so they are deeply frozen: code that mutated
 * one by mistake would corrupt it for every later reader. Copy a template with
 * `structuredClone` before editing it in place.
 */
export const ARCHITECTURE_TEMPLATES: Readonly<Record<TemplateId, TemplateGraph>> = templates;
