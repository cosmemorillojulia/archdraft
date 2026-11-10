# Módulo: backend

API de Archdraft: un Cloudflare Worker con Hono que ejecuta el agente de IA. El agente crea un diagrama desde una descripción, edita el diagrama abierto, propone mejoras y propone una arquitectura más simple o más completa. Depende de `@archdraft/shared` y nunca del frontend (ADR 0021). Las decisiones de fondo están en ADR 0004 (coste cero) y ADR 0022 (agente con tareas tipadas).

## Estructura

```
backend/
  wrangler.jsonc          # Worker, bindings AI y USAGE, ALLOWED_ORIGINS, DAILY_ASSIST_LIMIT, logs
  src/
    index.ts              # punto de entrada del Worker: createApp() y el Durable Object
    usage-counter.ts      # Durable Object UsageCounter: uso diario de una dirección
    cloudflare-workers.d.ts # la parte de cloudflare:workers que se usa
    http/
      app.ts              # rutas, middlewares, límite diario, registro por petición
      env.ts              # Env del Worker y elección del proveedor
      problems.ts         # errores application/problem+json (RFC 9457)
      usage.ts            # cuenta diaria pura, límite y clave de cada dirección
    llm/
      provider.ts         # LlmProvider: mensajes in, texto out
      errors.ts           # LlmError y sus cuatro tipos; Retry-After; plazos
      openai-compatible.ts# proveedor de chat completions (Groq), fetch inyectado
      workers-ai.ts       # adaptador del binding env.AI
      scripted-provider.ts# proveedor guionizado para los tests
    agent/
      assist.ts           # las cinco tareas: prompt, lectura y validación de la respuesta
      prompt.ts           # mensajes: catálogo, reglas de modelado, ejemplo, tarea
      repair.ts           # runWithRepair: llamar, validar y reintentar con los errores
      extract-json.ts     # el objeto JSON de una respuesta con texto alrededor
  evals/                  # banco de evaluación (docs/evaluacion.md)
    case.ts               # tipos de un caso y la petición que genera
    cases.ts              # los 32 casos
    score.ts              # puntuador puro y resúmenes
    run.ts                # ejecuta los casos con assist y reintenta los límites de cuota
    ideal-provider.ts     # modelo falso con la respuesta ideal de cada caso
    report.ts             # informe en Markdown
    cli.ts                # pnpm --filter @archdraft/api eval
  bench/
    cpu.ts                # tiempo de CPU de las peticiones más grandes
    cli.ts                # pnpm --filter @archdraft/api bench:cpu
  test/                   # Vitest con proveedor guionizado y fetch falso
```

El contrato de la API (`AssistRequestSchema`, `AssistResultSchema`, tipos de problema y avisos) está en `shared/src/assist/contract.ts`, porque lo usan el backend y el editor. Las operaciones de edición (`applyPatch`, `diffGraphs`) están en `shared/src/patch.ts`.

## Endpoints

### `GET /health`

`200 {"status":"ok"}`.

### `POST /v1/assist`

Cuerpo JSON de 64 KB como máximo, discriminado por `task`:

| `task`     | Campos                                        | Qué hace                                     |
| ---------- | --------------------------------------------- | -------------------------------------------- |
| `generate` | `locale`, `prompt`, `provider?`               | Diseña un diagrama nuevo                     |
| `edit`     | `locale`, `prompt`, `graph`                   | Cambia el diagrama como se pide              |
| `improve`  | `locale`, `graph`, `prompt?` (en qué fijarse) | De una a cinco mejoras independientes        |
| `simplify` | `locale`, `graph`, `prompt?`                  | Una arquitectura más simple para lo mismo    |
| `extend`   | `locale`, `graph`, `prompt?`                  | Una arquitectura más completa, de producción |

`locale` es `en` o `es`: el idioma de los nombres y explicaciones que escribe el modelo. `prompt` tiene 4.000 caracteres como máximo y `graph` sigue el esquema del diagrama.

Respuesta `200`, siempre con la misma forma:

```json
{
  "task": "improve",
  "proposals": [
    {
      "title": "Add a cache",
      "rationale": "Takes reads off the database.",
      "graph": { "schemaVersion": 1, "...": "el diagrama con la propuesta aplicada" },
      "changes": {
        "diagram": false,
        "nodes": { "added": ["cache"], "updated": [], "removed": [] },
        "edges": { "added": ["api-cache"], "updated": [], "removed": [] }
      },
      "operations": [
        { "op": "addNode", "node": { "id": "cache", "kind": "cache", "label": "Cache" } }
      ]
    }
  ],
  "attempts": 1,
  "warnings": []
}
```

