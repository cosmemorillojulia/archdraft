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
| T04 | Paquete de disposición automática con ELK                        | T01           | pendiente          |
| T05 | Exportación a draw.io                                            | T03, T04      | pendiente          |
| T06 | Plantillas de arquitectura                                       | T02           | pendiente          |
| T07 | Editor: estructura, sistema visual y despliegue en Pages         | T01           | pendiente          |
| T08 | Editor: lienzo que representa el grafo                           | T04, T06, T07 | pendiente          |
| T09 | Editor: edición, inspector, deshacer y rehacer                   | T08           | pendiente          |
| T10 | Editor: panel de revisión de diseño                              | T02, T09      | pendiente          |
| T11 | Editor: persistencia local, importación y enlaces para compartir | T03, T09      | pendiente          |
| T12 | Editor: exportación desde la interfaz                            | T03, T05, T09 | pendiente          |
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
| T24 | Lanzamiento 1.0                                                  | T22, T23      | pendiente          |

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

Objetivo: calcular posiciones legibles respetando contenedores.

Entregables:

- Tipos `DiagramLayout` (posiciones relativas al contenedor padre y tamaños) y `DiagramDocument` (`{ graph, layout }`) con su esquema Zod en `core`.
- `packages/layout`: `computeLayout(graph, options)` con ELK `layered`, dirección configurable, `hierarchyHandling: INCLUDE_CHILDREN`, aristas ortogonales, tamaños por defecto y relleno de cabecera en contenedores.
- `computeLayout` acepta posiciones fijadas para recolocar solo los nodos nuevos (lo usará T18).

Criterios de aceptación: determinista; sin solapes entre hermanos; hijos dentro de los límites del padre; contenedores anidados; 200 nodos en menos de 2 s en Node.js.

Documentación: `docs/modulos/layout.md` con las opciones de ELK elegidas y su motivo.

### T05. Exportación a draw.io

Objetivo: abrir el diagrama en draw.io para quien prefiera esa herramienta.

Entregables: `toDrawio(graph, layout)` que genera `mxfile` con contenedores como grupos, relación de padres, estilos por categoría, aristas discontinuas para asíncronas y escapado XML.

Criterios de aceptación: XML bien formado (validado con un parser en tests), padres correctos, escapado de caracteres especiales. Comprobación manual de apertura en draw.io anotada en la documentación.

Documentación: ampliar `docs/modulos/exportacion.md`.

### T06. Plantillas de arquitectura

Objetivo: ejemplos de calidad para la galería y para el prompt (few-shot).

Entregables: `packages/core/src/templates/` con seis plantillas: aplicación web de tres capas, API serverless, microservicios orientados a eventos, chatbot con RAG, pipeline de datos analíticos y web estática con CMS headless. Cada una con título, descripción y proveedor.

Criterios de aceptación: todas pasan `parseArchitectureGraph` sin avisos y `lintGraph` sin errores; los avisos restantes están justificados en la documentación.

Documentación: `docs/modulos/plantillas.md`.

## Fase 2: editor

### T07. Estructura, sistema visual y despliegue en Pages

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

Objetivo: ver un `DiagramDocument` en React Flow.

Entregables:

- Adaptador puro `toFlow(document)` de dominio a nodos y aristas de React Flow, con tests.
- Nodo de componente: icono de Lucide, etiqueta, producto resuelto y distintivo de proveedor. Nodo de contenedor como grupo con cabecera.
- Aristas con estilo síncrono o asíncrono y etiqueta de protocolo.
- Disposición en un Web Worker con `packages/layout`; carga diferida.
- Minimapa, controles, ajuste a la vista. Se carga una plantilla por defecto.
- Test que verifica que todos los iconos del catálogo existen en `lucide-react`.

Criterios de aceptación: las seis plantillas se ven sin solapes; el adaptador tiene tests de contenedores anidados.

Documentación: ampliar `docs/modulos/web.md`.

### T09. Edición, inspector, deshacer y rehacer

Objetivo: editar el diagrama a mano.

Entregables:

- Store con Zustand: documento, selección e historial (límite de 100 pasos).
- Acciones: añadir nodo desde la paleta (arrastrar y soltar), conectar, borrar, mover, cambiar de contenedor respetando `CONTAINMENT_RULES`, editar propiedades.
- Inspector con formularios para nodo y arista.
- Atajos de teclado: borrar, deshacer, rehacer, duplicar.
- Validación tras cada acción; una acción que produciría un grafo inválido se rechaza con un mensaje.

Criterios de aceptación: tests de las acciones del store; test de componentes del inspector.

Documentación: ADR sobre la gestión de estado; ampliar `docs/modulos/web.md`.

### T10. Panel de revisión de diseño

Objetivo: mostrar los hallazgos del motor de reglas mientras se edita.

Entregables: lista agrupada por severidad, filtros, clic para seleccionar y centrar el nodo, resaltado en el lienzo, explicación y sugerencia de cada regla, opción de desactivar reglas (preferencia local).

Criterios de aceptación: recálculo memoizado por versión del documento; tests del panel.

### T11. Persistencia local, importación y enlaces para compartir

Objetivo: no perder trabajo y poder compartirlo sin servidor.

Entregables: autoguardado en localStorage con clave versionada y manejo de errores; enlace con el documento comprimido en el fragmento (`#d=`), con aviso si es demasiado largo; importación y exportación de fichero JSON. Toda carga pasa por `importJson`.

Criterios de aceptación: ida y vuelta de un enlace sin pérdida; un enlace manipulado muestra un error y no rompe la aplicación.

### T12. Exportación desde la interfaz

Objetivo: menú de exportación completo.

Entregables: copiar y descargar Mermaid, descargar draw.io y JSON, exportar PNG y SVG del lienzo.

Criterios de aceptación: tests de generación de contenido y nombres de fichero.

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
