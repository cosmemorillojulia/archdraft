# ADR 0029: Enrutado propio de las conexiones en el lienzo en lugar de las rutas de ELK

- Estado: aceptada
- Fecha: 2026-11-21

## Contexto

La revisión de diseño de T08 vio aristas que pasaban por detrás de nodos que no eran su origen ni su destino, porque se dibujaban como curvas directas entre conectores. T30 proponía usar las rutas que ELK ya calcula (secciones con puntos de inflexión), exponerlas en `DiagramLayout` y dibujarlas en el lienzo.

Antes de empezar T30, el lienzo ya rodeaba los nodos con un enrutador propio (`routeAround` en `frontend/src/canvas/router.ts`): un A\* sobre una rejilla dispersa, con coste por giro, que también elige el par de lados de cada arista (`placeEdges`). Las restricciones que pesan:

- El usuario mueve nodos, cambia su tamaño y fija lados y puntos a mano. Las rutas tienen que seguir siendo correctas después de cada edición, no solo tras una disposición completa.
- La disposición se calcula en un Web Worker y de forma asíncrona; el dibujo de una arista mientras se arrastra un nodo tiene que ser síncrono.
- La exportación a SVG y PNG dibuja lo mismo que el lienzo sin ELK.

## Decisión

Las conexiones se enrutan en el lienzo con `routeAround`, a partir de las cajas de los nodos tal como están, y no se usan ni se guardan las rutas de ELK. Una curva que tendría que cruzar un nodo pasa por las esquinas de esa ruta con una spline de Catmull-Rom; si la spline, al pasar por esquinas muy desiguales, se abre hacia un nodo, la curva sigue la ruta con esquinas redondeadas de radio amplio (24 px). Un test recorre las dieciséis plantillas en los dos estilos y comprueba, muestreando el trazo dibujado, que ninguna conexión entra en un nodo que no une.

## Alternativas consideradas

- Rutas de ELK en `DiagramLayout`: solo valen para la disposición en la que se calcularon. En cuanto el usuario mueve un nodo hay que descartarlas o recalcular la disposición entera en el worker, que es asíncrono y movería nodos fijados. Además añaden datos al documento que se guarda, se comparte en la URL y se valida, sin aportar nada que el lienzo no pueda calcular.
- Rutas de ELK solo tras una disposición completa y el enrutador propio después de editar: dos algoritmos con resultados distintos para el mismo diagrama, de modo que una arista cambiaría de forma al tocar cualquier nodo.
- Limitar la longitud de las tangentes de la spline: reduce el desvío pero no lo elimina cuando la ruta va pegada a una columna de nodos, como en la plantilla MLOps.
- No hacer nada: las curvas seguirían cruzando un nodo en esa plantilla.

## Consecuencias

- Positivas: una sola forma de dibujar cada arista en el lienzo, en la exportación y mientras se edita; el documento no crece; el criterio de aceptación de T30 queda cubierto por un test que corre en `pnpm check`.
- Negativas: el enrutador es código propio que hay que mantener; `elk.edgeRouting` sigue en `ORTHOGONAL` solo para que ELK deje hueco entre capas. En los pocos casos que usan el respaldo, una curva se ve como una línea de esquinas muy redondeadas.

## Revisar si

- El enrutador se vuelve lento en diagramas grandes (el test de 200 nodos de T22 lo vigila).
- Se quiere que las aristas influyan en la colocación de los nodos más allá de lo que ya hace ELK.
