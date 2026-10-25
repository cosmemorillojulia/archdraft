# ADR 0018: Cambio de tema con un fundido cruzado de View Transitions

- Estado: aceptada
- Fecha: 2026-10-25
- Modifica: ADR 0016 (el modo de fundir; el fundido de colores queda como alternativa)

## Contexto

ADR 0016 cambió de tema dando a todos los elementos una transición de color de 420 ms. Con el lienzo de React Flow (T08) y la edición (T09) la página tiene unos 400 elementos visibles, muchos de ellos SVG, y paneles con desenfoque de fondo. Al medir el cambio en Chromium sin GPU, el primer fotograma tardaba entre 146 y 309 ms y la transición entera daba de 6 a 8 fotogramas en 800 ms: cada fotograma recalcula estilos y vuelve a pintar toda la página. Además, la clase se quitaba a los 420 ms justos, y las transiciones que habían empezado un fotograma tarde saltaban a su color final. El propietario pidió mejorar la transición.

Los navegadores principales admiten ya las transiciones de vista en el mismo documento (Chrome y Edge desde la versión 111, Safari 18 y Firefox 144; Baseline desde octubre de 2025, según web.dev).

## Decisión

- Donde el navegador tiene `document.startViewTransition`, el cambio de tema es un fundido cruzado: el navegador captura la página en el tema anterior, aplica el nuevo y funde la captura con la página en vivo en el compositor. Dura 450 ms con una curva que empieza y termina suave (`cubic-bezier(0.4, 0, 0.2, 1)`).
- El estado del tema en React (el icono del botón) se actualiza dentro de la transición, después de la captura, para que el icono cambie con el resto.
- Donde no hay transiciones de vista, se mantiene el fundido de colores de ADR 0016, con la misma duración y curva, y la clase se quita 150 ms después del final teórico para que ninguna transición salte.
- Con movimiento reducido, el cambio sigue siendo inmediato.

## Alternativas consideradas

- Ajustar solo el fundido de colores (curva, duración y fin): corrige el salto final, pero no el coste por fotograma, que crece con el diagrama.
- Animar solo algunos elementos (fondos y textos principales): menos trabajo, pero el resto cambiaría de golpe, que es lo que ADR 0016 quería evitar.

## Consecuencias

- Positivas: un único cambio de estilo y una animación en el compositor. En la misma medición, el primer fotograma bajó a 4 a 12 ms y la transición dio de 19 a 26 fotogramas en 800 ms; con GPU la diferencia debería ser mayor, aunque no se ha medido.
- Negativas: durante 450 ms la página que se ve es una captura que se funde con la real, y los clics de ese intervalo no llegan a la interfaz; en el punto medio todo pasa por un gris uniforme, propio de cualquier fundido cruzado. Hay dos caminos que mantener y probar.

## Revisar si

Se añaden otras transiciones de vista a la aplicación, que compartirían el pseudoelemento `root`, o el bloqueo de los clics durante el fundido se nota.
