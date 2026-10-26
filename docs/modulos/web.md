# Módulo: apps/web

Editor visual de Archdraft. Es una aplicación de una sola página con Vite, React 19, TypeScript y Tailwind CSS 4, publicada en GitHub Pages en `https://cosmemorillojulia.github.io/archdraft/`. Depende de `@archdraft/core` y `@archdraft/layout`, nunca al revés (ver [arquitectura](../arquitectura.md)).

Estado: estructura y despliegue (T07), lienzo con React Flow y zoom (T08), rediseño centrado en el lienzo (T25), cabecera fija con animaciones (T27), paleta en móvil (T28) y ajustes visuales (T29). La edición llega en T09 y el panel de revisión en T10.

## Estructura

```
apps/web/
  index.html              # aplica el tema guardado antes del primer pintado
  vite.config.ts          # base /archdraft/, plugins de React y Tailwind, configuración de Vitest
  public/favicon.svg      # logo (G3); apple-touch-icon.png, la misma figura para iOS
  src/
    main.tsx              # punto de entrada
    App.tsx               # proveedores, cabecera fija, lienzo, capas flotantes y añadir en el centro
    export/
      diagram-svg.ts      # diagramToSvg: el documento como imagen vectorial, puro
      browser.ts          # tema, medida de texto, fuente incrustada y PNG en el navegador
      icon-markup.tsx     # los iconos de Lucide del lienzo como marcado SVG
      files.ts            # nombres de fichero por formato y descarga
    palette/
      palette-drag.ts     # arrastrar un mosaico con ratón o con el dedo hasta el diagrama
      PaletteDragGhost.tsx# el nodo que sigue al puntero mientras se arrastra
    i18n/
      en.ts               # textos en inglés y el tipo Strings (ADR 0009 y 0020)
      es.ts               # textos en español, con las mismas claves
      locale.ts           # idioma: store, useStrings, currentStrings, detección y lang de la página
      templates.ts        # plantillas en español, por id de nodo y de arista
      labels.ts           # productName: producto de un nodo con el nombre del tipo en su idioma
    theme.ts              # useTheme: tema claro u oscuro, guardado, con fundido de colores
    motion.ts             # tokens de movimiento: curva y muelles compartidos
    motion-features.ts    # funciones de Motion que se cargan aparte
    media.ts              # useMediaQuery y el punto de corte WIDE_SCREEN
    preferences.ts        # preferencias de la vista: animación del flujo (localStorage)
    icons.ts              # icono de Lucide de cada tipo de nodo
    styles.css            # tokens, tema oscuro, utilidad floating, estilos de React Flow
    components/           # Button, Header, HistoryControls, LanguageToggle, DiagramCard, ComponentsPanel, PromptDock,
                          # FloatingPanel, PanelSlot, Inspector, fields (campos del inspector),
                          # ReviewPanel, EditorNotice, ShareMenu (compartir y ficheros)
    persist/
      autosave.ts         # autoguardado en localStorage (archdraft:document:v1)
      share-link.ts       # enlaces #d=: compresión, base64 apto para URL y límites
    review/
      findings.ts         # hallazgos memoizados por versión del documento, severidades por nodo
      review-store.ts     # estado del panel de revisión y reglas desactivadas (localStorage)
    editor/
      store.ts            # store de Zustand: documento, historial, selección, mensajes (ADR 0017)
      operations.ts       # ediciones puras del documento: añadir, conectar, mover, borrar, duplicar
      open-document.ts    # abre plantillas, ficheros, enlaces y lo guardado; deduce la dirección
      shortcuts.ts        # atajos de teclado
    canvas/
      DiagramCanvas.tsx   # lienzo React Flow: vista inicial, resaltado, arrastres, conexiones, minimapa
      flow.ts             # toFlow: adaptador puro del documento a nodos y aristas
      ComponentNode.tsx   # nodo de componente
      ContainerNode.tsx   # nodo de contenedor
      ShapeNode.tsx       # figura genérica: caja, círculo, rombo o nota, con cambio de tamaño
      ArchitectureEdge.tsx# arista con trazado animado, punta de flecha, partícula y etiqueta
      ZoomControls.tsx    # acercar, alejar, ajustar y animación del flujo
      canvas-context.ts   # contexto del lienzo: foco, selección, grupo de destino; relatedTo
      ResizeHandles.tsx   # tiradores para cambiar el tamaño de cualquier nodo seleccionado
      use-stable-handler.ts # manejadores con identidad estable para React Flow
      geometry.ts         # cajas absolutas, profundidad, límites, escala, vista inicial y punta de flecha
      layout-client.ts    # layoutDiagram: ELK en un Web Worker
      layout.worker.ts    # el worker
      elk-in-worker.ts    # prepara el ámbito del worker para elkjs
  test/
    setup.ts              # jest-dom, limpieza, matchMedia, ResizeObserver y DOMMatrix simulados, animaciones desactivadas
    app.test.tsx          # comportamiento de la aplicación con Testing Library
    editing.test.tsx      # edición en la aplicación: tocar, soltar, atajos, deshacer, rechazos
    inspector.test.tsx    # formularios del inspector
    operations.test.ts    # ediciones puras
    store.test.ts         # historial, validación y mensajes del store
    flow.test.ts          # adaptador toFlow
    shapes.test.tsx       # figuras genéricas, animación del flujo y aristas
    geometry.test.ts
    icons.test.ts         # los iconos coinciden con los del catálogo de core
```

## Scripts

| Script                      | Qué hace                                                            |
| --------------------------- | ------------------------------------------------------------------- |
| `pnpm --filter web dev`     | Servidor de desarrollo en `http://localhost:5173/archdraft/`        |
| `pnpm --filter web build`   | Build de producción en `apps/web/dist`                              |
| `pnpm --filter web preview` | Sirve el build en `http://localhost:4173/archdraft/` para revisarlo |
| `pnpm --filter web test`    | Tests en jsdom                                                      |

La `base` de Vite es `/archdraft/` también en desarrollo: GitHub Pages sirve el sitio del proyecto bajo el nombre del repositorio, y usar la misma ruta en local evita sorpresas con rutas de recursos que solo fallarían en producción.

## Dirección visual

[ADR 0014](../adr/0014-interfaz-centrada-en-el-lienzo.md): el lienzo ocupa el espacio bajo la cabecera y el resto de la interfaz flota encima. [ADR 0015](../adr/0015-animaciones-con-motion-y-cabecera-fija.md): la cabecera vuelve a ser una barra fija solo con el nombre, y todo el recorrido se anima con Motion.

```
┌──────────────────────────────────────────────────────────────┐
│ ARCHDRAFT  Describe a cloud architecture…  ↶ ↷ Share [ES] ◐ │  cabecera fija
├──────────────────────────────────────────────────────────────┤
│ [Show components]              [Título del diagrama     AWS] │
│                                [10 components 8 connections] │
│                                [              ✓ No issues    ] │
│                  diagrama sobre cuadrícula de puntos         │
│                                                              │
│          [✦ ejemplo de descripción que va rotando     ↑]     │
└──────────────────────────────────────────────────────────────┘
```

### Tokens de color

Variables CSS en `:root` y `:root[data-theme='dark']`, expuestas a Tailwind con `@theme inline`: `bg-surface` o `text-muted` cambian con el tema sin variantes `dark:` en los componentes.

| Token           | Claro         | Oscuro        | Uso                                     |
| --------------- | ------------- | ------------- | --------------------------------------- |
| `canvas`        | `#f3f4f6`     | `#15171c`     | Fondo del lienzo                        |
| `dots`          | `#cfd4dc`     | `#2c3039`     | Cuadrícula de puntos cada 22 px         |
| `surface`       | `#ffffff`     | `#1d2027`     | Paneles flotantes y nodos               |
| `surface-muted` | `#f6f7f9`     | `#23272f`     | Campos, hover, insignias                |
| `ink`           | `#171a20`     | `#eceef2`     | Texto principal                         |
| `muted`         | `#5d6471`     | `#9ba2af`     | Texto secundario e iconos de interfaz   |
| `line`          | `#e2e5ea`     | `#2e333c`     | Filetes y bordes                        |
| `accent`        | `#2e5bff`     | `#7c9bff`     | Acción principal, plantilla activa      |
| `success`       | `#0f7a50`     | `#4cc38a`     | Revisión sin hallazgos                  |
| `warning`       | `#b45309`     | `#f0a54a`     | Revisión con hallazgos                  |
| `edge`          | `#9aa3b2`     | `#5c6474`     | Aristas del diagrama                    |
| `cat-*`         | por categoría | por categoría | Icono y fondo de cada categoría de nodo |

