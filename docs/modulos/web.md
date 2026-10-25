# Módulo: apps/web

Editor visual de Archdraft. Es una aplicación de una sola página con Vite, React 19, TypeScript y Tailwind CSS 4, publicada en GitHub Pages en `https://cosmemorillojulia.github.io/archdraft/`. Depende de `@archdraft/core` y `@archdraft/layout`, nunca al revés (ver [arquitectura](../arquitectura.md)).

Estado: estructura y despliegue (T07), lienzo con React Flow y zoom (T08), rediseño centrado en el lienzo (T25), cabecera fija con animaciones (T27), paleta en móvil (T28) y ajustes visuales (T29). La edición llega en T09 y el panel de revisión en T10.

## Estructura

```
apps/web/
  index.html              # aplica el tema guardado antes del primer pintado
  vite.config.ts          # base /archdraft/, plugins de React y Tailwind, configuración de Vitest
  public/favicon.svg
  src/
    main.tsx              # punto de entrada
    App.tsx               # proveedores, cabecera fija, lienzo, capas flotantes y añadir en el centro
    strings.ts            # todas las cadenas visibles (ADR 0009)
    theme.ts              # useTheme: tema claro u oscuro, guardado, con fundido de colores
    motion.ts             # tokens de movimiento: curva y muelles compartidos
    motion-features.ts    # funciones de Motion que se cargan aparte
    media.ts              # useMediaQuery y el punto de corte WIDE_SCREEN
    icons.ts              # icono de Lucide de cada tipo de nodo
    styles.css            # tokens, tema oscuro, utilidad floating, estilos de React Flow
    components/           # Button, Header, HistoryControls, DiagramCard, ComponentsPanel, PromptDock,
                          # Inspector, fields (campos del inspector), EditorNotice
    editor/
      store.ts            # store de Zustand: documento, historial, selección, mensajes (ADR 0017)
      operations.ts       # ediciones puras del documento: añadir, conectar, mover, borrar, duplicar
      open-template.ts    # dispone una plantilla y la abre
      shortcuts.ts        # atajos de teclado
    canvas/
      DiagramCanvas.tsx   # lienzo React Flow: vista inicial, resaltado, arrastres, conexiones, minimapa
      flow.ts             # toFlow: adaptador puro del documento a nodos y aristas
      ComponentNode.tsx   # nodo de componente
      ContainerNode.tsx   # nodo de contenedor
      ArchitectureEdge.tsx# arista con trazado animado, partícula y etiqueta
      ZoomControls.tsx    # acercar, alejar y ajustar
      canvas-context.ts   # contexto del lienzo: foco, selección, grupo de destino; relatedTo
      palette-drop.ts     # tipo de datos de un mosaico arrastrado al lienzo
      geometry.ts         # cajas absolutas, profundidad, límites, escala y vista inicial
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
│ Archdraft  Describe a cloud architecture…    Source code  ◐  │  cabecera fija
├──────────────────────────────────────────────────────────────┤
│ [Show components]              [Título del diagrama     AWS] │
│                                [10 components 8 connections] │
│                                [              ✓ No issues    ] │
│                  diagrama sobre cuadrícula de puntos         │
│                                                              │
│          [✦ ejemplo de descripción que va rotando     ↑]     │
│          ( plantilla activa ) plantilla  plantilla  …        │
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

La utilidad `floating` da a cada capa una superficie al 88 % de opacidad con desenfoque de fondo, un filete de un píxel y una sombra de dos niveles. Solo la llevan los elementos que flotan sobre el lienzo; dentro de un panel no hay tarjetas ni sombras. Radios por capa: 16 px en paneles (`rounded-panel`), 10 px en controles (`rounded-control`) y píldora en las plantillas.

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

| Momento                    | Qué ocurre                                                                                                                                                           |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cargar o cambiar diagrama  | El anterior se desvanece; el nuevo se construye de izquierda a derecha en unos 0,7 s: grupos, nodos con un muelle y aristas que se trazan                            |
| Flujo                      | Una partícula del color de la categoría de origen recorre cada arista en bucle, más despacio cuanto más larga es                                                     |
| Pasar el ratón por un nodo | El nodo crece un 4 % y se perfila con su color; sus conexiones se resaltan con su etiqueta y el resto se atenúa                                                      |
| Seleccionar                | El elemento se rodea del color de acento y sus conexiones se resaltan sin atenuar el resto; el inspector entra deslizándose desde la derecha, o desde abajo en móvil |
| Añadir                     | El nodo nuevo aparece con un muelle, sin esperar a la construcción del diagrama; las cifras de la tarjeta ruedan                                                     |
| Arrastrar                  | El nodo arrastrado pasa por encima de todo; el grupo en el que caería se ilumina                                                                                     |
| Rechazo                    | El aviso baja desde arriba y se va solo a los 4,5 s                                                                                                                  |
| Elegir plantilla           | El indicador de la plantilla activa se desliza hasta ella; la tarjeta del diagrama cambia el título y las cifras ruedan                                              |
| Paleta                     | Entra desde la izquierda con un muelle, los mosaicos aparecen en cascada y la rejilla se recoloca al filtrar; el lienzo ajusta su margen                             |
| Campo de descripción       | Ejemplos de descripción que se suceden cada 3,6 s mientras está vacío; al enfocarlo aparece un halo del color de acento                                              |
| Cambio de tema             | Toda la página funde sus colores al nuevo tema en 420 ms (ADR 0016); el icono gira y se funde                                                                        |

## Piezas de la interfaz

| Pieza             | Contenido                                                                                                                                                                                                                                                                          |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Header`          | Barra fija: nombre del producto en mayúsculas inclinadas, sin logotipo gráfico, descripción, deshacer y rehacer (`HistoryControls`), enlace al código y cambio de tema                                                                                                             |
| `DiagramCard`     | Tarjeta flotante: título, proveedor, descripción recortada a dos líneas, número de componentes y conexiones, y estado de la revisión de diseño (`lintGraph` memoizado por grafo, con `role="status"`)                                                                              |
| `ComponentsPanel` | Cerrada al empezar. Buscador por nombre, grupos por categoría y mosaicos con icono y nombre; la descripción del catálogo aparece al pasar el ratón. Cada mosaico es un botón «Add …» (ver Edición)                                                                                 |
| `PromptDock`      | Campo que crece con el texto (`field-sizing: content`) con ejemplos rotatorios decorativos (`aria-hidden`), botón de generar deshabilitado con el motivo enlazado por `aria-describedby`, y las seis plantillas con icono en una cápsula con indicador deslizante (`aria-pressed`) |
| `DiagramCanvas`   | Lienzo React Flow con el diagrama, zoom, minimapa, resaltado y edición directa (ver Lienzo y Edición)                                                                                                                                                                              |
| `Inspector`       | Panel flotante con las propiedades de lo seleccionado (ver Edición)                                                                                                                                                                                                                |
| `EditorNotice`    | Avisos arriba en el centro: por qué no se hizo una edición (`role="alert"`) y la conexión pendiente desde el inspector, con su botón para cancelar                                                                                                                                 |
| `Button`          | Variantes `primary`, `secondary`, `ghost` y `danger`; tamaños `default` e `icon`. Los tamaños son variantes con nombre porque dos utilidades de Tailwind sobre la misma propiedad no se anulan por su orden en `class`                                                             |

