# ADR 0009: Inglés en código e interfaz, español en la documentación de diseño

- Estado: aceptada
- Fecha: 2026-10-20

## Contexto

El repositorio es público y sirve de portfolio: lo pueden revisar equipos en España y fuera de ella. Al mismo tiempo, la documentación de diseño tiene que servir para que el autor comprenda y defienda cada decisión, y su idioma nativo es el español.

## Decisión

- En inglés: código, identificadores, comentarios, mensajes de commit, README, CONTRIBUTING, CHANGELOG y la interfaz de usuario.
- En español: todo lo que hay dentro de `docs/` (arquitectura, ADR, roadmap, módulos).
- La interfaz se escribe con las cadenas centralizadas para poder añadir español más adelante sin reescribir componentes.

## Alternativas consideradas

- Todo en inglés: más coherente para una audiencia internacional, pero la documentación profunda pierde su función principal para el autor.
- Todo en español: limita la audiencia del código y es poco habitual en proyectos de código abierto.

## Consecuencias

- Positivas: la cara pública del proyecto es estándar y la documentación es útil para su autor.
- Negativas: un lector que no hable español no puede leer el diseño detallado; el README en inglés resume lo esencial para mitigarlo.

## Revisar si

El proyecto atrae contribuciones externas; entonces conviene traducir al menos la arquitectura y los ADR.
