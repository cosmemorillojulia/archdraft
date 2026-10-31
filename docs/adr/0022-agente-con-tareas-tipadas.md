# ADR 0022: Agente con tareas tipadas y un único endpoint

- Estado: aceptada
- Fecha: 2026-10-31

## Contexto

El asistente de IA debe crear un diagrama desde cero, editar el diagrama abierto, encontrar mejoras y proponer una arquitectura más simple o más completa. Corre en el plan gratuito de Workers AI (ADR 0004): unos 10.000 neurons al día, que dan para unas veinte generaciones con un modelo de 70B. Los modelos disponibles son pequeños para salida estructurada compleja. El roadmap preveía dos endpoints, `/v1/generate` y `/v1/edit`.

## Decisión

- Cinco tareas tipadas (`generate`, `edit`, `improve`, `simplify`, `extend`). Cada una es una llamada al modelo con un prompt propio, más como mucho dos reintentos que envían al modelo los errores concretos de su respuesta.
- La forma de la respuesta del modelo depende de la tarea:
  - Crear y rediseñar devuelven el grafo completo: cambian mucho y un modelo pequeño escribe mejor un documento entero que una lista larga de operaciones.
  - Editar y mejorar devuelven operaciones (`GraphPatch`, `shared/src/patch.ts`): son cambios locales, conservan la colocación manual y dejan ver qué cambió.
  - En los dos casos el backend valida y aplica el resultado, y la API devuelve siempre propuestas con el grafo final y los cambios (`diffGraphs`).
- Un único endpoint, `POST /v1/assist`, con el cuerpo discriminado por `task`. El contrato está en `shared` y lo validan los dos lados.
- En el editor, crear y editar se aplican al momento (se deshacen como cualquier edición). Las mejoras y los rediseños se ofrecen en un panel con Aplicar y Descartar. Una mejora hecha de operaciones se puede volver a aplicar sobre un diagrama que ha cambiado; un rediseño completo, no.

## Alternativas consideradas

- Un agente con herramientas en bucle (`add_node`, `connect`, `lint`…) que decide sus pasos: más flexible, pero cada paso es una llamada al modelo. Con unas veinte generaciones al día, un bucle de cinco o diez pasos dejaría el asistente en un par de usos. Además, los modelos de 70B gratuitos encadenan herramientas con poca fiabilidad, y el coste y la latencia de una petición se vuelven impredecibles.
- Siempre grafo completo: el más sencillo de pedir, pero en un diagrama grande una edición pequeña reescribe todo, gasta tokens de salida (los caros) y arriesga cambios no pedidos.
- Siempre operaciones: preciso para editar, pero crear un diagrama como una lista de `addNode` y `addEdge` es menos natural para el modelo y más propenso a referencias rotas.
- Un endpoint por tarea (`/v1/generate`, `/v1/edit`, …): contratos y validaciones repetidos, y el límite de uso por IP (T19) habría que aplicarlo en cada uno.
- Que el modelo decida la tarea a partir del texto: una llamada más por petición solo para clasificarla, y errores de interpretación que la interfaz evita con un modo explícito.

## Consecuencias

- Positivas: coste y latencia predecibles (una llamada, como mucho tres); toda salida pasa por los mismos validadores que el resto de entradas no confiables; el editor trata todas las respuestas igual; el banco de evaluación (T16) mide exactamente el código que se despliega.
- Negativas: el asistente no puede razonar en varios pasos, como mirar la revisión, corregir y volver a mirar. La tarea `improve` lo compensa en parte con los hallazgos del motor de reglas en el prompt.

## Revisar si

La cuota disponible crece lo bastante para varias llamadas por petición, o los modelos disponibles encadenan herramientas con fiabilidad medida en el banco de evaluación.
