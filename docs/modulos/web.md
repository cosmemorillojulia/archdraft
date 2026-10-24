# Módulo: apps/web

Editor visual de Archdraft. Es una aplicación de una sola página con Vite, React 19, TypeScript y Tailwind CSS 4, publicada en GitHub Pages en `https://cosmemorillojulia.github.io/archdraft/`. Depende de `@archdraft/core` y nunca al revés (ver [arquitectura](../arquitectura.md)).

Estado a fecha de T07: estructura, sistema visual, componentes base y despliegue. El lienzo interactivo llega en T08, la edición en T09 y la revisión de diseño en T10.

## Estructura

```
apps/web/
  index.html            # aplica el tema guardado antes del primer pintado
  vite.config.ts        # base /archdraft/, plugins de React y Tailwind, configuración de Vitest
  public/favicon.svg
  src/
    main.tsx            # punto de entrada
    App.tsx             # estructura: cabecera, tres paneles y selector para pantallas pequeñas
    strings.ts          # todas las cadenas visibles (ADR 0009)
    theme.ts            # useTheme: tema claro u oscuro, guardado en localStorage
    styles.css          # tokens, tema oscuro, utilidades propias
    components/         # Button, Panel, Tabs, TextAreaField
    layout/             # Header, BuildPanel, Canvas, DetailsPanel
  test/
    setup.ts            # jest-dom, limpieza y matchMedia simulado
    app.test.tsx        # test de humo con Testing Library
```

## Scripts

| Script                      | Qué hace                                                            |
| --------------------------- | ------------------------------------------------------------------- |
| `pnpm --filter web dev`     | Servidor de desarrollo en `http://localhost:5173/archdraft/`        |
| `pnpm --filter web build`   | Build de producción en `apps/web/dist`                              |
| `pnpm --filter web preview` | Sirve el build en `http://localhost:4173/archdraft/` para revisarlo |
| `pnpm --filter web test`    | Tests en jsdom                                                      |

La `base` de Vite es `/archdraft/` también en desarrollo: GitHub Pages sirve el sitio del proyecto bajo el nombre del repositorio, y usar la misma ruta en local evita sorpresas con rutas de recursos que solo fallarían en producción.

## Sistema visual

La dirección visual y sus alternativas están en [ADR 0013](../adr/0013-direccion-visual-hoja-de-dibujo.md): vocabulario de dibujo técnico, con la hoja de dibujo como único elemento llamativo.

### Tokens de color

Se definen como variables CSS en `:root` y `:root[data-theme='dark']`, y se exponen a Tailwind con `@theme inline`, de modo que `bg-sheet` o `text-lead` cambian con el tema sin variantes `dark:` en los componentes.

| Token          | Claro     | Oscuro    | Uso                                               |
| -------------- | --------- | --------- | ------------------------------------------------- |
| `vellum`       | `#eceeea` | `#142330` | Fondo de la aplicación                            |
| `sheet`        | `#f7f8f5` | `#19293a` | Hoja del lienzo, campos y piezas de la paleta     |
| `graphite`     | `#22292b` | `#e4eaef` | Texto principal y marco de la hoja                |
| `lead`         | `#5f6a68` | `#9aabb9` | Texto secundario                                  |
| `rule`         | `#c9cfcb` | `#2f465b` | Filetes y bordes                                  |
| `grid`         | `#dfe4e0` | `#21364a` | Cuadrícula de la hoja                             |
| `diazo`        | `#2f4bb8` | `#93a9ff` | Acción principal, pestaña activa                  |
| `diazo-strong` | `#233a94` | `#b5c4ff` | Estado hover de la acción principal               |
| `on-diazo`     | `#f7f8f5` | `#142330` | Texto sobre `diazo`                               |
| `redline`      | `#c8352e` | `#ff8a7f` | Reservado para los hallazgos de la revisión (T10) |
| `focus`        | `#2f4bb8` | `#b5c4ff` | Anillo de foco                                    |

Contraste WCAG medido: texto principal sobre el fondo, 12,7:1 en claro y 13,2:1 en oscuro; texto secundario, 4,8:1 y 6,8:1; texto sobre el botón principal, 7,0:1 y 7,1:1. Todos cumplen AA para texto normal.

### Tipografía

Archivo variable (peso 100 a 900, anchura 62 % a 125 %), autoalojada con `@fontsource-variable/archivo`. El navegador solo descarga el subconjunto que necesita por `unicode-range` (unos 90 KB para el latino básico).

