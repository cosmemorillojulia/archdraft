# ADR 0004: Infraestructura de coste cero sin tarjeta

- Estado: aceptada
- Fecha: 2026-10-20

## Contexto

Requisito explícito: el proyecto no debe costar dinero ni requerir dar de alta una tarjeta en ningún proveedor, incluido AWS. A la vez, debe estar desplegado con una URL pública y ofrecer generación con un modelo de lenguaje.

Datos de los planes gratuitos consultados el 2026-10-20 (cambian sin aviso, ver `docs/operaciones.md`):

- Cloudflare Workers Free: 100.000 peticiones al día y 10 ms de CPU por petición.
- Cloudflare Workers AI: 10.000 neurons al día gratis, compartidos entre modelos. Una medición pública con Llama 3.3 70B estimó unas 80 respuestas diarias.
- GitHub Models: acceso gratuito con límite para cualquier cuenta. Sin Copilot, 15 peticiones por minuto y 150 al día en modelos de nivel bajo.
- GitHub Pages: hosting estático gratuito para repositorios públicos.
- Hugging Face Spaces: desde 2026 los Spaces con cómputo requieren plan de pago para cuentas gratuitas, salvo un máximo de dos con ZeroGPU.

## Decisión

- Frontend: aplicación estática en GitHub Pages, desplegada con GitHub Actions.
- API: un Cloudflare Worker con el framework Hono.
- Modelo: Workers AI, invocado mediante binding desde el Worker. No hay clave de API que guardar ni que se pueda filtrar desde el frontend.
- Evaluación: GitHub Actions llamando a GitHub Models con el permiso `models: read` del propio workflow.
- Sin base de datos: los diagramas viven en el navegador (localStorage) y se comparten codificados en el fragmento de la URL.
- La capa de proveedores LLM es una interfaz con varias implementaciones (Workers AI y cualquier API compatible con OpenAI, como GitHub Models o Groq) para poder cambiar de proveedor si un plan gratuito cambia.

## Alternativas consideradas

- AWS (Lambda, API Gateway, Bedrock): encaja con la experiencia del autor, pero requiere tarjeta y Bedrock no tiene capa gratuita.
- Hugging Face Spaces: ya no ofrece CPU gratuita para Spaces con backend.
- Streamlit Community Cloud: gratuito, pero limita a una app en Python y no permite un frontend a medida.
- Llamar al LLM directamente desde el navegador con una clave: cualquiera podría copiar la clave del código de la página.
- Modelo en el navegador (WebLLM, Transformers.js): coste cero real, pero descarga de cientos de megabytes y calidad insuficiente para salida estructurada compleja en modelos pequeños.

## Consecuencias

- Positivas: coste cero real; sin secretos en el cliente; despliegue reproducible desde CI.
- Negativas: cuotas diarias bajas que obligan a limitar el uso por IP; el límite de 10 ms de CPU por petición obliga a que el trabajo síncrono del Worker (parseo y validación de la respuesta del modelo) sea ligero. La espera al modelo no consume CPU, pero hay que medirlo (tarea T19 del roadmap). Dependencia de las condiciones de dos proveedores.
- El despliegue del Worker requiere una cuenta gratuita de Cloudflare y un token en los secretos del repositorio; es una acción manual del propietario.

## Revisar si

Cambian las condiciones de los planes gratuitos, la cuota diaria se agota con frecuencia, o el proyecto pasa a tener usuarios que justifiquen un coste.
