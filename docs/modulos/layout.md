# Módulo: packages/layout

Calcula posiciones y tamaños legibles para un `ArchitectureGraph` con ELK.js (ADR 0007). Es una librería pura: no usa DOM ni red, así que se ejecuta igual en Node.js y dentro del Web Worker del editor (T08).

## API pública

| Export                                          | Uso                                                                  |
| ----------------------------------------------- | -------------------------------------------------------------------- |
| `computeLayout(graph, { direction?, pinned? })` | Devuelve una promesa con un `DiagramLayout`                          |
| `LAYOUT_DIRECTIONS`, `LayoutDirection`          | `LR` (por defecto), `TB`, `RL`, `BT`: los mismos valores que Mermaid |
| `NODE_SPACING`, `CONTAINER_PADDING`             | Separación entre hermanos y relleno de los contenedores              |
| `ComputeLayoutOptions`                          | Tipo de las opciones                                                 |

Los tipos `DiagramLayout` y `DiagramDocument`, sus esquemas y los tamaños por defecto (`DEFAULT_NODE_SIZE`, 180 × 64 para componentes; `DEFAULT_CONTAINER_SIZE`, 240 × 140 para contenedores vacíos) viven en `@archdraft/core` (`document.ts`), porque el editor los guarda, los comparte en la URL y los valida como cualquier entrada no confiable sin necesitar ELK, y la exportación a draw.io usa los mismos tamaños cuando falta una entrada.

## Formato del resultado

```ts
{
  positions: { [nodeId]: { x, y } },        // esquina superior izquierda, relativa al contenedor padre
  sizes: { [nodeId]: { width, height } },
}
```

Las posiciones de un nodo dentro de un contenedor son relativas a ese contenedor, que es la convención de los subflujos de React Flow; las de los nodos raíz son absolutas. Los valores se redondean a enteros para que el resultado sea estable al serializarlo.

## Opciones de ELK elegidas

| Opción                                      | Valor               | Motivo                                                                                                              |
| ------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `elk.algorithm`                             | `layered`           | Sugiyama por capas: el tráfico fluye en una dirección, que es como se leen los diagramas de arquitectura            |
| `elk.hierarchyHandling`                     | `INCLUDE_CHILDREN`  | Dispone los contenedores y su contenido a la vez, de modo que las aristas que cruzan contenedores ordenan las capas |
| `elk.edgeRouting`                           | `ORTHOGONAL`        | Aristas en ángulo recto; deja el hueco que necesitará el lienzo para dibujarlas así                                 |
| `elk.direction`                             | según `direction`   | `LR` → `RIGHT`, `TB` → `DOWN`, `RL` → `LEFT`, `BT` → `UP`                                                           |
| `elk.spacing.nodeNode`                      | 40                  | Separación entre nodos de la misma capa                                                                             |
| `elk.layered.spacing.nodeNodeBetweenLayers` | 80                  | Espacio entre capas para las etiquetas de protocolo                                                                 |
| `elk.layered.considerModelOrder.strategy`   | `NODES_AND_EDGES`   | Respeta el orden del grafo cuando no empeora los cruces: el resultado se parece a cómo se escribió el diagrama      |
| `elk.randomSeed`                            | 1                   | Fija la semilla para que la disposición sea determinista                                                            |
| `elk.padding` en contenedores               | arriba 48, resto 24 | La franja superior deja sitio a la cabecera con el nombre del contenedor                                            |

Los contenedores con hijos no reciben tamaño: ELK lo calcula a partir de su contenido. Los contenedores vacíos y los componentes usan el tamaño conocido si `pinned.sizes` lo trae (el editor podrá pasar el tamaño medido de cada nodo) y, si no, el tamaño por defecto.

Se usa `elkjs/lib/elk.bundled.js`, que incluye el motor y no crea un worker propio: el editor ya ejecutará `computeLayout` dentro de su Web Worker, y así el mismo código funciona en los tests de Node.js. La licencia de elkjs es EPL-2.0 o GPL-3.0 a elección; usarlo como dependencia sin modificarlo es compatible con la licencia MIT del proyecto.

## Posiciones fijadas

`pinned` es una disposición anterior. Sirve para recolocar solo lo nuevo, por ejemplo tras aplicar un parche de la IA (T18) o al añadir un nodo:

1. Se calcula la disposición completa con ELK, como si no hubiera nada fijado.
2. Los nodos con posición en `pinned` la conservan, igual que su tamaño si lo trae.
3. Cada nodo nuevo parte de su posición en la disposición completa y, si choca con un hermano ya colocado (con `NODE_SPACING` de margen), se desplaza en el eje transversal al flujo, hacia abajo en `LR` y `RL` y hacia la derecha en `TB` y `BT`, hasta quedar libre.
4. Los contenedores crecen para abarcar a sus hijos, nunca encogen. Se procesan los hijos antes que el contenedor para conocer su tamaño final antes de colocarlo.

Las entradas de `pinned` de nodos que ya no existen se ignoran. Si no hay ninguna posición fijada de un nodo existente, el resultado es exactamente la disposición completa.

Alternativas descartadas:

- Modo interactivo de ELK (`interactiveLayout` y estrategias semiinteractivas): usa las posiciones previas como pista para ordenar, pero no garantiza que un nodo fijado no se mueva, que es justo lo que el usuario espera tras colocarlo a mano.
- Disponer solo los nodos nuevos en un grafo aparte: pierde la relación con sus vecinos ya colocados y no resuelve dónde poner el bloque resultante.

Limitación conocida: si un contenedor fijado crece, puede llegar a solapar a un hermano también fijado. No se mueve ninguno de los dos porque ambos los colocó el usuario; el editor podrá ofrecer volver a disponer el diagrama completo.

## Entrada no válida

`computeLayout` espera un grafo válido. Aun así no falla con uno inválido: usa `indexGraph`, deja fuera los nodos atrapados en un ciclo de contenedores (no cuelgan de ninguna raíz) y descarta las aristas cuyos extremos no se han incluido.

## Tests

- Grafo vacío, tamaños por defecto y conocidos, resultado válido según `DiagramLayoutSchema`.
- Sin solapes entre hermanos e hijos dentro de los límites del padre, con contenedores anidados en tres niveles y un contenedor vacío.
- Determinismo, inmutabilidad de la entrada y las cuatro direcciones.
- 200 nodos en 20 redes con aristas dentro y entre redes en menos de 2 s y sin solapes (unos 400 ms en el entorno de desarrollo).
- Ids que coinciden con miembros de `Object.prototype` (`constructor`, `toString`), que no deben leerse como tamaños ni posiciones heredados.
- Posiciones fijadas: se conservan, los nodos nuevos no chocan, desplazamiento en ambos ejes, crecimiento de contenedores, contenedor fijado que no encoge y entradas obsoletas ignoradas.
