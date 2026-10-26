import {
  type ContainerKind,
  LIMITS,
  type LintRuleId,
  MAX_SYNC_HOPS,
  type NodeKind,
} from '@archdraft/core';
import type { FindingFacts, KindText, Strings } from './en.ts';

/** "a, b o c". */
function listOf(items: readonly string[], conjunction: string): string {
  return items.length <= 1
    ? (items[0] ?? '')
    : `${items.slice(0, -1).join(', ')} ${conjunction} ${items.at(-1) ?? ''}`;
}

const capitalised = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** A label in Spanish quotation marks. */
const quoted = (label: string) => `«${label}»`;

const KINDS: Record<NodeKind, KindText> = {
  user: { label: 'Usuario', description: 'Una persona que usa el sistema' },
  'web-client': { label: 'Cliente web', description: 'Aplicación en el navegador' },
  'mobile-client': { label: 'Cliente móvil', description: 'Aplicación móvil nativa o híbrida' },
  dns: { label: 'DNS', description: 'Resolución de nombres de dominio' },
  cdn: { label: 'CDN', description: 'Caché en el borde para contenido estático y cacheable' },
  'load-balancer': {
    label: 'Balanceador de carga',
    description: 'Reparte el tráfico entre instancias',
  },
  'api-gateway': {
    label: 'API gateway',
    description: 'Punto de entrada gestionado para APIs: enrutado, autenticación y límites',
  },
  waf: { label: 'Firewall de aplicaciones web', description: 'Filtra el tráfico HTTP malicioso' },
  service: { label: 'Servicio', description: 'Servicio en contenedores siempre en marcha' },
  function: { label: 'Función', description: 'Función serverless que se ejecuta por eventos' },
  vm: { label: 'Máquina virtual', description: 'Servidor virtual que gestionas tú' },
  'kubernetes-cluster': {
    label: 'Clúster de Kubernetes',
    description: 'Clúster de orquestación de contenedores',
  },
  'batch-job': {
    label: 'Proceso por lotes',
    description: 'Trabajo finito, programado o bajo demanda',
  },
  'relational-db': {
    label: 'Base de datos relacional',
    description: 'Base de datos SQL con transacciones',
  },
  'nosql-db': {
    label: 'Base de datos NoSQL',
    description: 'Base de datos clave-valor o documental',
  },
  cache: { label: 'Caché', description: 'Almacén en memoria para lecturas de baja latencia' },
  'object-storage': {
    label: 'Almacenamiento de objetos',
    description: 'Almacenamiento duradero para ficheros y blobs',
  },
  'search-index': {
    label: 'Índice de búsqueda',
    description: 'Motor de búsqueda de texto completo',
  },
  'data-warehouse': { label: 'Almacén de datos', description: 'Almacén analítico por columnas' },
  'vector-db': {
    label: 'Base de datos vectorial',
    description: 'Búsqueda por similitud sobre embeddings',
  },
  queue: { label: 'Cola', description: 'Cola de mensajes punto a punto' },
  topic: { label: 'Tema', description: 'Difusión por publicación y suscripción' },
  stream: {
    label: 'Flujo de eventos',
    description: 'Registro ordenado de eventos que se puede releer',
  },
  'event-bus': { label: 'Bus de eventos', description: 'Enrutador de eventos basado en reglas' },
  'identity-provider': {
    label: 'Proveedor de identidad',
    description: 'Autenticación y directorio de usuarios',
  },
  'secrets-manager': { label: 'Gestor de secretos', description: 'Guarda credenciales y claves' },
  monitoring: { label: 'Monitorización', description: 'Métricas, registros y alertas' },
  llm: { label: 'LLM', description: 'Modelo de lenguaje grande alojado' },
  'external-system': {
    label: 'Sistema externo',
    description: 'API o sistema de terceros fuera de tu control',
  },
  box: {
    label: 'Caja',
    description: 'Un paso, una cosa o cualquier otra idea; sin significado de arquitectura',
  },
  circle: {
    label: 'Círculo',
    description: 'Un inicio, un final o un evento; sin significado de arquitectura',
  },
  diamond: {
    label: 'Rombo',
    description: 'Una decisión o una bifurcación; sin significado de arquitectura',
  },
  note: {
    label: 'Nota',
    description: 'Un comentario sobre el diagrama; sin significado de arquitectura',
  },
  text: {
    label: 'Texto',
    description: 'Texto libre en cualquier punto del diagrama; sin significado de arquitectura',
  },
  region: { label: 'Región', description: 'Región geográfica de la nube' },
  'availability-zone': {
    label: 'Zona de disponibilidad',
    description: 'Ubicación aislada dentro de una región',
  },
  network: { label: 'Red virtual', description: 'Límite de una red privada' },
  subnet: { label: 'Subred', description: 'Rango de direcciones dentro de una red virtual' },
  boundary: {
    label: 'Frontera',
    description: 'Agrupación lógica: equipo, dominio, cuenta o zona de confianza',
  },
};

