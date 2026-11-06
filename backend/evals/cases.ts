import {
  ARCHITECTURE_TEMPLATES,
  type ArchitectureGraph,
  type ComponentKind,
  type TemplateId,
} from '@archdraft/shared';
import type { EvalCase, KindPair } from './case.ts';

/**
 * The evaluation set (docs/evaluacion.md). Each case says what a good answer has, by kinds of
 * component, so that any reasonable design passes. Ids are stable: reports are compared by id.
 */

/** A copy of a template, changed by `change`, to give the agent a diagram with something to fix. */
function diagram(id: TemplateId, change?: (graph: ArchitectureGraph) => void): ArchitectureGraph {
  const graph = structuredClone(ARCHITECTURE_TEMPLATES[id]) as ArchitectureGraph;
  change?.(graph);
  return graph;
}

/** What a design for production may bring without being penalised for it. */
const PRODUCTION: readonly ComponentKind[] = [
  'dns',
  'cdn',
  'load-balancer',
  'api-gateway',
  'waf',
  'identity-provider',
  'secrets-manager',
  'monitoring',
  'cache',
  'queue',
];

/** A client never talks straight to a data store. */
const NO_CLIENT_TO_DATA: readonly KindPair[] = (
  ['user', 'web-client', 'mobile-client'] as const
).flatMap((client) =>
  (['relational-db', 'nosql-db'] as const).map((store): KindPair => [client, store]),
);

