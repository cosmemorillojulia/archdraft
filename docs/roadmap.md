# Roadmap

Plan de implementación hasta la versión 1.0. Cada tarea es una iteración: una rama, varios commits atómicos y un merge `--no-ff` a `main` (ADR 0011).

## Reglas

- Se trabaja en la primera tarea con estado `pendiente` cuyas dependencias estén todas `hecha`. Una tarea `en curso` tiene prioridad sobre cualquier pendiente.
- Si CI está en rojo en `main`, antes de nada se arregla en una rama `fix/...`.
- Si una tarea no cabe en una iteración, se implementa un subconjunto coherente que deje `main` en verde, se marca `en curso` y se añade debajo una lista `Pendiente:` con lo que falta.
- Si una tarea depende de una acción manual del propietario (ver `operaciones.md`), se implementa todo lo posible sin ella y la acción queda anotada en la tabla de acciones pendientes.
- Al cerrar una tarea: estado `hecha (AAAA-MM-DD)`, entrada en `CHANGELOG.md` y documentación actualizada.
- Las tareas nuevas que surjan se añaden al final de su fase con el siguiente número libre; no se renumeran las existentes.

## Resumen

| Id  | Tarea                                                            | Depende de    | Estado             |
| --- | ---------------------------------------------------------------- | ------------- | ------------------ |
| T01 | Fundamentos: monorepo, CI, modelo de dominio, documentación      |               | hecha (2026-10-20) |
| T02 | Motor de reglas de diseño                                        | T01           | hecha (2026-10-20) |
| T03 | Exportación a Mermaid y JSON, importación con migraciones        | T01           | hecha (2026-10-21) |
| T04 | Paquete de disposición automática con ELK                        | T01           | hecha (2026-10-22) |
| T05 | Exportación a draw.io                                            | T03, T04      | hecha (2026-10-23) |
| T06 | Plantillas de arquitectura                                       | T02           | hecha (2026-10-24) |
| T07 | Editor: estructura, sistema visual y despliegue en Pages         | T01           | hecha (2026-10-24) |
| T08 | Editor: lienzo que representa el grafo                           | T04, T06, T07 | hecha (2026-10-25) |
| T09 | Editor: edición, inspector, deshacer y rehacer                   | T08           | hecha (2026-10-25) |
| T10 | Editor: panel de revisión de diseño                              | T02, T09      | hecha (2026-10-25) |
| T11 | Editor: persistencia local, importación y enlaces para compartir | T03, T09      | hecha (2026-10-25) |
| T12 | Editor: exportación desde la interfaz                            | T03, T05, T09 | hecha (2026-10-25) |
| T13 | API: esqueleto del Worker                                        | T01           | pendiente          |
| T14 | packages/ai: interfaz y proveedores LLM                          | T01           | pendiente          |
| T15 | Pipeline de generación y endpoint /v1/generate                   | T06, T13, T14 | pendiente          |
| T16 | Banco de evaluación: conjunto de casos y métricas                | T15           | pendiente          |
| T17 | Evaluaciones en CI y elección del modelo                         | T16           | pendiente          |
| T18 | Edición asistida con operaciones y endpoint /v1/edit             | T15           | pendiente          |
| T19 | API: límites de uso, protección y observabilidad                 | T15           | pendiente          |
| T20 | Editor: integración con la API                                   | T11, T15, T18 | pendiente          |
| T21 | Tests de extremo a extremo y accesibilidad                       | T20           | pendiente          |
| T22 | Rendimiento y presupuesto de tamaño                              | T21           | pendiente          |
| T23 | Galería de plantillas, estado vacío y onboarding                 | T20           | pendiente          |
| T24 | Lanzamiento 1.0                                                  | T22, T23, T26 | pendiente          |
| T25 | Editor: rediseño centrado en el lienzo                           | T07           | hecha (2026-10-24) |
| T26 | Revisión de diseño y pulido visual                               | T20, T23      | pendiente          |
| T27 | Editor: cabecera fija y animaciones                              | T25           | hecha (2026-10-24) |
| T28 | Editor: paleta de componentes en móvil                           | T27           | hecha (2026-10-25) |
| T29 | Editor: diagrama legible en móvil y ajustes visuales             | T28           | hecha (2026-10-25) |
| T30 | Editor: aristas que esquivan los nodos                           | T08           | pendiente          |
| T31 | Editor: figuras genéricas, flechas y animación del flujo         | T09           | hecha (2026-10-25) |
| T32 | Editor: interfaz en inglés y español                             | T10, T11      | hecha (2026-10-25) |
| T33 | Editor: fluidez al mover, cambiar el tamaño y añadir             | T31           | hecha (2026-10-25) |