Cada categoría del catálogo tiene un par de color (icono y fondo): cómputo en azul, datos en verde azulado, mensajería en ámbar, seguridad en rosa, entrada y tráfico en violeta, IA en magenta, observabilidad en verde y el resto en gris. El color identifica la categoría de un vistazo en la paleta y en el diagrama; la etiqueta sigue presente, así que no es la única pista.

Contraste WCAG medido: texto principal sobre superficie, 17,4:1 en claro y 14,0:1 en oscuro; texto secundario sobre superficie, 6,0:1 y 6,4:1, y sobre el lienzo, 5,4:1 y 7,0:1; texto sobre el botón principal, 5,2:1 y 7,0:1; estado de la revisión sobre su fondo tintado, 4,5:1 en claro.

### Capas flotantes

La utilidad `floating` da a cada capa una superficie al 88 % de opacidad con desenfoque de fondo, un filete de un píxel y una sombra de dos niveles. En pantallas táctiles (`pointer: coarse`) la superficie es casi opaca (96 %) y sin desenfoque: una capa desenfocada se vuelve a pintar cada vez que cambia el lienzo que tiene debajo, en cada paso de un arrastre, y es lo que más cuesta en un móvil. Solo la llevan los elementos que flotan sobre el lienzo; dentro de un panel no hay tarjetas ni sombras. Radios por capa: 16 px en paneles (`rounded-panel`), 10 px en controles (`rounded-control`) y píldora en las plantillas.

### Logo

El icono de la aplicación es la propuesta G3, elegida por el propietario entre varias rondas: un pequeño diagrama con forma de A (un nodo redondo arriba, dos cuadrados abajo y una conexión que hace de travesaño) dentro de las marcas de esquina de una hoja de dibujo. Tres colores: marino `#12284A` de fondo, papel `#F4F6F9` para el grafo y acero claro `#8FB0DE` para las marcas y el travesaño. Se ve como icono de la pestaña (`public/favicon.svg`, en una cuadrícula de 512 con esquinas redondeadas) y en la pantalla de inicio de iOS (`public/apple-touch-icon.png`, 180 × 180 y cuadrado, porque iOS redondea los iconos), y encabeza el README. La cabecera sigue sin logotipo gráfico: el nombre en mayúsculas inclinadas hace de marca (ADR 0015).

### Tarjeta para compartir

`public/og-image.png` (1200 × 630, unos 260 KB, por debajo de los 300 KB que exige WhatsApp) es la imagen que muestran WhatsApp, LinkedIn, X o Slack al pegar el enlace: logo, nombre con la misma tipografía inclinada de la cabecera, lema y un diagrama pequeño en modo oscuro con un componente de cada categoría de color (API en AWS con inicio de sesión, función, IA, datos, cola, monitorización y un sistema externo a cada lado de la región). No es una captura del editor, sino un dibujo con los mismos colores e iconos; se renderizó a 3x y se redujo para que quede nítida. Las etiquetas `og:*` y `twitter:card` de `index.html` la anuncian con URL absolutas, porque los rastreadores no resuelven rutas relativas. Si cambian los colores o la tipografía del editor, hay que regenerar la imagen a mano; `test/brand.test.ts` solo comprueba que existe, que mide 1200 × 630 y que está enlazada.

### Tipografía

Instrument Sans variable (peso 400 a 700, anchura 75 % a 100 %), autoalojada con `@fontsource-variable/instrument-sans`: unos 57 KB para el alfabeto latino básico. Escala: 14 px para la interfaz, 18 px bold para el nombre en la cabecera, 13 px semibold para la etiqueta de un nodo y 11 a 12 px para textos secundarios. Sin mayúsculas sostenidas, salvo el nombre de la cabecera, que hace de logotipo: en mayúsculas con `text-transform` (el texto sigue siendo Archdraft para los lectores de pantalla), con un espaciado de 0,06 em y una inclinación de 8° (`skewX`) en lugar de la cursiva de Instrument Sans, que sería otro archivo de fuente solo para esta palabra; en mayúsculas, la cursiva apenas cambia la forma de las letras.

### Movimiento

Motion (`motion/react`, ADR 0015) con `LazyMotion` y componentes `m`; las funciones de animación (`domMax`, con animaciones de layout) se cargan en un chunk aparte justo después del primer render. `MotionConfig reducedMotion="user"` desactiva los desplazamientos y escalados si el sistema pide movimiento reducido, y las partículas de las aristas no se dibujan en ese caso.

Tokens en `src/motion.ts`:

| Token          | Valor                                 | Uso                                              |
| -------------- | ------------------------------------- | ------------------------------------------------ |
| `EASE_OUT`     | `cubic-bezier(0.2, 0.8, 0.2, 1)`      | Entradas, salidas y fundidos                     |
| `SPRING_POP`   | muelle, rigidez 380, amortiguación 28 | Elementos pequeños que aparecen: nodos, mosaicos |
| `SPRING_SLIDE` | muelle, rebote 0,18, 450 ms           | Paneles e indicadores que se desplazan           |

Animaciones del recorrido:

| Momento                        | Qué ocurre                                                                                                                                                                     |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Cargar o cambiar diagrama      | El anterior se desvanece; el nuevo se construye de izquierda a derecha en unos 0,7 s: grupos, nodos con un muelle y aristas que se trazan                                      |
| Flujo                          | Una partícula del color de la categoría de origen recorre cada arista en bucle, más despacio cuanto más larga es                                                               |
| Pasar el ratón por un nodo     | El nodo crece un 4 % y se perfila con su color; sus conexiones se resaltan con su etiqueta y el resto se atenúa                                                                |
| Seleccionar                    | El elemento se rodea del color de acento y sus conexiones se resaltan sin atenuar el resto; el inspector entra deslizándose desde la derecha, o desde abajo y plegado en móvil |
| Desplegar el inspector (móvil) | El panel sigue un poco al dedo y cambia de tamaño con un muelle; el contenido anterior sale enseguida y el nuevo entra con un fundido                                          |
| Añadir                         | El nodo nuevo aparece con un muelle, sin esperar a la construcción del diagrama; las cifras de la tarjeta ruedan                                                               |
| Arrastrar                      | El nodo arrastrado pasa por encima de todo; el grupo en el que caería se ilumina                                                                                               |
| Rechazo                        | El aviso baja desde arriba y se va solo a los 4,5 s                                                                                                                            |
| Elegir plantilla               | El menú de la cabecera se cierra; la tarjeta del diagrama cambia el título y las cifras ruedan                                                                                 |
| Paleta                         | Entra desde la izquierda con un muelle, los mosaicos aparecen en cascada y la rejilla se recoloca al filtrar; el lienzo ajusta su margen                                       |
| Campo de descripción           | Ejemplos de descripción que se suceden cada 3,6 s mientras está vacío; al enfocarlo aparece un halo del color de acento                                                        |
| Cambio de tema                 | La página en el tema anterior se funde con la del nuevo en 450 ms, con un fundido cruzado (ADR 0018); el icono gira y se funde                                                 |

## Piezas de la interfaz