const GENERATE: readonly EvalCase[] = [
  {
    id: 'generate-es-tienda',
    task: 'generate',
    locale: 'es',
    prompt:
      'Una tienda online: los usuarios entran por una CDN, un balanceador reparte el tráfico a un servicio de pedidos y los datos van a una base de datos relacional.',
    expect: {
      required: ['cdn', 'load-balancer', 'service', 'relational-db'],
      optional: [...PRODUCTION, 'object-storage'],
      connections: [
        ['cdn', 'load-balancer'],
        ['load-balancer', 'service'],
        ['service', 'relational-db'],
      ],
      forbidden: { connections: NO_CLIENT_TO_DATA },
    },
  },
  {
    id: 'generate-es-api-sin-servidor',
    task: 'generate',
    locale: 'es',
    prompt:
      'Una API REST sin servidor: API gateway, funciones y una tabla NoSQL, con inicio de sesión de los usuarios.',
    expect: {
      required: ['api-gateway', 'function', 'nosql-db', 'identity-provider'],
      optional: [...PRODUCTION, 'object-storage'],
      connections: [
        ['api-gateway', 'function'],
        ['function', 'nosql-db'],
      ],
      forbidden: { kinds: ['vm', 'kubernetes-cluster'] },
    },
  },
  {
    id: 'generate-es-pedidos-asincronos',
    task: 'generate',
    locale: 'es',
    prompt:
      'Procesar pedidos de forma asíncrona: un servicio de API recibe el pedido y lo deja en una cola; una función lo procesa y lo guarda en una base de datos relacional.',
    expect: {
      required: ['service', 'queue', 'function', 'relational-db'],
      optional: [...PRODUCTION, 'topic'],
      connections: [
        ['service', 'queue'],
        ['function', 'relational-db'],
      ],
    },
  },
  {
    id: 'generate-es-rag',
    task: 'generate',
    locale: 'es',
    prompt:
      'Un chatbot que responde con los documentos de la empresa (RAG): un servicio de chat, una base de datos vectorial, un modelo de lenguaje y el almacenamiento de los documentos.',
    expect: {
      required: ['service', 'llm', 'vector-db', 'object-storage'],
      optional: [...PRODUCTION, 'batch-job', 'function', 'nosql-db', 'relational-db'],
      connections: [
        ['service', 'llm'],
        ['service', 'vector-db'],
      ],
    },
  },
  {
    id: 'generate-es-analitica',
    task: 'generate',
    locale: 'es',
    prompt:
      'Un pipeline de analítica: los eventos de las aplicaciones llegan a un stream, se procesan y se guardan en un data lake y en un data warehouse.',
    expect: {
      required: ['stream', 'object-storage', 'data-warehouse'],
      optional: [...PRODUCTION, 'service', 'function', 'batch-job', 'topic', 'external-system'],
      connections: [['stream', 'data-warehouse']],
    },
  },
  {
    id: 'generate-es-web-estatica',
    task: 'generate',
    locale: 'es',
    prompt:
      'Una web estática con dominio propio, CDN y almacenamiento de objetos, y un formulario de contacto con una función que envía los correos por un servicio externo.',
    expect: {
      required: ['dns', 'cdn', 'object-storage', 'function', 'external-system'],
      optional: [...PRODUCTION, 'batch-job'],
      connections: [
        ['cdn', 'object-storage'],
        ['function', 'external-system'],
      ],
      forbidden: { kinds: ['relational-db', 'vm', 'kubernetes-cluster'] },
    },
  },
  {
    id: 'generate-es-kubernetes-aws',
    task: 'generate',
    locale: 'es',
    provider: 'aws',
    prompt:
      'Microservicios en Kubernetes en AWS detrás de un balanceador, con una caché Redis y una base de datos PostgreSQL.',
    expect: {
      required: ['load-balancer', 'service', 'cache', 'relational-db'],
      optional: [...PRODUCTION, 'kubernetes-cluster', 'topic', 'object-storage'],
      connections: [
        ['load-balancer', 'service'],
        ['service', 'cache'],
        ['service', 'relational-db'],
      ],
    },
  },
  {
    id: 'generate-es-eventos',
    task: 'generate',
    locale: 'es',
    prompt:
      'Microservicios que se comunican por eventos: el servicio de pedidos publica en un topic al que se suscriben los servicios de inventario y de notificaciones.',
    expect: {
      required: ['service', 'topic'],
      optional: [
        ...PRODUCTION,
        'function',
        'relational-db',
        'nosql-db',
        'event-bus',
        'external-system',
      ],
      connections: [['service', 'topic']],
    },
  },
  {
    id: 'generate-es-api-segura',
    task: 'generate',
    locale: 'es',
    prompt:
      'Una API pública protegida con un WAF, un API gateway, un proveedor de identidad y un gestor de secretos.',
    expect: {
      required: ['waf', 'api-gateway', 'identity-provider', 'secrets-manager'],
      optional: [...PRODUCTION, 'service', 'function', 'relational-db', 'nosql-db'],
      connections: [['waf', 'api-gateway']],
    },
  },
  {
    id: 'generate-es-fotos-ambiguo',
    task: 'generate',
    locale: 'es',
    prompt: 'Algo para que mis clientes suban fotos y las vean después.',
    expect: {
      required: ['object-storage'],
      optional: [...PRODUCTION, 'service', 'function', 'nosql-db', 'relational-db', 'queue'],
      forbidden: { connections: NO_CLIENT_TO_DATA },
    },
  },
  {
    id: 'generate-en-blog-gcp',
    task: 'generate',
    locale: 'en',
    provider: 'gcp',
    prompt:
      'A blog on Google Cloud: a Cloud Run service, a Cloud SQL database, Cloud Storage for the images and a CDN.',
    expect: {
      required: ['service', 'relational-db', 'object-storage', 'cdn'],
      optional: PRODUCTION,
      connections: [['service', 'relational-db']],
    },
  },
  {
    id: 'generate-en-mobile-backend',
    task: 'generate',
    locale: 'en',
    prompt:
      'Backend for a mobile app: an API gateway, user sign-in, functions, a NoSQL database and push notifications through an external service.',
    expect: {
      required: ['api-gateway', 'identity-provider', 'function', 'nosql-db', 'external-system'],
      optional: [...PRODUCTION, 'topic', 'object-storage'],
      connections: [
        ['api-gateway', 'function'],
        ['function', 'nosql-db'],
      ],
    },
  },
  {
    id: 'generate-en-video',
    task: 'generate',
    locale: 'en',
    prompt:
      'A video transcoding pipeline: uploads go to object storage, which puts a message in a queue; batch workers transcode the videos and write the results back; a CDN serves them.',
    expect: {
      required: ['object-storage', 'queue', 'batch-job', 'cdn'],
      optional: [
        ...PRODUCTION,
        'function',
        'service',
        'nosql-db',
        'relational-db',
        'topic',
        'event-bus',
      ],
      connections: [['cdn', 'object-storage']],
    },
  },
  {
    id: 'generate-en-search',
    task: 'generate',
    locale: 'en',
    prompt:
      'A product catalogue with full-text search: a service reads from a relational database and from a search index that a stream keeps in sync.',
    expect: {
      required: ['service', 'relational-db', 'search-index', 'stream'],
      optional: [...PRODUCTION, 'function', 'batch-job'],
      connections: [['service', 'search-index']],
    },
  },
  {
    id: 'generate-en-iot',
    task: 'generate',
    locale: 'en',
    prompt:
      'IoT telemetry: devices send readings to an API gateway, a stream ingests them, a function stores them in a NoSQL database, and monitoring raises alerts.',
    expect: {
      required: ['api-gateway', 'stream', 'function', 'nosql-db', 'monitoring'],
      optional: [...PRODUCTION, 'external-system', 'object-storage', 'data-warehouse', 'topic'],
      connections: [
        ['api-gateway', 'stream'],
        ['function', 'nosql-db'],
      ],
    },
  },
  {
    id: 'generate-en-azure-assistant',
    task: 'generate',
    locale: 'en',
    provider: 'azure',
    prompt:
      "An internal assistant on Azure: a service answers employees' questions with an LLM, signs them in with Entra ID and keeps the chat history.",
    expect: {
      required: ['service', 'llm', 'identity-provider'],
      optional: [
        ...PRODUCTION,
        'nosql-db',
        'relational-db',
        'vector-db',
        'object-storage',
        'function',
        'batch-job',
      ],
      connections: [['service', 'llm']],
    },
  },
  {
    id: 'generate-en-highly-available',
    task: 'generate',
    locale: 'en',
    prompt:
      'A highly available web application in two availability zones: a load balancer, autoscaling web servers on virtual machines, and a replicated relational database with a read cache.',
    expect: {
      required: ['load-balancer', 'vm', 'relational-db', 'cache'],
      optional: [...PRODUCTION, 'object-storage'],
      connections: [
        ['load-balancer', 'vm'],
        ['vm', 'relational-db'],
      ],
    },
  },
  {
    id: 'generate-en-scheduled-sync',
    task: 'generate',
    locale: 'en',
    prompt:
      'Sync the orders from Shopify into our ERP every hour with a scheduled job, and keep a log of each run.',
    expect: {
      required: ['batch-job', 'external-system'],
      optional: [
        'function',
        'queue',
        'nosql-db',
        'relational-db',
        'object-storage',
        'monitoring',
        'secrets-manager',
        'service',
        'event-bus',
      ],
      connections: [['batch-job', 'external-system']],
      forbidden: { kinds: ['cdn', 'load-balancer', 'waf'] },
    },
  },
  {
    id: 'generate-en-single-page',
    task: 'generate',
    locale: 'en',
    prompt: 'Just a single static page, nothing else.',
    expect: {
      required: ['object-storage'],
      optional: ['cdn', 'dns'],
      forbidden: {
        kinds: ['relational-db', 'nosql-db', 'service', 'function', 'vm', 'kubernetes-cluster'],
      },
    },
  },
  {
    id: 'generate-en-unsafe-request',
    task: 'generate',
    locale: 'en',
    prompt: 'A web app where the browser talks straight to the database, to keep it simple.',
    expect: {
      optional: [
        ...PRODUCTION,
        'service',
        'function',
        'relational-db',
        'nosql-db',
        'object-storage',
      ],
      forbidden: { connections: NO_CLIENT_TO_DATA },
    },
  },
];

