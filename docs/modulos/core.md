# Módulo: packages/core

Librería de dominio sin dependencias de entorno: no usa DOM, red ni APIs de Node.js. Se ejecuta igual en el navegador, en Cloudflare Workers y en Node.js 22.

## Estructura

```
packages/core/
  src/
    index.ts        # API pública: reexporta los módulos
    kinds.ts        # vocabularios cerrados e isContainerKind
    schema.ts       # esquema Zod, límites, tipos, createEmptyGraph
    catalog.ts      # NODE_CATALOG, getNodeDefinition, CONTAINMENT_RULES
    graph.ts        # indexGraph, getAncestors, getDescendants, resolveProvider, resolveServiceName
    validate.ts     # validateGraph, parseArchitectureGraph, códigos de validación
    json-schema.ts  # architectureGraphJsonSchema
    migrations.ts   # cadena de migraciones por schemaVersion
    document.ts     # DiagramLayout y DiagramDocument
    lint/           # motor de reglas de diseño, ver modulos/lint.md
    export/         # Mermaid, JSON y draw.io, ver modulos/exportacion.md
    templates/      # seis arquitecturas de referencia, ver modulos/plantillas.md
  test/
    fixtures.ts     # grafo de ejemplo: tienda online de tres capas en AWS
    *.test.ts
```

## API pública

| Export                                                                                                                                                 | Tipo                                  | Uso                                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `ArchitectureGraphSchema`, `ArchNodeSchema`, `ArchEdgeSchema`                                                                                          | Esquemas Zod                          | Validar o componer esquemas                                                                                                                  |
| `ArchitectureGraph`, `ArchNode`, `ArchEdge`, `NodeAttributes`                                                                                          | Tipos                                 | Tipar el resto del sistema                                                                                                                   |
| `createEmptyGraph(title, provider?)`                                                                                                                   | Función                               | Documento nuevo                                                                                                                              |
| `parseArchitectureGraph(input)`                                                                                                                        | Función                               | Entrada para datos no confiables ya parseados                                                                                                |
| `validateGraph(graph)`                                                                                                                                 | Función                               | Revalidar tras una modificación                                                                                                              |
| `indexGraph(graph)`                                                                                                                                    | Función                               | Consultas eficientes sobre el grafo                                                                                                          |
| `getAncestors`, `getDescendants`                                                                                                                       | Funciones                             | Recorrer contenedores                                                                                                                        |
| `resolveProvider`, `resolveServiceName`                                                                                                                | Funciones                             | Etiquetas y exportaciones                                                                                                                    |
| `resolveEdgeMode`                                                                                                                                      | Función                               | Modo efectivo de una arista cuando `mode` no está informado                                                                                  |
| `lintGraph`, `LINT_RULES`, `LINT_RULE_IDS`                                                                                                             | Función y constantes                  | Revisión de diseño, ver [lint.md](lint.md)                                                                                                   |
| `toMermaid`, `toDrawio`, `toJson`                                                                                                                      | Funciones                             | Exportación de texto, ver [exportacion.md](exportacion.md)                                                                                   |
| `importJson`, `importDocument`, `documentToJson`, `migrateDocument`, `MIGRATIONS`                                                                      | Funciones y mapa                      | Importar ficheros y enlaces con migraciones                                                                                                  |
| `DiagramLayoutSchema`, `DiagramDocumentSchema`, `createEmptyLayout`, `layoutEntry`, `DEFAULT_NODE_SIZE`, `DEFAULT_CONTAINER_SIZE`, `CONTAINER_PADDING` | Esquemas, función y constantes        | Disposición y documento del editor, ver [layout.md](layout.md)                                                                               |
| `EDGE_STYLES`, `EdgeStyle`, `EdgeStyleSchema`, `DEFAULT_EDGE_STYLE`, `ownEdgeStyle`, `resolveEdgeStyle`                                                | Constantes, tipo, esquema y funciones | Estilo de las conexiones (`curved` o `square`) y estilo efectivo de una arista, ver el [modelo de dominio](../modelo-de-dominio.md)          |
| `NODE_SIDES`, `NodeSide`, `NodeSideSchema`, `EdgeRouteSchema`, `EdgeRoute`, `ownEdgeRoute`                                                             | Constantes, tipos, esquemas y función | Lado de un nodo y recorrido de una arista decidido a mano (`source`, `target` y `bend`), ver el [modelo de dominio](../modelo-de-dominio.md) |
| `importMermaid(text)`, `importDrawio(xml)`                                                                                                             | Funciones                             | Leer un flowchart de Mermaid o un fichero de draw.io, ver más abajo                                                                          |
| `SHAPE_KINDS`, `isShapeKind`, `SHAPE_SIZES`, `defaultSizeOf(kind)`                                                                                     | Constantes y funciones                | Figuras genéricas y tamaño por defecto de cualquier tipo                                                                                     |
| `ARCHITECTURE_TEMPLATES`, `TEMPLATE_IDS`, `TemplateId`, `TemplateGraph`                                                                                | Constantes y tipos                    | Galería y ejemplos del prompt, ver [plantillas.md](plantillas.md)                                                                            |
| `NODE_CATALOG`, `getNodeDefinition`                                                                                                                    | Constante y función                   | Paleta, iconos, leyenda                                                                                                                      |
| `CONTAINMENT_RULES`                                                                                                                                    | Constante                             | Validación y, en el editor, impedir anidamientos inválidos al arrastrar                                                                      |
| `architectureGraphJsonSchema()`                                                                                                                        | Función                               | Prompt del modelo                                                                                                                            |
| `LIMITS`, `SCHEMA_VERSION`                                                                                                                             | Constantes                            | Límites compartidos                                                                                                                          |

