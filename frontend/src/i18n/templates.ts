import { ARCHITECTURE_TEMPLATES, type TemplateGraph, type TemplateId } from '@archdraft/shared';
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
  'web-app-on-vms': {
    title: 'Aplicación web en máquinas virtuales',
    description:
      'Un sitio de contenidos como WordPress en servidores que gestionas tú. Una CDN guarda en caché las páginas y sirve los medios desde el almacenamiento de objetos, un balanceador reparte el resto entre un grupo con autoescalado de máquinas virtuales en subredes privadas, y los servidores comparten una base de datos, una caché y un sistema de ficheros para las subidas. Una puerta de enlace NAT les deja descargar actualizaciones sin que se pueda llegar a ellos desde internet.',
    nodes: {
      visitor: 'Visitante',
      dns: 'DNS',
      cdn: 'CDN',
      media: 'Medios y ficheros estáticos',
      region: 'us-east-1',
      vpc: 'VPC',
      'public-subnet': 'Subredes públicas',
      'app-subnet': 'Subredes de aplicación',
      'data-subnet': 'Subredes de datos',
      'load-balancer': 'Balanceador de carga',
      nat: 'Puerta de enlace NAT',
      web: 'Servidores web',
      database: 'Base de datos',
      cache: 'Caché de objetos',
      uploads: 'Subidas compartidas',
      monitoring: 'Métricas y alarmas',
      updates: 'Actualizaciones de plugins y del núcleo',
    },
    edges: {
      'visitor-dns': 'Resolver dominio',
      'cdn-media': 'Medios y ficheros estáticos',
      'cdn-load-balancer': 'Páginas dinámicas',
      'web-uploads': 'Montar',
      'web-media': 'Descargar las subidas',
      'web-nat': 'Actualizaciones en segundo plano',
    },
  },
  'scheduled-job': {
    title: 'Tarea programada',
    description:
      'Trabajo que se ejecuta según un horario sin nada encendido entre medias. Un programador lanza una función cada noche; lee el día de la base de datos, escribe un informe en el almacenamiento de objetos y lo envía por correo. Las ejecuciones que fallan van a una cola de mensajes fallidos para reintentarlas o revisarlas.',
    nodes: {
      region: 'eu-central-1',
      schedule: 'Cada noche a las 02:00',
      job: 'Informe diario',
      orders: 'Pedidos',
      reports: 'Informes',
      email: 'Correo',
      failures: 'Ejecuciones fallidas',
      logs: 'Registros',
      team: 'Equipo de finanzas',
    },
    edges: {
      'schedule-job': 'Invocar',
      'job-orders': 'Leer el día',
      'job-reports': 'Escribir CSV',
      'job-email': 'Enviar informe',
      'schedule-failures': 'Tras los reintentos',
      'email-team': 'Informe',
    },
  },
  'websocket-chat': {
    title: 'Chat en tiempo real con WebSockets',
    description:
      'Un chat en el que los mensajes llegan a toda la sala a la vez. Los clientes mantienen abierto un WebSocket con un API gateway, que ejecuta una función cuando alguien se conecta, envía un mensaje o se va. Las funciones guardan las conexiones abiertas en una tabla y devuelven cada mensaje por el gateway a todas las conexiones.',
    nodes: {
      browser: 'Chat en el navegador',
      phone: 'App de chat',
      region: 'us-west-2',
      identity: 'Inicio de sesión',
      gateway: 'API WebSocket',
      'on-connect': 'Al conectar',
      'send-message': 'Enviar mensaje',
      'on-disconnect': 'Al desconectar',
      connections: 'Conexiones abiertas',
      logs: 'Registros',
    },
    edges: {
      'browser-identity': 'Iniciar sesión',
      'gateway-identity': 'Validar token',
      'gateway-connect': '$connect',
      'gateway-send': 'sendmessage',
      'gateway-disconnect': '$disconnect',
      'connect-table': 'Guardar id',
      'send-table': 'Listar la sala',
      'disconnect-table': 'Quitar id',
      'send-post': 'Enviar a cada conexión',
    },
  },
  'container-delivery': {
    title: 'Entrega continua de contenedores',
    description:
      'Cada cambio en la rama principal se compila, se prueba y llega a Kubernetes. Un servicio de compilación crea la imagen del contenedor, la guarda en un registro y crea una versión; el pipeline de entrega la despliega en preproducción y, cuando alguien la aprueba, promociona la misma imagen a producción.',
    nodes: {
      developer: 'Desarrollador',
      repository: 'Repositorio git',
      approver: 'Aprobador de versiones',
      customer: 'Cliente',
      region: 'europe-west1',
      delivery: 'Entrega',
      build: 'Compilar y probar',
      images: 'Imágenes de contenedor',
      artifacts: 'Artefactos de compilación',
      pipeline: 'Pipeline de entrega',
      staging: 'Preproducción',
      'staging-cluster': 'Clúster de preproducción',
      production: 'Producción',
      'load-balancer': 'Balanceador de carga',
      'production-cluster': 'Clúster de producción',
      logs: 'Registros',
      monitoring: 'Métricas y alertas',
    },
    edges: {
      'developer-repository': 'git push',
      'repository-build': 'Disparar en main',
      'build-images': 'Subir imagen',
      'build-artifacts': 'Informes de pruebas',
      'build-pipeline': 'Crear versión',
      'pipeline-staging': 'Desplegar',
      'approver-pipeline': 'Aprobar la promoción',
      'pipeline-production': 'Promocionar',
      'staging-images': 'Descargar imagen',
      'production-images': 'Descargar imagen',
    },
  },
  'iot-analytics': {
    title: 'Telemetría y analítica IoT',
    description:
      'Los dispositivos envían lecturas a un hub gestionado. Un trabajo de streaming mantiene el último estado de cada dispositivo para la app de operaciones, mientras una base de datos de series temporales ingiere cada lectura para el histórico, los paneles y las alertas, y exporta los datos antiguos a un almacenamiento barato. Los modelos entrenados con ese histórico puntúan las lecturas nuevas.',
    nodes: {
      devices: 'Dispositivos de campo',
      operator: 'App de operaciones',
      analyst: 'Analista',
      'on-call': 'Ingeniero de guardia',
      dashboards: 'Paneles',
      region: 'northeurope',
      ingestion: 'Ingesta',
      hub: 'Hub de dispositivos',
      'stream-job': 'Procesado casi en tiempo real',
      serving: 'Operaciones',
      'api-management': 'API',
      api: 'API de operaciones',
      'device-state': 'Estado de los dispositivos',
      analytics: 'Analítica',
      history: 'Histórico de telemetría',
      archive: 'Archivo Parquet',
      models: 'Modelos de anomalías',
      alerts: 'Reglas de alerta',
      email: 'Correo de alertas',
    },
    edges: {
      'devices-hub': 'Lecturas por MQTT',
      'stream-job-state': 'Último estado',
      'hub-history': 'Ingerir cada lectura',
      'history-archive': 'Exportación continua',
      'api-history': 'Tendencias',
      'dashboards-history': 'Consultar',
      'models-history': 'Entrenar y puntuar',
      'alerts-history': 'Comprobar umbrales',
      'email-on-call': 'Alerta',
    },
  },
  'video-on-demand': {
    title: 'Vídeo bajo demanda',
    description:
      'Los vídeos subidos se codifican para cada pantalla y se sirven en todo el mundo. Un fichero nuevo en el bucket de origen arranca un flujo que lo analiza, lanza un trabajo de transcodificación a formatos de streaming adaptativo y registra cada paso en una tabla; cuando el trabajo termina, un evento reanuda el flujo, que avisa a los operadores y publica el resultado detrás de una CDN.',
    nodes: {
      studio: 'Herramienta de subida del estudio',
      viewer: 'Espectador',
      operators: 'Operadores',
      cdn: 'CDN',
      region: 'us-east-1',
      ingest: 'Ingesta y procesado',
      source: 'Vídeos originales',
      workflow: 'Ingerir, procesar, publicar',
      steps: 'Pasos del flujo',
      transcoding: 'Transcodificación',
      'job-events': 'Eventos de trabajos',
      metadata: 'Metadatos de vídeo',
      delivery: 'Distribución',
      renditions: 'Versiones HLS y DASH',
      notifications: 'Avisos de trabajos',
      monitoring: 'Métricas y registros',
    },
    edges: {
      'studio-source': 'Subir',
      'source-workflow': 'Fichero nuevo',
      'workflow-steps': 'Analizar y planificar',
      'steps-metadata': 'Registrar el avance',
      'workflow-transcoding': 'Iniciar trabajo',
      'transcoding-source': 'Leer original',
      'transcoding-renditions': 'Escribir versiones',
      'transcoding-events': 'Trabajo terminado',
      'events-workflow': 'Reanudar',
      'workflow-notifications': 'Publicado',
      'notifications-operators': 'Correo',
      'cdn-renditions': 'Segmentos',
    },
  },
  'aks-microservices': {
    title: 'Microservicios en Kubernetes',
    description:
      'Un servicio de reparto dividido en microservicios sobre un clúster de Kubernetes gestionado. El ingress recibe las peticiones; el servicio de ingesta las deja en una cola para que los picos nunca lleguen al resto, y el servicio de flujo las recoge y llama a los servicios de reparto, planificación y paquetes, cada uno con sus datos. Las imágenes, los secretos, la identidad, los despliegues y la telemetría son servicios compartidos.',
    nodes: {
      client: 'App cliente',
      region: 'westeurope',
      vnet: 'Red virtual',
      cluster: 'Clúster de Kubernetes',
      ingress: 'Ingress',
      ingestion: 'Ingesta',
      requests: 'Solicitudes de reparto',
      workflow: 'Flujo de reparto',
      delivery: 'Reparto',
      'drone-scheduler': 'Planificador de drones',
      package: 'Paquetes',
      'delivery-status': 'Estado del reparto',
      packages: 'Datos de paquetes',
      shared: 'Servicios compartidos',
      pipelines: 'Compilar y desplegar',
      images: 'Imágenes de contenedor',
      identity: 'Identidad de las cargas',
      secrets: 'Secretos',
      monitoring: 'Métricas y alertas',
      tracing: 'Trazas distribuidas',
    },
    edges: {
      'ingress-ingestion': 'Programar una recogida',
      'ingress-delivery': 'Estado del reparto',
      'ingestion-requests': 'Encolar',
      'requests-workflow': 'Consumir',
      'pipelines-images': 'Subir imágenes',
    },
  },
  'mlops-pipeline': {
    title: 'Aprendizaje automático en producción',
    description:
      'Un modelo que entrenan, comprueban y despliegan pipelines en lugar de personas. Los cambios en el código del pipeline se compilan y prueban como cualquier otro software; el pipeline de entrenamiento se ejecuta según un horario o cuando el modelo se desvía, prepara variables a partir del almacén de datos, entrena y evalúa, y registra el modelo, que se sirve detrás de la API del producto.',
    nodes: {
      'data-scientist': 'Científico de datos',
      repository: 'Código del pipeline',
      customer: 'Cliente',
      region: 'us-central1',
      build: 'Integración continua',
      ci: 'Compilar y probar el pipeline',
      images: 'Imágenes del pipeline',
      training: 'Entrenamiento continuo',
      schedule: 'Reentrenar cada semana',
      pipeline: 'Pipeline de entrenamiento',
      features: 'Preparar variables',
      warehouse: 'Datos de entrenamiento',
      artifacts: 'Datasets y modelos',
      'model-registry': 'Registro de modelos',
      serving: 'Servicio del modelo',
      'load-balancer': 'Balanceador de carga',
      'product-api': 'API del producto',
      endpoint: 'Endpoint de predicción',
      'model-monitoring': 'Monitorización del modelo',
    },
    edges: {
      'scientist-repository': 'git push',
      'repository-ci': 'Disparar',
      'ci-images': 'Subir componentes',
      'ci-pipeline': 'Desplegar el pipeline',
      'schedule-pipeline': 'Ejecutar',
      'features-warehouse': 'Extraer',
      'pipeline-artifacts': 'Entrenar y evaluar',
      'pipeline-registry': 'Registrar si mejora',
      'registry-endpoint': 'Desplegar modelo',
      'api-endpoint': 'Predecir',
      'endpoint-monitoring': 'Predicciones',
      'monitoring-pipeline': 'Reentrenar si se desvía',
    },
  },
  'multi-region-dr': {
    title: 'Recuperación ante desastres multirregión',
    description:
      'Una aplicación que sigue funcionando aunque caiga una región entera. El DNS manda a los usuarios a la región principal mientras sus comprobaciones de salud pasan y a la región en espera cuando fallan. La región en espera ejecuta el mismo clúster a menor tamaño, lista para crecer, y recibe la base de datos, la caché y las copias de los volúmenes por replicación asíncrona.',
    nodes: {
      user: 'Usuario',
      dns: 'DNS de conmutación',
      primary: 'us-east-1 (principal)',
      'primary-load-balancer': 'Balanceador de carga',
      'primary-cluster': 'Clúster de la aplicación',
      'primary-database': 'Base de datos principal',
      'primary-cache': 'Caché',
      'primary-backups': 'Copias de volúmenes',
      standby: 'us-west-2 (en espera)',
      'standby-load-balancer': 'Balanceador de carga',
      'standby-cluster': 'Clúster en espera',
      'standby-database': 'Réplica en otra región',
      'standby-cache': 'Réplica de la caché',
      'standby-backups': 'Duplicado de las copias',
      monitoring: 'Comprobaciones y alarmas',
    },
    edges: {
      'user-dns': 'Resolver dominio',
      'user-primary': 'Funcionamiento normal',
      'user-standby': 'Tras la conmutación',
      'dns-health': 'Comprobación de salud',
      'primary-cluster-backups': 'Instantáneas de volúmenes',
      'database-replication': 'Replicación asíncrona',
      'cache-replication': 'Almacén global',
      'backup-replication': 'Replicación entre regiones',
      'standby-restore': 'Restaurar volúmenes',
    },
  },
  'hub-spoke-network': {
    title: 'Red hub and spoke',
    description:
      'La red de una empresa ampliada a la nube. La oficina se conecta por VPN a una red hub que reúne lo que comparten todas las cargas: la puerta de enlace, un firewall que inspecciona el tráfico entre redes y hacia internet, y la monitorización. Cada carga vive en su propia red spoke, emparejada con el hub, así que solo llega a la oficina y a internet a través del firewall.',
    nodes: {
      office: 'Red de la oficina',
      employees: 'Empleados',
      internet: 'Servicios de internet permitidos',
      region: 'westeurope',
      hub: 'Red hub',
      'gateway-subnet': 'GatewaySubnet',
      vpn: 'Puerta de enlace VPN',
      'firewall-subnet': 'AzureFirewallSubnet',
      firewall: 'Firewall',
      monitoring: 'Monitorización de red',
      production: 'Spoke de producción',
      'app-subnet': 'Aplicación',
      app: 'Aplicación de negocio',
      'data-subnet': 'Datos',
      database: 'Base de datos',
      development: 'Spoke de desarrollo',
      'build-subnet': 'Agentes de compilación',
      agents: 'Agentes de compilación',
    },
    edges: {
      'employees-vpn': 'VPN de sitio a sitio',
      'vpn-firewall': 'Inspeccionar',
      'firewall-app': 'Puertos permitidos',
      'agents-firewall': 'Todo el tráfico de salida',
      'firewall-internet': 'Dominios permitidos',
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
