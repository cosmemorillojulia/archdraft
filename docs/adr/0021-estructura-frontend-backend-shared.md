# ADR 0021: Estructura en frontend, backend y shared

- Estado: aceptada
- Fecha: 2026-10-31
- Sustituye en parte a: ADR 0002 (la organización de carpetas; el monorepo con pnpm y los paquetes sin compilar siguen vigentes)

## Contexto

El ADR 0002 organizó el repositorio en `apps/*` (`web`, `api`) y `packages/*` (`core`, `layout`), con `evals/` aparte. Antes de empezar el backend se revisó la estructura y no dejaba ver a primera vista qué corre en el navegador, qué en el servidor y qué es común:

- `packages/layout` solo lo usa el editor, pero estaba al mismo nivel que el dominio compartido.
- El agente de IA iba a ser otro paquete (`packages/ai`) que solo usaría la API, con lo que el servidor quedaba repartido en dos carpetas lejanas.
- `core` no decía que era el código que comparten los dos lados.

## Decisión

Tres paquetes, uno por carpeta en la raíz:

| Carpeta     | Paquete             | Qué contiene                                                                                         |
| ----------- | ------------------- | ---------------------------------------------------------------------------------------------------- |
| `frontend/` | `@archdraft/web`    | El editor, incluida la disposición con ELK en `src/layout/` (antes `packages/layout`)                |
| `backend/`  | `@archdraft/api`    | El Worker: capa HTTP (`src/http/`), proveedores LLM (`src/llm/`) y agente (`src/agent/`); y `evals/` |
| `shared/`   | `@archdraft/shared` | Lo que usan los dos: dominio, validación, reglas, exportadores, plantillas y contrato de la API      |

Reglas de dependencia: `frontend` y `backend` dependen de `shared`; `shared` no depende de ningún otro paquete; `frontend` y `backend` nunca se importan entre sí. Lo que necesitan los dos lados, como el contrato de `/v1/assist`, va en `shared`.

`frontend/src/layout/` mantiene sus umbrales de cobertura con un umbral por ruta en `frontend/vite.config.ts`. El banco de evaluación vivirá en `backend/evals/` y ejecutará el agente directamente, sin pasar por HTTP.

## Alternativas consideradas

- Dejar `apps/` y `packages/`: es la convención habitual de los monorepos, pero aquí obliga a saber qué paquete usa cada aplicación para entender el sistema.
- `frontend/`, `backend/` y `packages/{core,layout,ai}`: cambio mínimo, pero mantiene paquetes que solo usa un lado y que no se reutilizan en ningún otro sitio.
- Solo renombrar `apps/web` a `frontend`: no resuelve dónde viven la disposición ni el agente.

## Consecuencias

- Positivas: la estructura dice qué corre dónde; un paquete menos (`layout`) y otro que no llega a existir (`ai`); los cambios del agente y de su API van en una sola carpeta.
- Negativas: el historial de los ficheros movidos se sigue con `git log --follow`. La disposición ya no se puede usar fuera del editor sin importar su fichero; hoy nadie más la usa.
- Los ADR anteriores conservan las rutas antiguas (`apps/web`, `packages/core`, `packages/layout`), que equivalen a `frontend`, `shared` y `frontend/src/layout`. La documentación viva usa las nuevas.

## Revisar si

Aparece un segundo consumidor de la disposición o del agente (por ejemplo una CLI), que justificaría volver a sacarlos a `shared/` o a un paquete propio.