## Fase 0: fundamentos

### T01. Fundamentos

Estado: hecha (2026-10-20).

Monorepo con pnpm, TypeScript estricto, ESLint con tipos, Prettier, Vitest con cobertura, CI y Dependabot. `packages/core` con esquema, catálogo, índice del grafo, validación estructural y JSON Schema, con 100 % de cobertura. Documentación: visión, arquitectura, modelo de dominio, ADR 0001 a 0011, guía de desarrollo, operaciones y este roadmap.

## Fase 1: núcleo

### T02. Motor de reglas de diseño

Estado: hecha (2026-10-20). Documentado en `docs/modulos/lint.md` y ADR 0012.

Objetivo: detectar riesgos de diseño en un grafo válido, con explicación y sugerencia.

Entregables:

- `packages/core/src/lint/`: tipos `LintRule` (id, título, descripción, severidad por defecto, función `check` sobre un `GraphIndex`) y `LintFinding` (ruleId, severidad `error | warning | info`, mensaje, nodeIds, edgeIds, sugerencia). Función `lintGraph(graph, { disabledRules? })` que devuelve los hallazgos ordenados por severidad.
- Ocho reglas como mínimo:
  - `single-point-of-failure`: cómputo que recibe tráfico síncrono con `replicas` 1 y sin `autoscaling`; `info` si `replicas` no está informado.
  - `public-database`: almacén de datos con `publiclyAccessible` o con una arista directa desde un actor o cliente. Severidad `error`.
  - `unprotected-entry`: actor o cliente que llama directamente a cómputo sin balanceador, API gateway ni CDN delante.
  - `database-single-az`: base de datos relacional o caché con `multiAz` falso (`warning`) o sin informar (`info`).
  - `unencrypted-data`: almacén de datos con `encryptedAtRest` falso.
  - `sync-chain-too-long`: camino síncrono de más de cuatro saltos desde un actor.
  - `sync-cycle`: ciclo formado solo por aristas síncronas. Severidad `error`.
  - `orphan-component`: componente sin aristas, salvo tipos transversales (`monitoring`, `secrets-manager`, `identity-provider`). Severidad `info`.
- Atributos ausentes tratados como desconocidos, nunca como falsos (ver modelo de dominio).

Criterios de aceptación:

- Cada regla con al menos un test positivo y uno negativo; un test sobre el fixture de tres capas con los hallazgos esperados.
- `lintGraph` es puro y no lanza con grafos válidos.
- Cobertura de `core` por encima de los umbrales.

Documentación: `docs/modulos/lint.md` con la tabla de reglas, severidades y justificación; ADR si se decide algo con alternativas (por ejemplo el modelo de severidades).

### T03. Exportación a Mermaid y JSON, importación con migraciones

Estado: hecha (2026-10-21). Documentado en `docs/modulos/exportacion.md`.

Objetivo: sacar el diagrama a formatos de texto e importarlo de forma segura.

Entregables:

