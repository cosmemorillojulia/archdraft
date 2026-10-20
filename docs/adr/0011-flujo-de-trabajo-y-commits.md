# ADR 0011: Una rama por tarea del roadmap integrada con merge --no-ff

- Estado: aceptada
- Fecha: 2026-10-20

## Contexto

El proyecto avanza en iteraciones cortas, cada una centrada en una tarea del roadmap. Hay una sola persona responsable del repositorio. El historial tiene que ser legible y mostrar qué commits forman parte de cada funcionalidad.

## Decisión

- Cada tarea del roadmap se desarrolla en su propia rama, nombrada `<tipo>/tNN-<slug>`, por ejemplo `feat/t02-lint-engine`.
- Dentro de la rama, commits pequeños y atómicos con Conventional Commits en inglés: `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `build:`, `ci:`, `chore:`, `perf:`, con ámbito opcional (`feat(core): ...`). Detalles en CONTRIBUTING.md.
- Antes de integrar: pasada de simplificación y revisión de código sobre el diff completo de la rama, y `pnpm check` en verde.
- La rama se integra en `main` siempre con `git merge --no-ff`, y el commit de merge sigue la misma convención, con el identificador de la tarea: `feat: add design lint engine (T02)`. Después se borra la rama.
- Si CI falla en `main`, la siguiente iteración empieza por arreglarlo, en una rama `fix/...`, antes de cualquier tarea nueva.
- Versionado semántico: `0.x` durante el desarrollo; `1.0.0` al cerrar la última tarea del roadmap.

## Alternativas consideradas

- Commits directos a `main` sin ramas: historial lineal, pero se pierde la agrupación de commits por funcionalidad.
- Merge con fast-forward o squash: el fast-forward borra la frontera de la funcionalidad; el squash la conserva pero destruye los commits atómicos intermedios.
- Pull requests con revisión obligatoria: útiles con varias personas; con un único responsable añaden fricción sin un revisor real. Se pueden activar más adelante sin cambiar el nombre de las ramas.
- Git Flow con `develop` y `release`: excesivo para una aplicación desplegada de forma continua.

## Consecuencias

- Positivas: `git log --first-parent main` muestra una línea por tarea; cada funcionalidad se puede revertir de una vez revirtiendo su merge.
- Negativas: más commits de merge en el historial. Un error que pase las comprobaciones locales llega a `main` antes de que CI lo detecte; se mitiga con la regla de arreglar CI primero.

## Revisar si

Entran más colaboradores o se quiere revisar cada tarea antes de integrarla; entonces se pasa a pull requests con protección de rama.
