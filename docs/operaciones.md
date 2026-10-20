# Operaciones

## Entornos

| Pieza        | Dónde              | URL                                              | Estado          |
| ------------ | ------------------ | ------------------------------------------------ | --------------- |
| Editor web   | GitHub Pages       | `https://cosmemorillojulia.github.io/archdraft/` | Pendiente (T07) |
| API          | Cloudflare Workers | `https://archdraft-api.<subdominio>.workers.dev` | Pendiente (T13) |
| Evaluaciones | GitHub Actions     | Pestaña Actions del repositorio                  | Pendiente (T17) |

## Acciones manuales pendientes

Pasos que requieren al propietario del repositorio porque necesitan permisos de administración o cuentas propias. Cada tarea del roadmap que dependa de uno de ellos lo indica.

| Paso                                                               | Necesario para                                | Cómo                                                                                                                   | Estado               |
| ------------------------------------------------------------------ | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | -------------------- |
| Verificar `cosmemorillojulia@gmail.com` en GitHub                  | Que los commits aparezcan enlazados al perfil | GitHub > Settings > Emails                                                                                             | Por comprobar        |
| Activar GitHub Pages con origen GitHub Actions                     | Publicar el editor (T07)                      | Settings > Pages > Build and deployment > Source: GitHub Actions                                                       | Pendiente            |
| Crear cuenta gratuita de Cloudflare                                | Desplegar la API (T13)                        | dash.cloudflare.com, plan Free, sin tarjeta                                                                            | Pendiente            |
| Crear token de API de Cloudflare con permiso de edición de Workers | Despliegue desde CI (T13)                     | My Profile > API Tokens > plantilla Edit Cloudflare Workers                                                            | Pendiente            |
| Añadir secretos `CLOUDFLARE_API_TOKEN` y `CLOUDFLARE_ACCOUNT_ID`   | Despliegue desde CI (T13)                     | Settings > Secrets and variables > Actions                                                                             | Pendiente            |
| Permitir lectura de modelos en Actions                             | Evaluaciones (T17)                            | Lo declara el propio workflow con `permissions: models: read`; no requiere acción salvo que la organización lo bloquee | No aplica de momento |

Hasta que estén los secretos de Cloudflare, el workflow de despliegue de la API se salta sin fallar.

## Límites de los planes gratuitos

Consultados el 2026-10-20. Cambian sin aviso: revisar antes de decisiones que dependan de ellos.

| Servicio                    | Límite relevante                                                                             | Fuente                                                |
| --------------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Cloudflare Workers Free     | 100.000 peticiones al día, 10 ms de CPU por petición                                         | cloudflare.com/plans                                  |
| Cloudflare Workers AI       | 10.000 neurons al día, reinicio a las 00:00 UTC; el consumo por respuesta depende del modelo | developers.cloudflare.com/workers-ai/platform/pricing |
| GitHub Models (sin Copilot) | 15 peticiones por minuto y 150 al día en modelos de nivel bajo; 10 y 50 en nivel alto        | docs.github.com, sección GitHub Models                |
| GitHub Pages                | Gratuito para repositorios públicos                                                          | docs.github.com                                       |
| GitHub Actions              | Gratuito para repositorios públicos en ejecutores estándar                                   | docs.github.com                                       |

## Secretos

| Secreto                                       | Dónde                                       | Uso                        |
| --------------------------------------------- | ------------------------------------------- | -------------------------- |
| `CLOUDFLARE_API_TOKEN`                        | Secretos de Actions                         | `wrangler deploy` desde CI |
| `CLOUDFLARE_ACCOUNT_ID`                       | Secretos de Actions                         | Ídem                       |
| Tokens de proveedores alternativos (opcional) | Secretos del Worker (`wrangler secret put`) | Proveedor LLM de respaldo  |

Nunca se guardan secretos en el repositorio ni en variables del frontend. `.dev.vars` y `.env*` están en `.gitignore`.

## Supervisión

- API: Workers Logs en el panel de Cloudflare; logs JSON con identificador de petición.
- Cuota de Workers AI: panel de Cloudflare, sección AI.
- Calidad: informes del banco de evaluación.