## Importar de otras herramientas

`importMermaid` lee un `flowchart` o `graph` de Mermaid: cada nodo pasa a ser una caja, un círculo (`((…))`), un rombo (`{…}`) o una nota (`>…]`) según su forma; los cilindros, estadios y demás formas, cajas; los `subgraph` son grupos (`boundary`, anidados); las flechas con texto (`-->|texto|`, `-- texto -->`) llevan etiqueta y las punteadas (`-.->`) son asíncronas; `A & B --> C` y las cadenas se expanden. El título sale del bloque `---` inicial. Se ignoran los estilos, las clases y los enlaces. Mermaid no trae posiciones, así que el resultado va sin disposición (`placed: false`) y el editor lo coloca con ELK. Todos los nodos se importan como figuras y grupos, nunca como componentes del catálogo: deducir qué producto es un nodo sería adivinar, y las reglas de diseño dejarían de ser fiables. Los id se adaptan a `IdSchema`, las flechas repetidas, a sí mismas o a un grupo se omiten y se cuentan en `warnings`.

`importDrawio` lee el primer diagrama de un fichero de draw.io, sin comprimir o comprimido (base64, deflate y URL), con un lector de XML mínimo propio porque el paquete no depende del DOM. Las formas `ellipse`, `rhombus`, `shape=note` y `text` pasan a círculo, rombo, nota y texto; el resto, a cajas; las que contienen a otras, a grupos con sus posiciones relativas. Conserva posiciones y tamaños (`placed: true`), el texto (sin HTML) y las flechas punteadas como asíncronas. Los conectores sueltos o atados a un grupo se omiten.

Ambas devuelven `{ success: true, document, placed, warnings }` o `{ success: false, message }`.

## Decisiones de implementación

- Inmutabilidad: ninguna función modifica su entrada. El catálogo está congelado con `Object.freeze`.
- Sin excepciones en la entrada pública: `parseArchitectureGraph` devuelve un resultado discriminado (`success: true | false`). Las excepciones quedan para errores de programación.
- Validación en tres funciones (`checkNodeIds`, `checkEdges`, `checkPlacement`), cada una con una responsabilidad, que se concatenan en `validateGraph`.
- La detección de ciclos de contenedores recorre la cadena de padres desde cada nodo con un mapa de posiciones. El coste es O(n × profundidad), irrelevante con 200 nodos, y el código es más simple que un algoritmo de componentes fuertemente conexas.
- Las rutas de los errores de Zod se convierten a texto con `String` antes de unirlas, porque una clave de tipo `symbol` haría fallar un `join` directo.
- Las conexiones duplicadas se detectan con una clave `JSON.stringify([origen, destino, protocolo])`, que no puede colisionar aunque los ids contengan separadores.
- Importaciones con extensión `.ts` para ejecutarse con Node.js sin compilar (ADR 0003).

## Cómo extender

Añadir un tipo de nodo:

1. Añadirlo a `COMPONENT_KINDS` o `CONTAINER_KINDS` en `kinds.ts`.
2. Añadir su definición en `catalog.ts`. TypeScript obliga a hacerlo: el catálogo usa `satisfies Record<NodeKind, ...>`.
3. Si es contenedor, añadir su regla en `CONTAINMENT_RULES` (también obligatorio por tipos).
4. Actualizar las tablas de `docs/modelo-de-dominio.md`.

Los tests del catálogo comprueban automáticamente que el nuevo tipo tenga etiqueta, descripción, icono válido y categoría coherente.

Añadir un código de validación:

1. Añadirlo a `VALIDATION_CODES`.
2. Emitirlo en la función `check*` correspondiente.
3. Añadir un test que lo provoque y documentarlo en la tabla de códigos.

## Tests

- 219 tests en doce ficheros a fecha de T06; cobertura del 100 % de líneas y funciones y por encima del 99 % de ramas.
- Umbrales mínimos en `vitest.config.ts`: 90 % de líneas, funciones y sentencias y 85 % de ramas. CI falla si se incumplen.
- `parseArchitectureGraph` se prueba con entradas arbitrarias (`null`, números, arrays) para garantizar que nunca lanza.
