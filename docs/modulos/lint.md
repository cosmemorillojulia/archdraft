# Módulo: motor de reglas de diseño

Vive en `packages/core/src/lint/`. Recibe un grafo estructuralmente válido y devuelve hallazgos de diseño: riesgos de disponibilidad, seguridad o acoplamiento, cada uno con explicación y sugerencia. No modifica el grafo ni hace E/S.

La validación estructural (`validateGraph`) responde a "¿se puede confiar en estos datos?"; el motor de reglas responde a "¿es una buena arquitectura?". Un grafo inválido se rechaza antes de llegar aquí.

## Estructura

```
packages/core/src/lint/
  types.ts        # LintRule, LintFinding, severidades e ids de regla
  rules.ts        # las ocho reglas y LINT_RULES
  sync-paths.ts   # recorridos del subgrafo síncrono: cadenas largas y ciclos
  lint-graph.ts   # lintGraph: ejecuta las reglas y ordena los hallazgos
  index.ts        # API pública del módulo
```

## API pública

| Export                        | Tipo      | Uso                                                                                                  |
| ----------------------------- | --------- | ---------------------------------------------------------------------------------------------------- |
| `lintGraph(graph, options?)`  | Función   | Ejecuta las reglas activas. `options.disabledRules` desactiva reglas                                 |
| `LINT_RULES`                  | Constante | Reglas con título y descripción; el panel de revisión del editor (T10, [web.md](web.md)) las muestra |
| `LINT_RULE_IDS`, `LintRuleId` | Constante | Ids válidos, para guardar preferencias de reglas desactivadas                                        |
| `LINT_SEVERITIES`             | Constante | `error`, `warning`, `info`, de mayor a menor                                                         |
| `LintFinding`, `LintRule`     | Tipos     | Hallazgo: `ruleId`, `severity`, `message`, `nodeIds`, `edgeIds`, etc.                                |
| `MAX_SYNC_HOPS`               | Constante | Saltos síncronos máximos desde un cliente (4)                                                        |
| `resolveEdgeMode(edge)`       | Función   | En `graph.ts`. Modo efectivo de una arista, ver más abajo                                            |

`lintGraph` devuelve los hallazgos ordenados por severidad (primero `error`). Dentro de una severidad se mantiene el orden de `LINT_RULES` y, dentro de cada regla, el orden en que la regla los produce, así que la salida es determinista.

## Severidades

| Severidad | Significado                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `error`   | Defecto que hay que corregir antes de dar el diseño por bueno                 |
| `warning` | Riesgo probable que conviene corregir                                         |
| `info`    | Falta información o hay un punto que revisar; no afirma que exista un defecto |

Cada regla declara una severidad por defecto y puede emitir un hallazgo concreto con otra. El caso típico es un atributo sin informar: la regla no puede afirmar el defecto y lo rebaja a `info`. La decisión y sus alternativas están en [ADR 0012](../adr/0012-severidad-por-hallazgo.md).

## Reglas

| Regla                     | Por defecto | Se dispara cuando                                                                                                  | Justificación                                                                                        |
| ------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `sync-cycle`              | `error`     | Hay componentes que se llaman entre sí en bucle solo con aristas síncronas                                         | Riesgo de bloqueo, reintentos infinitos y fallos en cadena; impide desplegar las partes por separado |
| `public-database`         | `error`     | Un almacén de datos tiene `publiclyAccessible: true` o recibe una arista directa desde un actor o cliente          | Se salta la capa que aplica autorización y validación                                                |
| `single-point-of-failure` | `warning`   | Un componente de cómputo recibe tráfico síncrono con `replicas: 1` y sin `autoscaling`. `info` si `replicas` falta | Un fallo o un redespliegue de la única instancia corta todo el camino de la petición                 |
| `unprotected-entry`       | `warning`   | Un actor o cliente llama directamente a un componente de cómputo                                                   | Sin balanceador, API gateway ni CDN no hay terminación TLS, limitación de tráfico ni conmutación     |
| `database-single-az`      | `warning`   | Una base de datos relacional o una caché tiene `multiAz: false`. `info` si `multiAz` falta                         | La caída de una zona deja sin datos y puede perder escrituras recientes                              |
| `unencrypted-data`        | `warning`   | Un almacén de datos tiene `encryptedAtRest: false`                                                                 | Exposición por instantáneas, copias o discos y falta de cumplimiento normativo                       |
| `sync-chain-too-long`     | `warning`   | Desde un actor sale un camino síncrono de más de `MAX_SYNC_HOPS` (4) saltos                                        | Cada salto suma latencia y multiplica la probabilidad de fallo                                       |
| `orphan-component`        | `info`      | Un componente no tiene aristas, salvo `monitoring`, `secrets-manager` e `identity-provider`                        | O sobra o faltan las interacciones que explican su papel                                             |