- `generate`, `edit`, `simplify` y `extend` devuelven una propuesta; `improve`, de una a cinco.
- `graph` ya está validado con `parseArchitectureGraph`; el editor lo vuelve a validar al aplicarlo.
- `operations` aparece en las propuestas hechas como edición del diagrama (`edit` e `improve`). Con ellas el editor puede volver a aplicar una mejora sobre un diagrama que ha cambiado desde entonces.
- `warnings` son códigos que el editor traduce: `proposals-dropped` (alguna mejora no era válida y se dejó fuera), `not-simpler`, `not-more-complete` y `more-findings` (una propuesta da más hallazgos de diseño).

#### Progreso en directo

Con `Accept: text/event-stream` la respuesta es un flujo de _server-sent events_: varios `progress` mientras el agente trabaja y, al final, un `result` con el cuerpo de arriba o un `problem` con los detalles del error (y `retryAfter` si lo hay). Los errores de la petición en sí (cuerpo inválido, demasiado grande) siguen llegando como `application/problem+json` antes de abrir el flujo.

```text
event: progress
data: {"stage":"thinking","thought":"The user wants a shop on AWS…"}

event: progress
data: {"stage":"drawing","components":["Storefront","Orders API"]}

event: result
data: {"task":"generate","proposals":[…],"attempts":1,"warnings":[]}
```

`stage` es `thinking`, `drawing`, `checking` o `fixing` (`AssistProgressSchema`). `thought` es el razonamiento nuevo desde el último evento, solo en los modelos que lo muestran (`gpt-oss` en Groq); `components`, los nombres de los componentes escritos hasta ahora, cuando cambian. Enseñarlo no gasta tokens: es lo que el modelo genera de todos modos, reenviado a medida que llega. Workers AI no transmite en modo JSON, así que con él solo llegan las etapas.

### Errores

`application/problem+json` con `type`, `title`, `status` y `detail`. El editor traduce cada `type`:

| `type`                           | Estado | Cuándo                                                                                  |
| -------------------------------- | ------ | --------------------------------------------------------------------------------------- |
| `/problems/invalid-request`      | 400    | El cuerpo no es JSON o no sigue el contrato (`errors[]`)                                |
| `/problems/payload-too-large`    | 413    | El cuerpo pasa de 64 KB                                                                 |
| `/problems/rate-limited`         | 429    | Límite diario de la dirección o cuota del proveedor agotados; `Retry-After` en segundos |
| `/problems/model-error`          | 502    | El proveedor falla, no responde o no hay modelo configurado                             |
| `/problems/invalid-model-output` | 502    | El modelo no dio una respuesta válida tras los reintentos                               |
| `/problems/model-timeout`        | 504    | El modelo tardó más de 60 s                                                             |
| `/problems/not-found`            | 404    | Ruta desconocida                                                                        |
| `/problems/internal-error`       | 500    | Fallo inesperado                                                                        |

### Middlewares

- `X-Request-Id`: se respeta el de la petición si es un slug de hasta 64 caracteres; si no, se genera uno. Vuelve en la respuesta.
- CORS: solo los orígenes de `ALLOWED_ORIGINS` (separados por comas), con `X-Request-Id` y `Retry-After` expuestos.
- Límite de cuerpo de 64 KB y validación con el contrato antes de llamar al modelo.
- Límite diario por dirección (ver Límites de uso) antes de llamar al modelo y antes de abrir el flujo de eventos.
- Un registro JSON por llamada al agente: identificador, tarea, proveedor, estado, duración, intentos y, si falla, su tipo y su explicación. Nunca el prompt ni el diagrama.

## Límites de uso

Para que una sola persona no gaste la cuota diaria del modelo (ADR 0025):

| Límite                         | Valor                                         | Dónde                                          |
| ------------------------------ | --------------------------------------------- | ---------------------------------------------- |
| Peticiones por dirección y día | 10 (`DAILY_ASSIST_LIMIT`)                     | `http/usage.ts`, Durable Object `UsageCounter` |
| Cuerpo de la petición          | 64 KB                                         | `ASSIST_LIMITS.bodyBytes`                      |
| Descripción o instrucción      | 4.000 caracteres                              | `AssistRequestSchema`                          |
| Diagrama                       | 200 nodos y 400 aristas, más los del esquema  | `LIMITS` de `shared`                           |
| Cada llamada al modelo         | 60 s, como mucho tres llamadas por reparación | `MODEL_TIMEOUT_MS`, `runWithRepair`            |
| Respuesta del modelo           | 4.500, 2.500 o 3.500 tokens según la tarea    | `MAX_TOKENS` en `agent/assist.ts`              |