| Pieza             | Contenido                                                                                                                                                                                                                                                                    |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Header`          | Barra fija: nombre del producto en mayúsculas inclinadas, sin logotipo gráfico, descripción, deshacer y rehacer (`HistoryControls`), compartir y ficheros (`ShareMenu`), idioma (`LanguageToggle`) y cambio de tema                                                          |
| `DiagramCard`     | Tarjeta flotante: título, proveedor, descripción recortada a dos líneas, número de componentes y conexiones, y estado de la revisión de diseño en el color del hallazgo más grave; es el botón que abre la revisión, y una región `role="status"` oculta anuncia sus cambios |
| `ComponentsPanel` | Cerrada al empezar. Buscador por nombre, grupos por categoría y mosaicos con icono y nombre; la descripción del catálogo aparece al pasar el ratón. Cada mosaico es un botón «Add …» (ver Edición)                                                                           |
| `PromptDock`      | Campo que crece con el texto (`field-sizing: content`) con ejemplos rotatorios decorativos (`aria-hidden`), botón de generar deshabilitado con el motivo enlazado por `aria-describedby`, sin plantillas: viven en el menú de la cabecera                                    |
| `DiagramCanvas`   | Lienzo React Flow con el diagrama, zoom, minimapa, resaltado y edición directa (ver Lienzo y Edición)                                                                                                                                                                        |
| `PanelSlot`       | Lugar bajo la tarjeta, o abajo en móvil, para un panel a la vez: la revisión de diseño si está abierta y, si no, el inspector. Uno sale mientras el otro entra (`FloatingPanel` es la carcasa común)                                                                         |
| `Inspector`       | Panel flotante con las propiedades de lo seleccionado (ver Edición)                                                                                                                                                                                                          |
| `ReviewPanel`     | Panel de revisión de diseño (ver Revisión de diseño)                                                                                                                                                                                                                         |
| `EditorNotice`    | Avisos arriba en el centro: por qué no se hizo una edición (`role="alert"`) y la conexión pendiente desde el inspector, con su botón para cancelar                                                                                                                           |
| `Button`          | Variantes `primary`, `secondary`, `ghost` y `danger`; tamaños `default` e `icon`. Los tamaños son variantes con nombre porque dos utilidades de Tailwind sobre la misma propiedad no se anulan por su orden en `class`                                                       |

En pantallas estrechas la cabecera oculta la descripción, la tarjeta ocupa el ancho sin la descripción del diagrama y el menú de plantillas pasa a ser un icono.

### Paleta en escritorio y en móvil

`useMediaQuery(WIDE_SCREEN)` (`min-width: 768px`, el punto `md` de Tailwind) decide la forma de la paleta:

| Pantalla | Botón                                                                       | Paleta                                                                                            | Cierre                                                                                               |
| -------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Ancha    | `Show components` arriba a la izquierda                                     | Panel flotante junto al diagrama, tres columnas; el lienzo deja sitio                             | Botón del panel o Escape                                                                             |
| Estrecha | Botón flotante redondeado sobre la barra de descripción, abajo a la derecha | Hoja modal que sube desde abajo (hasta el 80 % de la altura), cuatro columnas, con fondo atenuado | Botón con aspa, Escape, toque fuera o arrastrar el asa hacia abajo (más de 120 px o más de 500 px/s) |

Mientras la hoja está abierta, el resto de la página lleva el atributo `inert`, de modo que el foco y los lectores de pantalla no salen de ella; al abrirse recibe el foco la propia hoja (no el buscador, para no desplegar el teclado) y al cerrarse vuelve al botón. El arrastre solo empieza en el asa (`useDragControls`), para que desplazar la rejilla no cierre la hoja.

Pulsar un mosaico añade su componente en el centro de la vista; en escritorio también se puede arrastrar al diagrama, y en móvil la hoja se cierra al añadir. Una línea bajo el título lo explica en cada caso.

## Lienzo

`DiagramCanvas` dibuja el documento del store del editor con React Flow (ADR 0007 y 0017) y convierte clics, arrastres y conexiones en ediciones (ver Edición). La disposición automática solo se calcula al abrir una plantilla; después, las posiciones son las del documento.

### Del documento a React Flow

`toFlow(document, direction)` es un adaptador puro, con tests:

- Un nodo `component`, `shape` o `container` por nodo del grafo, con la posición relativa al contenedor padre (la convención de los subflujos de React Flow), el tamaño de la disposición y `parentId`. Los padres van antes que sus hijos, como exige React Flow.
- Cada nodo lleva también ese tamaño como `measured`. React Flow, cuando recibe un objeto de nodo nuevo sin tamaño medido, descarta la posición de sus conectores y oculta sus aristas hasta volver a medirlo; como cada edición y cada paso de un arrastre crean objetos nuevos, las aristas se desmontaban y se volvían a trazar desde cero, y en mitad de un arrastre se veían cortadas. El tamaño ya lo fija la disposición, así que se pasa medido.
- Los componentes llevan su categoría, el producto resuelto, las posiciones de sus conectores según la dirección (derecha e izquierda en `LR`, abajo y arriba en `TB`) y, si su proveedor no es el del diagrama, un distintivo (`External`, `AWS`, `GCP` o `Azure`).
- Los contenedores llevan su profundidad de anidamiento, para el tinte.
- Cada arista sabe si es asíncrona y la categoría de su origen, para el color de la partícula.
- Cada elemento lleva el retardo de su entrada: el diagrama se construye en el sentido del flujo en unos 0,7 s.
- Los nodos sin disposición se omiten, con sus descendientes y sus aristas.

### Disposición en un Web Worker

`openTemplate` llama a `layoutDiagram`, que envía el grafo a `layout.worker.ts`, donde se ejecuta `computeLayout` de `@archdraft/layout`: de izquierda a derecha si la plantilla se abre en una pantalla ancha y de arriba abajo en una estrecha. Esa dirección se guarda con el documento, porque orienta los conectores; girar el móvil no vuelve a disponer el diagrama, para no perder lo editado. El worker se crea la primera vez que hace falta, así que ELK (unos 440 KB comprimidos) no forma parte de la carga inicial y nunca bloquea la interfaz. Donde no hay workers (los tests en jsdom) se ejecuta en el hilo principal con `import()` dinámico.

La versión empaquetada de elkjs, al ejecutarse en un contexto con `self` y sin `document`, se comporta como su propio worker: escucha mensajes y deja de exportar el motor que usa `@archdraft/layout`. `elk-in-worker.ts`, importado antes que nada en el worker, declara un `document` vacío para que elkjs se cargue como librería.

### Distribución en escritorio

Los paneles flotantes se reparten el espacio sin dejar huecos junto a la barra de descripción: la paleta de componentes llega de arriba abajo en el lado izquierdo; a la derecha, la tarjeta del diagrama y el inspector (o la revisión) ocupan la columna hasta el grupo de zoom y minimapa, que está en la esquina inferior derecha; y la barra de descripción se queda entre ambos con un ancho máximo de 48 rem, que se estrecha en pantallas pequeñas. En alturas pequeñas, como 626 px, el inspector queda unos 40 px más bajo que antes y se desplaza por dentro.

### Zoom y desplazamiento

| Gesto                                                            | Efecto                                                                            |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Rueda del ratón                                                  | Acerca o aleja alrededor del puntero                                              |
| Pellizco en trackpad (el navegador lo envía como rueda con Ctrl) | Acerca o aleja                                                                    |
| Pellizco con dos dedos                                           | Acerca o aleja                                                                    |
| Arrastrar el fondo, o un grupo sin seleccionar                   | Desplaza                                                                          |
| Arrastrar un componente, o un grupo seleccionado                 | Lo mueve (ver Edición)                                                            |
| Doble clic o doble toque                                         | Acerca                                                                            |
| Botones de zoom                                                  | Acercar y alejar en pasos animados de 220 ms; ajustar con una animación de 450 ms |

El zoom va del 20 % al 200 % y los botones muestran el porcentaje actual. Cada diagrama que se abre (una plantilla, o deshacer hasta otro diagrama) se muestra entero: `initialViewport` lo encaja y lo centra en la parte del lienzo que no tapan las capas flotantes (`canvasInsets` en `App.tsx`), sin pasar del 120 % para que uno pequeño no se agrande y sin bajar del 20 %; si ni así cabe, empieza arriba y centrado. El botón de ajustar hace el mismo cálculo con una animación. En móvil, las plantillas se ven enteras entre el 34 % y el 54 %, así que los textos de los nodos quedan pequeños hasta acercar con los dedos; antes, por T29, la vista inicial no bajaba del 90 % en móvil (60 % en escritorio) y empezaba arriba; se cambió a petición del propietario para ver siempre el diagrama completo al abrirlo. Al abrir o cerrar la paleta en escritorio, la vista se desliza la mitad del ancho del panel para seguir centrada en el espacio libre.

Los botones de zoom y el de la animación del flujo forman un grupo llamado «View». En escritorio van abajo a la derecha, pegados al borde, en una columna compacta de botones de 28 px con el minimapa a su izquierda (176 × 157 px, de la misma altura), y el minimapa se ve en cualquier ancho de escritorio (a partir de 768 px), no solo desde 1280 px como antes: en una pantalla de unos 1265 px efectivos no aparecía. Los nodos del minimapa llevan el color de su categoría y sirve también para desplazarse y hacer zoom. En pantallas estrechas el grupo sube por encima de la barra de descripción, a la derecha, con el botón de mostrar componentes a la izquierda, y sus botones miden 40 px para el dedo. El enlace de atribución que React Flow pone en la esquina está oculto (`proOptions.hideAttribution`); su licencia MIT lo permite y su documentación lo contempla, y el crédito está en el README.

### Nodos y aristas

- Componente: tarjeta con el icono sobre el color de su categoría, el nombre en hasta dos líneas y el producto en una, recortados con puntos suspensivos y completos en el `title`; el distintivo de proveedor flota sobre el borde superior.
- Contenedor: rectángulo opaco teñido con el acento, más intenso cuanto más anidado, para que los puntos del fondo no se vean dentro; `boundary` con borde discontinuo; cabecera con icono y nombre.
- Figura genérica: caja, círculo, rombo o nota con el nombre centrado (hasta tres líneas), en gris neutro; la nota, en amarillo papel. El rombo y la nota se dibujan con un SVG que se estira con la figura y un trazo que no se deforma.
- Puntos de conexión: cada componente y figura tiene cuatro, dos de entrada (izquierda y arriba) y dos de salida (derecha y abajo, los que muestran el punto para arrastrar una conexión nueva, `ConnectionHandles`). Cada arista elige sola el par más corto con `edgeSides` (geometry.ts): sale siempre por la derecha o por abajo y llega siempre por la izquierda o por arriba, y penaliza las líneas que irían hacia atrás, como salir por la derecha hacia un nodo que está a la izquierda. La dirección del flujo solo desempata. Las aristas guardan el par en `sourceHandle` y `targetHandle`, y la exportación a SVG y PNG usa la misma función, así que el dibujo exportado coincide con el editor. El par se recalcula al soltar un nodo, no mientras se arrastra.
- Renombrar en la caja: doble clic sobre un componente, figura o grupo, o Enter o F2 con el nodo seleccionado, sustituye su nombre por un campo de texto con el nombre seleccionado (`NameEditor`). Enter o salir del campo guarda, Escape lo descarta y un nombre vacío se ignora; guardar es un paso del historial. Las teclas escritas ahí no llegan al lienzo (Supr borra texto, no el nodo). Enter sobre un nodo enfocado que aún no está seleccionado solo lo selecciona, como antes; el doble clic ya no hace zoom en el lienzo (`zoomOnDoubleClick` desactivado).
- Cambio de tamaño: cualquier nodo seleccionado (componente, figura o grupo) muestra tiradores en las esquinas y se puede estirar también desde los bordes (`ResizeHandles`, sobre `NodeResizer`). Los tiradores miden 9 px, 12 px en pantallas táctiles, con un área invisible de unos 28 px (36 px con el dedo); los bordes son franjas invisibles de 12 px. Mínimos (`MIN_SIZES`): 132 × 52 un componente, 40 × 40 una figura y 120 × 72 un grupo; el círculo mantiene la proporción. El tamaño en curso vive en el lienzo, como el arrastre, y llega al store al soltar como un solo paso. `fitResize` decide la caja: redondea cada borde por separado, de modo que los bordes que no se mueven se quedan donde estaban, la mantiene dentro del relleno de su grupo y, si es un grupo, nunca más pequeña que lo que contiene; si se mueve su borde superior o izquierdo, su contenido se desplaza al revés para quedarse en el mismo sitio del lienzo, también durante el gesto. Al soltar, `resizeNode` aplica lo mismo y hace crecer los grupos que lo rodean.
- Los callbacks de los tiradores conservan su identidad: React Flow vuelve a enlazar el gesto cuando cambian, y con el dedo un gesto enlazado de nuevo a mitad del cambio de tamaño no terminaba nunca y el tamaño no se guardaba.
- Arista: curva de Bézier entre los conectores, trazada al aparecer (las asíncronas, discontinuas, aparecen con un fundido porque el trazado también usa `stroke-dasharray`), con una partícula en bucle y una punta de flecha propia. La punta no es un `marker` de SVG: un marcador escala con el grosor del trazo, no puede fundir su color y se ve antes de que la línea termine de trazarse. `arrowhead` (`geometry.ts`) calcula un triángulo de 9 × 9 px con la punta en el borde del destino, y la curva termina en el centro de su base; la punta aparece cuando llega la línea y cambia de color con ella. Cuando termina de trazarse, la línea pasa a ser un `path` normal: el trazado usa un guion normalizado (`pathLength`) que Chromium no reescala cuando la curva cambia de longitud, y la línea se quedaba corta al mover un nodo.
- Conectores: miden 0 × 0 y están fuera del elemento que se anima al entrar. Dentro, React Flow los medía a mitad de la animación de escala y las aristas acababan unos 10 px dentro de la tarjeta, con la flecha tapada. El punto visible (12 px, con un área de agarre de 28 px) es un pseudoelemento que aparece al pasar el ratón, al enfocar, al seleccionar o mientras se conecta.
- Animación del flujo: el botón con el icono de actividad, bajo los de zoom, quita o devuelve las partículas de las conexiones (`aria-pressed`). La preferencia es de la vista, no del diagrama: vive en `preferences.ts` y se guarda en `localStorage` (`archdraft:flow-animation`). Con movimiento reducido en el sistema no hay partículas.
- La cuadrícula de puntos es el `Background` de React Flow, así que se desplaza y escala con el diagrama.

### Resaltado

Al pasar el ratón por un componente, este crece un 4 % y se perfila con su color, sus conexiones se vuelven del color de acento con su etiqueta y el resto se atenúa. Un componente seleccionado (al tocarlo en una pantalla táctil, por ejemplo) resalta también sus conexiones, pero no atenúa el resto, que sigue siendo editable. El tipo de puntero se recuerda en cada `pointerdown`, porque React Flow notifica el hover con eventos de ratón también en pantallas táctiles. Este estado, la selección y el grupo de destino de un arrastre viven en un contexto (`CanvasContext`) para no recalcular los nodos. Las etiquetas se pintan en la capa de etiquetas de React Flow, que se sube por encima de los nodos porque los grupos opacos las taparían.

### Figuras sin nombre, texto, orden y selección múltiple

- Las figuras (caja, círculo, rombo, nota) nacen sin nombre y pueden quedarse así: solo ellas y el texto admiten un nombre vacío (`EMPTY_LABEL` en core). El inspector no lo exige y se presentan por su tipo.
- El tipo Texto (`text`, una figura sin contorno) se coloca con un clic o dibujando su caja, y se escribe ahí mismo; si se deja vacío al terminar, se elimina. Seleccionado o al dibujarse, muestra un marco discontinuo.
- Un Texto colocado o soltado sobre una caja (componente o figura) queda fijo en ella (`attachedTo`, solo para texto): vive en el mismo grupo que la caja, se mueve, se copia y se borra con ella, no se arrastra solo (arrastrarlo desplaza el lienzo, como un grupo) y en el orden de apilado va siempre justo encima de su caja. El inspector del texto dice a qué caja está fijo y «Soltar» lo libera; soltarlo de nuevo sobre una caja lo vuelve a fijar. Un texto en el aire no se fija a nada. `INVALID_ATTACHMENT` en core rechaza fijar algo que no sea texto o fijarlo a un grupo, a otro texto o a un nodo que no existe.
- El orden de apilado es el de `graph.nodes` entre los nodos de un mismo grupo (`stackingOrder` en geometry.ts, que el lienzo y la exportación a SVG comparten; un grupo siempre va antes que sus hijos y arrastra su contenido). El inspector de cualquier nodo tiene cuatro botones: al frente, subir, bajar y al fondo (`stackNode`, `canStack`). En el SVG exportado los grupos siguen dibujándose bajo las conexiones, así que una figura enviada detrás de un grupo se ve ahí aunque el editor la oculte.
- Ctrl, Cmd o Mayús con un clic en un nodo lo suma o lo quita de la selección (`group` en el store). Con dos o más, un panel dice cuántos hay y ofrece borrar; arrastrar uno mueve todos (excepto los grupos) con un solo paso del historial (`moveNodes`) y Suprimir los borra con su contenido (`removeNodes`). Un clic sin teclas, Escape o un clic en el lienzo la terminan.
- En la tarjeta del diagrama, el título se edita al pulsarlo (da nombre a los ficheros que se exportan) y la nube se elige con un desplegable (`updateDiagram`); las dos cosas son un paso del historial.

### Diagrama en blanco

El botón + de la cabecera (`openBlank`, en `editor/open-document.ts`) abre un diagrama vacío titulado «Diagrama sin título» en el idioma de la interfaz, con la dirección que corresponde a la pantalla. Es un paso del historial: deshacer devuelve el diagrama anterior. Descarta una plantilla que aún se esté disponiendo, para que no sustituya al diagrama en blanco al terminar.

### Cambio de plantilla

La plantilla elegida en el menú de la cabecera (`TemplatesMenu`: botón «Plantillas» con un menú `role="menu"` de seis `menuitemradio`, flechas, Inicio y Fin, Escape devuelve el foco al botón) se marca en cuanto se pulsa (`opening` en el store). El diagrama anterior se mantiene hasta que la nueva disposición está lista; entonces sale con un fundido y el nuevo lienzo se monta y se construye (`AnimatePresence` en modo `wait`, con la clave del documento). Si se eligen varias plantillas seguidas, solo se abre la última. Si la disposición falla, un aviso lo dice y el error va a la consola. Abrir una plantilla es un paso del historial: deshacer devuelve el diagrama anterior, con lo editado.

### Revisión de diseño de T08

Capturas de las seis plantillas en claro y oscuro a 1440 × 900, del resaltado y de móvil a 390 × 844 (vista inicial y toque), revisadas con la skill `design-critique`:

- El diagrama domina la jerarquía; tarjeta, barra de descripción y controles quedan en segundo plano. Sin solapes en ninguna plantilla.
- Corregido: los botones de zoom medían 32 px en móvil; ahora 40 px.
- Corregido: las etiquetas de aristas dentro de grupos quedaban tapadas por el grupo opaco.
- Pendiente (T30): algunas aristas pasan por detrás de otro nodo, porque la curva no esquiva obstáculos; usar las rutas que calcula ELK lo resolvería.

En Chromium se comprobaron la rueda, Ctrl más rueda (como envía el navegador el pellizco del trackpad), los botones, el ajuste y el arrastre. El pellizco con dos dedos lo implementa d3-zoom dentro de React Flow y no se automatizó.

## Edición

Estado en un store de Zustand (`editor/store.ts`, ADR 0017). Cada edición es una función pura del documento (`editor/operations.ts`); el store valida el resultado con el esquema y `validateGraph` antes de registrarlo, de modo que el diagrama es válido en todo momento. Las ediciones que no cambian nada no se registran.

### Acciones

| Acción             | Cómo                                                                                                                                       | Qué hace                                                                                                                                                                                                            |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Añadir             | Pulsar un mosaico de la paleta, o arrastrarlo al diagrama: con el ratón en cuanto se mueve, con el dedo tras mantenerlo pulsado un momento | El nodo aparece centrado en el centro de la vista libre o donde se suelta, en el hueco libre más cercano, dentro del grupo más interior que lo admita, y queda seleccionado                                         |
| Seleccionar        | Clic o toque en un nodo o una arista; Enter o Espacio sobre el elemento enfocado con Tab                                                   | Abre el inspector. Clic en el fondo o Escape lo cierran                                                                                                                                                             |
| Mover              | Arrastrar un componente o una figura, o un grupo ya seleccionado                                                                           | Al soltar, si el centro cae en otro grupo que lo admite, pasa a ese grupo; fuera de todos, al nivel superior. El grupo de destino se ilumina mientras tanto. Mover no selecciona: el inspector no se abre ni cambia |
| Cambiar el tamaño  | Seleccionar el nodo y arrastrar una esquina o un borde                                                                                     | Ver Nodos y aristas                                                                                                                                                                                                 |
| Conectar           | Arrastrar desde el punto del lado de salida de un componente hasta otro componente; o «Connect» en el inspector y tocar el otro            | Crea la arista y la selecciona para elegir su protocolo. Se puede soltar en cualquier parte del componente, no solo en su punto de entrada                                                                          |
| Editar propiedades | Inspector                                                                                                                                  | Ver Inspector                                                                                                                                                                                                       |
| Duplicar           | «Duplicate» o Ctrl/⌘ + D                                                                                                                   | Copia el nodo junto al original, con todo lo que contiene y las aristas entre esos nodos, y selecciona la copia                                                                                                     |
| Borrar             | «Delete», Supr o Retroceso                                                                                                                 | Borra lo seleccionado; un grupo, con todo lo que contiene y sus aristas                                                                                                                                             |
| Deshacer y rehacer | Botones de la cabecera; Ctrl/⌘ + Z, Ctrl/⌘ + Mayús + Z o Ctrl + Y                                                                          | Hasta 100 pasos. Al deshacer se mantiene la selección si el elemento sigue existiendo                                                                                                                               |

Los atajos (`editor/shortcuts.ts`) no actúan mientras se escribe en un campo ni con la hoja de la paleta abierta.

### Arrastrar desde la paleta

`palette/palette-drag.ts` sigue la pulsación de un mosaico con eventos de puntero, el mismo código para ratón, lápiz y dedo (sustituye al arrastrar y soltar de HTML, que no existe en pantallas táctiles):

- Con ratón o lápiz, la pulsación es un arrastre en cuanto se mueve más de 5 px; con el dedo, cuando se mantiene 280 ms sin moverse más de 10 px, para que deslizar siga desplazando la paleta. Al cogerlo, el móvil vibra brevemente si lo admite.
- Mientras se arrastra, `PaletteDragGhost` dibuja el nodo bajo el puntero al tamaño que tendrá con el zoom actual; sobre un panel, donde soltar no añade nada, se atenúa. El grupo en el que caería se ilumina como al mover un nodo.
- En móvil, la hoja se aparta hacia abajo sin desmontarse, para que el dedo no pierda el gesto, y el resto de la página deja de estar inerte. Al soltar sobre el diagrama se añade el nodo y la hoja se cierra; al soltar en otro sitio, la hoja vuelve.
- Escape, o soltar fuera del diagrama, cancela. El clic que sigue a un arrastre no añade un segundo nodo en el centro.
- Los oyentes están en `window`, así que el arrastre sobrevive a que el mosaico se mueva o se oculte; mientras dura, el arrastre del dedo no desplaza la página.

### Colocar pegado al puntero y dibujar figuras

En el panel de escritorio, un clic de ratón o lápiz en un mosaico (`carryTile`) lo deja pegado al puntero hasta colocarlo; en la hoja de móvil, un toque, y con el teclado (Enter o Espacio sobre el mosaico), el nodo se añade en el centro, porque no hay puntero que lo lleve:

- Un clic en el diagrama lo coloca ahí; el grupo bajo el puntero lo recibe, como al arrastrar. La pulsación que coloca no se transmite, así que no mueve el lienzo ni selecciona lo que hay debajo (el clic que la sigue también se descarta).
- Una caja arriba, «Suelta aquí para descartar» (`PaletteDiscard`), descarta lo que se lleva: se pulsa, o se suelta sobre ella un mosaico arrastrado. Escape y el botón derecho también lo descartan. Una pulsación sobre un panel no hace nada y deja el mosaico pegado, para poder elegir otro. Un aviso `role="status"` lo anuncia a los lectores de pantalla.
- Las figuras (caja, círculo, rombo y nota) se dibujan como en Excalidraw: con una figura elegida el cursor es una cruz (`data-drawing` en `html`), se pulsa en el diagrama, se arrastra y al soltar nace una figura de exactamente ese tamaño y posición (`addNode` con `size` y `exact`; `drawnSize` redondea y no baja del mínimo de la figura). Mientras se arrastra se ve la propia figura (`ShapeBody`, el mismo cuerpo que dibuja el nodo), así que al soltar no cambia nada. `drawnBox` aplica las teclas: un círculo sigue siendo un círculo, Mayús iguala los lados y Alt dibuja desde el centro. Se termina donde se suelte el botón, aunque sea sobre un panel, salvo sobre la caja de descarte; Escape cancela. Una pulsación que se mueve menos de 6 px coloca la figura con su tamaño habitual.
- Lo que se coloca a mano queda exactamente donde se puso (`exact`): no se desplaza para esquivar a sus vecinos, no entra con la animación de aparición, la vista no se mueve para revelarlo (`placed` en el store, hasta que se selecciona otra cosa) y solo entra en un grupo si cabe entero dentro; una figura que sobresale queda en el diagrama, donde se dibujó. Las altas por teclado y por el botón del centro siguen buscando hueco libre.
- Arrastrar un mosaico desde el panel, como antes, lo coloca al soltarlo con el tamaño habitual; soltarlo sobre la caja de descarte lo descarta.

### Fluidez

Medido en Chromium sin GPU con la CPU 4 veces más lenta, arrastrando un componente 40 pasos en la plantilla de microservicios. Antes, cada paso costaba unos 40 ms de JavaScript y la mediana de los fotogramas era de 33 ms; después, unos 17 ms y 16,7 ms (60 fps), con el percentil 90 de 50 a 16,7 ms. Tres cambios:

- El contexto del lienzo solo cambia al empezar y al terminar un arrastre o un cambio de tamaño (antes cambiaba en cada paso y volvía a pintar todos los nodos y aristas).
- Los manejadores que recibe React Flow conservan su identidad (`useStableHandler`): React Flow copia cada prop de manejador en su store cuando cambia, y cada cambio de su store ejecuta los selectores de todos los nodos y aristas.
- Mover un nodo ya no lo selecciona, así que el inspector no se monta ni la vista se desliza en mitad del gesto. `ZoomControls` está memoizado.

La paleta empieza por las figuras genéricas (caja, círculo, rombo y nota), para dibujar flujos sencillos sin elegir un servicio. En el inspector, una figura solo tiene nombre y descripción: ni producto, ni proveedor, ni hechos operativos. Se puede conectar como un componente.

Reglas al colocar: los hijos quedan dentro del relleno de su grupo (`CONTAINER_PADDING`, 48 px arriba para el título y 24 px a los lados) y los grupos crecen hacia la derecha y hacia abajo para contenerlos; un grupo nunca entra en sí mismo ni en sus hijos; un nodo que cambia de grupo pasa al final de la lista para dibujarse encima de sus nuevos vecinos. Los ids nuevos salen del tipo o de los extremos de la arista (`cache`, `api-db`), numerados si ya existen y dentro de 64 caracteres; los nombres repetidos se numeran (`Cache 2`).

### Rechazos

Una edición que dejaría el grafo inválido no se aplica, y `EditorNotice` explica por qué con una frase:

| Situación                            | Mensaje                                                                      |
| ------------------------------------ | ---------------------------------------------------------------------------- |
| Conectar con un grupo                | Groups cannot be connected. Connect the components inside them.              |
| Conectar un componente consigo mismo | A component cannot connect to itself.                                        |
| Repetir una conexión                 | These components are already connected.                                      |
| Dejar un grupo donde no puede ir     | Por ejemplo: A subnet goes inside a virtual network or an availability zone. |
| Pasar de 200 nodos o 400 aristas     | A diagram can have up to 200 components and groups.                          |
| Cualquier otro error de validación   | That change would make the diagram invalid: y el mensaje de core             |

Al rechazar un movimiento, el nodo vuelve a su sitio: la posición durante el arrastre vive en el lienzo y el documento no cambia.

### Inspector

Panel flotante que aparece al seleccionar algo: en escritorio bajo la tarjeta del diagrama, en la columna derecha; en móvil abajo, en lugar de la barra de descripción. Si el nodo seleccionado queda detrás del inspector o de otra capa, la vista se desliza para mostrarlo (salvo al empezar a arrastrarlo).

En móvil el inspector se abre plegado, como una tira fina con el icono, el nombre y el tipo de lo seleccionado (en una conexión, su origen y su destino) y sus acciones como botones de icono, con nombre accesible: Connect, Duplicate y Delete en un componente. Así se ve casi todo el diagrama mientras se elige. Arrastrar hacia arriba el asa de la tira, o tocarla, lo despliega con todos los campos, hasta el 52 % de la altura; arrastrarla hacia abajo, o tocarla otra vez, lo pliega. El asa es un botón con `aria-expanded`, así que también se usa con el teclado. El panel sigue un poco al dedo, cambia de tamaño con un muelle y su contenido se funde al cambiar.

Cada selección nueva se abre plegada: el store guarda para qué selección se desplegó (`expandedSelection`) y `isInspectorExpanded` solo es cierto mientras siga siendo esa. Plegado, la tira ocupa menos que el hueco que la vista ya reserva abajo, así que tocar un nodo no mueve el diagrama; al desplegarlo, si el nodo queda debajo, la vista se desliza para mostrarlo encima del panel. En escritorio el inspector se muestra siempre entero.

| Seleccionado | Campos                                                                                                                                                                                          | Acciones                   |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| Componente   | Nombre, producto (vacío usa el del catálogo para el proveedor, que se muestra como sugerencia), proveedor («Diagram default» o uno concreto), descripción, instancias y cinco hechos operativos | Connect, Duplicate, Delete |
| Grupo        | Nombre y descripción                                                                                                                                                                            | Duplicate, Delete          |
| Conexión     | Origen y destino, etiqueta, protocolo y modo (Auto, Sync o Async, con una línea que dice si el origen espera respuesta)                                                                         | Delete                     |

Los hechos operativos (varias zonas, autoescalado, acceso público, cifrado en reposo, servicio gestionado) tienen tres valores, «Not set», «Yes» y «No», porque en el modelo desconocido no es falso. Son botones de radio nativos, así que las flechas pasan de una opción a otra.

Los campos de texto guardan un borrador y lo confirman al salir del campo o con Enter, como un único paso del historial; Escape lo descarta. El nombre es obligatorio: vacío, el campo lo indica con `aria-invalid` y un mensaje enlazado, y al salir vuelve al valor anterior. Las instancias aceptan enteros de 1 a 1000. Las listas y los botones de radio se aplican al momento. En móvil, al pulsar «Connect» el inspector se aparta para poder tocar el destino.

### Revisión de diseño de T09

Capturas a 1440 × 900 en claro y oscuro (selección, arrastre a un grupo, arista seleccionada, rechazo) y en un móvil táctil de 390 × 844 (toque, conexión desde el inspector, paleta, añadir), revisadas con la skill `design-critique`. Se corrigió:

- Los nodos añadidos en el centro caían encima de otros: ahora buscan el hueco libre más cercano.
- El nodo arrastrado quedaba oculto bajo los grupos opacos: ahora se dibuja encima mientras se arrastra.
- El inspector tapaba el nodo seleccionado en la parte derecha o inferior: ahora la vista lo desliza a la zona libre.
- Las acciones del inspector no cabían en una fila; la tarjeta del diagrama se encogía al abrirse el inspector; el texto de la conexión pendiente se partía en móvil; el título de una arista repetía origen y destino.
- En móvil, el inspector tapaba el destino de una conexión pendiente: ahora se aparta.

Pendiente: las aristas siguen saliendo por el lado fijo de la dirección de la disposición, así que una conexión hacia atrás da un rodeo (T30).

## Revisión de diseño

El panel de revisión (T10) muestra los hallazgos del motor de reglas ([lint.md](lint.md)) mientras se edita. Se abre y se cierra con el estado de la revisión de la tarjeta del diagrama, y se cierra también con su botón, con Escape o al elegir un elemento en el lienzo, porque eso indica que se quiere editar. Ocupa el mismo lugar que el inspector: en la columna derecha en escritorio y abajo en móvil, en lugar de la barra de descripción.

### Cálculo

`findingsOf(graph, disabledRules)` ejecuta `lintGraph` y guarda el resultado en un `WeakMap` por grafo. Como el store nunca modifica un grafo, cada objeto grafo es una versión del documento: las reglas se ejecutan una vez por versión y por conjunto de reglas desactivadas, aunque lo pidan la tarjeta, el panel y el lienzo a la vez (`useFindings`). Deshacer devuelve un grafo ya revisado, que sigue en caché mientras el historial lo conserve.

### Contenido

- Cabecera con el número de hallazgos y tres filtros por severidad (Errors, Warnings, Notes) con su recuento, botones con `aria-pressed`.
- Hallazgos agrupados por severidad, de más a menos grave, con el mensaje y la sugerencia de la regla.
- Elegir un hallazgo selecciona su primer componente, lo marca como actual (`aria-current`) y desliza la vista para centrar todos sus componentes en la zona libre, alejando el zoom si no caben. En el lienzo, sus componentes se rodean del color de la severidad, sus aristas se resaltan y el resto se atenúa. El panel sigue abierto.
- «Why it matters» despliega el título y la explicación de la regla; «Edit» selecciona el componente y deja paso al inspector; «Turn off rule» desactiva la regla.
- Las reglas desactivadas se guardan en `localStorage` (`archdraft:disabled-rules`, con los ids en el orden de `LINT_RULE_IDS`; los desconocidos se ignoran) y aparecen al final del panel en «Rules turned off», donde se pueden volver a activar. No cuentan en la tarjeta.
- Mientras el panel está abierto, cada componente con hallazgos muestra un punto del color del más grave en su esquina superior izquierda.

Colores de severidad: error con `--danger`, aviso con `--warning` y nota con `--accent`. El estado de la tarjeta usa el del hallazgo más grave, o `--success` si no hay ninguno.

### Revisión de diseño de T10

Capturas a 1440 × 900 en claro y oscuro y en un móvil táctil de 390 × 844, con hallazgos de las tres severidades, el panel abierto, un hallazgo elegido y su explicación desplegada, revisadas con la skill `design-critique`. Se corrigió que los filtros no cabían en una fila del panel lateral. Queda como limitación que «Edit» selecciona el primer componente del hallazgo, que en `unprotected-entry` es el cliente y no el componente expuesto.

## Guardar y compartir

Todo se apoya en el documento con disposición de `@archdraft/core` (`documentToJson` e `importDocument`, ver [exportacion.md](exportacion.md#documento-con-disposición)) y en ADR 0019.

### Al abrir el editor

1. Si la dirección trae `#d=…`, se abre ese diagrama y el fragmento se quita de la dirección (`history.replaceState`), para que recargar abra el trabajo guardado y no vuelva al enlace.
2. Si no, o si el enlace no se puede abrir, se abre el diagrama guardado en este navegador.
3. Si no hay ninguno, o está dañado, la plantilla por defecto.