En pantallas estrechas la cabecera oculta la descripción, la tarjeta ocupa el ancho sin la descripción del diagrama y las plantillas se desplazan en horizontal.

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

- Un nodo `component` o `container` por nodo del grafo, con la posición relativa al contenedor padre (la convención de los subflujos de React Flow), el tamaño de la disposición y `parentId`. Los padres van antes que sus hijos, como exige React Flow.
- Los componentes llevan su categoría, el producto resuelto, las posiciones de sus conectores según la dirección (derecha e izquierda en `LR`, abajo y arriba en `TB`) y, si su proveedor no es el del diagrama, un distintivo (`External`, `AWS`, `GCP` o `Azure`).
- Los contenedores llevan su profundidad de anidamiento, para el tinte.
- Cada arista sabe si es asíncrona y la categoría de su origen, para el color de la partícula.
- Cada elemento lleva el retardo de su entrada: el diagrama se construye en el sentido del flujo en unos 0,7 s.
- Los nodos sin disposición se omiten, con sus descendientes y sus aristas.

### Disposición en un Web Worker

`openTemplate` llama a `layoutDiagram`, que envía el grafo a `layout.worker.ts`, donde se ejecuta `computeLayout` de `@archdraft/layout`: de izquierda a derecha si la plantilla se abre en una pantalla ancha y de arriba abajo en una estrecha. Esa dirección se guarda con el documento, porque orienta los conectores; girar el móvil no vuelve a disponer el diagrama, para no perder lo editado. El worker se crea la primera vez que hace falta, así que ELK (unos 440 KB comprimidos) no forma parte de la carga inicial y nunca bloquea la interfaz. Donde no hay workers (los tests en jsdom) se ejecuta en el hilo principal con `import()` dinámico.

