# Banco de evaluación

El banco mide con números la calidad del agente: si responde con un diagrama válido, si pone los componentes y las conexiones que se le piden, si evita lo que no debe y si cada tarea cumple su objetivo. Sirve para comparar modelos y para saber si un cambio de prompt mejora o empeora las respuestas (ADR 0010, ADR 0024).

Vive en `backend/evals/` y llama al mismo `assist` que la API, así que lo que se mide es lo que se despliega.

## Uso

```sh
make eval                                              # el modelo de .env.secrets
pnpm --filter @archdraft/api eval --provider ideal  # un modelo falso con las respuestas ideales
pnpm --filter @archdraft/api eval --cases edit-,improve- --pause 20
```

| Opción               | Qué hace                                                                                                                                                                                      |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--provider env`     | El proveedor compatible con OpenAI de `LLM_BASE_URL`, `LLM_API_KEY` y `LLM_MODEL`, como `make api`: valen las variables del shell, luego `.env.secrets` y luego `.env.defaults`. Por defecto. |
| `--provider ideal`   | Un modelo falso que da a cada caso la respuesta ideal, construida a partir de lo que el caso espera. No hace falta clave.                                                                     |
| `--cases <texto>`    | Solo los casos cuyo id contiene alguno de los textos, separados por comas.                                                                                                                    |
| `--pause <segundos>` | Pausa entre casos, para no agotar el límite por minuto de un plan gratuito.                                                                                                                   |
| `--out <carpeta>`    | Dónde se escriben los informes. Por defecto `backend/evals/reports/`, que git ignora.                                                                                                         |

Cada ejecución escribe dos ficheros con la fecha y el modelo en el nombre: un JSON con todas las medidas de cada caso y los resúmenes, y un Markdown con una tabla por tarea y por idioma y la lista de casos con problemas. Los casos se piden uno detrás de otro. Si el proveedor limita la cuota, se espera lo que indica `Retry-After` (60 s si no lo indica, como mucho 120 s) y se vuelve a pedir hasta dos veces; después el caso cuenta como fallido y se sigue con el siguiente.

Workers AI no está disponible desde la línea de comandos, porque solo se alcanza con el binding de un Worker. Con Groq gratis, que limita a unos 8.000 tokens por minuto, conviene `--pause 20` o más: una ejecución completa tarda entonces del orden de un cuarto de hora.

## Casos

`backend/evals/cases.ts` tiene 32 casos, 16 en español y 16 en inglés:

| Tarea      | Casos | Sobre qué                                                                                                             |
| ---------- | ----- | --------------------------------------------------------------------------------------------------------------------- |
| `generate` | 20    | Descripciones de sistemas habituales, una ambigua, una mínima y una que pide algo inseguro                            |
| `edit`     | 4     | Añadir una caché o un WAF a una plantilla, o quitar una conexión                                                      |
| `improve`  | 3     | Dos plantillas con un riesgo añadido (base de datos expuesta, entrada sin proteger) y una plantilla sin hallazgos     |
| `simplify` | 2     | Dos plantillas con piezas de más (un bus de eventos sin consumidores, un clúster de Kubernetes para una web estática) |
| `extend`   | 3     | Plantillas a las que les falta monitorización o un gestor de secretos                                                 |

Un caso no tiene un diagrama de referencia: dice qué debe tener una buena respuesta, por tipos de componente, para que cualquier diseño razonable apruebe.

- `required`: tipos que el diseño debe tener.
- `optional`: tipos que puede tener sin penalización. Los actores (`user`, `web-client`, `mobile-client`) se admiten siempre.
- `connections`: pares de tipos que deben estar unidos por un camino de conexiones en ese sentido. Un camino, y no una conexión directa, porque entre una CDN y un servicio puede haber un balanceador sin que el diseño sea peor.
- `forbidden`: tipos que no debe tener y pares que no deben estar unidos directamente, como un cliente que llama a la base de datos.

Los casos sobre un diagrama parten de una copia de una plantilla, a veces con un cambio para darle algo que arreglar. Un id nuevo es un caso nuevo: los informes se comparan por id, así que un caso no se cambia de sentido sin cambiarle el id.

## Métricas

Por caso, sobre la primera propuesta de la respuesta:

| Métrica                     | Qué mide                                                                                                                                                                                                                                              |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Válido                      | El agente devolvió una respuesta que cumple el contrato. Si no (respuesta inválida tras los reintentos, tiempo agotado, cuota, error), el caso no tiene medidas de calidad y no cumple el objetivo; el JSON guarda el tipo de fallo y su descripción. |
| Precisión de tipos          | De los tipos que trae la respuesta, los que el caso espera (obligatorios u opcionales). En una tarea sobre un diagrama solo cuentan los tipos que la respuesta añade.                                                                                 |
| Exhaustividad de tipos      | De los tipos obligatorios, los que tiene.                                                                                                                                                                                                             |
| F1 de tipos                 | Media armónica de las dos.                                                                                                                                                                                                                            |
| Exhaustividad de conexiones | De los pares obligatorios, los que tienen camino. Sin pares, no se mide.                                                                                                                                                                              |
| Prohibidos                  | Tipos y conexiones directas prohibidos que tiene.                                                                                                                                                                                                     |
| Errores y avisos            | Hallazgos de `lintGraph` con severidad `error` y `warning`.                                                                                                                                                                                           |
| Ids conservados             | En una tarea sobre un diagrama: de los componentes de un tipo que ya estaba, los que llevan un id del diagrama.                                                                                                                                       |
| Intentos y latencia         | Llamadas al modelo, reparaciones incluidas, y tiempo de la respuesta del agente, sin las esperas por la cuota.                                                                                                                                        |
| Objetivo                    | Ver abajo.                                                                                                                                                                                                                                            |

El objetivo depende de la tarea:

- `generate` y `edit`: tiene todos los tipos y conexiones obligatorios y nada prohibido.
- `improve`: si el diagrama tenía riesgos (hallazgos `error` o `warning`), alguna propuesta tiene menos; si no tenía, ninguna propuesta añade alguno.
- `simplify`: menos componentes que el diagrama, con lo obligatorio y sin lo prohibido.
- `extend`: más componentes que el diagrama, con lo obligatorio y sin lo prohibido.

Los resúmenes (todos los casos, cada tarea, cada idioma) dan la proporción de casos válidos y de objetivos cumplidos sobre todos los casos, y las medias de calidad solo sobre los válidos. La latencia se resume con la media, la mediana y el percentil 95.

## Comprobación del banco

Los tests de `backend/test/evals.test.ts` prueban el puntuador, que es puro, y el ejecutor con proveedores falsos. Además pasan el banco entero con el modelo ideal y exigen la nota máxima en todo. Así se comprueba que ningún caso es imposible ni contradictorio (por ejemplo, que no prohíbe lo que pide) y que las respuestas ideales pasan la validación y la revisión del agente sin reintentos.

## Limitaciones

- Las métricas son estructurales: no dicen si las etiquetas son buenas, si la explicación es correcta ni si el diagrama se entiende. Un diseño puede aprobar y ser mediocre.
- Los tipos admiten varias lecturas. Un worker puede ser `function`, `service` o `batch-job`, y una base de datos de historial, relacional o NoSQL. Los prompts nombran los tipos cuando importan, y lo demás va en `optional`; aun así, algún fallo será de la lectura del caso, no del modelo.
- Las conexiones son dirigidas: un modelo que dibuja que la función lee de la cola, en lugar de que la cola dispara la función, no tiene el camino. Por eso los pares evitan los sentidos discutibles.
- En `improve` solo se mide la primera propuesta, salvo el objetivo, que mira todas.
- Los modelos no son deterministas. Una diferencia pequeña entre dos ejecuciones no es significativa; con 32 casos, un caso son unos tres puntos.
- Con un plan gratuito, la cuota del día limita cuántas ejecuciones completas caben.

## Pendiente

- T17: ejecución periódica y bajo demanda en CI con un secreto de Groq, y elección del modelo con estos datos.
