# Arquitectura

Este documento describe el sistema completo tal y como está diseñado para la versión 1.0. Cada sección indica qué partes existen ya y cuáles están planificadas, con la tarea del [roadmap](roadmap.md) que las implementa.

## 1. Restricciones que dan forma al diseño

| Restricción                            | Origen                      | Consecuencia en el diseño                                |
| -------------------------------------- | --------------------------- | -------------------------------------------------------- |
| Coste cero y sin tarjeta               | Requisito del proyecto      | GitHub Pages, Cloudflare Workers y Workers AI (ADR 0004) |
| Sin base de datos                      | Coste cero y privacidad     | El estado vive en el navegador; se comparte en la URL    |
| Cuota diaria de inferencia baja        | Plan gratuito de Workers AI | Límite de uso por IP; el editor funciona sin IA          |
| 10 ms de CPU por petición en el Worker | Plan gratuito de Workers    | Trabajo síncrono mínimo en la API; validación ligera     |
| Salida de un LLM no confiable          | Naturaleza del componente   | Toda respuesta se valida con el esquema antes de usarse  |

## 2. Contexto

```mermaid
flowchart LR
  user([Usuario])
  subgraph archdraft [Archdraft]
    web[Editor web]
    api[API]
  end
  wai[(Workers AI)]
  gh[GitHub<br/>Pages · Actions]

  user -->|usa en el navegador| web
  web -->|genera y edita con IA| api
  api -->|inferencia| wai
  gh -->|aloja y despliega| web
  gh -.->|ejecuta evaluaciones| api
```

El usuario solo interactúa con el editor. El editor es útil sin la API: se puede dibujar a mano, usar plantillas, revisar y exportar. La API añade la generación y la edición en lenguaje natural.

## 3. Contenedores

```mermaid
flowchart TB
  subgraph browser [Navegador]
    web["frontend<br/>React · React Flow · Zustand"]
    worker["Web Worker de disposición<br/>frontend/src/layout · ELK.js"]
    storage[(localStorage<br/>y fragmento de URL)]
  end
  subgraph cloudflare [Cloudflare]
    api["backend<br/>Hono en Workers · agente"]
    ai[(Workers AI)]
  end
  shared[["shared<br/>esquema · validación · reglas · exportadores · contrato de la API"]]
  evals["backend/evals<br/>CLI + GitHub Actions"]
  ghm[(Groq<br/>API compatible con OpenAI)]

  web <--> worker
  web <--> storage
  web -->|HTTPS JSON| api
  api --> ai
  shared -.->|importado por| web
  shared -.->|importado por| api
  evals -.->|ejecuta el agente de| api
  evals -->|inferencia| ghm
```

El repositorio tiene tres paquetes, uno por carpeta (ADR 0021): lo que corre en el navegador, lo que corre en el servidor y lo que usan los dos.

| Paquete    | Nombre              | Responsabilidad                                                                                                                     | Tecnología                                         | Despliegue         | Estado                                                              |
| ---------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | ------------------ | ------------------------------------------------------------------- |
| `frontend` | `@archdraft/web`    | Editor visual, revisión en vivo, exportación, persistencia local y disposición automática (`src/layout`, en un Web Worker)          | React, Vite, Tailwind, React Flow, Zustand, ELK.js | GitHub Pages       | Hecho (T04, T07 a T12, T25 a T33); integración con el agente en T20 |
| `backend`  | `@archdraft/api`    | Capa HTTP (`src/http`), proveedores LLM (`src/llm`) y agente: prompts, pipeline con reintentos y tareas (`src/agent`)               | Hono, Cloudflare Workers, Workers AI               | Cloudflare Workers | Hecho (T13 a T15, T18, T35); límites de uso en T19                  |
| `shared`   | `@archdraft/shared` | Modelo de dominio: esquema, catálogo, índice del grafo, validación, reglas de diseño, exportadores, plantillas y contrato de la API | TypeScript puro, Zod                               | Librería interna   | Hecho (T01 a T06, T15, T18)                                         |

