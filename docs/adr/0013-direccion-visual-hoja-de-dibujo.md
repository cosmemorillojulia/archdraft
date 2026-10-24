# ADR 0013: Dirección visual basada en la hoja de dibujo técnico

- Estado: aceptada
- Fecha: 2026-10-24

## Contexto

El editor es la cara pública del proyecto y su pieza de portfolio: tiene que parecer una herramienta profesional con identidad propia, no una plantilla de panel de administración. Al mismo tiempo es una herramienta de trabajo para ingenieros, donde la interfaz debe ceder el protagonismo al diagrama. Hacen falta modo claro y oscuro, contraste AA y cero dependencias de servicios externos (las fuentes no pueden cargarse desde un CDN de terceros, ADR 0004).

## Decisión

Tomar el vocabulario del dibujo técnico, que es lo que significa el nombre del producto, y concentrar la personalidad en un único elemento: el lienzo como hoja de dibujo.

- Color: modo claro sobre papel vellum gris verdoso (`#eceeea`), texto en grafito (`#22292b`) y tinta diazo (`#2f4bb8`) para acciones y selección. Modo oscuro como plano azul (`#142330`) con trazo claro. Un rojo de corrección (`redline`) queda reservado para los hallazgos de la revisión de diseño (T10).
- Tipografía: una sola familia, Archivo, variable en peso y anchura y autoalojada con Fontsource. La anchura es parte del diseño: extendida (125 %) para la marca y el título del diagrama, condensada (75 %) para encabezados y etiquetas del cajetín, normal para el resto.
- Elemento memorable: la hoja con cuadrícula de 8 y 40 px, marco doble y un cajetín en la esquina inferior derecha con el título, el proveedor y las cifras del diagrama.
- Resto de la interfaz sobrio: paneles separados por filetes de un píxel, sin sombras ni tarjetas, radio de 3 px solo en controles, sin animaciones decorativas.

Los detalles (tokens, escala tipográfica, componentes) están en [modulos/web.md](../modulos/web.md).

## Alternativas consideradas

- Estilo neutro de librería de componentes (grises, tarjetas con sombra, radio grande): rápido de construir, pero indistinguible de cualquier otro proyecto y con poca relación con el dominio.
- Plano azul en los dos modos: muy reconocible, pero cansa en sesiones largas y el modo claro es el que más se usa para trabajar.
- Iconografía y colores de los proveedores cloud: atan la identidad a marcas ajenas y chocan con la iconografía neutral (ADR 0008).

## Consecuencias

- Positivas: identidad reconocible derivada del dominio; una sola familia tipográfica de unos 90 KB para el alfabeto latino; tokens semánticos que cambian de tema sin tocar componentes.
- Negativas: la cuadrícula del lienzo y los colores de React Flow (T08) habrá que ajustarlos a estos tokens en lugar de usar su estilo por defecto.

## Revisar si

Las pruebas de accesibilidad (T21) detectan problemas de contraste o legibilidad, o el lienzo de React Flow no encaja con la hoja.