Cada fallo se explica con un aviso y se pasa al siguiente paso; el editor nunca se queda vacío ni se rompe. Un enlace pegado en la barra de direcciones con el editor abierto también se abre (`hashchange`). Abrir cualquier diagrama es un paso del historial: deshacer devuelve el anterior.

`openDocumentText` (`editor/open-document.ts`) es el único camino para ficheros, enlaces y lo guardado: valida con `importDocument`; si faltan posiciones, coloca con ELK solo los nodos que faltan, conservando las demás (`layoutDiagram` con `pinned`), y deduce la dirección del flujo de las aristas ya colocadas (`inferDirection`: de arriba abajo si avanzan más en vertical que en horizontal), que orienta los conectores. Como las plantillas, se abre entero y, si llegan varias aperturas seguidas, solo cuenta la última.

### Autoguardado

`startAutosave` guarda el documento abierto en `localStorage` (`archdraft:document:v1`, JSON compacto) 400 ms después del último cambio, y al momento cuando la página se oculta o se cierra. Si el navegador no deja guardar (bloqueado o sin espacio), un aviso lo dice una vez y propone descargar el fichero. El historial no se guarda.

### Enlaces

El menú Share de la cabecera crea un enlace con el documento comprimido (`deflate-raw` con `CompressionStream`) en base64 apto para URL tras `#d=`. Las plantillas dan enlaces de 1100 a 1600 caracteres. A partir de 4000 caracteres el menú avisa de que algunas aplicaciones cortan los enlaces largos y propone el fichero; el umbral es una estimación. El enlace se rehace si el diagrama cambia con el menú abierto. «Copy link» usa el portapapeles; si el navegador no lo permite, selecciona el enlace y pide copiarlo a mano.

