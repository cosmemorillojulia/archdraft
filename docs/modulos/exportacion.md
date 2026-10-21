# Módulo: exportación e importación

Vive en `packages/core/src/export/` y en `packages/core/src/migrations.ts`. Convierte un grafo a formatos de texto (Mermaid y JSON) y lee de vuelta los ficheros JSON de forma segura. Todo son funciones puras sin E/S: el editor (T11, T12) se encarga de copiar, descargar o leer ficheros.

## Estructura

```
packages/core/src/
  export/
    mermaid.ts     # toMermaid
    json.ts        # toJson, importJson
    index.ts       # API pública del módulo
  migrations.ts    # cadena de migraciones por schemaVersion
```

## API pública

| Export                                | Tipo      | Uso                                                                            |
| ------------------------------------- | --------- | ------------------------------------------------------------------------------ |
| `toMermaid(graph, { direction? })`    | Función   | Texto `flowchart` de Mermaid. Dirección `LR` (por defecto), `TB`, `RL` o `BT`  |
| `MERMAID_DIRECTIONS`                  | Constante | Direcciones admitidas, para el selector de la interfaz                         |
| `toJson(graph)`                       | Función   | JSON indentado con orden de claves fijo                                        |
| `importJson(text)`                    | Función   | Parseo, migración y validación de un fichero o enlace. Nunca lanza excepciones |
| `migrateDocument(document, options?)` | Función   | Aplica la cadena de migraciones; lo usa `importJson`                           |
| `MIGRATIONS`, `Migration`             | Constante | Migraciones registradas, indexadas por la versión de origen                    |

`toMermaid` y `toJson` esperan un grafo válido. `toMermaid` lanza un error de programación si una arista apunta a un nodo inexistente, porque eso solo ocurre si alguien se salta `parseArchitectureGraph` o `validateGraph`.

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
| Producto             | Segunda línea de la etiqueta, solo si aporta algo (ver abajo)                |
| Arista síncrona      | Línea continua `-->`                                                         |
| Arista asíncrona     | Línea discontinua `-.->`                                                     |
| Etiqueta y protocolo | Texto de la arista: `"Reads · grpc"`, o solo uno de los dos si falta el otro |

Decisiones:

- El modo de cada arista es el efectivo, calculado con `resolveEdgeMode`: una arista `kafka` sin `mode` se dibuja discontinua.
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

| Carácter | Problema                           | Se escribe     |
| -------- | ---------------------------------- | -------------- |
| `"`      | Cierra la cadena                   | `#34;`         |
| `#`      | Inicia un código de entidad        | `#35;`         |
| `&`      | Se interpretaría como entidad HTML | `#38;`         |
| `<`, `>` | Se interpretarían como HTML        | `#60;`, `#62;` |
| `` ` ``  | Activa el modo Markdown de Mermaid | `#96;`         |
| `\|`     | Cierra la etiqueta de una arista   | `#124;`        |

Los saltos de línea (`\n`, `\r\n`, `\r`) se convierten en `<br/>`; sin esa conversión Mermaid los descarta. La salida del modelo es un dato y nunca debe poder inyectar HTML en el diagrama renderizado.

Verificación: el fixture de tres capas y un grafo con todos los casos anteriores (ids `end`, `a--b` y `a__b`, etiquetas con HTML, comillas, almohadillas, comillas invertidas, barras y saltos de línea, contenedor vacío) se renderizaron con Mermaid 12.2.0 en Chromium con `securityLevel: 'strict'`: sin errores, con los textos literales y sin elementos HTML inyectados. Los tests fijan la salida con instantáneas.

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
