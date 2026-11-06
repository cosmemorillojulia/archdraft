import type { TemplateId } from '@archdraft/shared';
import {
  Bot,
  ChartColumn,
  CloudCog,
  Layers,
  type LucideIcon,
  Newspaper,
  Workflow,
} from 'lucide-react';

/** The icon of each template, in the menu of the header and in the gallery. */
export const TEMPLATE_ICONS = {
  'three-tier-web': Layers,
  'serverless-api': CloudCog,
  'event-driven-microservices': Workflow,
  'rag-chatbot': Bot,
  'analytics-pipeline': ChartColumn,
  'static-site-cms': Newspaper,
} satisfies Record<TemplateId, LucideIcon>;
