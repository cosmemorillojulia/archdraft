# Módulo: backend

API de Archdraft: un Cloudflare Worker con Hono que ejecuta el agente de IA. El agente crea un diagrama desde una descripción, edita el diagrama abierto, propone mejoras y propone una arquitectura más simple o más completa. Depende de `@archdraft/shared` y nunca del frontend (ADR 0021). Las decisiones de fondo están en ADR 0004 (coste cero) y ADR 0022 (agente con tareas tipadas).

## Estructura

```
backend/
  wrangler.jsonc          # Worker, binding AI de Workers AI, ALLOWED_ORIGINS, logs
  src/
    index.ts              # punto de entrada del Worker: createApp()
    http/
      app.ts              # rutas, middlewares, registro por petición
      env.ts              # Env del Worker y elección del proveedor
      problems.ts         # errores application/problem+json (RFC 9457)
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

### Errores

`application/problem+json` con `type`, `title`, `status` y `detail`. El editor traduce cada `type`:

| `type`                           | Estado | Cuándo                                                      |
| -------------------------------- | ------ | ----------------------------------------------------------- |
| `/problems/invalid-request`      | 400    | El cuerpo no es JSON o no sigue el contrato (`errors[]`)    |
| `/problems/payload-too-large`    | 413    | El cuerpo pasa de 64 KB                                     |
| `/problems/rate-limited`         | 429    | Cuota del proveedor agotada; `Retry-After` en segundos      |
| `/problems/model-error`          | 502    | El proveedor falla, no responde o no hay modelo configurado |
| `/problems/invalid-model-output` | 502    | El modelo no dio una respuesta válida tras los reintentos   |
| `/problems/model-timeout`        | 504    | El modelo tardó más de 60 s                                 |
| `/problems/not-found`            | 404    | Ruta desconocida                                            |
| `/problems/internal-error`       | 500    | Fallo inesperado                                            |

### Middlewares

- `X-Request-Id`: se respeta el de la petición si es un slug de hasta 64 caracteres; si no, se genera uno. Vuelve en la respuesta.
- CORS: solo los orígenes de `ALLOWED_ORIGINS` (separados por comas), con `X-Request-Id` y `Retry-After` expuestos.
- Límite de cuerpo de 64 KB y validación con el contrato antes de llamar al modelo.
- Un registro JSON por llamada al agente: identificador, tarea, proveedor, estado, duración, intentos y, si falla, su tipo y su explicación. Nunca el prompt ni el diagrama.

## Proveedores

`LlmProvider` es una función de mensajes a texto. Los errores esperados son `LlmError` con cuatro tipos: `rate-limited`, `timeout`, `provider` e `invalid-response`. Una cancelación del llamante sube tal cual, como `AbortError`.

| Proveedor             | Cuándo se usa                         | Modo JSON                                                              | Modelo por defecto                         |
| --------------------- | ------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------ |
| Workers AI (binding)  | Por defecto en el Worker              | `response_format: { type: 'json_schema', json_schema: <esquema> }`     | `@cf/meta/llama-3.3-70b-instruct-fp8-fast` |
| Compatible con OpenAI | Si hay `LLM_BASE_URL` y `LLM_API_KEY` | `response_format: { type: 'json_object' }`; el esquema va en el prompt | `openai/gpt-oss-120b` (Groq)               |

`LLM_MODEL` cambia el modelo de cualquiera de los dos. `LLM_REASONING_EFFORT` (`low`, `medium` o `high`) dice cuánto razona un modelo de razonamiento del proveedor compatible con OpenAI; con `gpt-oss` es `low` si no se indica, porque sus razonamientos salen de los tokens de la respuesta y, con los límites del plan gratuito de Groq, `medium` puede dejar el diagrama cortado. A los demás modelos no se les envía. Datos comprobados en la documentación oficial el 2026-10-31:

- Workers AI admite modo JSON en seis modelos; el de 70B es el más capaz de ellos. En modo JSON, `response` puede llegar ya como objeto: el adaptador lo convierte en texto. Si el modelo no consigue el esquema, el binding falla con «JSON Mode couldn't be met», que se trata como respuesta inválida. Los errores de cuota se tratan como límite de uso hasta las 00:00 UTC, cuando se reinicia la asignación diaria.
- Coste del modelo de 70B: 26.668 neurons por millón de tokens de entrada y 204.805 por millón de salida. Con 10.000 neurons al día, una generación típica (unos 3.000 tokens de entrada, el prompt mide unos 10.400 caracteres, y 2.000 de salida: unos 490 neurons) da para unas veinte al día; una edición, menos. Por eso el límite por IP de T19 es necesario antes de abrir la API.
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

- T19: límite de uso por IP, tiempos de CPU medidos frente a los 10 ms del plan gratuito.
- T16 y T17: banco de evaluación de las cinco tareas en `backend/evals/` y elección del modelo con datos.
