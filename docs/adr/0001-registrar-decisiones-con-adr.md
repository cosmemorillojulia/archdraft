# ADR 0001: Registrar las decisiones de arquitectura con ADR

- Estado: aceptada
- Fecha: 2026-10-20

## Contexto

El proyecto se construye de forma incremental, una tarea del roadmap cada vez. Sin un registro, las razones de cada elección se pierden y, meses después, es imposible distinguir una decisión deliberada de un accidente. Además, el proyecto se usará como portfolio: en una entrevista hay que poder explicar por qué se eligió cada pieza y qué se descartó.

## Decisión

Cada decisión con alternativas razonables se documenta como un Architecture Decision Record (formato de Michael Nygard, adaptado) en `docs/adr/`, numerado de forma secuencial. La plantilla es `0000-plantilla.md`.

Reglas:

- Un ADR aceptado no se edita salvo para corregir erratas o cambiar su estado. Para cambiar una decisión se escribe uno nuevo que sustituye al anterior, y el antiguo pasa a estado sustituida.
- Cada ADR incluye una sección Revisar si con las condiciones que justificarían reabrirlo.
- Las decisiones menores, sin alternativas reales, se documentan en la página del módulo correspondiente, no en un ADR.

## Alternativas consideradas

- Documentar decisiones solo en los mensajes de commit: se pierden entre cientos de commits y no recogen alternativas.
- Un único documento de diseño que se reescribe: oculta la evolución y cuándo cambió cada cosa.

## Consecuencias

- Positivas: trazabilidad, onboarding más rápido y material directo para explicar el proyecto.
- Negativas: coste de escritura por decisión, asumible si se limita a decisiones con alternativas reales.

## Revisar si

El volumen de ADR crece tanto que deja de leerse; entonces conviene agruparlos por área.
