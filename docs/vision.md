# Visión y alcance

## Problema

Dibujar un diagrama de arquitectura cloud lleva tiempo y casi nunca se revisa con criterio. Las herramientas de dibujo (draw.io, Excalidraw, Lucidchart) producen imágenes sin semántica: no saben que una caja es una base de datos ni que está expuesta a internet. Las herramientas que convierten texto en diagramas (Mermaid, D2) exigen aprender una sintaxis y tampoco analizan el diseño.

## Propuesta

Archdraft convierte una descripción en lenguaje natural en un diagrama estructurado y editable, y lo revisa mientras se edita:

1. Borrador: el usuario describe el sistema y obtiene un diagrama con componentes, conexiones y contenedores (región, red, subred).
2. Edición: se ajusta a mano en un lienzo o pidiendo cambios en lenguaje natural, sin perder la colocación manual.
3. Revisión: un motor de reglas señala riesgos de diseño en tiempo real, con explicación y sugerencia.
4. Exportación: Mermaid, draw.io, PNG, SVG o JSON, y un enlace para compartir sin servidor.

El diagrama es agnóstico de proveedor y se puede ver para AWS, Google Cloud o Azure.

## Usuarios objetivo

- Ingenieros que preparan una propuesta técnica o una revisión de diseño y necesitan un primer diagrama rápido.
- Personas que estudian certificaciones de arquitectura cloud y quieren contrastar sus diseños con reglas de buenas prácticas.
- Equipos de preventa o consultoría que dibujan muchas arquitecturas parecidas.

## Alcance de la versión 1.0

Incluido:

- Generación desde texto y edición asistida con IA.
- Editor visual completo: paleta, conexiones, contenedores anidados, inspector de propiedades, deshacer y rehacer.
- Motor de reglas de diseño con al menos ocho reglas.
- Exportación a Mermaid, draw.io, PNG, SVG y JSON; importación de JSON.
- Plantillas de arquitecturas habituales.
- Compartir mediante enlace, sin cuentas de usuario.
- Banco de evaluación de la calidad de generación con resultados publicados.

Fuera de alcance:

- Cuentas de usuario, almacenamiento en servidor o colaboración en tiempo real.
- Estimación de costes de la arquitectura dibujada.
- Generación de infraestructura como código (Terraform, CDK). Es una extensión natural posterior.
- Iconos oficiales de los proveedores (ADR 0008).

## Métricas de éxito

| Métrica                                                 | Objetivo para 1.0                    | Cómo se mide                   |
| ------------------------------------------------------- | ------------------------------------ | ------------------------------ |
| Diagramas generados que pasan la validación estructural | 95 % o más                           | Banco de evaluación            |
| F1 de tipos de componente frente a lo esperado          | 0,8 o más                            | Banco de evaluación            |
| Tiempo hasta el primer diagrama generado                | menos de 20 s en p50                 | Logs de la API                 |
| Carga inicial del editor                                | menos de 2,5 s de LCP en móvil medio | Lighthouse en CI               |
| Coste de operación                                      | 0 €                                  | Facturación de los proveedores |

Los objetivos de calidad se revisarán con los primeros resultados reales del banco de evaluación (tarea T17).

## Riesgos principales

- Calidad de los modelos gratuitos para salida estructurada compleja. Mitigación: JSON Schema en el prompt, reintento con los errores de validación y medición continua.
- Cambios en los planes gratuitos. Mitigación: capa de proveedores intercambiable (ADR 0004).
- Alcance: un editor de diagramas puede crecer sin fin. Mitigación: roadmap cerrado y lista explícita de fuera de alcance.
