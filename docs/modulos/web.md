# Módulo: apps/web

Editor visual de Archdraft. Es una aplicación de una sola página con Vite, React 19, TypeScript y Tailwind CSS 4, publicada en GitHub Pages en `https://cosmemorillojulia.github.io/archdraft/`. Depende de `@archdraft/core` y `@archdraft/layout`, nunca al revés (ver [arquitectura](../arquitectura.md)).

Estado: estructura y despliegue (T07), rediseño centrado en el lienzo (T25), cabecera fija con animaciones (T27) y paleta en móvil (T28). El lienzo interactivo llega en T08, la edición en T09 y el panel de revisión en T10.

## Estructura

```
apps/web/
  index.html              # aplica el tema guardado antes del primer pintado
  vite.config.ts          # base /archdraft/, plugins de React y Tailwind, configuración de Vitest
  public/favicon.svg
  src/
    main.tsx              # punto de entrada
    App.tsx               # cabecera fija, lienzo y capas flotantes; carga de Motion
    strings.ts            # todas las cadenas visibles (ADR 0009)
    theme.ts              # useTheme: tema claro u oscuro, guardado, con revelado circular
    motion.ts             # tokens de movimiento: curva y muelles compartidos
    motion-features.ts    # funciones de Motion que se cargan aparte
    media.ts              # useMediaQuery y el punto de corte WIDE_SCREEN
    icons.ts              # icono de Lucide de cada tipo de nodo
    styles.css            # tokens, tema oscuro, utilidades floating y dot-grid
    components/           # Button, Header, DiagramCard, ComponentsPanel, PromptDock
    diagram/
      geometry.ts         # cajas absolutas, límites, curvas de las aristas, recorte de texto
      DiagramPreview.tsx  # vista previa SVG animada de solo lectura
  test/
    setup.ts              # jest-dom, limpieza, matchMedia simulado y animaciones desactivadas
    app.test.tsx          # comportamiento de la aplicación con Testing Library
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

Instrument Sans variable (peso 400 a 700, anchura 75 % a 100 %), autoalojada con `@fontsource-variable/instrument-sans`: unos 57 KB para el alfabeto latino básico. Escala: 14 px para la interfaz, 18 px bold para el nombre en la cabecera, 13 px semibold para la etiqueta de un nodo y 11 a 12 px para textos secundarios. Sin mayúsculas sostenidas.

### Movimiento

Motion (`motion/react`, ADR 0015) con `LazyMotion` y componentes `m`; las funciones de animación (`domMax`, con animaciones de layout) se cargan en un chunk aparte justo después del primer render. `MotionConfig reducedMotion="user"` desactiva los desplazamientos y escalados si el sistema pide movimiento reducido, y las partículas de las aristas no se dibujan en ese caso.

Tokens en `src/motion.ts`:

| Token          | Valor                                 | Uso                                              |
| -------------- | ------------------------------------- | ------------------------------------------------ |
| `EASE_OUT`     | `cubic-bezier(0.2, 0.8, 0.2, 1)`      | Entradas, salidas y fundidos                     |
| `SPRING_POP`   | muelle, rigidez 380, amortiguación 28 | Elementos pequeños que aparecen: nodos, mosaicos |
| `SPRING_SLIDE` | muelle, rebote 0,18, 450 ms           | Paneles e indicadores que se desplazan           |

Animaciones del recorrido:

| Momento                    | Qué ocurre                                                                                                                                |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Cargar o cambiar diagrama  | El anterior se desvanece; el nuevo se construye de izquierda a derecha en unos 0,7 s: grupos, nodos con un muelle y aristas que se trazan |
| Flujo                      | Una partícula del color de la categoría de origen recorre cada arista en bucle, más despacio cuanto más larga es                          |
| Pasar el ratón por un nodo | El nodo crece un 4 % y se perfila con su color; sus conexiones se resaltan con su etiqueta y el resto se atenúa                           |
| Elegir plantilla           | El indicador de la plantilla activa se desliza hasta ella; la tarjeta del diagrama cambia el título y las cifras ruedan                   |
| Paleta                     | Entra desde la izquierda con un muelle, los mosaicos aparecen en cascada y la rejilla se recoloca al filtrar; el lienzo ajusta su margen  |
| Campo de descripción       | Ejemplos de descripción que se suceden cada 3,6 s mientras está vacío; al enfocarlo aparece un halo del color de acento                   |
| Cambio de tema             | El nuevo tema se extiende en círculo desde el botón (API View Transitions); el icono gira y se funde                                      |

## Piezas de la interfaz

| Pieza             | Contenido                                                                                                                                                                                                                                                                          |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Header`          | Barra fija: nombre del producto (sin logotipo), descripción, enlace al código y cambio de tema                                                                                                                                                                                     |
| `DiagramCard`     | Tarjeta flotante: título, proveedor, descripción recortada a dos líneas, número de componentes y conexiones, y estado de la revisión de diseño (`lintGraph` memoizado por grafo, con `role="status"`)                                                                              |
| `ComponentsPanel` | Cerrada al empezar. Buscador por nombre, grupos por categoría y mosaicos con icono y nombre; la descripción del catálogo aparece al pasar el ratón                                                                                                                                 |
| `PromptDock`      | Campo que crece con el texto (`field-sizing: content`) con ejemplos rotatorios decorativos (`aria-hidden`), botón de generar deshabilitado con el motivo enlazado por `aria-describedby`, y las seis plantillas con icono en una cápsula con indicador deslizante (`aria-pressed`) |
| `DiagramPreview`  | Dibujo SVG animado del diagrama actual, ajustado al lienzo                                                                                                                                                                                                                         |
| `Button`          | Variantes `primary`, `secondary` y `ghost`; tamaños `default` e `icon`. Los tamaños son variantes con nombre porque dos utilidades de Tailwind sobre la misma propiedad no se anulan por su orden en `class`                                                                       |

