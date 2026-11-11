# ADR 0026: Tests de extremo a extremo sobre el build, con la API simulada y en un job propio

- Estado: aceptada
- Fecha: 2026-11-11

## Contexto

ADR 0010 fija Playwright y axe para probar los flujos principales del editor. Quedaba por decidir contra qué se ejecutan, cómo se trata el asistente, que depende de un modelo de lenguaje, y dónde corren. Los tests deben ser deterministas, no gastar la cuota gratuita del modelo y no alargar `pnpm check`, que se ejecuta antes de cada integración.

## Decisión

- Los tests corren contra el build de producción servido con `vite preview`, no contra el servidor de desarrollo: se prueba lo que se publica en Pages.
- El build de los tests apunta la API a una ruta del mismo origen (`/api`). Nada responde ahí: cada test que usa el asistente contesta con `page.route` una respuesta que se valida con `AssistResultSchema`, el mismo contrato que usa el editor. Al ser el mismo origen, no hay peticiones CORS previas que simular.
- Solo Chromium. El editor no tiene código específico de navegador más allá de APIs estándar con alternativa (`CompressionStream`, View Transitions).
- axe se pasa con las reglas de WCAG 2.1 A y AA y falla con violaciones `serious` o `critical`, en las pantallas principales en claro, oscuro y móvil.
- Corren en un job `e2e` de CI, paralelo al de comprobaciones, y no forman parte de `pnpm check`. Como el despliegue de Pages espera a que CI termine en verde, un fallo de los tests de extremo a extremo también lo bloquea.

## Alternativas consideradas

- Servidor de desarrollo de Vite: arranca antes, pero no prueba el build ni la división en chunks que llega a producción.
- Levantar el Worker con Wrangler y un proveedor falso: prueba más piezas, pero duplica los tests de integración del backend, exige el runtime de Workers en el job y hace el test más lento y frágil. El contrato compartido ya garantiza que las dos partes hablan el mismo formato.
- Incluir los tests en `pnpm check`: obliga a descargar un navegador en cada máquina y añade alrededor de un minuto a cada comprobación.
- Firefox y WebKit: triplican el tiempo del job para un riesgo bajo; se puede añadir otro proyecto a la configuración si aparece un fallo propio de un navegador.
- Fallar con cualquier violación de axe: las menores y moderadas se revisan en las pasadas de diseño (T26) y harían frágiles los tests ante cambios visuales.

## Consecuencias

- Positivas: los flujos principales se prueban como los usa una persona, sin red ni cuota; una regresión de accesibilidad grave bloquea el despliegue.
- Negativas: `pnpm check` en verde no garantiza que pasen los tests de extremo a extremo; hay que ejecutar `pnpm test:e2e` en local o esperar al job. La respuesta simulada no prueba la calidad del modelo, que mide el banco de evaluación.

## Revisar si

El job tarda más de cinco minutos, aparecen fallos que solo se dan en otros navegadores o el editor empieza a depender de algo del servidor que la simulación no cubra.
