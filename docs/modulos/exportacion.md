# Módulo: exportación e importación

Vive en `packages/core/src/export/` y en `packages/core/src/migrations.ts`. Convierte un grafo a formatos de texto (Mermaid, draw.io y JSON) y lee de vuelta los ficheros JSON de forma segura. Todo son funciones puras sin E/S: el editor (T11, T12) se encarga de copiar, descargar o leer ficheros. Las imágenes SVG y PNG se dibujan en `apps/web` (ver [web.md](web.md#exportar)), porque necesitan medir texto con la fuente, los iconos y los colores del tema, que no son del dominio.

## Estructura

```
packages/core/src/
  export/
    labels.ts      # textos comunes: subtítulo del nodo y etiqueta de la arista
    mermaid.ts     # toMermaid
    drawio.ts      # toDrawio
    json.ts        # toJson, importJson, documentToJson, importDocument
    index.ts       # API pública del módulo
  migrations.ts    # cadena de migraciones por schemaVersion
```

## API pública

| Export                                  | Tipo      | Uso                                                                                               |
| --------------------------------------- | --------- | ------------------------------------------------------------------------------------------------- |
| `toMermaid(graph, { direction? })`      | Función   | Texto `flowchart` de Mermaid. Dirección `LR` (por defecto), `TB`, `RL` o `BT`                     |
| `MERMAID_DIRECTIONS`                    | Constante | Direcciones admitidas, para el selector de la interfaz                                            |
| `toDrawio(graph, layout)`               | Función   | Fichero `.drawio` sin comprimir, con las posiciones de un `DiagramLayout`                         |
| `toJson(graph)`                         | Función   | JSON indentado con orden de claves fijo                                                           |
| `importJson(text)`                      | Función   | Parseo, migración y validación de un fichero o enlace. Nunca lanza excepciones                    |
| `documentToJson(document, { indent? })` | Función   | Documento con disposición, `{ graph, layout }`, en orden estable; `indent: 0` lo escribe compacto |
| `importDocument(text)`                  | Función   | Lee un documento con disposición o un grafo suelto. Nunca lanza excepciones                       |
| `migrateDocument(document, options?)`   | Función   | Aplica la cadena de migraciones; lo usa `importJson`                                              |
| `MIGRATIONS`, `Migration`               | Constante | Migraciones registradas, indexadas por la versión de origen                                       |

`toMermaid`, `toDrawio` y `toJson` esperan un grafo válido. `toMermaid` y `toDrawio` lanzan un error de programación si una arista apunta a un nodo inexistente, porque eso solo ocurre si alguien se salta `parseArchitectureGraph` o `validateGraph`.

## Mermaid

Ejemplo con un fragmento del fixture de tres capas:

```
---
title: "Online store"
---
flowchart LR
  n_customer(["Customer"])
  subgraph n_region ["eu-west-1"]
    subgraph n_vpc ["VPC"]
      n_db[("Orders DB<br/>Amazon Aurora")]
    end
  end
  n_orders_queue["Orders queue<br/>Amazon SQS"]
  n_customer -->|"https"| n_cdn
  n_api -.->|"amqp"| n_orders_queue
```

| Elemento del grafo   | Representación en Mermaid                                                    |
| -------------------- | ---------------------------------------------------------------------------- |
| Título               | Cabecera YAML `title`                                                        |
| Contenedor           | `subgraph id ["etiqueta"]` ... `end`, anidado según `parentId`               |
| Componente de datos  | Cilindro `id[("etiqueta")]`                                                  |
| Actor                | Estadio `id(["etiqueta"])`                                                   |
| Resto de componentes | Rectángulo `id["etiqueta"]`                                                  |
| Caja                 | Rectángulo `id["etiqueta"]`                                                  |
| Círculo              | Círculo `id(("etiqueta"))`                                                   |
| Rombo                | Rombo `id{"etiqueta"}`                                                       |
| Nota                 | Bandera `id>"etiqueta"]`, la figura de Mermaid más parecida a una nota       |
| Producto             | Segunda línea de la etiqueta, solo si aporta algo (ver abajo)                |
| Arista síncrona      | Línea continua `-->`                                                         |
| Arista asíncrona     | Línea discontinua `-.->`                                                     |
| Etiqueta y protocolo | Texto de la arista: `"Reads · grpc"`, o solo uno de los dos si falta el otro |

Decisiones:

- El modo de cada arista es el efectivo, calculado con `resolveEdgeMode`: una arista `kafka` sin `mode` se dibuja discontinua.
- Mermaid no recibe la disposición, así que no refleja el estilo de las conexiones (`curved` o `square`); lo decide Mermaid. Lo siguen el SVG y el PNG del editor (`apps/web`), que dibujan cada conexión como el lienzo.
- El producto (`resolveServiceName`) se añade como segunda línea solo cuando es distinto de la etiqueta del nodo y del nombre genérico del tipo. Así un nodo AWS muestra "Order worker / AWS Lambda", pero un nodo genérico no repite "Service" debajo de su nombre.
- Todos los nodos y contenedores se declaran antes que las aristas. Mermaid coloca un nodo en el `subgraph` donde aparece por primera vez, de modo que declarar una arista dentro de un bloque podría mover nodos de contenedor.
- Los contenedores vacíos se exportan como `subgraph` vacío; Mermaid los dibuja como un marco sin contenido.
- La cabecera YAML usa `JSON.stringify` para el título. Una cadena JSON es un escalar YAML entre comillas dobles válido, así que no hace falta otro escapado.

### Identificadores

Los identificadores del dominio no se pueden usar tal cual. Probado con Mermaid 12.2.0:

- `a--b`, válido en el esquema, rompe el análisis porque `--` forma parte de las flechas.
- Palabras clave como `end`, `graph`, `subgraph`, `style`, `click` o `default` producen errores de sintaxis.

Por eso cada id se transforma en `n_` seguido del id con los guiones cambiados por guiones bajos (`orders-queue` pasa a `n_orders_queue`). El prefijo evita cualquier palabra clave sin mantener una lista que puede cambiar entre versiones de Mermaid. Si dos ids acaban en el mismo texto (`a-b` y `a_b`), el segundo recibe un sufijo numérico (`n_a_b_2`). El resultado sigue siendo legible si alguien edita el texto a mano.

### Escapado de etiquetas

Todas las etiquetas van entre comillas dobles, lo que permite corchetes, llaves y paréntesis sin escapar. Los caracteres que siguen siendo peligrosos se sustituyen por códigos de entidad de Mermaid (`#código;`), que se muestran como el carácter literal:

| Carácter | Problema                                                        | Se escribe     |
| -------- | --------------------------------------------------------------- | -------------- |
| `"`      | Cierra la cadena                                                | `#34;`         |
| `%`      | `%%{...}%%` es una directiva: Mermaid la elimina de la etiqueta | `#37;`         |
| `#`      | Inicia un código de entidad                                     | `#35;`         |
| `&`      | Se interpretaría como entidad HTML                              | `#38;`         |
| `<`, `>` | Se interpretarían como HTML                                     | `#60;`, `#62;` |
| `` ` ``  | Activa el modo Markdown de Mermaid                              | `#96;`         |
| `\|`     | Cierra la etiqueta de una arista                                | `#124;`        |

Los saltos de línea (`\n`, `\r\n`, `\r`) se convierten en `<br/>`; sin esa conversión Mermaid los descarta. La salida del modelo es un dato y nunca debe poder inyectar HTML en el diagrama renderizado.

Verificación: el fixture de tres capas y un grafo con todos los casos anteriores (ids `end`, `a--b` y `a__b`, etiquetas con HTML, directivas `%%{init}%%`, comillas, almohadillas, comillas invertidas, barras y saltos de línea, contenedor vacío) se renderizaron con Mermaid 12.2.0 en Chromium con `securityLevel: 'strict'`: sin errores, con los textos literales y sin elementos HTML inyectados. Los tests fijan la salida con instantáneas.

## draw.io

`toDrawio(graph, layout)` genera un `mxfile` sin comprimir, el formato que draw.io guarda por defecto, con una sola página que se llama como el diagrama. A diferencia de Mermaid, draw.io no calcula posiciones, así que el exportador recibe la disposición: la del editor o la de `computeLayout` (`packages/layout`). La función sigue en `core` porque solo escribe texto; no depende de ELK.

Ejemplo abreviado:

```xml
<mxfile host="Archdraft">
  <diagram id="archdraft" name="Online store">
    <mxGraphModel>
      <root>
        <mxCell id="0" />
        <mxCell id="1" parent="0" />
        <mxCell id="n-vpc" value="VPC" style="...container=1;..." vertex="1" parent="n-region">
          <mxGeometry x="24" y="48" width="700" height="300" as="geometry" />
        </mxCell>
        <mxCell id="e-e7" value="amqp" style="edgeStyle=orthogonalEdgeStyle;...dashed=1;" edge="1" parent="1" source="n-api" target="n-orders-queue">
          <mxGeometry relative="1" as="geometry" />
        </mxCell>
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>
```

| Elemento del grafo | Representación en draw.io                                                                                                                             |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contenedor         | Celda con `container=1`, borde discontinuo, sin relleno y título arriba a la izquierda                                                                |
| Hijo               | Celda con `parent` igual a la celda de su contenedor; moverlo en draw.io mueve también su contenido                                                   |
| Posición y tamaño  | `mxGeometry` con los valores del `DiagramLayout`; ambos usan coordenadas relativas al padre                                                           |
| Componente         | Rectángulo redondeado con el color de su categoría; cilindro (`cylinder3`) para datos, estadio para actores, borde discontinuo para sistemas externos |
| Figura genérica    | Gris neutro: rectángulo redondeado, `ellipse`, `rhombus` o `shape=note`, sin segunda línea de producto                                                |
| Etiqueta           | Nombre y, en una segunda línea, el producto con la misma regla que Mermaid (`nodeSubtitle`)                                                           |
| Arista             | Celda `edge="1"` con estilo ortogonal; discontinua si el modo efectivo es asíncrono                                                                   |
| Texto de arista    | El mismo que en Mermaid (`edgeText`): `"Reads · grpc"`                                                                                                |

Decisiones:

- Identificadores de celda: `n-<id>` para nodos y `e-<id>` para aristas. En draw.io nodos y aristas comparten espacio de nombres y las celdas `0` y `1` están reservadas para la raíz y la capa, mientras que en el dominio un nodo y una arista pueden llamarse igual (`e1`) y un slug puede ser `1`.
- Los contenedores se escriben antes que sus hijos. draw.io pinta en el orden del documento, así que el contenido queda encima del marco.
- El exportador escribe siempre `edgeStyle=orthogonalEdgeStyle`, sea cual sea el estilo de las conexiones del diagrama (`layout.edgeStyle`): de momento no lo traduce.
- Las aristas cuelgan de la capa (`parent="1"`) aunque sus extremos estén en contenedores distintos: draw.io calcula la posición absoluta de cada extremo.
- Si a un nodo le falta la posición en la disposición se coloca en el origen de su padre, y si le falta el tamaño recibe el tamaño por defecto de su tipo (`defaultSizeOf`). Una disposición desfasada respecto al grafo sigue exportándose en lugar de fallar.
- Colores de la paleta estándar de draw.io, uno por categoría, para que el diagrama encaje con lo que el usuario ya dibuja allí. No se usan iconos de proveedor (ADR 0008).

Uso desde Node.js, por ejemplo para generar un fichero de prueba:

```ts
import { toDrawio } from '@archdraft/core';
import { computeLayout } from '@archdraft/layout';

const xml = toDrawio(graph, await computeLayout(graph));
```

### Escapado

Las etiquetas usan `html=1`, que permite que los nombres largos se partan dentro del nodo. Con esa opción draw.io interpreta el valor como HTML, de modo que el texto pasa por dos escapados:

1. HTML: `&`, `<`, `>`, `"` y `'` se convierten en referencias numéricas (`&#60;`) y los saltos de línea en `<br>`. Una etiqueta nunca puede inyectar marcado.
2. XML: el resultado se escribe como atributo escapando `&`, `<`, `>`, `"` y `'`. Tabuladores y saltos de línea en atributos sin HTML, como el nombre de la página, se escriben como referencias (`&#10;`) porque un parser XML los normalizaría a espacios.

XML 1.0 no admite algunos caracteres ni siquiera como referencia: controles C0 salvo tabulador, salto de línea y retorno de carro, sustitutos sin pareja, U+FFFE y U+FFFF. El esquema no los excluye y uno solo basta para que draw.io rechace el fichero, así que se eliminan.

### Verificación

- Los tests analizan la salida con `@xmldom/xmldom` en modo estricto (cualquier aviso falla) y comprueban padres, orden, geometría, estilos, ids reservados y compartidos, escapado y caracteres no válidos. Una instantánea fija la salida del fixture de tres capas.
- El fixture de tres capas con la disposición de `computeLayout` y una etiqueta con `<b>`, comillas, `&` y un salto de línea se cargó con `mxCodec` de mxGraph 4.2.2 (la librería sobre la que está construido draw.io) en Chromium: 26 celdas con los padres esperados, contenedores anidados en su sitio, aristas conectadas y el texto de la etiqueta mostrado de forma literal, sin elementos HTML inyectados. mxGraph no incluye la forma `cylinder3` de draw.io y la dibuja como rectángulo.
- Pendiente: abrir el fichero en draw.io (app.diagrams.net o la aplicación de escritorio). Desde el entorno de desarrollo automatizado no hay acceso a draw.io; la comprobación está en la tabla de acciones pendientes de [operaciones](../operaciones.md).

## JSON

`toJson` escribe JSON indentado con dos espacios y las claves en el orden en que las declara el esquema Zod (`Object.keys(Schema.shape)`): grafo, nodos, atributos y aristas. Consecuencias:

- El mismo grafo produce siempre el mismo texto, independientemente del orden en que se construyeron los objetos. Los ficheros se pueden comparar con `diff` y versionar.
- El orden sale del propio esquema (ADR 0006): añadir un campo no obliga a tocar el exportador.
- Los campos `undefined` y las claves que no pertenecen al esquema no se escriben.

## Importación

`importJson(text)` es la entrada para ficheros y enlaces compartidos y devuelve el mismo `ParseResult` que `parseArchitectureGraph`:

1. `JSON.parse` dentro de un `try`. Un texto que no es JSON produce `INVALID_JSON` con el mensaje del parser.
2. `migrateDocument` lleva el documento a la versión actual (ver abajo).
3. `parseArchitectureGraph` aplica el esquema y la validación estructural.

Un `__proto__` en el JSON es una propiedad propia del objeto resultante, no modifica prototipos, y el esquema estricto lo rechaza como clave desconocida.

## Documento con disposición

El editor guarda, comparte y descarga el documento completo, no solo el grafo, para no perder la colocación manual (ADR 0019):

```json
{
  "graph": { "schemaVersion": 1, "title": "…", "provider": "aws", "nodes": [], "edges": [] },
  "layout": {
    "positions": { "api": { "x": 0, "y": 0 } },
    "sizes": { "api": { "width": 180, "height": 64 } }
  }
}
```

`documentToJson` escribe el grafo con el mismo orden que `toJson` y las entradas de la disposición en el orden de los nodos, así que el texto también es estable. `importDocument(text)` devuelve `{ success, graph, layout, warnings }` o `{ success: false, issues }`:

1. JSON inválido: `INVALID_JSON`, como `importJson`.
2. Si el objeto tiene la clave `graph`, es un documento; si no, es un grafo suelto y `layout` vale `null`.
3. El grafo pasa por `migrateDocument` y `parseArchitectureGraph`, igual que en `importJson`.
4. La disposición se valida con `DiagramLayoutSchema`. Un error se informa como `SCHEMA` con la ruta bajo `layout`. Las entradas de nodos que no están en el grafo se descartan; las que faltan se dejan faltar, y el editor coloca esos nodos con ELK.

## Migraciones

`MIGRATIONS` es un `Map` de la versión de origen a una función que convierte un documento de la versión `n` en uno de la versión `n + 1`. Hoy está vacío porque el formato sigue en la versión 1, pero la cadena funciona y está probada con migraciones ficticias.

`migrateDocument(document, { migrations?, targetVersion? })`:

| Entrada                                          | Resultado                                                       |
| ------------------------------------------------ | --------------------------------------------------------------- |
| No es un objeto o `schemaVersion` no es entero   | Se devuelve sin cambios; el esquema informa del problema        |
| `schemaVersion` igual a la versión actual        | Se devuelve sin cambios                                         |
| `schemaVersion` mayor que la actual              | `UNSUPPORTED_SCHEMA_VERSION`: hay que actualizar Archdraft      |
| Falta una migración en la cadena (por ejemplo 0) | `UNSUPPORTED_SCHEMA_VERSION`                                    |
| Una migración lanza una excepción                | `MIGRATION_FAILED` con el motivo; `migrateDocument` nunca lanza |
| En otro caso                                     | Documento migrado paso a paso                                   |

La propia cadena escribe `schemaVersion: n + 1` después de cada paso, así que una migración no puede olvidarlo. Las migraciones reciben datos sin validar: deben tolerar campos ausentes o mal formados y dejar que el esquema los rechace después.

Cómo añadir una migración al cambiar el formato de forma incompatible:

1. Incrementar `SCHEMA_VERSION` en `schema.ts` y adaptar el esquema.
2. Añadir a `MIGRATIONS` la entrada desde la versión anterior.
3. Añadir un test con un documento real de la versión anterior que, tras `importJson`, sea válido en la nueva.
4. Actualizar la sección de versionado del [modelo de dominio](../modelo-de-dominio.md#versionado-del-formato).