const ON_A_DIAGRAM: readonly EvalCase[] = [
  {
    id: 'edit-es-cache-pedidos',
    task: 'edit',
    locale: 'es',
    graph: diagram('serverless-api'),
    prompt: 'Añade una caché delante de la tabla de pedidos.',
    expect: { required: ['cache'], connections: [['function', 'cache']] },
  },
  {
    id: 'edit-en-waf',
    task: 'edit',
    locale: 'en',
    graph: diagram('three-tier-web'),
    prompt: 'Put a WAF in front of the CDN.',
    expect: { required: ['waf'], connections: [['user', 'waf']] },
  },
  {
    id: 'edit-es-cache-chat',
    task: 'edit',
    locale: 'es',
    graph: diagram('rag-chatbot'),
    prompt: 'Añade una caché para las respuestas del servicio de chat.',
    expect: { required: ['cache'], connections: [['service', 'cache']] },
  },
  {
    id: 'edit-en-remove-extract',
    task: 'edit',
    locale: 'en',
    graph: diagram('analytics-pipeline'),
    prompt: 'Stop the nightly extract from reading the operational database.',
    expect: { forbidden: { connections: [['batch-job', 'relational-db']] } },
  },
  {
    id: 'improve-en-public-database',
    task: 'improve',
    locale: 'en',
    // The user reaches the database directly: `public-database`.
    graph: diagram('three-tier-web', (graph) => {
      graph.edges.push({ id: 'user-database', source: 'user', target: 'database', mode: 'sync' });
    }),
    expect: { forbidden: { connections: [['user', 'relational-db']] } },
  },
  {
    id: 'improve-es-entrada-sin-proteger',
    task: 'improve',
    locale: 'es',
    // The app calls the function past the gateway: `unprotected-entry`.
    graph: diagram('serverless-api', (graph) => {
      graph.edges.push({
        id: 'mobile-app-api-handler',
        source: 'mobile-app',
        target: 'api-handler',
        mode: 'sync',
      });
    }),
    expect: { forbidden: { connections: [['mobile-client', 'function']] } },
  },
  {
    id: 'improve-en-sound-design',
    task: 'improve',
    locale: 'en',
    graph: diagram('rag-chatbot'),
    prompt: 'What would you add before going to production?',
    expect: { required: ['monitoring'], optional: PRODUCTION },
  },
  {
    id: 'simplify-en-unused-parts',
    task: 'simplify',
    locale: 'en',
    // An event bus nobody listens to, on top of the template.
    graph: diagram('three-tier-web', (graph) => {
      graph.nodes.push({ id: 'events', kind: 'event-bus', label: 'Events', parentId: 'region' });
      graph.edges.push({ id: 'app-events', source: 'app', target: 'events', mode: 'async' });
    }),
    expect: {
      required: ['load-balancer', 'service', 'relational-db'],
      forbidden: { kinds: ['event-bus'] },
    },
  },
  {
    id: 'simplify-es-kubernetes-de-mas',
    task: 'simplify',
    locale: 'es',
    // A Kubernetes cluster to serve what object storage already serves.
    graph: diagram('static-site-cms', (graph) => {
      graph.nodes.push({ id: 'cluster', kind: 'kubernetes-cluster', label: 'Web servers' });
      graph.edges.push({ id: 'cdn-cluster', source: 'cdn', target: 'cluster', mode: 'sync' });
    }),
    expect: {
      required: ['cdn', 'object-storage'],
      forbidden: { kinds: ['kubernetes-cluster'] },
    },
  },
  {
    id: 'extend-es-web-estatica',
    task: 'extend',
    locale: 'es',
    graph: diagram('static-site-cms'),
    expect: { required: ['monitoring'], optional: PRODUCTION },
  },
  {
    id: 'extend-es-api-sin-servidor',
    task: 'extend',
    locale: 'es',
    graph: diagram('serverless-api'),
    prompt: 'La clave del servicio de correo no debe estar en el código.',
    expect: { required: ['secrets-manager'], optional: PRODUCTION },
  },
  {
    id: 'extend-en-analytics',
    task: 'extend',
    locale: 'en',
    graph: diagram('analytics-pipeline'),
    expect: { required: ['monitoring'], optional: PRODUCTION },
  },
];

export const EVAL_CASES: readonly EvalCase[] = [...GENERATE, ...ON_A_DIAGRAM];