La versión empaquetada de elkjs, al ejecutarse en un contexto con `self` y sin `document`, se comporta como su propio worker: escucha mensajes y deja de exportar el motor que usa `@archdraft/layout`. `elk-in-worker.ts`, importado antes que nada en el worker, declara un `document` vacío para que elkjs se cargue como librería.

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

El zoom va del 20 % al 200 % y los botones muestran el porcentaje actual. La vista inicial se calcula con `initialViewport`: encaja el diagrama en la parte del lienzo que no tapan las capas flotantes (`canvasInsets` en `App.tsx`), sin pasar del 120 % y sin bajar del 60 % en pantallas anchas ni del 90 % en las estrechas, para que las etiquetas se lean; si así no cabe, empieza arriba y centrado. Ajustar usa el mismo cálculo con el mínimo del 20 %, de modo que muestra el diagrama entero. Al abrir o cerrar la paleta en escritorio, la vista se desliza la mitad del ancho del panel para seguir centrada en el espacio libre.

Los botones de zoom están abajo a la izquierda; en pantallas estrechas suben por encima de la barra de descripción y miden 40 px para el dedo. A partir de 1280 px aparece un minimapa abajo a la derecha, con los nodos en el color de su categoría, que también sirve para desplazarse y hacer zoom. Se mantiene la atribución de React Flow.

### Nodos y aristas

- Componente: tarjeta con el icono sobre el color de su categoría, el nombre y el producto en una línea cada uno, recortados con puntos suspensivos y completos en el `title`; el distintivo de proveedor flota sobre el borde superior.
- Contenedor: rectángulo opaco teñido con el acento, más intenso cuanto más anidado, para que los puntos del fondo no se vean dentro; `boundary` con borde discontinuo; cabecera con icono y nombre.
- Arista: curva de Bézier entre los conectores, trazada al aparecer (las asíncronas, discontinuas, aparecen con un fundido porque el trazado también usa `stroke-dasharray`), con una partícula en bucle y una flecha. Las dos flechas, normal y resaltada, se definen una vez por lienzo.
- La cuadrícula de puntos es el `Background` de React Flow, así que se desplaza y escala con el diagrama.

### Resaltado

Al pasar el ratón por un componente, este crece un 4 % y se perfila con su color, sus conexiones se vuelven del color de acento con su etiqueta y el resto se atenúa. Un componente seleccionado (al tocarlo en una pantalla táctil, por ejemplo) resalta también sus conexiones, pero no atenúa el resto, que sigue siendo editable. El tipo de puntero se recuerda en cada `pointerdown`, porque React Flow notifica el hover con eventos de ratón también en pantallas táctiles. Este estado, la selección y el grupo de destino de un arrastre viven en un contexto (`CanvasContext`) para no recalcular los nodos. Las etiquetas se pintan en la capa de etiquetas de React Flow, que se sube por encima de los nodos porque los grupos opacos las taparían.

### Cambio de plantilla

El botón de la plantilla se marca en cuanto se pulsa (`opening` en el store). El diagrama anterior se mantiene hasta que la nueva disposición está lista; entonces sale con un fundido y el nuevo lienzo se monta y se construye (`AnimatePresence` en modo `wait`, con la clave del documento). Si se eligen varias plantillas seguidas, solo se abre la última. Si la disposición falla, un aviso lo dice y el error va a la consola. Abrir una plantilla es un paso del historial: deshacer devuelve el diagrama anterior, con lo editado.

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