- La dirección es la cabecera `CF-Connecting-IP`: la IPv4 entera o los primeros 64 bits de la IPv6, porque una conexión suele tener un /64 completo y podría cambiar de dirección dentro de él. Una IPv4 escrita como IPv6 (`::ffff:a.b.c.d`) cuenta como esa IPv4. El contador se llama con su huella SHA-256, nunca con la dirección, y la dirección no aparece en los registros.
- Solo cuentan las peticiones que cumplen el contrato; las rechazadas con 400 o 413 no gastan. Una petición que pasa el límite no se escribe, así que tampoco gasta filas del plan gratuito de Durable Objects.
- Pasado el límite: 429 `rate-limited` con `Retry-After` hasta las 00:00 UTC, el `detail` «This address has made its N requests for today» y una línea de registro con `problem: "daily-limit"`. El editor ya traduce este tipo y dice cuánto esperar.
- La primera petición del día programa una alarma a las 00:00 UTC que borra el objeto. Si la alarma se retrasa, una cuenta de un día anterior se ignora.
- Sin el binding `USAGE`, como en los tests de otras partes o en una configuración sin Durable Objects, no hay límite. Si el contador falla, la petición sigue y se registra `Usage counter failed`: el límite protege la cuota, pero no debe apagar el asistente.

### Tiempo de CPU

El plan gratuito de Workers admite 10 ms de CPU por petición; esperar al modelo no cuenta. `pnpm --filter @archdraft/api bench:cpu [veces]` mide en Node.js, con un modelo que responde al instante, lo que sí cuenta: leer el cuerpo, validarlo con el contrato, escribir el prompt, extraer y validar la respuesta, la revisión de diseño y los cambios, con el diagrama más grande que admite el esquema (200 nodos). Zod se pone en modo `jitless`, porque en Workers no puede compilar sus comprobaciones con `new Function`.

Resultado el 2026-11-10, tres ejecuciones de 100 peticiones por caso en una máquina Linux de desarrollo con Node.js 22 (milisegundos de CPU):

| Caso                  | Primera petición | Mediana | Máximo  |
| --------------------- | ---------------- | ------- | ------- |
| `generate`, 200 nodos | 47 a 54          | 2 a 3   | 47 a 54 |
| `edit`, 200 nodos     | 8 a 14           | 3 a 4   | 17      |
| `improve`, 200 nodos  | 5 a 7            | 4       | 7       |
| `extend`, 200 nodos   | 4 a 6            | 2 a 4   | 9       |

Lectura:

- Con el proceso caliente, todas las tareas quedan en 2 a 4 ms, por debajo de los 10 ms incluso con el diagrama más grande. Los máximos de 15 a 17 ms de `edit` son esporádicos, probablemente recolección de basura.
- La primera petición de un proceso nuevo pasa de 10 ms: compila el código y los esquemas por primera vez (solo la primera validación de una petición con 200 nodos se lleva unos 20 ms). En Workers equivale a la primera petición de cada isolate. La documentación de Cloudflare dice que cada isolate tiene cierta flexibilidad para pasarse del límite de vez en cuando, y que solo se corta si ocurre de forma sostenida; con diagramas normales, mucho más pequeños, el coste es menor.
- Son medidas en Node.js, que comparte motor (V8) con Workers pero no máquina; sirven para comparar y para detectar regresiones, no como cifra exacta de producción. El tiempo real se comprueba en las métricas del Worker en el panel de Cloudflare (acción pendiente en `docs/operaciones.md`).

## Proveedores

`LlmProvider` es una función de mensajes a texto. Los errores esperados son `LlmError` con cuatro tipos: `rate-limited`, `timeout`, `provider` e `invalid-response`. Una cancelación del llamante sube tal cual, como `AbortError`.