La regla de dependencias es estricta: `frontend` y `backend` dependen de `shared`; `shared` no depende de nadie, y `frontend` y `backend` nunca se importan entre sí. Lo que necesitan los dos lados, como el contrato de `/v1/assist`, va en `shared`. El banco de evaluación vive en `backend/evals/` y ejecuta el mismo agente que la API: lo que se mide es lo que se despliega (`evaluacion.md`). El código de dominio y el agente no hacen E/S por su cuenta; reciben `fetch` o el proveedor por parámetro, así que se prueban sin red, sin navegador y sin Worker.

## 4. Componentes

### 4.1 shared

| Módulo           | Contenido                                                                                    | Estado |
| ---------------- | -------------------------------------------------------------------------------------------- | ------ |
| `kinds.ts`       | Vocabularios cerrados: proveedores, categorías, tipos de nodo, protocolos, modos             | Hecho  |
| `schema.ts`      | Esquema Zod del diagrama, límites, tipos derivados                                           | Hecho  |
| `catalog.ts`     | Definición de cada tipo de nodo, mapeo a productos, reglas de anidamiento                    | Hecho  |
| `graph.ts`       | Índice del grafo y recorridos (ancestros, descendientes), resolución de proveedor y producto | Hecho  |
| `validate.ts`    | Validación estructural y punto de entrada para datos no confiables                           | Hecho  |
| `json-schema.ts` | JSON Schema derivado para el LLM                                                             | Hecho  |
| `lint/`          | Motor de reglas de diseño                                                                    | Hecho  |
| `export/`        | Mermaid y JSON (T03), draw.io (T05)                                                          | Hecho  |
| `migrations.ts`  | Cadena de migraciones por `schemaVersion`, aplicada por `importJson`                         | Hecho  |
| `document.ts`    | Esquemas de `DiagramLayout` y `DiagramDocument`: grafo más posiciones y tamaños              | Hecho  |
| `templates/`     | Seis arquitecturas de referencia para la galería y el prompt                                 | Hecho  |
| `patch.ts`       | Operaciones de edición (añadir, quitar, modificar) y su aplicación                           | Hecho  |
| `assist/`        | Contrato de `POST /v1/assist`, compartido por el backend y el editor                         | Hecho  |

Detalle en [modelo-de-dominio.md](modelo-de-dominio.md), [modulos/shared.md](modulos/shared.md), [modulos/lint.md](modulos/lint.md), [modulos/exportacion.md](modulos/exportacion.md), [modulos/plantillas.md](modulos/plantillas.md) y, para la disposición, [modulos/layout.md](modulos/layout.md).

### 4.2 frontend

Hoy existen la estructura de la aplicación, el despliegue en Pages (T07), la interfaz centrada en el lienzo (T25, ADR 0014) y el lienzo React Flow con el adaptador `toFlow`, la disposición en un Web Worker y el zoom (T08), y la edición con el store de Zustand, el inspector y el historial (T09, ADR 0017, ver [modulos/web.md](modulos/web.md)). El panel de revisión de diseño llegó con T10, y el autoguardado, los enlaces y los ficheros JSON con T11. La exportación llegó con T12 y el asistente de IA, con su cliente de la API, con T20. El diagrama muestra el diseño completo:

```mermaid
flowchart LR
  prompt[Panel de prompt] --> client[Cliente de la API]
  client --> store
  palette[Paleta] --> store
  inspector[Inspector] <--> store
  store[(Store Zustand<br/>documento + historial)] --> adapter[Adaptador dominio ↔ React Flow]
  adapter --> canvas[Lienzo React Flow]
  canvas -->|movimientos y conexiones| store
  store --> lint[Panel de revisión]
  store --> layoutc[Cliente de disposición] --> wk[Web Worker ELK]
  store --> persist[Persistencia local y URL]
  store --> exportui[Exportación]
```

Decisiones de diseño del editor:

- Un único documento en el store: `DiagramDocument` (`{ graph, layout: { positions, sizes } }`, esquema en `shared`). El grafo es la fuente de verdad semántica; la disposición es presentación (ADR 0007). `computeLayout` de `frontend/src/layout` calcula la disposición y, con posiciones fijadas, coloca solo los nodos nuevos.
- Toda modificación pasa por acciones del store que producen un nuevo documento inmutable, se validan con el esquema y `validateGraph` y se apilan en el historial para deshacer (ADR 0017). La disposición automática se calcula al abrir una plantilla; después, las posiciones son las que deja el usuario.
- React Flow es una vista: su estado de nodos y aristas se deriva del documento mediante un adaptador puro y testeable, y los cambios del lienzo vuelven al store como acciones.
- La revisión de diseño se recalcula en cada cambio. Las reglas son funciones puras y el grafo tiene como mucho 200 nodos, así que basta con memoizar por versión del documento.

### 4.3 backend

Detalle en [modulos/backend.md](modulos/backend.md) y ADR 0022.

```mermaid
flowchart LR
  req[Petición] --> mw["src/http<br/>request id · CORS · tamaño · contrato"]
  mw --> route["Rutas<br/>/health · /v1/assist"]
  route --> agent["src/agent<br/>assist: cinco tareas"]
  agent --> prompt[Prompt: catálogo, reglas, ejemplo, tarea]
  agent --> repair["runWithRepair<br/>extraer · validar · reintentar"]
  repair --> prov["src/llm<br/>LlmProvider"]
  prov --> wai[Workers AI]
  prov --> oai[API compatible con OpenAI]
  repair -->|grafo| parse[parseArchitectureGraph]
  repair -->|operaciones| patch[applyPatch]
  route --> err[Errores RFC 9457]
```

- Hono como router por su tamaño mínimo y su soporte nativo de Workers.
- El agente y los proveedores están en `backend/src/agent` y `backend/src/llm`, sin E/S propia salvo el `fetch` o el binding que reciben. La capa HTTP (`backend/src/http`) solo tiene las rutas, los middlewares y la elección del proveedor a partir del entorno del Worker.
- Cinco tareas tipadas, una llamada al modelo cada una (ADR 0022): crear y rediseñar devuelven el grafo completo; editar y mejorar, operaciones que se aplican con `applyPatch`. Todas responden con propuestas que ya traen el grafo validado y los cambios.
- El prompt incluye el catálogo de tipos y las reglas de anidamiento generados desde `shared`, el JSON Schema de la respuesta y, al crear, una plantilla de ejemplo. Al mejorar incluye los hallazgos del motor de reglas.
- Si la salida no pasa la validación, se reintenta como máximo dos veces enviando al modelo los errores concretos. Es la técnica más barata para mejorar la tasa de salidas válidas con modelos pequeños.
- Los errores se devuelven como `application/problem+json` (RFC 9457) con un `type` estable que el frontend traduce a mensajes.

## 5. Flujos principales

### 5.1 Generar un diagrama

```mermaid
sequenceDiagram
  actor U as Usuario
  participant W as Editor
  participant A as API (Worker)
  participant M as Modelo
  U->>W: Describe el sistema
  W->>A: POST /v1/assist {task: generate, locale, prompt}
  A->>A: Valida la entrada con el contrato
  A->>M: Prompt + JSON Schema + ejemplo
  M-->>A: {title, rationale, graph}
  A->>A: parseArchitectureGraph
  alt inválido y quedan reintentos
    A->>M: Última respuesta + errores de validación
    M-->>A: JSON corregido
  end
  A-->>W: {proposals: [{graph, changes}], attempts, warnings}
  W->>W: Valida de nuevo y dispone con ELK en el Web Worker
  W->>W: Revisión de diseño
  W-->>U: Diagrama editable con avisos
```

### 5.2 Editar, mejorar y rediseñar

Para editar o mejorar, el modelo devuelve operaciones (`addNode`, `updateNode`, `removeNode`, `addEdge`, `updateEdge`, `removeEdge`, `updateDiagram`) en lugar de un diagrama nuevo, y el backend las aplica con `applyPatch` de `shared`. Para simplificar o completar devuelve el grafo entero y reutiliza los ids de lo que mantiene. En los dos casos el editor conserva la posición de lo que sigue en su sitio, coloca con ELK solo lo nuevo o lo movido, y resalta lo que cambió. Una edición se aplica al momento; las mejoras y los rediseños se ofrecen en un panel para aplicarlos uno a uno (T18, T20, T35).