- `toMermaid(graph, { direction })`: `flowchart` con `subgraph` por contenedor, forma de nodo por categoría (cilindro para datos, estadio para actores), aristas síncronas continuas y asíncronas discontinuas, protocolo como etiqueta.
- Saneado de identificadores para Mermaid (palabras reservadas como `end`, caracteres no admitidos) y escapado de etiquetas.
- `toJson(graph)`: JSON estable con orden de claves fijo.
- `importJson(text)`: parseo seguro, cadena de migraciones por `schemaVersion` y `parseArchitectureGraph`. La cadena existe aunque hoy no haya migraciones, con un test que use una migración ficticia.

Criterios de aceptación: tests de instantánea, tests de escapado con comillas, corchetes y saltos de línea, ida y vuelta JSON sin pérdidas.

Documentación: `docs/modulos/exportacion.md`; sección de versionado del modelo de dominio actualizada.

### T04. Paquete de disposición automática con ELK

Estado: hecha (2026-10-22). Documentado en `docs/modulos/layout.md`.

Objetivo: calcular posiciones legibles respetando contenedores.

Entregables:

- Tipos `DiagramLayout` (posiciones relativas al contenedor padre y tamaños) y `DiagramDocument` (`{ graph, layout }`) con su esquema Zod en `core`.
- `packages/layout`: `computeLayout(graph, options)` con ELK `layered`, dirección configurable, `hierarchyHandling: INCLUDE_CHILDREN`, aristas ortogonales, tamaños por defecto y relleno de cabecera en contenedores.
- `computeLayout` acepta posiciones fijadas para recolocar solo los nodos nuevos (lo usará T18).

Criterios de aceptación: determinista; sin solapes entre hermanos; hijos dentro de los límites del padre; contenedores anidados; 200 nodos en menos de 2 s en Node.js.

Documentación: `docs/modulos/layout.md` con las opciones de ELK elegidas y su motivo.

### T05. Exportación a draw.io

Estado: hecha (2026-10-23). Documentado en `docs/modulos/exportacion.md`. La apertura en draw.io queda como acción manual en `operaciones.md`.

Objetivo: abrir el diagrama en draw.io para quien prefiera esa herramienta.

Entregables: `toDrawio(graph, layout)` que genera `mxfile` con contenedores como grupos, relación de padres, estilos por categoría, aristas discontinuas para asíncronas y escapado XML.

Criterios de aceptación: XML bien formado (validado con un parser en tests), padres correctos, escapado de caracteres especiales. Comprobación manual de apertura en draw.io anotada en la documentación.

Documentación: ampliar `docs/modulos/exportacion.md`.

### T06. Plantillas de arquitectura

Estado: hecha (2026-10-24). Documentado en `docs/modulos/plantillas.md`. Ninguna plantilla produce avisos de validación ni hallazgos de diseño.

Objetivo: ejemplos de calidad para la galería y para el prompt (few-shot).

Entregables: `packages/core/src/templates/` con seis plantillas: aplicación web de tres capas, API serverless, microservicios orientados a eventos, chatbot con RAG, pipeline de datos analíticos y web estática con CMS headless. Cada una con título, descripción y proveedor.

Criterios de aceptación: todas pasan `parseArchitectureGraph` sin avisos y `lintGraph` sin errores; los avisos restantes están justificados en la documentación.

Documentación: `docs/modulos/plantillas.md`.

## Fase 2: editor

### T07. Estructura, sistema visual y despliegue en Pages

Estado: hecha (2026-10-24). Documentado en `docs/modulos/web.md` y ADR 0013. Publicado en GitHub Pages desde el 2026-10-24.

Objetivo: la base del editor publicada en internet.

Entregables:

- `apps/web` con Vite, React, TypeScript y Tailwind CSS. Usar la skill `frontend-design` para definir la dirección visual antes de escribir componentes.
- Sistema visual: tokens de color, tipografía y espaciado; modo claro y oscuro; componentes base (botón, panel, pestañas, campo).
- Estructura de la aplicación: cabecera, panel izquierdo (prompt y paleta), lienzo, panel derecho (inspector y revisión); diseño adaptable.
- Cadenas de texto centralizadas (ADR 0009).
- Workflow `deploy-web.yml`: build con base `/archdraft/`, `upload-pages-artifact` y `deploy-pages`, tras CI en verde.
- Test de humo con Testing Library.