Al abrir un enlace, que puede estar manipulado, `decodeDocument` rechaza caracteres fuera de base64, textos de más de 500 000 caracteres y datos que no se descomprimen, y corta la descompresión al pasar de 2 MB. Después, el texto pasa por `importDocument` como cualquier fichero.

### Ficheros

«Download JSON» descarga el documento con el título como nombre (`three-tier-web-application.archdraft.json`). «Abrir o importar un fichero» (`openFileText`) distingue por el contenido un documento o grafo suelto de Archdraft (JSON, por ejemplo uno escrito a mano o exportado con `toJson`), un flowchart de Mermaid (`.mmd`, `.mermaid`, `.md`, `.txt`) y un fichero de draw.io (`.drawio`, `.xml`); ver «Importar de otras herramientas» en core.md. Lo que no tiene disposición, como Mermaid, se coloca con ELK; el título sale del fichero o, si no lo trae, de su nombre. Si se omitió algo, un aviso lo cuenta («Importado. 2 connectors…»).

### Exportar

La sección Export del mismo menú (T12) ofrece:

| Botón        | Resultado                                                                                                   |
| ------------ | ----------------------------------------------------------------------------------------------------------- |
| Copy Mermaid | `toMermaid` en el portapapeles, en la dirección en que está dibujado el diagrama, para pegarlo en un README |
| Mermaid      | El mismo texto como `<título>.mmd`                                                                          |
| draw.io      | `toDrawio` con la disposición del editor, como `<título>.drawio`, para seguir editando en draw.io           |
| SVG          | Una imagen vectorial del diagrama, como `<título>.svg`                                                      |
| PNG          | La misma imagen rasterizada al doble de tamaño, como `<título>.png`; nunca más de 8192 px por lado          |