| Proveedor             | Cuándo se usa                         | Modo JSON                                                              | Modelo por defecto                         |
| --------------------- | ------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------ |
| Workers AI (binding)  | Por defecto en el Worker              | `response_format: { type: 'json_schema', json_schema: <esquema> }`     | `@cf/meta/llama-3.3-70b-instruct-fp8-fast` |
| Compatible con OpenAI | Si hay `LLM_BASE_URL` y `LLM_API_KEY` | `response_format: { type: 'json_object' }`; el esquema va en el prompt | `openai/gpt-oss-120b` (Groq)               |

`LLM_MODEL` cambia el modelo de cualquiera de los dos. `LLM_REASONING_EFFORT` (`low`, `medium` o `high`) dice cuánto razona un modelo de razonamiento del proveedor compatible con OpenAI; con `gpt-oss` es `low` si no se indica, porque sus razonamientos salen de los tokens de la respuesta y, con los límites del plan gratuito de Groq, `medium` puede dejar el diagrama cortado. A los demás modelos no se les envía. Datos comprobados en la documentación oficial el 2026-10-31:

- Workers AI admite modo JSON en seis modelos; el de 70B es el más capaz de ellos. En modo JSON, `response` puede llegar ya como objeto: el adaptador lo convierte en texto. Si el modelo no consigue el esquema, el binding falla con «JSON Mode couldn't be met», que se trata como respuesta inválida. Los errores de cuota se tratan como límite de uso hasta las 00:00 UTC, cuando se reinicia la asignación diaria.
- Coste del modelo de 70B: 26.668 neurons por millón de tokens de entrada y 204.805 por millón de salida. Con 10.000 neurons al día, una generación típica (unos 3.000 tokens de entrada, el prompt mide unos 10.400 caracteres, y 2.000 de salida: unos 490 neurons) da para unas veinte al día; una edición, menos. Por eso existe el límite diario por dirección (Límites de uso).
- Groq acepta `json_object` en todos sus modelos; la URL base es `https://api.groq.com/openai/v1`.
- Groq retiró `llama-3.3-70b-versatile` y `llama-3.1-8b-instant` para cuentas gratuitas el 2026-08-16 y recomienda `openai/gpt-oss-120b`, el modelo por defecto. Su plan gratuito admite 8.000 tokens por minuto y cuenta también los reservados para la respuesta, así que los límites de salida del agente (4.500 tokens para un grafo completo) dejan sitio para un prompt de unos 3.000. Los modelos y límites de Groq cambian a menudo: consultarlos en `console.groq.com/docs/models` y en la página Limits de la cuenta.
- Cuando el proveedor rechaza una petición, el error lleva su estado y su explicación (por ejemplo, un modelo retirado o una clave inválida), y aparece en el `detail` de la respuesta y en el registro.
- GitHub Models se retiró el 2026-07-30, así que deja de ser una opción (ver ADR 0004).

## El agente

Cada tarea es una llamada al modelo, más las reparaciones. No hay un bucle de herramientas (ADR 0022).

1. `assist.ts` compone dos mensajes: el de sistema (`systemPrompt`) y el de la tarea.
2. `runWithRepair` llama al modelo, extrae el JSON (`extractJson`) y lo interpreta con la función de la tarea. Si algo no vale, vuelve a llamar con la última respuesta y la lista exacta de problemas (hasta 20). Hay como mucho dos reintentos; solo se reenvía la última respuesta, para que la conversación no crezca. Agotados los reintentos, falla con `invalid-response`.
   - Revisión (ADR 0023): una respuesta válida puede traer riesgos. En `generate`, `edit`, `simplify` y `extend`, los hallazgos nuevos frente al diagrama anterior de `public-database`, `unprotected-entry`, `unencrypted-data` y `sync-cycle` se devuelven una vez al modelo para que los corrija o explique en `assumptions` por qué los mantiene. Si la corrección no es válida, se queda la primera respuesta.
3. La interpretación trata la respuesta como entrada no confiable:
   - Grafo completo (`generate`, `simplify`, `extend`): `parseArchitectureGraph` con `schemaVersion` fijado por el código, y `diffGraphs` frente al diagrama anterior. Un rediseño idéntico al original se rechaza; uno que va en contra de su objetivo se acepta con aviso.
   - Operaciones (`edit`, `improve`): `GraphPatchSchema` y `applyPatch` sobre el diagrama de la petición. Un parche que no cambia nada se rechaza.
   - `improve`: cada propuesta se valida por separado. Mientras quedan reintentos, una inválida devuelve todas al modelo con sus errores; en el último intento se quedan las válidas, con el aviso `proposals-dropped`. `more-findings` avisa si alguna da más hallazgos de diseño (errores y avisos de `lintGraph`) que el diagrama actual.
