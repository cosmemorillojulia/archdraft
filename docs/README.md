# Documentación de Archdraft

Orden de lectura recomendado:

1. [Visión y alcance](vision.md): qué problema resuelve, para quién y qué queda fuera.
2. [Arquitectura](arquitectura.md): contexto, contenedores, componentes, flujos y aspectos transversales.
3. [Modelo de dominio](modelo-de-dominio.md): el formato del diagrama, el catálogo y la validación.
4. [Decisiones (ADR)](adr/): por qué se eligió cada pieza y qué se descartó.
5. [Roadmap](roadmap.md): tareas, dependencias, criterios de aceptación y estado.

Referencia:

- [Guía de desarrollo](desarrollo.md): herramientas, configuración, CI y convenciones.
- [Operaciones](operaciones.md): entornos, acciones manuales, límites de los planes gratuitos y secretos.
- Módulos: [core](modulos/core.md), [motor de reglas de diseño](modulos/lint.md), [exportación e importación](modulos/exportacion.md), [disposición automática](modulos/layout.md), [plantillas de arquitectura](modulos/plantillas.md), [editor web](modulos/web.md).

## Decisiones registradas

| ADR                                                 | Decisión                                                      |
| --------------------------------------------------- | ------------------------------------------------------------- |
| [0001](adr/0001-registrar-decisiones-con-adr.md)    | Registrar las decisiones con ADR                              |
| [0002](adr/0002-monorepo-pnpm-workspaces.md)        | Monorepo con pnpm workspaces y paquetes internos sin compilar |
| [0003](adr/0003-typescript-en-todo-el-stack.md)     | TypeScript en todo el stack                                   |
| [0004](adr/0004-infraestructura-coste-cero.md)      | Infraestructura de coste cero sin tarjeta                     |
| [0005](adr/0005-modelo-de-dominio-agnostico.md)     | Modelo de dominio agnóstico de proveedor                      |
| [0006](adr/0006-zod-como-fuente-de-verdad.md)       | Zod como única fuente de verdad del formato                   |
| [0007](adr/0007-react-flow-y-elk.md)                | React Flow para el lienzo y ELK para la disposición           |
| [0008](adr/0008-iconografia-neutral.md)             | Iconografía neutral                                           |
| [0009](adr/0009-idioma.md)                          | Inglés en código, español en la documentación de diseño       |
| [0010](adr/0010-estrategia-de-calidad.md)           | Estrategia de calidad: tests, evaluaciones y puertas en CI    |
| [0011](adr/0011-flujo-de-trabajo-y-commits.md)      | Una rama por tarea integrada con merge --no-ff                |
| [0012](adr/0012-severidad-por-hallazgo.md)          | Severidad por hallazgo con un valor por defecto por regla     |
| [0013](adr/0013-direccion-visual-hoja-de-dibujo.md) | Dirección visual basada en la hoja de dibujo técnico          |

Cada nueva página de módulo o ADR se añade a este índice.
