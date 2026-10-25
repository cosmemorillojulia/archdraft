# ADR 0016: Cambio de tema con fundido de colores

- Estado: aceptada; ADR 0018 usa un fundido cruzado de View Transitions donde el navegador lo admite y deja este fundido de colores como alternativa; desde T08 la cuadrícula de puntos es el fondo de React Flow, un patrón SVG que se funde por su relleno
- Fecha: 2026-10-25
- Modifica: ADR 0015 (solo el modo de cambiar de tema)

## Contexto

ADR 0015 introdujo un revelado circular del nuevo tema desde el botón, con la API View Transitions. Al probarlo, el propietario prefirió una transición general, no desde una esquina, y notó un tirón al final. Al medirlo se vio que el cambio de tema volvía a pintar toda la aplicación, porque el estado del tema vivía en el componente raíz: el trabajo de React retrasaba el inicio y el final de la animación.

## Decisión

- Mientras dura el cambio, la raíz lleva la clase `theme-fade`, que da a todos los elementos una transición de 420 ms sobre los colores (fondo, borde, texto, relleno y trazo de SVG, sombra). Como todos los colores salen de variables CSS, al cambiar `data-theme` la página entera se funde a la vez. Con movimiento reducido el cambio es inmediato.
- La cuadrícula de puntos pasa a ser una capa con máscara cuyo color es un fondo liso, porque los degradados no se interpolan.
- El estado del tema vive en la cabecera: un cambio de tema solo vuelve a pintar el botón.

## Alternativas consideradas

- Mantener View Transitions con un fundido cruzado en lugar del círculo: más sencillo que el círculo, pero sigue dependiendo de capturas de la página y del soporte del navegador, y el tirón venía del trabajo de React, no de la forma.
- Animar solo el fondo: rápido, pero el texto y los nodos cambiarían de golpe y el efecto se vería desigual.

## Consecuencias

- Positivas: transición uniforme en todos los navegadores, sin capturas ni recortes; el cambio empieza en el mismo fotograma.
- Negativas: durante 420 ms, las transiciones propias de los elementos (por ejemplo, la opacidad al resaltar un nodo) quedan sustituidas por las de color.

## Revisar si

Aparecen elementos cuyo color no sale de los tokens y no se funden, o el fundido resulta lento en equipos modestos.