/** Indefinite article of each group, for sentences such as "Una subred va dentro de…". */
const ARTICLES: Record<ContainerKind, 'un' | 'una'> = {
  region: 'una',
  'availability-zone': 'una',
  network: 'una',
  subnet: 'una',
  boundary: 'una',
};

const containerNoun = (kind: ContainerKind) =>
  `${ARTICLES[kind]} ${KINDS[kind].label.toLowerCase()}`;

const RULES: Record<LintRuleId, { readonly title: string; readonly description: string }> = {
  'single-point-of-failure': {
    title: 'Punto único de fallo',
    description:
      'Un componente de cómputo que atiende peticiones síncronas con una sola instancia deja caer todo el camino de la petición cuando falla o se vuelve a desplegar.',
  },
  'public-database': {
    title: 'Almacén de datos expuesto a los clientes',
    description:
      'Un almacén de datos accesible desde internet o al que llaman directamente los clientes se salta la capa de aplicación que comprueba permisos y datos.',
  },
  'unprotected-entry': {
    title: 'Cómputo expuesto sin punto de entrada',
    description:
      'Los clientes que llaman directamente al cómputo no tienen terminación TLS, límite de peticiones, enrutado ni conmutación por error de un balanceador de carga, un API gateway o una CDN.',
  },
  'database-single-az': {
    title: 'Base de datos en una sola zona de disponibilidad',
    description:
      'Una base de datos relacional o una caché en una sola zona pierde el acceso a sus datos, y quizá las escrituras recientes, cuando esa zona falla.',
  },
  'unencrypted-data': {
    title: 'Datos sin cifrar en reposo',
    description:
      'El almacenamiento sin cifrar expone los datos a través de instantáneas, copias de seguridad o discos filtrados, y no cumple la mayoría de las normativas.',
  },
  'sync-chain-too-long': {
    title: 'Cadena síncrona larga',
    description: `Cada salto síncrono suma latencia y multiplica la probabilidad de fallo. Más de ${MAX_SYNC_HOPS} saltos desde un cliente es frágil.`,
  },
  'sync-cycle': {
    title: 'Ciclo síncrono',
    description:
      'Los componentes que se esperan entre sí en bucle pueden bloquearse, reintentar sin fin o caer juntos, y no se pueden desplegar por separado.',
  },
  'orphan-component': {
    title: 'Componente sin conexiones',
    description:
      'Un componente sin conexiones o sobra o le faltan las interacciones que explican su papel.',
  },
};