Criterios de aceptación: build correcto; la página carga en local con `pnpm --filter web dev`; workflow de despliegue válido. Acción manual: activar Pages.

Documentación: `docs/modulos/web.md`; ADR sobre la dirección visual si hay alternativas reales.

### T08. Lienzo que representa el grafo

Estado: hecha (2026-10-25). Documentado en `docs/modulos/web.md`. Incluye zoom con la rueda, con el pellizco del trackpad o de los dedos y con botones, a petición del usuario; los contenedores son opacos desde T29.

Objetivo: ver un `DiagramDocument` en React Flow.

Entregables:

- Adaptador puro `toFlow(document)` de dominio a nodos y aristas de React Flow, con tests.
- Nodo de componente: icono de Lucide, etiqueta, producto resuelto y distintivo de proveedor. Nodo de contenedor como grupo con cabecera.
- Aristas con estilo síncrono o asíncrono y etiqueta de protocolo.
- Disposición en un Web Worker con `packages/layout`; carga diferida.
- Minimapa, controles, ajuste a la vista. Se carga una plantilla por defecto.
- Test que verifica que todos los iconos del catálogo existen en `lucide-react`.
- Diseño (ADR 0014 y 0015): sustituye la vista previa de T25 y T27 y conserva su lenguaje visual y su movimiento (construcción del diagrama, partículas en las aristas, resaltado al pasar el ratón): nodos con icono sobre el color de su categoría, contenedores translúcidos, aristas suaves y la cuadrícula de puntos; React Flow se estiliza con los tokens del sistema visual, también en modo oscuro.

Criterios de aceptación: las seis plantillas se ven sin solapes; el adaptador tiene tests de contenedores anidados; capturas de las seis plantillas en claro y oscuro revisadas con la skill `design-critique`.

Documentación: ampliar `docs/modulos/web.md`.

### T09. Edición, inspector, deshacer y rehacer

Estado: hecha (2026-10-25). Documentado en `docs/modulos/web.md` y ADR 0017. Además de lo previsto: conectar desde el inspector tocando el destino, avisos de rechazo, nodos nuevos en el hueco libre más cercano y selección con el teclado.

Objetivo: editar el diagrama a mano.

Entregables:

- Store con Zustand: documento, selección e historial (límite de 100 pasos).
- Acciones: añadir nodo desde la paleta (arrastrar y soltar en escritorio; en pantallas estrechas o táctiles, tocar un mosaico lo añade en el centro de la vista, lo selecciona y cierra la hoja de la paleta), conectar, borrar, mover, cambiar de contenedor respetando `CONTAINMENT_RULES`, editar propiedades.
- Inspector con formularios para nodo y arista, como panel flotante que aparece al seleccionar (ADR 0014).
- Atajos de teclado: borrar, deshacer, rehacer, duplicar.
- Validación tras cada acción; una acción que produciría un grafo inválido se rechaza con un mensaje.

Criterios de aceptación: tests de las acciones del store; test de componentes del inspector.

Documentación: ADR sobre la gestión de estado; ampliar `docs/modulos/web.md`.

### T10. Panel de revisión de diseño

Estado: hecha (2026-10-25). Documentado en `docs/modulos/web.md`. El panel se abre desde el estado de la revisión de la tarjeta del diagrama, que sustituyó a la barra superior flotante (ADR 0015), y comparte lugar con el inspector.

Objetivo: mostrar los hallazgos del motor de reglas mientras se edita.

Entregables: panel flotante que se abre desde el estado de la revisión de la barra superior (ADR 0014), lista agrupada por severidad, filtros, clic para seleccionar y centrar el nodo, resaltado en el lienzo, explicación y sugerencia de cada regla, opción de desactivar reglas (preferencia local).

