import { ARCHITECTURE_TEMPLATES, type TemplateGraph, type TemplateId } from '@archdraft/core';
import type { Locale } from './locale.ts';

/** Texts of a template in another language, by node and edge id. */
interface TemplateText {
  readonly title: string;
  readonly description: string;
  readonly nodes: Readonly<Record<string, string>>;
  /** Only edges that have a label. */
  readonly edges: Readonly<Record<string, string>>;
}

/**
 * Templates in Spanish. Region codes, product names and event names stay as
 * they are, because that is how they appear in the consoles of each cloud.
 */
const SPANISH: Readonly<Record<TemplateId, TemplateText>> = {
  'three-tier-web': {
    title: 'Aplicación web en tres capas',
    description:
      'Aplicación web clásica dividida en capas de presentación, aplicación y datos. Una CDN sirve los ficheros estáticos, un balanceador de carga reparte las peticiones entre un servicio con autoescalado, y una base de datos y una caché en varias zonas viven en subredes privadas.',
    nodes: {
      user: 'Usuario',
      dns: 'DNS',
      cdn: 'CDN',
      'static-assets': 'Recursos estáticos',
      region: 'eu-west-1',
      vpc: 'VPC',
      'public-subnet': 'Subred pública',
      'app-subnet': 'Subred de aplicación',
      'data-subnet': 'Subred de datos',
      'load-balancer': 'Balanceador de carga',
      app: 'Aplicación web',
      database: 'Base de datos',
      cache: 'Caché de sesiones',
      secrets: 'Secretos',
      monitoring: 'Monitorización',
    },
    edges: {
      'user-dns': 'Resolver dominio',
      'cdn-assets': 'Ficheros estáticos',
      'cdn-load-balancer': 'Peticiones dinámicas',
      'app-secrets': 'Leer credenciales',
    },
  },
  'serverless-api': {
    title: 'API REST serverless',
    description:
      'Backend móvil hecho solo con servicios gestionados. Un API gateway comprueba los tokens que emite el proveedor de identidad e invoca funciones, los datos viven en una tabla clave-valor y el trabajo lento, como enviar correos, se ejecuta desde una cola con una cola de mensajes fallidos.',
    nodes: {
      'mobile-app': 'App móvil',
      region: 'us-east-1',
      identity: 'Inicio de sesión',
      'api-gateway': 'API REST',
      'api-handler': 'Manejador de la API',
      'orders-table': 'Tabla de pedidos',
      'jobs-queue': 'Cola de trabajos',
      'dead-letters': 'Cola de mensajes fallidos',
      worker: 'Worker en segundo plano',
      monitoring: 'Registros y métricas',
      email: 'Servicio de correo',
    },
    edges: {
      'app-identity': 'Iniciar sesión',
      'api-identity': 'Validar token',
      'api-invoke': 'Invocar',
      'handler-enqueue': 'Encolar trabajo',
      'queue-worker': 'Disparar',
      'queue-dead-letters': 'Tras 3 intentos fallidos',
    },
  },
  'event-driven-microservices': {
    title: 'Microservicios dirigidos por eventos',
    description:
      'Tienda online dividida en servicios dueños de sus datos. El servicio de pedidos publica un evento cuando se hace un pedido y los servicios de inventario y notificaciones reaccionan a él, así que un consumidor lento o caído nunca bloquea la compra.',
    nodes: {
      'web-shop': 'Tienda web',
      'api-gateway': 'API gateway',
      orders: 'Pedidos',
      'order-service': 'Servicio de pedidos',
      'orders-db': 'Base de datos de pedidos',
      'order-events': 'Eventos de pedidos',
      inventory: 'Inventario',
      'inventory-service': 'Servicio de inventario',
      'stock-db': 'Niveles de stock',
      notifications: 'Notificaciones',
      'notification-sender': 'Envío de notificaciones',
      payments: 'Proveedor de pagos',
      email: 'Servicio de correo',
      monitoring: 'Monitorización y trazas',
    },
    edges: {
      'api-orders': 'Pagar el pedido',
      'api-inventory': 'Disponibilidad de productos',
      'orders-payments': 'Cobrar la tarjeta',
      'orders-publish': 'OrderPlaced',
      'events-inventory': 'Reservar stock',
      'events-notifications': 'Enviar confirmación',
    },
  },
  'rag-chatbot': {
    title: 'Chatbot con generación aumentada por recuperación',
    description:
      'Asistente que responde preguntas con los documentos de la empresa. Un proceso de ingesta divide los documentos nuevos en fragmentos, calcula sus embeddings y llena un índice vectorial; para cada pregunta, el servicio de chat recupera los fragmentos más relevantes y se los pasa al modelo de lenguaje como contexto.',
    nodes: {
      'chat-ui': 'Interfaz de chat',
      identity: 'Acceso de empleados',
      region: 'West Europe',
      answering: 'Respuesta a preguntas',
      'api-gateway': 'API gateway',
      'chat-service': 'Servicio de chat',
      'chat-history': 'Historial de conversaciones',
      ingestion: 'Ingesta',
      documents: 'Documentos de origen',
      'ingestion-job': 'Ingesta de documentos',
      'vector-index': 'Índice vectorial',
      'embedding-model': 'Modelo de embeddings',
      'chat-model': 'Modelo de chat',
    },
    edges: {
      'ui-identity': 'Iniciar sesión',
      'ui-api': 'Hacer una pregunta',
      'api-identity': 'Validar token',
      'chat-embed': 'Vectorizar la pregunta',
      'chat-retrieve': 'Recuperar fragmentos',
      'chat-generate': 'Generar la respuesta',
      'chat-store': 'Guardar la conversación',
      'ingest-read': 'Leer documentos nuevos',
      'ingest-embed': 'Vectorizar fragmentos',
      'ingest-index': 'Insertar vectores',
    },
  },
  'analytics-pipeline': {
    title: 'Pipeline de datos analíticos',
    description:
      'Recoge eventos de navegación en tiempo real y extracciones nocturnas de la base de datos operacional, guarda los datos en bruto en un data lake y construye modelos analíticos en un almacén de datos que los analistas consultan desde una herramienta de BI.',
    nodes: {
      apps: 'Web y apps',
      analyst: 'Analista',
      region: 'europe-west1',
      ingestion: 'Ingesta',
      'load-balancer': 'Balanceador de carga',
      collector: 'Recolector de eventos',
      'raw-events': 'Eventos en bruto',
      'stream-processing': 'Procesamiento en streaming',
      'nightly-extract': 'Extracción nocturna',
      'operational-db': 'Base de datos operacional',
      modelling: 'Almacenamiento y modelado',
      'data-lake': 'Data lake',
      warehouse: 'Almacén de datos',
      transformations: 'Transformaciones programadas',
      bi: 'Cuadros de mando de BI',
    },
    edges: {
      'apps-load-balancer': 'Enviar eventos',
      'collector-publish': 'Publicar',
      'events-processing': 'Suscribirse',
      'processing-lake': 'Archivar eventos en bruto',
      'processing-warehouse': 'Inserciones en streaming',
      'extract-read': 'Leer cambios',
      'extract-write': 'Escribir instantáneas',
      'warehouse-lake': 'Consultar tablas externas',
      'transformations-warehouse': 'Construir modelos',
    },
  },
  'static-site-cms': {
    title: 'Web estática con un CMS headless',
    description:
      'Web de marketing generada como páginas estáticas. Los editores publican en un CMS alojado, un webhook lanza una compilación que sube las páginas a un almacenamiento de objetos privado detrás de una CDN, y una pequeña función atiende el formulario de contacto.',
    nodes: {
      visitor: 'Visitante',
      editor: 'Editor de contenido',
      dns: 'DNS',
      cdn: 'CDN',
      'site-files': 'Ficheros de la web',
      'contact-form': 'Formulario de contacto',
      email: 'Servicio de correo',
      cms: 'CMS headless',
      build: 'Compilación de la web',
    },
    edges: {
      'visitor-dns': 'Resolver dominio',
      'cdn-site': 'Páginas y recursos',
      'cdn-form': 'POST /contact',
      'editor-cms': 'Editar y publicar',
      'cms-webhook': 'Webhook de publicación',
      'build-fetch': 'Obtener contenido',
      'build-upload': 'Subir páginas',
      'build-purge': 'Purgar caché',
    },
  },
};

