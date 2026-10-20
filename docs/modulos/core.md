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
    lint/           # motor de reglas de diseño, ver modulos/lint.md
  test/
    fixtures.ts     # grafo de ejemplo: tienda online de tres capas en AWS
    *.test.ts
```

## API pública

| Export                                                        | Tipo                 | Uso                                                                     |
| ------------------------------------------------------------- | -------------------- | ----------------------------------------------------------------------- |
| `ArchitectureGraphSchema`, `ArchNodeSchema`, `ArchEdgeSchema` | Esquemas Zod         | Validar o componer esquemas                                             |
| `ArchitectureGraph`, `ArchNode`, `ArchEdge`, `NodeAttributes` | Tipos                | Tipar el resto del sistema                                              |
| `createEmptyGraph(title, provider?)`                          | Función              | Documento nuevo                                                         |
| `parseArchitectureGraph(input)`                               | Función              | Única entrada para datos no confiables                                  |
| `validateGraph(graph)`                                        | Función              | Revalidar tras una modificación                                         |
| `indexGraph(graph)`                                           | Función              | Consultas eficientes sobre el grafo                                     |
| `getAncestors`, `getDescendants`                              | Funciones            | Recorrer contenedores                                                   |
| `resolveProvider`, `resolveServiceName`                       | Funciones            | Etiquetas y exportaciones                                               |
| `resolveEdgeMode`                                             | Función              | Modo efectivo de una arista cuando `mode` no está informado             |
| `lintGraph`, `LINT_RULES`, `LINT_RULE_IDS`                    | Función y constantes | Revisión de diseño, ver [lint.md](lint.md)                              |
| `NODE_CATALOG`, `getNodeDefinition`                           | Constante y función  | Paleta, iconos, leyenda                                                 |
| `CONTAINMENT_RULES`                                           | Constante            | Validación y, en el editor, impedir anidamientos inválidos al arrastrar |
| `architectureGraphJsonSchema()`                               | Función              | Prompt del modelo                                                       |
| `LIMITS`, `SCHEMA_VERSION`                                    | Constantes           | Límites compartidos                                                     |

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

- 128 tests en seis ficheros; cobertura del 100 % de líneas, ramas y funciones a fecha de T02.
- Umbrales mínimos en `vitest.config.ts`: 90 % de líneas, funciones y sentencias y 85 % de ramas. CI falla si se incumplen.
- `parseArchitectureGraph` se prueba con entradas arbitrarias (`null`, números, arrays) para garantizar que nunca lanza.
