# ADR 0006: Zod como única fuente de verdad del formato

- Estado: aceptada
- Fecha: 2026-10-20

## Contexto

El formato del diagrama se usa en cuatro sitios: los tipos de TypeScript, la validación en tiempo de ejecución de entradas no confiables (ficheros importados, URLs compartidas, respuestas del modelo), el JSON Schema que se le da al LLM para que genere salida estructurada, y la documentación. Mantener cuatro definiciones a mano garantiza que acaben divergiendo.

## Decisión

El formato se define una vez con Zod 4 en `packages/core/src/schema.ts`. De ahí se derivan:

- Los tipos, con `z.infer`.
- La validación, con `safeParse`, envuelta en `parseArchitectureGraph`, que nunca lanza excepciones.
- El JSON Schema, con `z.toJSONSchema` en modo `input`. Las descripciones de los campos (`.describe()`) viajan al esquema y sirven de instrucciones al modelo.

Los objetos son estrictos (`z.strictObject`): una propiedad desconocida es un error, no algo que se descarte en silencio. Con un LLM como productor, aceptar campos inventados ocultaría alucinaciones.

La validación tiene dos capas: el esquema (forma) y `validateGraph` (integridad: referencias, duplicados, ciclos, anidamiento). La segunda no se puede expresar en JSON Schema.

## Alternativas consideradas

- JSON Schema escrito a mano más Ajv: estándar, pero los tipos de TypeScript habría que generarlos o duplicarlos.
- Valibot o ArkType: más ligeros en el bundle, pero Zod tiene el ecosistema más amplio y conversión a JSON Schema integrada.
- TypeBox: muy bueno para JSON Schema, menos ergonómico para validaciones con transformaciones como `trim`.

## Consecuencias

- Positivas: un cambio en el formato se propaga a tipos, validación y prompt en el mismo commit.
- Negativas: Zod añade peso al bundle del frontend (decenas de KB). La validación estructural vive aparte del esquema y hay que mantenerla en paralelo.

## Revisar si

El peso de Zod pesa en las métricas de rendimiento del frontend (tarea T22), o el límite de CPU del Worker no tolera validar respuestas grandes.