Las imágenes no son una captura de la pantalla: `diagramToSvg` (`export/diagram-svg.ts`) dibuja el documento como lo dibuja el lienzo en reposo, sin selección, resaltado ni partículas, y entero aunque la vista muestre solo una parte. Es una función pura; recibe los colores del tema en uso (`readPalette` lee los tokens de la página), los nombres en el idioma de la interfaz, los iconos de Lucide del lienzo (`iconMarkup` los pinta una vez en un elemento suelto) y una función que mide el texto con la fuente del editor (`OffscreenCanvas`). Así los nombres se parten en dos líneas y se recortan como en el lienzo. Orden: grupos, conexiones con sus puntas de flecha, componentes y figuras, y las etiquetas de las conexiones encima; una etiqueta que taparía un nodo (una curva que pasa por detrás de él, ver T30) se omite. El SVG lleva la fuente solo por nombre, para que pese poco y se pueda editar; el PNG se dibuja desde un SVG que la lleva dentro (`@font-face` con el fichero en base64), porque una imagen SVG no puede cargar fuentes de fuera. Si el PNG falla, el menú lo dice y propone el SVG.

Los nombres de fichero salen del título (`fileNameFor(title, format)` en `export/files.ts`), sin tildes y con guiones.

## Idioma

La interfaz está en inglés y en español (ADR 0020). `i18n/en.ts` y `i18n/es.ts` tienen las mismas claves; el tipo `Strings` se deduce del inglés, así que el compilador avisa si al español le falta o le sobra algo. El idioma vive en un store de Zustand (`i18n/locale.ts`): los componentes leen los textos con `useStrings()` y se vuelven a pintar al cambiar, y el código fuera de React usa `currentStrings()` al escribir un mensaje.

