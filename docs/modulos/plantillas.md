# Módulo: plantillas de arquitectura

Vive en `packages/core/src/templates/`. Son seis arquitecturas de referencia escritas a mano con dos usos:

- La galería del editor (T23) y el diagrama que se carga por defecto (T08).
- Los ejemplos del prompt de generación (few-shot, T15): el modelo aprende el formato y el nivel de detalle esperado viendo grafos completos y correctos.

Por eso cada plantilla tiene que ser a la vez realista, válida y una buena arquitectura según el motor de reglas.

## Estructura

```
packages/core/src/templates/
  index.ts                        # TEMPLATE_IDS, ARCHITECTURE_TEMPLATES, TemplateGraph
  three-tier-web.ts
  serverless-api.ts
  event-driven-microservices.ts
  rag-chatbot.ts
  analytics-pipeline.ts
  static-site-cms.ts
```

Una plantilla por fichero: cada una ocupa entre 60 y 140 líneas y así se revisan por separado.

## API pública

| Export                   | Tipo      | Uso                                                                               |
| ------------------------ | --------- | --------------------------------------------------------------------------------- |
| `TEMPLATE_IDS`           | Constante | Ids en el orden de la galería                                                     |
| `TemplateId`             | Tipo      | Unión de los ids                                                                  |
| `ARCHITECTURE_TEMPLATES` | Constante | Grafo de cada plantilla por id, congelado en profundidad                          |
| `TemplateGraph`          | Tipo      | `ArchitectureGraph` con `description` obligatoria, que la galería siempre muestra |

El título, la descripción y el proveedor de cada plantilla son los del propio grafo (`title`, `description`, `provider`). No hay metadatos aparte que puedan desincronizarse: lo que se ve en la galería es lo que se carga en el lienzo y lo que recibe el modelo.

## Las seis plantillas

| Id                           | Título                                      | Proveedor | Nodos | Contenedores | Aristas | JSON compacto |
| ---------------------------- | ------------------------------------------- | --------- | ----- | ------------ | ------- | ------------- |
| `three-tier-web`             | Three-tier web application                  | AWS       | 15    | 5            | 8       | 2,4 KB        |
| `serverless-api`             | Serverless REST API                         | AWS       | 11    | 1            | 9       | 2,1 KB        |
| `event-driven-microservices` | Event-driven microservices                  | GCP       | 14    | 3            | 10      | 2,6 KB        |
| `rag-chatbot`                | Chatbot with retrieval-augmented generation | Azure     | 13    | 3            | 11      | 2,8 KB        |
| `analytics-pipeline`         | Analytics data pipeline                     | GCP       | 15    | 3            | 12      | 3,1 KB        |
| `static-site-cms`            | Static website with a headless CMS          | Genérico  | 9     | 0            | 10      | 1,8 KB        |

El tamaño es el de `toJson` sin sangría, medido el 2026-10-24; da una idea de lo que cuesta incluir una plantilla como ejemplo en el prompt.

Qué muestra cada una del modelo de dominio:

| Plantilla                    | Elementos del modelo que ejercita                                                                                                                                                |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `three-tier-web`             | Anidamiento región, red y subredes (una por capa); `service` para fijar el producto (Aurora, Application Load Balancer); servicios transversales sin aristas dentro de la región |
| `serverless-api`             | Solo servicios gestionados; aristas asíncronas sin protocolo marcadas con `mode`; cola de mensajes fallidos; validación de tokens contra el proveedor de identidad               |
| `event-driven-microservices` | Un `boundary` por dominio con su propia base de datos; un tema que reparte eventos a dos consumidores; sistemas externos con `provider: generic`                                 |
| `rag-chatbot`                | Dos flujos en `boundary` dentro de la región (ingesta y respuesta) que comparten el índice vectorial y los modelos; dos nodos `llm` con papeles distintos                        |
| `analytics-pipeline`         | Ingesta en tiempo real y por lotes; almacén a almacén (el data warehouse consulta el data lake); productos concretos con `service` (Dataflow, Dataform)                          |
| `static-site-cms`            | Proveedor genérico sin productos; dos actores; un webhook HTTPS marcado como `async`, que crea un bucle CMS y build que no es síncrono                                           |