Criterios de aceptación: recálculo memoizado por versión del documento; tests del panel.

### T11. Persistencia local, importación y enlaces para compartir

Estado: hecha (2026-10-25). Documentado en `docs/modulos/web.md`, `docs/modulos/exportacion.md` y ADR 0019. Para no perder la colocación manual, fichero, enlace y autoguardado guardan el documento con su disposición; la carga pasa por `importDocument`, que comparte con `importJson` el tratamiento del grafo.

Objetivo: no perder trabajo y poder compartirlo sin servidor.

Entregables: autoguardado en localStorage con clave versionada y manejo de errores; enlace con el documento comprimido en el fragmento (`#d=`), con aviso si es demasiado largo; importación y exportación de fichero JSON. Toda carga pasa por `importJson`.

Criterios de aceptación: ida y vuelta de un enlace sin pérdida; un enlace manipulado muestra un error y no rompe la aplicación.

### T12. Exportación desde la interfaz

Estado: hecha (2026-10-25). Documentado en `docs/modulos/web.md` y `exportacion.md`.

Objetivo: menú de exportación completo.

Entregables: copiar y descargar Mermaid, descargar draw.io y JSON, exportar PNG y SVG del lienzo.

Criterios de aceptación: tests de generación de contenido y nombres de fichero.

### T25. Rediseño centrado en el lienzo

Estado: hecha (2026-10-24). Documentado en `docs/modulos/web.md` y ADR 0014.

Objetivo: una interfaz moderna, fluida, sencilla y visual, que no se perciba como una plantilla. Surgió al revisar el resultado de T07.

Entregables: lienzo a pantalla completa con cuadrícula de puntos; barra superior, paleta y barra de descripción flotantes; paleta con buscador e iconos por categoría; plantillas de un clic; estado de la revisión de diseño; vista previa de solo lectura del diagrama con ELK cargado bajo demanda; tipografía Instrument Sans; skill `design-critique` añadida al repositorio.

Criterios de aceptación: tests de comportamiento de la aplicación, de la geometría y de los iconos; contraste AA; capturas revisadas en escritorio y móvil, en claro y oscuro.

### T27. Cabecera fija y animaciones

Estado: hecha (2026-10-24). Documentado en `docs/modulos/web.md` y ADR 0015.

Objetivo: volver a la cabecera fija de T07 sin logotipo y dar a todo el recorrido animaciones fluidas. Surgió al revisar T25.

Entregables: cabecera fija con el nombre, la descripción, el enlace al código y el tema; tarjeta flotante con el título, las cifras y la revisión del diagrama; Motion con carga diferida y tokens de movimiento; diagrama que se construye, aristas con partículas y resaltado de conexiones con etiquetas al pasar el ratón; paleta con entrada, cascada y recolocación; indicador deslizante de plantillas; ejemplos de descripción rotatorios; cambio de tema con revelado circular.

Criterios de aceptación: tests de comportamiento con las animaciones desactivadas; movimiento reducido respetado; capturas y vídeo revisados.

### T28. Paleta de componentes en móvil

Estado: hecha (2026-10-25). Documentado en `docs/modulos/web.md`.

Objetivo: que la paleta también esté disponible en pantallas estrechas, donde T27 la ocultaba.

Entregables: botón flotante y hoja modal que sube desde abajo, con fondo atenuado, resto de la página inerte, foco gestionado y cierre con botón, Escape, toque fuera o arrastre del asa; cierre con Escape también en el panel lateral; nota en T09 sobre cómo se añaden componentes en móvil.

Criterios de aceptación: tests de la hoja y del panel lateral; capturas en móvil en claro y oscuro y prueba del arrastre para cerrar.

### T29. Diagrama legible en móvil y ajustes visuales

Estado: hecha (2026-10-25). Documentado en `docs/modulos/web.md` y ADR 0016.

