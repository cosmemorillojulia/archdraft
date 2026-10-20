# ADR 0012: Severidad por hallazgo con un valor por defecto por regla

- Estado: aceptada
- Fecha: 2026-10-20

## Contexto

El motor de reglas de diseño (T02) clasifica cada hallazgo por gravedad para ordenar el panel de revisión y para que las plantillas puedan exigir "sin errores". Hay dos fuerzas en tensión:

- Una misma regla detecta situaciones de gravedad distinta. `database-single-az` puede saber que la base de datos está en una sola zona (`multiAz: false`) o no saberlo (atributo ausente). El modelo de dominio prohíbe tratar lo desconocido como falso.
- La interfaz necesita un vocabulario pequeño y estable, y el usuario debe poder entender de un vistazo qué hallazgos son defectos y cuáles solo piden información.

## Decisión

Tres severidades: `error`, `warning` e `info`. Cada regla declara una severidad por defecto, que es la de su caso principal, y cada hallazgo puede llevar otra. El motor completa la severidad por defecto cuando la regla no la fija. `info` se reserva para "falta información o conviene revisar", nunca para afirmar un defecto.

La configuración del usuario se limita a desactivar reglas completas (`disabledRules`). No se pueden cambiar severidades.

## Alternativas consideradas

- Severidad fija por regla: obliga a partir reglas como `database-single-az` en dos (valor falso y valor desconocido), duplicando la lógica y la documentación, o a elegir una severidad que es incorrecta en uno de los dos casos.
- Cuatro niveles o más (por ejemplo, añadir `critical`): no hay ninguna regla que lo necesite y complica la interfaz y los criterios de aceptación.
- Severidades configurables por el usuario: útil en herramientas de lint de código con equipos que comparten configuración; aquí el usuario edita un diagrama suelto y desactivar una regla cubre el caso real. Se puede añadir sin romper nada si aparece la necesidad.
- Puntuación numérica de riesgo: más fina, pero difícil de justificar regla a regla y de explicar al usuario.

## Consecuencias

- Positivas: una regla por concepto de diseño; el valor desconocido se trata de forma honesta; la interfaz muestra tres grupos claros.
- Negativas: la severidad por defecto de una regla no basta para saber la de todos sus hallazgos; la documentación de cada regla debe indicar cuándo se rebaja.

## Revisar si

Aparecen usuarios que necesitan políticas propias (por ejemplo, tratar `unencrypted-data` como error por cumplimiento normativo); entonces se añaden sobrescrituras de severidad en `LintOptions`.
