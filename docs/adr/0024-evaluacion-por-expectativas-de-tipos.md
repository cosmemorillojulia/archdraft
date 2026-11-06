# ADR 0024: Evaluación por expectativas de tipos, sin diagramas de referencia

- Estado: aceptada
- Fecha: 2026-11-06

## Contexto

ADR 0010 decide medir la calidad del agente con un banco de evaluación, pero no cómo se puntúa una respuesta. Una misma descripción admite muchos diseños correctos, con nombres e ids distintos y con piezas intermedias opcionales. La puntuación tiene que ser objetiva, repetible y barata: el banco se ejecuta con la cuota de un plan gratuito, y no puede depender de un segundo modelo que también consume cuota y tampoco es determinista.

## Decisión

Cada caso declara expectativas por tipo de componente, no un diagrama de referencia: tipos obligatorios, tipos opcionales, pares de tipos que deben estar unidos por un camino de conexiones y tipos o conexiones directas prohibidos. Un puntuador puro calcula precisión, exhaustividad y F1 de tipos, exhaustividad de conexiones, prohibidos, hallazgos del motor de reglas, conservación de ids y si se cumple el objetivo de la tarea (docs/evaluacion.md). Un proveedor falso construye la respuesta ideal a partir de esas mismas expectativas, y un test exige que saque la nota máxima.

## Alternativas consideradas

- Diagramas de referencia comparados nodo a nodo o arista a arista: penalizan diseños correctos que nombran o agrupan distinto, y obligan a resolver qué nodo corresponde a cuál.
- Un modelo como juez: capta la calidad de las etiquetas y de la explicación, pero gasta cuota, no es determinista y necesita su propia validación. Queda como ampliación si las métricas dejan de correlacionar con la calidad percibida (ADR 0010).
- Conexiones directas en lugar de caminos: castigarían un balanceador o una caché entre dos piezas, que suelen mejorar el diseño.

## Consecuencias

- Positivas: cualquier diseño razonable puede aprobar; la puntuación es pura y se prueba como el resto del código; el banco entero se ejecuta sin modelo en los tests, lo que detecta casos imposibles o contradictorios.
- Negativas: las métricas no ven la calidad de las etiquetas ni de las explicaciones; los tipos y el sentido de las conexiones admiten lecturas que el caso tiene que prever.

## Revisar si

Los resultados del banco y la calidad que se percibe al usar el editor dejan de ir de la mano.