Objetivo: corregir lo detectado al revisar T27 y T28: en móvil los componentes del diagrama apenas se leían, los puntos del lienzo se veían dentro de los grupos, el icono de IA debía ir relleno y el cambio de tema tenía un tirón al final.

Entregables: disposición de arriba abajo y escala mínima con desplazamiento en pantallas estrechas; resaltado al tocar en pantallas táctiles; grupos opacos con tinte por nivel de anidamiento; icono de brillos relleno; fundido de colores de toda la página al cambiar de tema, con el estado del tema en la cabecera.

Criterios de aceptación: tests de la escala de dibujo y de la profundidad de anidamiento; capturas en móvil y escritorio; muestreo de colores durante el cambio de tema.

### T30. Aristas que esquivan los nodos

Objetivo: que ninguna arista pase por detrás de un nodo que no es su origen ni su destino, algo que la revisión de diseño de T08 detectó en varias plantillas porque las aristas son curvas directas entre conectores.

Entregables: usar las rutas que ya calcula ELK (secciones con puntos de inflexión) en `@archdraft/layout`, exponerlas en `DiagramLayout` y dibujarlas en el lienzo como trazos suavizados, con la etiqueta en el punto medio de la ruta; mantener la animación de trazado y las partículas.

Criterios de aceptación: tests de la ruta en la disposición y en el adaptador; capturas de las seis plantillas sin aristas que crucen nodos ajenos, revisadas con la skill `design-critique`.

### T31. Figuras genéricas, flechas y animación del flujo

Estado: hecha (2026-10-25). Documentado en `docs/modelo-de-dominio.md`, `docs/modulos/web.md`, `lint.md`, `exportacion.md`, `core.md` y `layout.md`.

Objetivo: a petición del propietario, poder dibujar flujos sencillos sin elegir un servicio, quitar las partículas de las conexiones y corregir las puntas de flecha, que quedaban tapadas o se descolocaban.

Entregables: tipos `box`, `circle`, `diamond` y `note` en la categoría `shape`, con tamaño por defecto, exportación a Mermaid y draw.io e ignorados por las reglas de diseño; figuras en el lienzo con cambio de tamaño, primeras en la paleta e inspector reducido; botón para ocultar las partículas, guardado en el navegador; punta de flecha propia con la línea terminando en su base, conectores medidos fuera de la animación de entrada y aristas que no se vuelven a montar ni se quedan cortas al editar o arrastrar.

Criterios de aceptación: tests de las figuras en core, layout y editor, de la geometría de la flecha, del botón y de que las aristas no se vuelven a montar; comprobación en Chromium de que la línea sigue al nodo durante el arrastre y de que la punta toca el borde; capturas en claro, oscuro y móvil.

### T32. Interfaz en inglés y español

Estado: hecha (2026-10-25). Documentado en `docs/modulos/web.md` y ADR 0020.

Objetivo: a petición del propietario, cambiar entre inglés y español con un único botón en lugar del enlace al código fuente (primero con banderas y después, a petición suya, con el código EN o ES del idioma actual), y quitar el enlace de React Flow de la esquina del lienzo.

Entregables: diccionarios inglés y español con las mismas claves, idioma en un store con preferencia guardada y detección del navegador, tipos de nodo, reglas, hallazgos y plantillas en español, plantilla sin editar que sigue al idioma, botón con el código del idioma, nombres de componentes en hasta dos líneas, búsqueda sin tildes y crédito a React Flow en el README.

Criterios de aceptación: tests de los diccionarios, de los hallazgos en los dos idiomas, de las plantillas traducidas, de la detección y del cambio de idioma en la aplicación; capturas en español en escritorio, oscuro y móvil, y comprobación de que ningún nombre de las plantillas se corta.

### T33. Fluidez al mover, cambiar el tamaño y añadir

Estado: hecha (2026-10-25). Documentado en `docs/modulos/web.md`.

Objetivo: a petición del propietario, que mover, cambiar el tamaño y añadir figuras y componentes sea fluido en escritorio y en móvil.

