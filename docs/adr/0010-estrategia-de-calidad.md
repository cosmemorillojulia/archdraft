# ADR 0010: Estrategia de calidad: tests, evaluaciones y puertas en CI

- Estado: aceptada
- Fecha: 2026-10-20

## Contexto

El sistema combina código determinista (esquema, validación, reglas, exportadores, disposición) con un componente probabilístico (el LLM). Los tests unitarios sirven para lo primero, pero no dicen nada de si el modelo genera buenos diagramas. Sin una medida objetiva, cualquier cambio de prompt o de modelo se valora a ojo.

## Decisión

Cuatro niveles, cada uno con su herramienta:

1. Tests unitarios con Vitest en todos los paquetes. `packages/core` exige cobertura mínima (90 % de líneas, funciones y sentencias, 85 % de ramas), comprobada en CI.
2. Tests de integración de la API con el runtime de Workers y un proveedor LLM falso, para probar el pipeline sin llamar a ningún modelo.
3. Tests de extremo a extremo con Playwright sobre los flujos principales del editor, más comprobaciones de accesibilidad con axe.
4. Evaluaciones de generación (`evals/`): un conjunto de descripciones con propiedades esperadas y métricas (validez del esquema, precisión y exhaustividad de tipos de componente, F1 de conexiones, errores de diseño). Se ejecutan bajo demanda y de forma periódica, no en cada push, porque consumen cuota y no son deterministas.

Puertas de CI en cada push y pull request: formato, lint con tipos, typecheck, tests con cobertura y build. Un fallo bloquea.

## Alternativas consideradas

- Solo tests unitarios: no detectan regresiones de calidad del modelo.
- Ejecutar las evaluaciones en cada push: agotaría la cuota gratuita y daría resultados ruidosos.
- Revisión manual de diagramas generados: no escala ni deja histórico comparable.

## Consecuencias

- Positivas: cada cambio de prompt o modelo se justifica con números; las regresiones del código determinista se detectan antes de llegar a `main`.
- Negativas: mantener el conjunto de evaluación requiere esfuerzo; las métricas estructurales no capturan todo lo que hace bueno un diagrama.

## Revisar si

Las métricas dejan de correlacionar con la calidad percibida; entonces se añade evaluación con un modelo como juez o revisión humana sobre una muestra.
