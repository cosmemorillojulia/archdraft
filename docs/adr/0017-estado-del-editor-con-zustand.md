# ADR 0017: Estado del editor en un store de Zustand con historial de documentos y validación en cada edición

- Estado: aceptada
- Fecha: 2026-10-25

## Contexto

Con T09 el diagrama deja de ser de solo lectura: se añaden, conectan, mueven, cambian de grupo, editan, duplican y borran elementos, y todo debe poder deshacerse. Lo leen piezas que no están en el mismo árbol de React: el lienzo, el inspector, la paleta, la tarjeta del diagrama, los botones de deshacer de la cabecera y los atajos de teclado, que escuchan en la ventana. Hay requisitos fijos:

- El grafo es la fuente de verdad y la disposición es presentación (ADR 0007); React Flow es una vista que se deriva del documento con un adaptador puro (`toFlow`, T08).
- Ninguna edición puede dejar un grafo que `validateGraph` rechace, porque la revisión de diseño, las exportaciones y la persistencia (T11) confían en él.
- Historial de 100 pasos. Un diagrama tiene como mucho 200 nodos y 400 aristas.
- Mientras se arrastra un nodo, su posición cambia en cada fotograma, pero el arrastre entero es un único paso del historial.

## Decisión

- Un store de Zustand (`apps/web/src/editor/store.ts`), sin middleware, con el documento actual, la pila de estados anteriores y posteriores, la selección, la conexión pendiente desde el inspector y el último mensaje de rechazo. Los componentes leen con selectores y los manejadores de eventos llaman a las acciones con `editorStore.getState()`, sin suscribirse.
- Cada edición es una función pura del documento (`operations.ts`) que devuelve el documento siguiente y qué seleccionar, o el motivo para no hacerla. El store valida el resultado una sola vez para todas (esquema Zod y `validateGraph`): si hay un error, la edición no se aplica y se explica con una frase (`describeIssue`). Las ediciones que no cambian nada no se registran.
- El historial guarda documentos inmutables completos, que comparten con el anterior todo lo que no cambió. Abrir otro diagrama también es un paso, con una clave nueva para que el lienzo empiece de cero. La selección no forma parte del historial; al deshacer se mantiene si el elemento sigue existiendo.
- El estado de un arrastre en curso vive en el lienzo, no en el store: el documento solo cambia al soltar.

## Alternativas consideradas

- `useReducer` con contexto: sin dependencias, pero cada cambio vuelve a pintar a todos los consumidores del contexto, y los atajos de la ventana y el lienzo necesitarían el `dispatch` por props o por otro contexto.
- Redux Toolkit: resuelve lo mismo con más piezas (slices, acciones serializables, Immer) de las que necesita un único documento.
- `zundo` como middleware de historial: ahorra escribir la pila, pero el historial tiene que validar antes de registrar, ignorar las ediciones sin cambios y tratar la apertura de diagramas como un paso con clave, y eso queda más claro escrito a mano.
- Guardar parches inversos en lugar de documentos: menos memoria, pero cada edición necesitaría su inversa y sus tests. Con 100 pasos de documentos de 200 nodos que comparten estructura, la memoria no es un problema.
- Validar dentro de cada operación: repetiría las mismas comprobaciones de contención y de aristas en cada una, y una operación nueva podría olvidarlas.

## Consecuencias

- Positivas: el diagrama es válido en todo momento; las operaciones se prueban sin DOM ni React; el lienzo, el inspector y los atajos usan las mismas acciones; deshacer y rehacer son triviales.
- Negativas: validar el grafo entero en cada edición cuesta O(n), unos 0,9 ms con 200 nodos y 400 aristas (medido en Node.js en el entorno de desarrollo); las reglas de contención de las operaciones (dónde cae un nodo) y las de la validación deben seguir coincidiendo, aunque si divergen el resultado es un rechazo explicado, nunca un grafo inválido.

## Revisar si

Las ediciones asistidas por IA (T18) necesitan aplicar lotes de operaciones como un solo paso, la persistencia (T11) necesita guardar el historial, o la validación por edición se nota en diagramas grandes.
