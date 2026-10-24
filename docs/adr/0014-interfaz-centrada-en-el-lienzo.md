# ADR 0014: Interfaz centrada en el lienzo con paneles flotantes

- Estado: aceptada; ADR 0015 sustituye la barra superior flotante por una cabecera fija
- Fecha: 2026-10-24
- Sustituye a: ADR 0013

## Contexto

La primera dirección visual (ADR 0013, hoja de dibujo técnico) se publicó en T07. Al verla, el propietario pidió una interfaz más moderna, con sensación premium, fluida, sencilla y visual, y que no se perciba como generada por una IA. La versión de T07 tenía tres paneles fijos con mucho texto, un lienzo vacío y un concepto decorativo (cuadrícula de dibujo, cajetín, tipografía extendida) que pesaba más que el contenido.

Las herramientas de diagramas que se perciben como premium comparten patrones: el lienzo ocupa toda la ventana, la interfaz flota sobre él y aparece cuando se necesita, la acción principal está siempre a mano y el contenido se reconoce por iconos y color antes que por texto.

## Decisión

- Lienzo a pantalla completa con cuadrícula de puntos. Todo lo demás flota encima con superficie translúcida, filete de un píxel y una única sombra suave que indica que la capa está por encima del lienzo.
- Barra superior flotante con el producto, el título del diagrama, su proveedor y el estado de la revisión de diseño (resultado real de `lintGraph`).
- Paleta de componentes flotante, cerrada al empezar, con buscador e iconos con un color por categoría.
- Barra inferior para describir el sistema, que será la entrada a la generación con IA (T20), con las seis plantillas como accesos de un clic.
- El diagrama se dibuja ya en una vista previa de solo lectura (SVG con la disposición de ELK) que el lienzo interactivo de T08 sustituirá conservando su lenguaje visual.
- Tipografía Instrument Sans variable, autoalojada. Acento azul cobalto (`#2e5bff` en claro, `#7c9bff` en oscuro). Radios por capa: 16 px en paneles, 10 px en controles, píldora en las plantillas.
- Movimiento contenido: entrada del diagrama y de los paneles con una curva suave en unos 300 ms, desactivado con `prefers-reduced-motion`.

Los tokens y componentes están en [modulos/web.md](../modulos/web.md).

## Alternativas consideradas

- Pulir la hoja de dibujo de ADR 0013: conserva la identidad, pero no resuelve que la interfaz se lea como una herramienta de administración con tres columnas de texto.
- Mantener los tres paneles fijos y añadir solo color e iconos: menos trabajo, pero el diagrama seguiría encajonado y el móvil, partido en pestañas.
- Esperar a T08 para mostrar diagramas: el editor publicado seguiría enseñando un lienzo vacío.

## Consecuencias

- Positivas: el diagrama es lo primero que se ve; la interfaz se reduce a tres piezas reconocibles; el color por categoría hace legibles la paleta y los nodos sin leer etiquetas; el mismo lenguaje visual servirá para los nodos de React Flow.
- Negativas: la vista previa duplica temporalmente parte del trabajo de T08 (geometría y dibujo de nodos), y ELK pesa unos 440 KB comprimidos, que se cargan bajo demanda al mostrar el primer diagrama. Los paneles de inspector y revisión de T09 y T10 tendrán que ser también flotantes.

## Revisar si

Las pruebas con usuarios o de accesibilidad (T21) muestran que los paneles flotantes tapan contenido importante, o el rendimiento del desenfoque de fondo es malo en equipos modestos.