/** The finding worded in Spanish, from the same facts the rule used. */
function finding({ finding, labels, attributes }: FindingFacts): {
  message: string;
  suggestion: string;
} {
  const [first = '', second = ''] = labels;
  const unknown = finding.severity === 'info';
  switch (finding.ruleId) {
    case 'single-point-of-failure':
      return unknown
        ? {
            message: `${quoted(first)} atiende peticiones síncronas y no se sabe cuántas réplicas tiene`,
            suggestion:
              'Indica las instancias o el autoescalado para que el diseño diga cómo sobrevive este componente a la caída de una instancia.',
          }
        : {
            message: `${quoted(first)} atiende peticiones síncronas con una sola réplica y ${attributes?.autoscaling === false ? 'el autoescalado desactivado' : 'sin autoescalado indicado'}`,
            suggestion:
              'Ejecuta al menos dos réplicas detrás de un balanceador de carga, o activa el autoescalado con un mínimo de dos instancias.',
          };
    case 'public-database': {
      const reasons = [
        ...(attributes?.publiclyAccessible === true ? ['es accesible públicamente'] : []),
        ...(finding.edgeIds.length > 0 ? ['recibe llamadas directas de los clientes'] : []),
      ];
      return {
        message: `El almacén de datos ${quoted(first)} ${reasons.join(' y ')}`,
        suggestion:
          'Deja el almacén de datos en una red privada y accede a él a través de un servicio o una API; sirve los ficheros públicos con una CDN con acceso restringido al origen.',
      };
    }
    case 'unprotected-entry':
      return {
        message: `${quoted(first)} llama directamente a ${quoted(second)}`,
        suggestion: 'Pon delante un balanceador de carga, un API gateway o una CDN.',
      };
    case 'database-single-az':
      return unknown
        ? {
            message: `No se sabe si ${quoted(first)} abarca varias zonas de disponibilidad`,
            suggestion:
              'Indica si está en varias zonas para saber si resiste la caída de una zona.',
          }
        : {
            message: `${quoted(first)} funciona en una sola zona de disponibilidad`,
            suggestion:
              'Activa un despliegue en varias zonas con conmutación automática, o una réplica en otra zona.',
          };
    case 'unencrypted-data':
      return {
        message: `${quoted(first)} guarda datos sin cifrar en reposo`,
        suggestion:
          'Activa el cifrado en reposo, a ser posible con claves gestionadas por un servicio de claves.',
      };
    case 'sync-chain-too-long':
      return {
        message: `Una cadena síncrona de al menos ${finding.edgeIds.length} saltos empieza en un cliente: ${labels.map(quoted).join(' → ')}`,
        suggestion:
          'Haz asíncrono algún paso con una cola o un evento, guarda resultados en caché o une servicios que siempre se llaman entre sí.',
      };
    case 'sync-cycle':
      return {
        message: `Estos componentes se llaman entre sí de forma síncrona en bucle: ${labels.map(quoted).join(', ')}`,
        suggestion:
          'Rompe el bucle haciendo asíncrona una de las llamadas, o lleva la lógica compartida a un componente al que ambos puedan llamar.',
      };
    case 'orphan-component':
      return {
        message: `${quoted(first)} no tiene conexiones`,
        suggestion:
          'Conéctalo con los componentes a los que sirve o de los que depende, o quítalo.',
      };
  }
}