### 5.3 Compartir

El documento, con su disposición, se serializa, se comprime y se codifica en el fragmento de la URL (`#d=...`). El fragmento nunca se envía al servidor, de modo que compartir no expone el diagrama a ningún backend. Al abrir el enlace, el contenido pasa por `importDocument`, que aplica al grafo los mismos pasos que `importJson` (migraciones y `parseArchitectureGraph`) y valida la disposición, como cualquier entrada no confiable (T11, ADR 0019). El mismo formato sirve para el fichero JSON y para el autoguardado en `localStorage`.

## 6. Formato de datos y versionado

- El formato está definido en `shared/src/schema.ts` y documentado en [modelo-de-dominio.md](modelo-de-dominio.md).
- `schemaVersion` es un entero. Un cambio incompatible incrementa la versión y añade una migración desde la anterior; `importJson` aplica la cadena al importar y rechaza versiones más nuevas que la del código.
- Las posiciones no forman parte del grafo semántico (ADR 0007).

## 7. Aspectos transversales

### Seguridad

- No hay secretos en el frontend. El modelo se invoca mediante binding dentro del Worker; los tokens de proveedores alternativos son secretos del Worker.
- CORS restringido al dominio del editor.
- Límites de tamaño en la entrada: prompt de 4.000 caracteres como máximo y cuerpo de 64 KB, más los límites del esquema (200 nodos, 400 aristas).
- La salida del modelo es dato, nunca código: se valida con esquemas estrictos y se renderiza como texto. Los exportadores escapan las etiquetas según el formato de destino (XML y HTML en draw.io, comillas y entidades en Mermaid).
- Límite de uso por IP para proteger la cuota diaria (T19).

### Privacidad

- No se almacenan diagramas ni prompts en servidor.
- Los logs de la API registran métricas (longitud, latencia, reintentos, resultado), no el contenido del prompt.

### Rendimiento

- ELK se carga de forma diferida y se ejecuta en un Web Worker.
- División del bundle por rutas y funcionalidades; presupuesto de tamaño verificado en CI (T22).

### Disponibilidad y degradación

- Si la API no responde o la cuota se agota, el editor lo indica y sigue funcionando en modo manual con plantillas.
- La API distingue cuota agotada (429 con `Retry-After`), error del modelo (502) y entrada inválida (400).

### Observabilidad

- Logs estructurados en JSON con identificador de petición, visibles en Workers Logs.
- Métricas de calidad de la generación en los informes del banco de evaluación.

## 8. Despliegue

```mermaid
flowchart LR
  dev[Push a main] --> ci[GitHub Actions: check]
  ci -->|verde| pages[Build web → GitHub Pages]
  ci -->|verde y secretos presentes| wr[wrangler deploy → Cloudflare Workers]
```

Los pasos manuales necesarios (activar Pages, cuenta de Cloudflare, secretos) están en [operaciones.md](operaciones.md).

## 9. Riesgos técnicos

| Riesgo                                                     | Probabilidad | Impacto | Mitigación                                                                                          |
| ---------------------------------------------------------- | ------------ | ------- | --------------------------------------------------------------------------------------------------- |
| Los modelos gratuitos generan JSON inválido con frecuencia | Media        | Alto    | JSON Schema, reintentos con errores, few-shot, medición en evals                                    |
| El parseo y la validación superan 10 ms de CPU             | Baja         | Medio   | Medir en T19; si ocurre, validar en el cliente y dejar en el Worker solo la comprobación de esquema |
| La cuota diaria se agota                                   | Media        | Medio   | Límite por IP, proveedor alternativo, editor útil sin IA                                            |
| Cambios en los planes gratuitos                            | Media        | Alto    | Proveedores intercambiables, documentación de límites con fecha                                     |
| Diagramas grandes lentos en el lienzo                      | Baja         | Medio   | Límite de 200 nodos, memoización, disposición en worker                                             |