- Idioma inicial: el elegido antes (`archdraft:locale` en `localStorage`), si no español cuando el primer idioma del navegador empieza por `es`, y si no inglés. `document.documentElement.lang` lo sigue.
- `LanguageToggle`, en la cabecera entre compartir y el tema: un botón con el código del idioma en que está la interfaz, EN o ES. Al pulsarlo el código sube y entra el otro en 220 ms. Su nombre accesible empieza por el código visible («EN, switch to Spanish», «ES, cambiar a inglés») y el `title` dice qué hace.
- Nombres y descripciones de los tipos, producto genérico, reglas y hallazgos: el inglés reutiliza los textos de `@archdraft/core`; el español redacta cada hallazgo a partir de la regla, la gravedad, los nodos y aristas implicados y los atributos del primer nodo.
- Plantillas: se abren en el idioma de la interfaz (`localizedTemplate`, que devuelve siempre el mismo objeto para la misma plantilla e idioma). Si se cambia de idioma con una plantilla sin editar, se sustituye por la del idioma nuevo con la misma disposición y sin paso en el historial (`followLanguage` y `replaceGraph`); mover nodos no cuenta como editar. Un diagrama editado, abierto de un fichero o de un enlace no se traduce.
- Los componentes nuevos se llaman como su tipo en el idioma de la interfaz («Caché», «Caché 2»).
- El buscador de la paleta ignora mayúsculas y tildes y encuentra también por el nombre en inglés: «cache» encuentra «Caché» y «relational» encuentra «Base de datos relacional».
- Los nombres de las plantillas en la barra se acortaron en español («Tres capas», «Analítica») para que quepan en el ancho de la barra en escritorio.
- Límites conocidos: los mensajes de validación que vienen de `core` o de Zod siguen en inglés, y un aviso que ya está en pantalla no cambia de idioma.

## Tema

`useTheme` parte del tema que ya aplicó el script de `index.html` (preferencia guardada o tema del sistema) y lo guarda en `localStorage` solo cuando el usuario lo cambia. Si el almacenamiento está bloqueado, el tema se aplica igualmente durante la visita y se registra un aviso en la consola. El script inline evita el destello del tema equivocado antes de que cargue React; si el almacenamiento está bloqueado, usa el tema del sistema. El tema se decide al cargar: un cambio del tema del sistema con la página abierta se aplica al recargar. El estado del tema vive en `Header`, de modo que un cambio solo vuelve a pintar el botón.

Al pulsarlo (ADR 0018), si el navegador tiene transiciones de vista, `toggle` llama a `document.startViewTransition`: el navegador captura la página, se cambian `data-theme` y el icono, y la captura se funde con la página nueva en el compositor durante 450 ms con `cubic-bezier(0.4, 0, 0.2, 1)`. Es un único cambio de estilo, así que el fundido no depende del tamaño del diagrama. Si no las tiene, `toggle` añade la clase `theme-fade` a la raíz, que da a todos los elementos una transición de color con la misma duración y curva (ADR 0016), y la quita 150 ms después del final para que ninguna transición tardía salte. La cuadrícula de puntos es el fondo de React Flow, un patrón SVG cuyo relleno también se funde.

Medido en Chromium sin GPU con la plantilla por defecto: con el fundido de colores el primer fotograma tardaba de 146 a 309 ms y el cambio daba de 6 a 8 fotogramas en 800 ms; con el fundido cruzado, de 4 a 12 ms y de 19 a 26 fotogramas. Con GPU no se ha medido.

## Accesibilidad

- `header` con el `h1`, `main` etiquetado para el lienzo y el diagrama como grupo con nombre (`role="group"`, «Diagram: <título>»).
- Los controles de zoom forman un grupo etiquetado, con botones que se deshabilitan en los límites; el zoom también funciona con gestos.
- Nodos y aristas reciben el foco con Tab, con un nombre accesible (nombre y producto, o nombre y tipo de grupo); Enter o Espacio los seleccionan. Todo lo que se hace arrastrando tiene otro camino: los mosaicos añaden con un clic, «Connect» conecta tocando el destino y el inspector edita y borra.
- Atajos anunciados con `aria-keyshortcuts`; deshacer y rehacer se deshabilitan cuando no hay pasos.
- Los rechazos se anuncian con `role="alert"`; los campos inválidos, con `aria-invalid` y `aria-describedby`.
- El estado de la revisión es un botón con `aria-expanded`; los cambios de la revisión se anuncian con una región `role="status"`. Los filtros usan `aria-pressed`, el hallazgo elegido `aria-current` y las explicaciones `aria-expanded`. Los puntos de severidad del lienzo son decorativos: la misma información está en el panel.
- Foco visible con contorno de 2 px; el buscador muestra un anillo al enfocarse.
- Botones de solo icono con `aria-label`; estado de la revisión anunciado con `role="status"`.
- Contrastes AA medidos (ver tokens); `prefers-reduced-motion` respetado.