/** Spanish texts of the interface, with the same keys as `en.ts` (ADR 0020). */
export const es: Strings = {
  lang: 'es',
  appName: 'Archdraft',
  tagline: 'Describe una arquitectura cloud y obtén un diagrama que puedes editar y revisar',
  header: {
    themeToDark: 'Cambiar al tema oscuro',
    themeToLight: 'Cambiar al tema claro',
    language: { code: 'ES', label: 'ES, cambiar a inglés', hint: 'Cambiar a inglés' },
    newDiagram: 'Nuevo diagrama',
    newDiagramTitle: 'Diagrama sin título',
    undo: 'Deshacer',
    redo: 'Rehacer',
  },
  card: {
    components: (count: number) => (count === 1 ? 'componente' : 'componentes'),
    connections: (count: number) => (count === 1 ? 'conexión' : 'conexiones'),
    shapes: (count: number) => (count === 1 ? 'figura' : 'figuras'),
    rename: 'Nombre del diagrama',
    provider: 'Nube',
  },
  providers: {
    generic: 'Cualquier nube',
    aws: 'AWS',
    gcp: 'Google Cloud',
    azure: 'Azure',
  },
  review: {
    clean: 'Sin problemas de diseño',
    issues: (count: number) =>
      count === 1 ? '1 problema de diseño' : `${count} problemas de diseño`,
    title: 'Revisión de diseño',
    close: 'Cerrar la revisión de diseño',
    summary: (count: number) =>
      count === 0 ? 'Nada que revisar' : count === 1 ? '1 hallazgo' : `${count} hallazgos`,
    filters: 'Mostrar hallazgos por gravedad',
    groups: { error: 'Errores', warning: 'Avisos', info: 'Notas' },
    severities: { error: 'Error', warning: 'Aviso', info: 'Nota' },
    empty:
      'El diseño cumple todas las reglas activas: disponibilidad, exposición, cifrado y acoplamiento.',
    filteredOut: 'Ningún hallazgo coincide con los filtros.',
    why: 'Por qué importa',
    edit: 'Editar',
    editLabel: (label: string) => `Editar ${label}`,
    turnOff: 'Desactivar',
    turnOffLabel: (title: string) => `Desactivar la regla ${title}`,
    turnOn: 'Activar',
    turnOnLabel: (title: string) => `Activar la regla ${title}`,
    disabled: (count: number) => `Reglas desactivadas (${count})`,
    disabledNote: 'Las reglas desactivadas siguen así en este navegador.',
  },
  components: {
    discard: 'Suelta aquí para descartar',
    carryHint: 'Haz clic en el diagrama para colocarlo. Esc cancela.',
    carryShapeHint:
      'Haz clic en el diagrama para colocarlo, o arrastra para dibujarla del tamaño que quieras. Esc cancela.',
    carrying: (label: string) =>
      `Colocando ${label}. Haz clic en el diagrama para colocarlo, o pulsa Escape para cancelar.`,
    title: 'Componentes',
    open: 'Ver componentes',
    close: 'Ocultar componentes',
    search: 'Buscar componentes',
    noMatches: (query: string) => `Ningún componente coincide con «${query}».`,
    add: (label: string) => `Añadir ${label}`,
    hintWide: 'Haz clic para añadir en el centro, o arrastra al diagrama.',
    hintNarrow: 'Toca para añadir al diagrama, o mantén pulsado y arrastra para colocarlo.',
    categories: {
      actor: 'Personas y clientes',
      edge: 'Entrada y tráfico',
      compute: 'Cómputo',
      data: 'Datos',
      messaging: 'Mensajería',
      security: 'Seguridad',
      observability: 'Observabilidad',
      ai: 'IA',
      external: 'Externos',
      shape: 'Figuras',
      container: 'Grupos',
    },
  },
  prompt: {
    label: 'Describe tu arquitectura',
    examples: [
      'Una tienda online en AWS con CDN, una API en contenedores y PostgreSQL',
      'Un chatbot que responde con los documentos de la empresa, en Azure',
      'Gestión de pedidos con microservicios que se comunican por eventos',
      'Una API REST serverless con Lambda, DynamoDB y una cola de trabajos',
      'Un pipeline de clics hacia BigQuery con extracciones nocturnas',
    ],
    generate: 'Generar diagrama',
    soon: 'La generación con IA llegará pronto',
    templates: 'Plantillas',
    templateNames: {
      'three-tier-web': 'Tres capas',
      'serverless-api': 'API serverless',
      'event-driven-microservices': 'Microservicios',
      'rag-chatbot': 'Chatbot RAG',
      'analytics-pipeline': 'Analítica',
      'static-site-cms': 'Web estática',
    },
  },
  canvas: {
    label: 'Diagrama',
    diagramLabel: (title: string) => `Diagrama: ${title}`,
    layoutFailed: 'No se ha podido dibujar este diagrama. Prueba con otra plantilla.',
    miniMap: 'Vista general del diagrama',
    flow: {
      label: 'Animación del flujo',
      hide: 'Ocultar las partículas de las conexiones',
      show: 'Mostrar las partículas de las conexiones',
    },
    zoom: {
      label: 'Vista',
      in: 'Acercar',
      out: 'Alejar',
      fit: 'Ajustar el diagrama a la pantalla',
    },
    rename: 'Nombre',
    connecting: 'Elige un componente para conectar',
    cancelConnecting: 'Cancelar',
    dismiss: 'Cerrar',
    providerBadges: {
      generic: 'Externo',
      aws: 'AWS',
      gcp: 'GCP',
      azure: 'Azure',
    },
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
    event: 'Evento',
    other: 'Otro',
  },
  share: {
    open: 'Compartir',
    title: 'Compartir y exportar',
    close: 'Cerrar',
    link: 'Enlace a este diagrama',
    creating: 'Creando el enlace…',
    copy: 'Copiar enlace',
    copied: 'Copiado',
    copyFailed: 'Aquí no se puede copiar: selecciona el enlace y cópialo.',
    linkNote: 'El diagrama va dentro del enlace; no se guarda nada en ningún servidor.',
    longLink: (length: number) =>
      `Este enlace tiene ${length.toLocaleString('es')} caracteres y algunas aplicaciones cortan los enlaces largos. Para compartir un diagrama grande, descarga el fichero JSON.`,
    export: 'Exportar',
    copyMermaid: 'Copiar Mermaid',
    mermaidCopied: 'Mermaid copiado',
    formats: { json: 'JSON', mermaid: 'Mermaid', drawio: 'draw.io', svg: 'SVG', png: 'PNG' },
    downloadAs: (format: string) => `Descargar ${format}`,
    exportHint:
      'Mermaid para READMEs y documentos, draw.io para seguir editando allí, SVG y PNG como imagen.',
    exportFailed: 'No se ha podido crear la imagen. Vuelve a intentarlo o exporta SVG.',
    file: 'Fichero',
    download: 'Descargar JSON',
    openFile: 'Abrir o importar un fichero',
    fileHint:
      'Abre JSON de Archdraft, diagramas de flujo de Mermaid y ficheros de draw.io. Sustituye el diagrama; deshacer lo recupera.',
  },
  persist: {
    importedTitle: 'Diagrama importado',
    importedWithNotes: (notes: string) => `Importado. ${notes}`,
    openFailed: {
      file: (reason: string) => `No se ha podido abrir este fichero. ${reason}`,
      link: (reason: string) => `No se ha podido abrir este enlace. ${reason}`,
      saved: (reason: string) =>
        `No se ha podido recuperar el diagrama guardado en este navegador. ${reason}`,
    },
    linkDamaged: 'Está incompleto o dañado.',
    linkTooLarge: 'Es demasiado grande.',
    saveFailed:
      'Este navegador no deja guardar los cambios y se perderán al cerrar la página. Descarga el fichero JSON para conservarlos.',
  },
  edit: {
    tooManyNodes: `Un diagrama puede tener hasta ${LIMITS.maxNodes} componentes y grupos.`,
    tooManyEdges: `Un diagrama puede tener hasta ${LIMITS.maxEdges} conexiones.`,
    alreadyConnected: 'Estos componentes ya están conectados.',
    selfLoop: 'Un componente no se puede conectar consigo mismo.',
    groupEndpoint: 'Los grupos no se pueden conectar. Conecta los componentes que contienen.',
    placement: (kind: ContainerKind, parents: readonly ContainerKind[]) =>
      `${capitalised(containerNoun(kind))} va dentro de ${listOf(parents.map(containerNoun), 'o')}.`,
    invalid: (detail: string) => `Ese cambio dejaría el diagrama inválido: ${detail}`,
  },
  inspector: {
    close: 'Cerrar',
    expand: 'Mostrar propiedades',
    collapse: 'Ocultar propiedades',
    connection: 'Conexión',
    name: 'Nombre',
    chosen: (count: number) => `${count} seleccionados`,
    chosenHint: 'Arrastra uno para moverlos todos',
    fixedTo: (host: string) => `Fijo en ${host}`,
    detach: 'Soltar',
    order: 'Orden',
    bringToFront: 'Traer al frente',
    bringForward: 'Subir un nivel',
    sendBackward: 'Bajar un nivel',
    sendToBack: 'Enviar al fondo',
    product: 'Producto',
    provider: 'Se ejecuta en',
    providerDefault: (provider: string) => `El del diagrama (${provider})`,
    description: 'Descripción',
    operations: 'Operación',
    replicas: 'Instancias',
    notSet: 'Sin indicar',
    yes: 'Sí',
    no: 'No',
    attributes: {
      multiAz: 'Varias zonas',
      autoscaling: 'Autoescalado',
      publiclyAccessible: 'Acceso público',
      encryptedAtRest: 'Cifrado en reposo',
      managed: 'Servicio gestionado',
    },
    label: 'Etiqueta',
    protocol: 'Protocolo',
    protocolNone: 'Sin indicar',
    mode: 'Modo',
    modes: { auto: 'Auto', sync: 'Síncrono', async: 'Asíncrono' },
    modeHint: (mode: 'sync' | 'async') =>
      mode === 'sync' ? 'El origen espera una respuesta.' : 'El origen no espera respuesta.',
    connect: 'Conectar',
    duplicate: 'Duplicar',
    delete: 'Eliminar',
    errors: {
      required: 'Escribe un nombre.',
      tooLong: (max: number) => `Usa ${max} caracteres o menos.`,
      replicas: `Escribe un número entero del 1 al ${LIMITS.maxReplicas}.`,
    },
  },
  kinds: KINDS,
  lint: { rules: RULES, finding },
};