| Acción             | Cómo                                                                                                                            | Qué hace                                                                                                                                                                    |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Añadir             | Pulsar un mosaico de la paleta, o arrastrarlo al diagrama en escritorio                                                         | El nodo aparece centrado en el centro de la vista libre o donde se suelta, en el hueco libre más cercano, dentro del grupo más interior que lo admita, y queda seleccionado |
| Seleccionar        | Clic o toque en un nodo o una arista; Enter o Espacio sobre el elemento enfocado con Tab                                        | Abre el inspector. Clic en el fondo o Escape lo cierran                                                                                                                     |
| Mover              | Arrastrar un componente, o un grupo ya seleccionado                                                                             | Al soltar, si el centro cae en otro grupo que lo admite, pasa a ese grupo; fuera de todos, al nivel superior. El grupo de destino se ilumina mientras tanto                 |
| Conectar           | Arrastrar desde el punto del lado de salida de un componente hasta otro componente; o «Connect» en el inspector y tocar el otro | Crea la arista y la selecciona para elegir su protocolo. Se puede soltar en cualquier parte del componente, no solo en su punto de entrada                                  |
| Editar propiedades | Inspector                                                                                                                       | Ver Inspector                                                                                                                                                               |
| Duplicar           | «Duplicate» o Ctrl/⌘ + D                                                                                                        | Copia el nodo junto al original, con todo lo que contiene y las aristas entre esos nodos, y selecciona la copia                                                             |
| Borrar             | «Delete», Supr o Retroceso                                                                                                      | Borra lo seleccionado; un grupo, con todo lo que contiene y sus aristas                                                                                                     |
| Deshacer y rehacer | Botones de la cabecera; Ctrl/⌘ + Z, Ctrl/⌘ + Mayús + Z o Ctrl + Y                                                               | Hasta 100 pasos. Al deshacer se mantiene la selección si el elemento sigue existiendo                                                                                       |

Los atajos (`editor/shortcuts.ts`) no actúan mientras se escribe en un campo ni con la hoja de la paleta abierta.

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

Panel flotante que aparece al seleccionar algo: en escritorio bajo la tarjeta del diagrama, en la columna derecha; en móvil abajo, hasta el 52 % de la altura, en lugar de la barra de descripción. Si el nodo seleccionado queda detrás del inspector o de otra capa, la vista se desliza para mostrarlo (salvo al empezar a arrastrarlo).

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

## Tema

`useTheme` parte del tema que ya aplicó el script de `index.html` (preferencia guardada o tema del sistema) y lo guarda en `localStorage` solo cuando el usuario lo cambia. Si el almacenamiento está bloqueado, el tema se aplica igualmente durante la visita y se registra un aviso en la consola. El script inline evita el destello del tema equivocado antes de que cargue React; si el almacenamiento está bloqueado, usa el tema del sistema. El tema se decide al cargar: un cambio del tema del sistema con la página abierta se aplica al recargar. El estado del tema vive en `Header`, de modo que un cambio solo vuelve a pintar el botón. Al pulsarlo, `toggle` añade la clase `theme-fade` a la raíz, cambia `data-theme` y la quita a los 420 ms: todos los colores de la página se funden a la vez (ADR 0016). La cuadrícula de puntos es el fondo de React Flow, un patrón SVG cuyo relleno también se funde.

## Accesibilidad

- `header` con el `h1`, `main` etiquetado para el lienzo y el diagrama como grupo con nombre (`role="group"`, «Diagram: <título>»).
- Los controles de zoom forman un grupo etiquetado, con botones que se deshabilitan en los límites; el zoom también funciona con gestos.
- Nodos y aristas reciben el foco con Tab, con un nombre accesible (nombre y producto, o nombre y tipo de grupo); Enter o Espacio los seleccionan. Todo lo que se hace arrastrando tiene otro camino: los mosaicos añaden con un clic, «Connect» conecta tocando el destino y el inspector edita y borra.
- Atajos anunciados con `aria-keyshortcuts`; deshacer y rehacer se deshabilitan cuando no hay pasos.
- Los rechazos se anuncian con `role="alert"`; los campos inválidos, con `aria-invalid` y `aria-describedby`.
- Foco visible con contorno de 2 px; el buscador muestra un anillo al enfocarse.
- Botones de solo icono con `aria-label`; estado de la revisión anunciado con `role="status"`.
- Contrastes AA medidos (ver tokens); `prefers-reduced-motion` respetado.