Entre todas cubren los cuatro proveedores, para que los ejemplos del prompt no sesguen al modelo hacia una nube, y todas las categorías del catálogo.

## Validación y revisión de diseño

Criterio de aceptación de T06: pasan `parseArchitectureGraph` sin avisos y `lintGraph` sin errores, con los avisos restantes justificados. El resultado es más estricto: ninguna plantilla produce hallazgos de ninguna severidad, ni `info`. No hay avisos que justificar.

Para conseguirlo sin forzar el diseño, las plantillas declaran los atributos de los que dependen las reglas en lugar de dejarlos desconocidos:

| Regla que podría dispararse | Cómo la evitan las plantillas                                                                                                                                            |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `single-point-of-failure`   | Los `service` que reciben tráfico síncrono declaran `autoscaling: true`; los trabajos por lotes solo reciben aristas asíncronas o ninguna; las funciones están excluidas |
| `database-single-az`        | Las bases de datos relacionales y las cachés declaran `multiAz: true`                                                                                                    |
| `unprotected-entry`         | Los clientes entran siempre por CDN, balanceador o API gateway                                                                                                           |
| `public-database`           | Ningún cliente llama a un almacén; el almacenamiento de objetos que sirve una CDN declara `publiclyAccessible: false`                                                    |
| `sync-chain-too-long`       | El camino síncrono más largo desde un actor tiene cuatro saltos (`three-tier-web`: usuario, CDN, balanceador, aplicación y base de datos)                                |
| `orphan-component`          | Solo quedan sin aristas los nodos `monitoring`, que la regla excluye por ser transversales                                                                               |

Declarar los atributos tiene además valor didáctico para el few-shot: el modelo ve cómo se expresan alta disponibilidad, cifrado y exposición pública.

Los tests lo comprueban con igualdad exacta: el resultado de `parseArchitectureGraph` es el propio grafo con la lista de avisos vacía, de modo que la plantilla ya está normalizada (sin espacios que recortar ni propiedades desconocidas), y `lintGraph` devuelve una lista vacía. Una regla nueva que dispare sobre una plantilla hará fallar el test, y habrá que corregir la plantilla o justificar el hallazgo aquí.

En `packages/layout` otro test calcula la disposición de las seis y comprueba que no hay solapes entre hermanos y que cada hijo queda dentro de su contenedor, que es el criterio del lienzo en T08. Además, las seis se exportaron a Mermaid y se renderizaron con `mmdc` para revisarlas a ojo antes de integrarlas.

## Decisiones

- Datos congelados en lugar de funciones que construyen el grafo. Las plantillas se leen mucho más de lo que se modifican (galería, prompt, tests), y el editor trata el documento como inmutable. Como son estado compartido del módulo, se congelan en profundidad con `Object.freeze`: una mutación accidental lanza `TypeError` en lugar de corromper la plantilla para el siguiente lector. Quien necesite modificar una copia en el sitio usa `structuredClone`.
- El tipo se comprueba con `satisfies ArchitectureGraph` en cada fichero y el conjunto con `satisfies Record<TemplateId, TemplateGraph>`: TypeScript obliga a que cada id tenga su plantilla y a que cada plantilla tenga descripción.
- Textos en inglés, como la interfaz (ADR 0009). Si la interfaz se traduce, los títulos y descripciones de la galería tendrán que pasar por las cadenas centralizadas; los grafos que recibe el modelo pueden seguir en inglés.
- Los productos de cada nodo salen del catálogo salvo cuando la plantilla quiere mostrar uno concreto con `service`. Así una revisión del catálogo actualiza también las plantillas.

## Cómo añadir una plantilla

1. Crear `src/templates/<id>.ts` con el grafo y `satisfies ArchitectureGraph`.
2. Añadir el id a `TEMPLATE_IDS` en la posición de la galería y el grafo al mapa de `index.ts`.
3. Ejecutar los tests: la plantilla debe ser válida sin avisos, sin hallazgos de diseño y disponerse sin solapes.
4. Añadirla a las tablas de esta página.