En pantallas estrechas la cabecera oculta la descripción, la tarjeta ocupa el ancho sin la descripción del diagrama y las plantillas se desplazan en horizontal.

### Paleta en escritorio y en móvil

`useMediaQuery(WIDE_SCREEN)` (`min-width: 768px`, el punto `md` de Tailwind) decide la forma de la paleta:

| Pantalla | Botón                                                                       | Paleta                                                                                            | Cierre                                                                                               |
| -------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Ancha    | `Show components` arriba a la izquierda                                     | Panel flotante junto al diagrama, tres columnas; el lienzo deja sitio                             | Botón del panel o Escape                                                                             |
| Estrecha | Botón flotante redondeado sobre la barra de descripción, abajo a la derecha | Hoja modal que sube desde abajo (hasta el 80 % de la altura), cuatro columnas, con fondo atenuado | Botón con aspa, Escape, toque fuera o arrastrar el asa hacia abajo (más de 120 px o más de 500 px/s) |

Mientras la hoja está abierta, el resto de la página lleva el atributo `inert`, de modo que el foco y los lectores de pantalla no salen de ella; al abrirse recibe el foco la propia hoja (no el buscador, para no desplegar el teclado) y al cerrarse vuelve al botón. El arrastre solo empieza en el asa (`useDragControls`), para que desplazar la rejilla no cierre la hoja.

Hoy los mosaicos solo muestran el catálogo. Añadir componentes llega con T09: arrastrar y soltar en escritorio y tocar para añadir en pantallas estrechas o táctiles.

## Vista previa del diagrama

Hasta que exista el lienzo interactivo (T08), `DiagramPreview` dibuja la plantilla elegida:

1. Carga `@archdraft/layout` con `import()` dinámico, de modo que ELK queda fuera del bundle inicial, y calcula la disposición.
2. `absoluteBoxes` convierte las posiciones relativas al contenedor padre en coordenadas absolutas.
3. Dibuja contenedores (rectángulo con relleno translúcido que se intensifica al anidar; `boundary` con borde discontinuo), aristas y componentes, en ese orden para que los nodos queden encima.
4. Las aristas son curvas de Bézier que salen del lado que mira al destino (`edgeCurve`): horizontales si las cajas no se solapan en horizontal y verticales en caso contrario. Las asíncronas son discontinuas y aparecen con un fundido, porque el trazado animado también usa `stroke-dasharray`. `curveMidpoint` sitúa la etiqueta al resaltar y `curveSpan` marca el ritmo de la partícula.
5. Cada componente muestra el icono de su tipo sobre el color de su categoría, la etiqueta y el producto resuelto (`resolveServiceName`). Los textos largos se recortan con puntos suspensivos y el texto completo queda en un `<title>`.