`LINT_RULES` está ordenado de forma que, a igualdad de severidad, lo más grave aparece antes.

### Detalles de cada regla

- `single-point-of-failure` excluye `function`, porque una función serverless escala por petición y el número de réplicas no aplica, y los componentes con `managed: true`, cuya disponibilidad la garantiza el proveedor. Solo cuenta el tráfico síncrono: un worker que consume de una cola puede reiniciarse sin que el cliente lo note.
- `public-database` informa un hallazgo por almacén, con los dos motivos si se dan a la vez, e incluye en `nodeIds` los clientes que lo llaman.
- `unprotected-entry` informa un hallazgo por arista, para que el editor pueda resaltar la conexión concreta.
- `sync-chain-too-long` informa como mucho un hallazgo por actor, con el primer camino encontrado de `MAX_SYNC_HOPS + 1` saltos. El mensaje dice "al menos" porque el camino real puede ser más largo. Los caminos son simples (sin repetir nodos), así que un ciclo no infla la longitud; los ciclos tienen su propia regla.
- `sync-cycle` informa un hallazgo por componente fuertemente conexo del subgrafo síncrono, con todos sus nodos y aristas internas. Varios bucles que comparten nodos se informan una sola vez.
- `orphan-component` excluye los servicios transversales porque se suelen dibujar sin aristas para no enmarañar el diagrama.

## Valores desconocidos

Siguiendo el [modelo de dominio](../modelo-de-dominio.md#atributos-operativos), un atributo ausente es desconocido. Las reglas solo afirman un defecto a partir de un valor explícito:

- `encryptedAtRest` ausente no dispara `unencrypted-data`.
- `multiAz` o `replicas` ausentes producen un `info` que pide informarlos, no un `warning`.

## Modo efectivo de una arista

`mode` es opcional en el esquema. `resolveEdgeMode(edge)` decide:

1. `mode`, si está informado.
2. `async` si el protocolo es de mensajería: `amqp`, `kafka` o `event`.
3. `sync` en cualquier otro caso, incluida la ausencia de protocolo.

El último punto es una decisión consciente: una flecha sin anotar en un diagrama de arquitectura suele significar petición y respuesta. La consecuencia es que `sync-cycle` y `sync-chain-too-long` pueden disparar sobre aristas sin anotar; la sugerencia del hallazgo indica cómo corregirlo, y marcar la arista como `async` lo resuelve si el diagrama estaba incompleto.

## Rendimiento

- Las reglas recorren el índice del grafo una vez por regla: O(n + e).
- `sync-cycle` usa el algoritmo de Tarjan, O(n + e).
- `sync-chain-too-long` hace una búsqueda en profundidad limitada a `MAX_SYNC_HOPS + 1` aristas desde cada actor. El coste está acotado por el número de caminos simples de esa longitud; con los límites del esquema (200 nodos, 400 aristas) es despreciable. Un test lo comprueba con un grafo en los límites.

## Cómo añadir una regla

1. Añadir su id a `LINT_RULE_IDS` en `types.ts`.
2. Definirla en `rules.ts` y añadirla a `LINT_RULES` en la posición que le corresponda por gravedad. Un test comprueba que ids y reglas coinciden.
3. Escribir al menos un test positivo y uno negativo en `test/lint.test.ts`, y revisar el test del fixture de tres capas. Si la regla dispara sobre alguna plantilla, el test de plantillas falla: corregir la plantilla o justificar el hallazgo en [plantillas.md](plantillas.md).
4. Añadirla a la tabla de reglas de esta página.