const TEXTS: Readonly<Partial<Record<Locale, Readonly<Record<TemplateId, TemplateText>>>>> = {
  es: SPANISH,
};

const cache = new Map<string, TemplateGraph>();

function translate(graph: TemplateGraph, text: TemplateText): TemplateGraph {
  return {
    ...graph,
    title: text.title,
    description: text.description,
    nodes: graph.nodes.map((node) => ({ ...node, label: text.nodes[node.id] ?? node.label })),
    edges: graph.edges.map((edge) =>
      edge.label === undefined ? edge : { ...edge, label: text.edges[edge.id] ?? edge.label },
    ),
  };
}

/**
 * A template in a language. The same object comes back for the same template
 * and language, so an untouched template can be recognised by identity.
 */
export function localizedTemplate(id: TemplateId, locale: Locale): TemplateGraph {
  const text = TEXTS[locale]?.[id];
  if (!text) return ARCHITECTURE_TEMPLATES[id];
  const key = `${locale}:${id}`;
  let graph = cache.get(key);
  if (!graph) {
    graph = translate(ARCHITECTURE_TEMPLATES[id], text);
    cache.set(key, graph);
  }
  return graph;
}

/** Texts of every template in a language, for tests. */
export function templateTexts(locale: Locale): Readonly<Record<TemplateId, TemplateText>> | null {
  return TEXTS[locale] ?? null;
}