Entregables: cambio de tamaño de cualquier nodo seleccionado, con mínimos por tipo, bordes que no se mueven si no se tocan y grupos que nunca encogen por debajo de su contenido ni lo mueven; arrastrar desde la paleta con ratón y con el dedo (mantener pulsado), con el nodo siguiendo al puntero y el grupo de destino iluminado; mover un nodo sin seleccionarlo; tiradores grandes para el dedo; paneles sin desenfoque en pantallas táctiles; contexto del lienzo y manejadores de React Flow estables durante los gestos.

Criterios de aceptación: tests del cambio de tamaño, de los tiradores y del arrastre desde la paleta con ratón y con el dedo; comprobación en Chromium (escritorio y Pixel 7 emulado) de mover, cambiar el tamaño y añadir con el dedo; medida del coste de un arrastre con la CPU ralentizada antes y después.

## Fase 3: inteligencia artificial

### T13. Esqueleto del Worker

Objetivo: API desplegable con sus contratos.

Entregables:

- `apps/api` con Hono y `wrangler.jsonc` (binding de Workers AI).
- Rutas `GET /health` y `POST /v1/generate` (respuesta provisional mientras no exista el pipeline).
- Middlewares: identificador de petición, CORS con lista permitida configurable, límite de tamaño del cuerpo, validación con Zod, manejador de errores con `application/problem+json` (RFC 9457).
- Tests de rutas y middlewares.
- Workflow `deploy-api.yml` que se salta si faltan los secretos de Cloudflare.

Criterios de aceptación: tests en verde; `wrangler deploy --dry-run` correcto.

Documentación: `docs/modulos/api.md` con el contrato de cada endpoint; ADR sobre Hono y el formato de errores.

### T14. Interfaz y proveedores LLM

Objetivo: invocar modelos sin acoplarse a un proveedor.

Entregables:

- `packages/ai` con la interfaz `LlmProvider` (mensajes, JSON Schema opcional, temperatura, tokens máximos, señal de cancelación).
- Proveedor compatible con OpenAI con `fetch` inyectado, válido para GitHub Models y Groq. Comprobar en la documentación oficial los endpoints vigentes al implementarlo.
- Taxonomía de errores: límite de uso, tiempo agotado, error del proveedor, respuesta inválida.
- Adaptador del binding de Workers AI en `apps/api`.

Criterios de aceptación: tests con `fetch` falso, incluidos errores HTTP y tiempos agotados.

Documentación: `docs/modulos/ai.md`.

### T15. Pipeline de generación y /v1/generate

Objetivo: descripción en lenguaje natural a grafo válido.

Entregables:

- Constructor de prompt: resumen del catálogo, JSON Schema, reglas de modelado y dos ejemplos tomados de las plantillas.
- `generateGraph`: llamada, extracción del JSON (bloques de código, texto alrededor), `parseArchitectureGraph`, hasta dos reintentos enviando los errores, resultado con número de intentos y avisos.
- `/v1/generate` conectado al pipeline con Workers AI. Modelo provisional documentado; la elección definitiva se hace en T17.

Criterios de aceptación: tests con un proveedor falso que primero devuelve JSON inválido y luego válido; tests del extractor de JSON.

Documentación: ampliar `docs/modulos/ai.md` con el diseño del prompt.

### T16. Banco de evaluación: casos y métricas

Objetivo: medir la calidad de generación con números.

Entregables:

- `evals/` con al menos 30 casos en español e inglés: descripción, tipos obligatorios, tipos opcionales, conexiones obligatorias por pares de tipos y elementos prohibidos.
- Métricas: validez de esquema, precisión, exhaustividad y F1 de tipos, exhaustividad de conexiones, errores del motor de reglas, intentos y latencia.
- CLI que ejecuta el conjunto contra un proveedor y modelo y genera un informe JSON y Markdown.