| Uso                               | Anchura            | Tamaño y peso                     |
| --------------------------------- | ------------------ | --------------------------------- |
| Marca en la cabecera              | `font-wide` 125 %  | 18 px, 700                        |
| Título del diagrama en el cajetín | `font-wide` 125 %  | 18 px, 600                        |
| Encabezados de panel              | `font-narrow` 75 % | 16 px, 600                        |
| Categorías de la paleta           | `font-narrow` 75 % | 14 px, 500                        |
| Etiquetas del cajetín             | `font-narrow` 75 % | 12 px, 400                        |
| Texto de interfaz                 | normal             | 15 px (cuerpo), 14 px (controles) |

No se usan mayúsculas sostenidas en etiquetas: la anchura condensada cumple ese papel.

### Hoja de dibujo

`drafting-grid` dibuja la cuadrícula con cuatro degradados lineales (líneas cada 8 y cada 40 px). La hoja tiene marco doble (borde de 2 px más un contorno separado 4 px) y el cajetín en la esquina inferior derecha con título, proveedor, número de componentes (nodos que no son contenedores) y número de conexiones. En pantallas estrechas el cajetín ocupa todo el ancho al pie de la hoja.

## Estructura de la aplicación

| Zona            | Contenido en T07                                                                              | Llega en                       |
| --------------- | --------------------------------------------------------------------------------------------- | ------------------------------ |
| Cabecera        | Marca, descripción, enlace al código, cambio de tema                                          |                                |
| Panel izquierdo | Campo para describir el sistema (botón deshabilitado) y paleta con el catálogo por categorías | T09 (arrastrar), T20 (generar) |
| Lienzo          | Hoja con cajetín de la plantilla por defecto (`three-tier-web`)                               | T08                            |
| Panel derecho   | Pestañas Inspector y Review con su estado vacío                                               | T09, T10                       |

Por debajo del punto de corte `lg` (1024 px) se muestra un panel cada vez con un selector de tres botones (`aria-pressed`); por encima, los tres a la vez. El lienzo es el panel inicial en móvil.

Las etiquetas y descripciones de los tipos de nodo de la paleta vienen del catálogo de `@archdraft/core`, que es la fuente de verdad del vocabulario; el resto de textos está en `strings.ts`.

## Componentes base

| Componente      | Notas                                                                                                                                 |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `Button`        | Variantes `primary`, `secondary` y `ghost`; tamaños `default` e `icon` (cuadrado, requiere `aria-label`). `type="button"` por defecto |
| `Panel`         | Sección con encabezado y descripción opcional, etiquetada por su encabezado                                                           |
| `Tabs`          | Patrón WAI-ARIA: un único punto de tabulación, flechas, Inicio y Fin seleccionan y enfocan                                            |
| `TextAreaField` | Etiqueta visible y pista enlazada con `aria-describedby`                                                                              |

Los tamaños son variantes con nombre en lugar de clases sobrescritas desde fuera, porque dos utilidades de Tailwind que fijan la misma propiedad no se anulan por orden de aparición en el atributo `class`.

## Tema

`useTheme` parte del tema que ya aplicó el script de `index.html` (preferencia guardada o tema del sistema) y lo guarda en `localStorage` solo cuando el usuario lo cambia. Si el almacenamiento está bloqueado, el tema se aplica igualmente durante la visita y se registra un aviso en la consola. El script inline evita el destello del tema equivocado antes de que cargue React.

## Accesibilidad

- Estructura con `header`, `nav`, `main`, dos `aside` etiquetados y la hoja como región.
- Foco visible con contorno de 2 px en todos los elementos interactivos.
- `prefers-reduced-motion` anula transiciones.
- Contrastes AA medidos (ver tokens).

## Tests

`test/app.test.tsx` comprueba con Testing Library las regiones principales, el campo con su descripción accesible, el cajetín con los datos de la plantilla, que la paleta contiene todo el catálogo, las pestañas con ratón y teclado, el cambio y guardado del tema, el tema inicial y el selector de paneles. Corren en jsdom; `matchMedia` se simula porque jsdom no lo implementa.

Revisión visual: el build se sirvió con `vite preview` y se capturó con Playwright en Chromium a 1440 × 900 (claro y oscuro) y 390 × 844, sin errores en la consola.

## Despliegue

`.github/workflows/deploy-web.yml` se dispara cuando el workflow CI termina con éxito tras un push a `main` (`workflow_run`), o a mano desde la pestaña Actions:

1. Consulta la API de Pages. Si Pages no está activado, termina con un aviso y no despliega; si está activado con un origen distinto de GitHub Actions, falla con un error que lo explica.
2. Hace checkout del commit que pasó CI, instala, ejecuta `pnpm --filter web build` y sube `apps/web/dist` con `actions/upload-pages-artifact`.
3. El job `deploy` publica con `actions/deploy-pages` en el entorno `github-pages`.

Solo se despliega lo que ha pasado CI. La activación de Pages es una acción manual del propietario, descrita en [operaciones](../operaciones.md).