4. Los títulos y explicaciones demasiado largos se recortan en lugar de rechazarse. `assumptions` se queda con hasta seis frases de texto; lo demás se ignora.

### Diseño del prompt

- En inglés, que los modelos pequeños siguen mejor. Los nombres y explicaciones se piden en el idioma de la persona; los ids, en inglés.
- El mensaje de sistema tiene las reglas de modelado (ids en slug, contenedores nunca como extremo de una arista, atributos solo si se conocen, nada de figuras si no se piden, nodos y aristas en el orden del flujo) y el catálogo y las reglas de anidamiento, generados desde `NODE_CATALOG` y `CONTAINMENT_RULES`. Un test comprueba que aparecen todos los tipos.
- También tiene las reglas para leer una petición: completar lo imprescindible, elegir la lectura más habitual de lo ambiguo y hacer segura por defecto la versión de lo que se pide inseguro. Lo que decida así lo dice en `assumptions`.
- `generate` lleva el JSON Schema del diagrama y un ejemplo: la plantilla cuyas palabras clave, en inglés y en español, más aparecen en la petición (`exampleGraph`), o la API serverless si no coincide ninguna. Las tareas sobre un diagrama llevan el diagrama actual en JSON compacto, que ya hace de ejemplo, y no repiten la plantilla.
- `improve` incluye los hallazgos del motor de reglas, con su sugerencia, para que el modelo parta de datos.
- `simplify` y `extend` piden reutilizar los ids de lo que se mantiene, para que el editor conserve la disposición y muestre qué cambió.
- Temperatura 0,2. Tokens de salida como mucho: 4.500 para un grafo completo, 2.500 para un parche y 3.500 para las mejoras. Un test limita el tamaño del mensaje de generación a 26.000 caracteres.

## Desarrollo en local

Las variables de desarrollo están en dos ficheros de la raíz:

| Fichero         | En git | Contenido                                                                                      | Lo leen                                    |
| --------------- | ------ | ---------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `.env.defaults` | Sí     | Valores no secretos: `VITE_API_URL` del editor, `LLM_BASE_URL` (Groq) y, opcional, `LLM_MODEL` | `make run` (solo las `VITE_`) y `make api` |
| `.env.secrets`  | No     | Secretos: `LLM_API_KEY`. Plantilla en `.env.secrets.example`                                   | `make api` (Wrangler, `--env-file`)        |

Wrangler carga los dos con `--env-file`, y los valores de `.env.secrets` ganan. Vite solo toma de `.env.defaults` las variables `VITE_`, y solo en el servidor de desarrollo: ni el build ni los tests las usan, para que producción no apunte a `localhost`. Una variable ya definida en la shell gana a las dos. Los secretos nunca llegan al navegador.

```bash
cp .env.secrets.example .env.secrets   # y poner la clave de Groq en LLM_API_KEY
make api                               # wrangler dev --local en http://localhost:8787, sin cuenta de Cloudflare
make run                               # el editor, que ya apunta a la API local
```

- `make api` ejecuta `wrangler dev --local`: los bindings remotos están desactivados, así que necesita la clave de Groq. Sin ella, la API arranca pero responde `model-error`, porque Workers AI no existe en local.
- `make api-remote` usa Workers AI de la cuenta de Cloudflare: hace falta `npx wrangler login` (o `CLOUDFLARE_API_TOKEN`) aunque la clave quede vacía, porque el binding `AI` siempre corre en Cloudflare.

```bash
curl -s localhost:8787/v1/assist -H 'Content-Type: application/json'   -d '{"task":"generate","locale":"es","prompt":"Una tienda online en AWS"}'
```

## Build y despliegue

- `pnpm --filter @archdraft/api build` ejecuta `wrangler deploy --dry-run`: comprueba en CI que el Worker se empaqueta (unos 925 KiB, 159 KiB comprimidos, dentro de los 3 MB del plan gratuito).
- `.github/workflows/deploy-api.yml` despliega tras CI en verde en `main`, y se salta con un aviso si faltan `CLOUDFLARE_API_TOKEN` o `CLOUDFLARE_ACCOUNT_ID` (ver `docs/operaciones.md`).

## Pendiente

- T17: evaluaciones en CI y elección del modelo con los datos del banco (`docs/evaluacion.md`).