## Tests

- `app.test.tsx`: hoja modal en pantallas estrechas (foco, `inert`, cierre con Escape, botón y fondo) y panel lateral en anchas (sin bloquear la página, cierre con Escape), cabecera solo con el nombre, sin enlaces ni logotipo, tarjeta del diagrama con cifras y revisión, diagrama dibujado con sus componentes en React Flow, resaltado y etiquetas de las conexiones al pasar el ratón, distintivo de proveedor, controles de zoom (acercar, alejar, porcentaje y ajustar), cambio de plantilla, campo con descripción accesible, ejemplos rotatorios y botón deshabilitado, paleta con todo el catálogo, búsqueda con y sin resultados, abrir y cerrar la paleta, tema. `MotionGlobalConfig.skipAnimations` lleva cada animación a su estado final y los tests esperan a que terminen las salidas.
- `editing.test.tsx`: en móvil, tocar un mosaico añade en el centro, selecciona, cierra la hoja y el inspector sustituye plegado a la barra de descripción y se despliega desde su asa; con el dedo, mantener un mosaico lo coge, aparta la hoja y lo añade donde se suelta, soltarlo fuera devuelve la hoja y deslizar no lo coge; en escritorio, clic para inspeccionar y renombrar, Enter sobre un nodo enfocado, Supr, Ctrl+Z y el botón de rehacer, Ctrl+D, arrastrar un mosaico con el ratón al lienzo (con su fantasma y sin un segundo nodo por el clic), cancelar sobre un panel o con Escape, renombrar en la caja (doble clic, Enter, F2, Escape, nombre vacío, teclas que no llegan al lienzo), mosaico pegado al puntero (colocar con un clic, descartar con Escape, la caja o el botón derecho, clic sobre un panel, teclado) y figuras dibujadas con su tamaño, rechazo explicado al conectar con un grupo y cierre con Escape.
- `persistence.test.ts`: ida y vuelta de un enlace sin pérdida (también con una plantilla), fragmentos que no son enlaces, enlaces dañados y demasiado grandes (incluida una bomba de descompresión), abrir un documento con su dirección, un grafo suelto y una disposición parcial, errores sin tocar el editor, dirección deducida, autoguardado con retardo y al parar, aviso único si no se puede guardar, clave versionada y nombres de fichero.
- `export.test.ts`: SVG bien formado, del tamaño del diagrama con su margen y con todo el texto escapado; orden de grupos, conexiones, nodos y etiquetas; conexiones asíncronas discontinuas con punta de flecha y etiqueta; producto, icono y distintivo de proveedor; nombres en español y fronteras discontinuas; etiqueta omitida si tapa un nodo; fuente incrustada solo si se pide; las seis plantillas; partir y recortar texto, escapar XML, mezclar colores, iconos y nombres de fichero por formato.
- `share.test.tsx`: arranque desde lo guardado, desde un enlace (que se quita de la dirección) y con un enlace manipulado (aviso y plantilla), guardado de las ediciones, enlace del menú que abre el mismo diagrama, copia al portapapeles, descarga, apertura de un fichero, copia de Mermaid en la dirección del dibujo, descarga de Mermaid, draw.io y SVG con su nombre y su contenido, aviso si la imagen no se puede crear y cierre con Escape.
- `review.test.tsx`: memoización por versión y por reglas desactivadas, severidad más grave y por componente, clave de un hallazgo, reglas desactivadas guardadas y leídas (con entradas desconocidas o rotas), apertura desde la tarjeta, grupos por severidad, filtros, elegir un hallazgo (selección y foco), paso al inspector, explicación, desactivar y activar reglas, revisión sin hallazgos, puntos en el lienzo y cierre con Escape.
- `inspector.test.tsx`: campos de componente, grupo y conexión; nombre confirmado al salir como un paso, nombre vacío rechazado y restaurado, Escape, producto y proveedor con vuelta a los valores por defecto, hechos operativos de tres valores, instancias en rango, modo inferido del protocolo, borrar e iniciar una conexión; en móvil, la tira plegada con nombre, tipo y acciones rápidas (y el origen y el destino de una conexión), desplegar y plegar desde el asa, cada selección nueva plegada, duplicar y borrar desde la tira, y en escritorio siempre entero.
- `i18n.test.tsx`: mismas claves en los dos diccionarios, tipos con nombre y descripción, frase de colocación con artículos, singular y plural, hallazgos en inglés idénticos a los de `core` y en español con los nombres de los componentes para un grafo que dispara todas las reglas, plantillas en español completas, válidas y sin hallazgos, producto por defecto, detección del idioma, ediciones en español, cambio de idioma (texto, `lang`, preferencia guardada, código EN o ES del botón, plantilla sin editar traducida sin paso en el historial y diagrama editado que no se traduce), plantillas abiertas en español, búsqueda sin tildes y por el nombre inglés, y lienzo sin el enlace de React Flow.
- `shapes.test.tsx`: tiradores de tamaño solo en el nodo seleccionado, sea componente o figura, figuras primero en la paleta, dibujadas con su nombre y contadas aparte en la tarjeta, inspector sin producto ni proveedor y con «Connect», botón de la animación del flujo (partículas, `aria-pressed`, `title` y preferencia guardada), flechas cuya base es el final de la línea y aristas que no se vuelven a montar al seleccionar o editar un nodo.
- `operations.test.ts`: ids y nombres numerados, reglas de contención, grupo bajo un punto, añadir (nivel superior, dentro de un grupo, hueco libre, crecimiento de grupos, límite de nodos), conectar (repetida, con un grupo), mover (dentro del grupo, sin cambios, fuera de todos, a otro grupo, relleno, nunca dentro de sí), cambiar el tamaño (bordes redondeados por separado, sin cambios, mínimos, relleno con los otros bordes en su sitio, grupo nunca menor que su contenido y contenido que no se mueve al mover el borde superior izquierdo), borrar con contenido, duplicar con contenido y aristas internas, y actualizaciones de campos.
- `store.test.ts`: historial (deshacer, rehacer, rama nueva, límite de 100, ediciones sin cambios), cambio de tamaño como un paso, rechazos con su mensaje, ids de mensaje, borrar y duplicar la selección, conexión pendiente, inspector desplegado solo para la selección con la que se desplegó y apertura de diagramas como paso del historial.
- `flow.test.ts`: padres antes que hijos, posiciones relativas, tamaños, profundidad, producto y distintivo de proveedor, conectores por dirección, orden de construcción, aristas asíncronas y categoría de origen, nombres accesibles, grupos fijos hasta seleccionarlos, tamaño medido en cada nodo, figuras genéricas, nodos sin disposición y diagrama vacío.
- `geometry.test.ts`: coordenadas absolutas con contenedores anidados, nodos sin disposición, profundidad de anidamiento, escala de dibujo con su mínimo y su máximo, límites vacíos, vista inicial que encaja o que empieza arriba y punta de flecha en los cuatro lados.
- `brand.test.ts`: el logo tiene sus tres colores y título, y la página enlaza el icono de la pestaña y el de iOS (un PNG de 180 × 180).
- `icons.test.ts`: cada icono de `KIND_ICONS` es el que nombra el catálogo de core. Detectó que Lucide renombró `waves` a `waves-horizontal`.

Revisión visual: build servido con `vite preview` y capturado con Playwright en Chromium a 1440 × 900 en claro y oscuro, con la paleta abierta y cerrada, con un nodo resaltado y con varias plantillas, y a 390 × 844; además, un vídeo de 15 s del recorrido para revisar el movimiento. Sin errores en la consola. La skill `design-critique` (`.claude/skills`) guía la revisión de las capturas.

## Despliegue

`.github/workflows/deploy-web.yml` se dispara cuando el workflow CI termina con éxito tras un push a `main` (`workflow_run`), o a mano desde la pestaña Actions:

1. Consulta la API de Pages. Si Pages no está activado, termina con un aviso y no despliega; si está activado con un origen distinto de GitHub Actions, falla con un error que lo explica.
2. Hace checkout del commit que pasó CI, instala, ejecuta `pnpm --filter web build` y sube `apps/web/dist` con `actions/upload-pages-artifact`.
3. El job `deploy` publica con `actions/deploy-pages` en el entorno `github-pages`.

Solo se despliega lo que ha pasado CI.