## Tests

- `app.test.tsx`: hoja modal en pantallas estrechas (foco, `inert`, cierre con Escape, botón y fondo) y panel lateral en anchas (sin bloquear la página, cierre con Escape), cabecera solo con el nombre, tarjeta del diagrama con cifras y revisión, diagrama dibujado con sus componentes en React Flow, resaltado y etiquetas de las conexiones al pasar el ratón, distintivo de proveedor, controles de zoom (acercar, alejar, porcentaje y ajustar), cambio de plantilla, campo con descripción accesible, ejemplos rotatorios y botón deshabilitado, paleta con todo el catálogo, búsqueda con y sin resultados, abrir y cerrar la paleta, tema. `MotionGlobalConfig.skipAnimations` lleva cada animación a su estado final y los tests esperan a que terminen las salidas.
- `editing.test.tsx`: en móvil, tocar un mosaico añade en el centro, selecciona, cierra la hoja y el inspector sustituye a la barra de descripción; en escritorio, clic para inspeccionar y renombrar, Enter sobre un nodo enfocado, Supr, Ctrl+Z y el botón de rehacer, Ctrl+D, soltar un mosaico en el lienzo, rechazo explicado al conectar con un grupo y cierre con Escape.
- `inspector.test.tsx`: campos de componente, grupo y conexión; nombre confirmado al salir como un paso, nombre vacío rechazado y restaurado, Escape, producto y proveedor con vuelta a los valores por defecto, hechos operativos de tres valores, instancias en rango, modo inferido del protocolo, borrar e iniciar una conexión.
- `operations.test.ts`: ids y nombres numerados, reglas de contención, grupo bajo un punto, añadir (nivel superior, dentro de un grupo, hueco libre, crecimiento de grupos, límite de nodos), conectar (repetida, con un grupo), mover (dentro del grupo, sin cambios, fuera de todos, a otro grupo, relleno, nunca dentro de sí), borrar con contenido, duplicar con contenido y aristas internas, y actualizaciones de campos.
- `store.test.ts`: historial (deshacer, rehacer, rama nueva, límite de 100, ediciones sin cambios), rechazos con su mensaje, ids de mensaje, borrar y duplicar la selección, conexión pendiente y apertura de diagramas como paso del historial.
- `flow.test.ts`: padres antes que hijos, posiciones relativas, tamaños, profundidad, producto y distintivo de proveedor, conectores por dirección, orden de construcción, aristas asíncronas y categoría de origen, nombres accesibles, grupos fijos hasta seleccionarlos, nodos sin disposición y diagrama vacío.
- `geometry.test.ts`: coordenadas absolutas con contenedores anidados, nodos sin disposición, profundidad de anidamiento, escala de dibujo con su mínimo y su máximo, límites vacíos y vista inicial que encaja o que empieza arriba.
- `icons.test.ts`: cada icono de `KIND_ICONS` es el que nombra el catálogo de core. Detectó que Lucide renombró `waves` a `waves-horizontal`.

Revisión visual: build servido con `vite preview` y capturado con Playwright en Chromium a 1440 × 900 en claro y oscuro, con la paleta abierta y cerrada, con un nodo resaltado y con varias plantillas, y a 390 × 844; además, un vídeo de 15 s del recorrido para revisar el movimiento. Sin errores en la consola. La skill `design-critique` (`.claude/skills`) guía la revisión de las capturas.

## Despliegue

`.github/workflows/deploy-web.yml` se dispara cuando el workflow CI termina con éxito tras un push a `main` (`workflow_run`), o a mano desde la pestaña Actions:

1. Consulta la API de Pages. Si Pages no está activado, termina con un aviso y no despliega; si está activado con un origen distinto de GitHub Actions, falla con un error que lo explica.
2. Hace checkout del commit que pasó CI, instala, ejecuta `pnpm --filter web build` y sube `apps/web/dist` con `actions/upload-pages-artifact`.
3. El job `deploy` publica con `actions/deploy-pages` en el entorno `github-pages`.

Solo se despliega lo que ha pasado CI.