Criterios de aceptación: el puntuador es puro y tiene tests; la CLI funciona con un proveedor falso.

Documentación: `docs/evaluacion.md` con metodología y limitaciones.

### T17. Evaluaciones en CI y elección del modelo

Objetivo: comparar modelos y elegir el de producción con datos.

Entregables: workflow `evals.yml` manual y semanal con `permissions: models: read`, informe como artefacto y resumen del job; resultados de al menos dos modelos en `docs/evaluacion.md`.

Criterios de aceptación: ADR con el modelo por defecto y su justificación numérica. Limitación conocida: desde Actions se evalúan modelos de GitHub Models; si el modelo de Workers AI no está allí, se evalúa el equivalente más cercano y se indica.

### T18. Edición asistida con operaciones y /v1/edit

Objetivo: pedir cambios en lenguaje natural sin regenerar el diagrama.

Entregables: esquema `GraphPatch` y `applyPatch` en `core` (puro, valida el resultado); prompt y `editGraph` en `packages/ai`; endpoint `/v1/edit`.

Criterios de aceptación: tests de cada operación y de parches que dejarían el grafo inválido.

### T19. Límites de uso, protección y observabilidad

Objetivo: proteger la cuota gratuita y poder diagnosticar problemas.

Entregables:

- Límite diario por IP. Investigar qué opción está disponible en el plan gratuito (binding de rate limiting, Durable Objects, KV) y documentar la elección en un ADR.
- Límites de tamaño de prompt y grafo, tiempos máximos por llamada al modelo.
- Logs JSON con identificador de petición, latencia, intentos y resultado, sin el contenido del prompt.
- Medición del tiempo de CPU de parseo y validación frente al límite de 10 ms.

Criterios de aceptación: tests del límite de uso y de las respuestas 429 con `Retry-After`.

### T20. Integración del editor con la API

Objetivo: generar y editar con IA desde el editor.

Entregables: panel de prompt conectado a `/v1/generate` y `/v1/edit`; estados de carga y error traducidos desde los tipos de problema; resaltado de los cambios aplicados por un parche; URL de la API por variable de entorno; mocks con MSW en tests; mensaje claro cuando se agota la cuota.

Criterios de aceptación: tests de los flujos con la API simulada.

## Fase 4: calidad y lanzamiento

### T21. Tests de extremo a extremo y accesibilidad

Entregables: Playwright con los flujos de cargar plantilla, añadir y conectar nodos, ver hallazgos, exportar Mermaid, compartir y abrir un enlace, y generar con la API simulada; comprobaciones con axe sin violaciones graves; job de CI.

### T22. Rendimiento y presupuesto de tamaño

Entregables: división del bundle (ELK y exportadores bajo demanda), comprobación del tamaño del JavaScript inicial en CI, Lighthouse CI con umbrales, prueba con un grafo de 200 nodos.

### T23. Galería de plantillas, estado vacío y onboarding

Entregables: estado vacío con ejemplos de prompt, galería de plantillas, ayuda de atajos de teclado y página de información con la política de privacidad (no se almacenan datos en servidor).

### T24. Lanzamiento 1.0

Entregables: README final con capturas generadas con Playwright, revisión completa de la documentación, versión 1.0.0 en todos los paquetes, sección de lanzamiento en CHANGELOG, etiqueta anotada `v1.0.0` y notas de la versión.

### T26. Revisión de diseño y pulido visual

Objetivo: que el editor completo se sienta premium antes del lanzamiento, revisado como lo haría un diseñador.

Entregables: revisión con la skill `design-critique` sobre capturas de Playwright de todos los flujos (escritorio y móvil, claro y oscuro); estados de hover, foco, carga, vacío y error coherentes en todos los paneles; microinteracciones de los flujos principales; pruebas de regresión visual con capturas de Playwright para las pantallas clave.

Criterios de aceptación: ningún hallazgo crítico ni moderado abierto en la revisión; las pruebas de regresión visual corren en CI.