Si la disposición falla, se muestra un mensaje y el error va a la consola. Al cambiar de plantilla se mantiene el diagrama anterior hasta que el nuevo está listo; entonces el anterior sale y el nuevo se construye (`AnimatePresence` en modo `wait`).

T08 sustituirá esta vista por React Flow reutilizando la geometría de los nodos, los colores por categoría, el estilo de las aristas y su movimiento.

## Tema

`useTheme` parte del tema que ya aplicó el script de `index.html` (preferencia guardada o tema del sistema) y lo guarda en `localStorage` solo cuando el usuario lo cambia. Si el almacenamiento está bloqueado, el tema se aplica igualmente durante la visita y se registra un aviso en la consola. El script inline evita el destello del tema equivocado antes de que cargue React; si el almacenamiento está bloqueado, usa el tema del sistema. El tema se decide al cargar: un cambio del tema del sistema con la página abierta se aplica al recargar. Al pulsar el botón, `toggle` recibe el centro del botón, guarda el origen y el radio del círculo en variables CSS y aplica el cambio dentro de `document.startViewTransition`; la animación `theme-reveal` de `styles.css` recorta el nuevo tema con un círculo creciente.

## Accesibilidad

- `header` con el `h1`, `main` etiquetado para el lienzo y el diagrama como imagen con nombre (`role="img"`).
- Foco visible con contorno de 2 px; el buscador muestra un anillo al enfocarse.
- Botones de solo icono con `aria-label`; estado de la revisión anunciado con `role="status"`.
- Contrastes AA medidos (ver tokens); `prefers-reduced-motion` respetado.

## Tests

- `app.test.tsx`: hoja modal en pantallas estrechas (foco, `inert`, cierre con Escape, botón y fondo) y panel lateral en anchas (sin bloquear la página, cierre con Escape), cabecera solo con el nombre, tarjeta del diagrama con cifras y revisión, diagrama dibujado con sus componentes, etiquetas de las conexiones al pasar el ratón, cambio de plantilla, campo con descripción accesible, ejemplos rotatorios y botón deshabilitado, paleta con todo el catálogo, búsqueda con y sin resultados, abrir y cerrar la paleta, tema. `MotionGlobalConfig.skipAnimations` lleva cada animación a su estado final y los tests esperan a que terminen las salidas.
- `geometry.test.ts`: coordenadas absolutas con contenedores anidados, nodos sin disposición, límites, los cuatro casos de curva de las aristas, punto medio, distancia y recorte de texto.
- `icons.test.ts`: cada icono de `KIND_ICONS` es el que nombra el catálogo de core. Detectó que Lucide renombró `waves` a `waves-horizontal`.

Revisión visual: build servido con `vite preview` y capturado con Playwright en Chromium a 1440 × 900 en claro y oscuro, con la paleta abierta y cerrada, con un nodo resaltado y con varias plantillas, y a 390 × 844; además, un vídeo de 15 s del recorrido para revisar el movimiento. Sin errores en la consola. La skill `design-critique` (`.claude/skills`) guía la revisión de las capturas.

## Despliegue

`.github/workflows/deploy-web.yml` se dispara cuando el workflow CI termina con éxito tras un push a `main` (`workflow_run`), o a mano desde la pestaña Actions:

1. Consulta la API de Pages. Si Pages no está activado, termina con un aviso y no despliega; si está activado con un origen distinto de GitHub Actions, falla con un error que lo explica.
2. Hace checkout del commit que pasó CI, instala, ejecuta `pnpm --filter web build` y sube `apps/web/dist` con `actions/upload-pages-artifact`.
3. El job `deploy` publica con `actions/deploy-pages` en el entorno `github-pages`.

Solo se despliega lo que ha pasado CI.
