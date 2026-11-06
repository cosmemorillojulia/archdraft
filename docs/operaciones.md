# Operaciones

## Entornos

| Pieza        | Dónde              | URL                                              | Estado                                      |
| ------------ | ------------------ | ------------------------------------------------ | ------------------------------------------- |
| Editor web   | GitHub Pages       | `https://cosmemorillojulia.github.io/archdraft/` | Publicado (T07)                             |
| API          | Cloudflare Workers | `https://archdraft-api.<subdominio>.workers.dev` | Lista para desplegar (T13); falta la cuenta |
| Evaluaciones | GitHub Actions     | Pestaña Actions del repositorio, workflow Evals  | Listo (T17); falta el secreto de Groq       |

## Acciones manuales pendientes

Pasos que requieren al propietario del repositorio porque necesitan permisos de administración o cuentas propias. Cada tarea del roadmap que dependa de uno de ellos lo indica.

| Paso                                                                        | Necesario para                                        | Cómo                                                                                                                                                       | Estado                                 |
| --------------------------------------------------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| Verificar `cosmemorillojulia@gmail.com` en GitHub                           | Que los commits aparezcan enlazados al perfil         | GitHub > Settings > Emails                                                                                                                                 | Por comprobar                          |
| Activar GitHub Pages con origen GitHub Actions                              | Publicar el editor (T07)                              | Settings > Pages > Build and deployment > Source: GitHub Actions, con el repositorio público                                                               | Hecho; primer despliegue el 2026-10-24 |
| Crear cuenta gratuita de Cloudflare                                         | Desplegar la API (T13)                                | dash.cloudflare.com, plan Free, sin tarjeta                                                                                                                | Hecho; comprobado el 2026-11-06        |
| Crear token de API de Cloudflare con permiso de edición de Workers          | Despliegue desde CI (T13)                             | My Profile > API Tokens > plantilla Edit Cloudflare Workers                                                                                                | Hecho; comprobado el 2026-11-06        |
| Añadir secretos `CLOUDFLARE_API_TOKEN` y `CLOUDFLARE_ACCOUNT_ID`            | Despliegue desde CI (T13)                             | Settings > Secrets and variables > Actions                                                                                                                 | Hecho; comprobado el 2026-11-06        |
| Añadir la variable `API_URL` con la URL del Worker                          | Que el editor publicado use el asistente (T20)        | Settings > Secrets and variables > Actions > Variables, tras el primer despliegue de la API; el workflow de Pages la pasa como `VITE_API_URL`              | Hecho; comprobado el 2026-11-06        |
| Revisar `ALLOWED_ORIGINS` en `backend/wrangler.jsonc`                       | CORS de la API                                        | Debe contener el origen de GitHub Pages (`https://cosmemorillojulia.github.io`)                                                                            | Hecho                                  |
| Abrir en draw.io un fichero generado con `toDrawio` (fixture de tres capas) | Confirmar la exportación a draw.io (T05)              | Generar el fichero como indica `docs/modulos/exportacion.md`, abrirlo en app.diagrams.net y comprobar contenedores, cilindros y aristas discontinuas       | Pendiente                              |
| Clave de Groq como secreto `GROQ_API_KEY` del repositorio                   | Evaluaciones (T17), tras la retirada de GitHub Models | console.groq.com > API Keys; comprobar antes que el plan gratuito no pide tarjeta; Settings > Secrets and variables > Actions; lanzar después Evals a mano | Pendiente (T17)                        |

Si Pages se desactiva, el workflow `Deploy web` termina con un aviso sin publicar. Hasta que estén los secretos de Cloudflare, el workflow de despliegue de la API se salta sin fallar; igual hace el de evaluaciones sin `GROQ_API_KEY`.

## Límites de los planes gratuitos

Consultados el 2026-10-20. Cambian sin aviso: revisar antes de decisiones que dependan de ellos.

| Servicio                | Límite relevante                                                                             | Fuente                                                |
| ----------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Cloudflare Workers Free | 100.000 peticiones al día, 10 ms de CPU por petición                                         | cloudflare.com/plans                                  |
| Cloudflare Workers AI   | 10.000 neurons al día, reinicio a las 00:00 UTC; el consumo por respuesta depende del modelo | developers.cloudflare.com/workers-ai/platform/pricing |
| GitHub Models           | Retirado el 2026-07-30; sin API de inferencia (ADR 0004, actualización)                      | docs.github.com/en/rest/models/inference              |
| GitHub Pages            | Gratuito para repositorios públicos                                                          | docs.github.com                                       |
| GitHub Actions          | Gratuito para repositorios públicos en ejecutores estándar                                   | docs.github.com                                       |

## Secretos

| Secreto                  | Dónde                                                                                                                               | Uso                                                           |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `CLOUDFLARE_API_TOKEN`   | Secretos de Actions                                                                                                                 | `wrangler deploy` desde CI                                    |
| `GROQ_API_KEY`           | Secretos de Actions                                                                                                                 | Workflow Evals (`docs/evaluacion.md`)                         |
| `CLOUDFLARE_ACCOUNT_ID`  | Secretos de Actions                                                                                                                 | Ídem                                                          |
| `LLM_API_KEY` (opcional) | `.env.secrets` en local; secreto del Worker (`wrangler secret put LLM_API_KEY`) en producción, junto con la variable `LLM_BASE_URL` | Proveedor compatible con OpenAI (Groq) en lugar de Workers AI |

Nunca se guardan secretos en el repositorio ni en variables del frontend. Los valores de desarrollo no secretos están en `.env.defaults`, que se versiona; los secretos, en `.env.secrets`, que `.gitignore` excluye junto con `.dev.vars` y el resto de `.env*` (salvo `.env.defaults` y `.env.secrets.example`).

## Supervisión

- API: Workers Logs en el panel de Cloudflare; logs JSON con identificador de petición.
- Cuota de Workers AI: panel de Cloudflare, sección AI.
- Calidad: informes del banco de evaluación.
