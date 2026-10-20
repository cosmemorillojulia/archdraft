# ADR 0003: TypeScript en todo el stack

- Estado: aceptada
- Fecha: 2026-10-20

## Contexto

El frontend es necesariamente JavaScript o TypeScript. El backend se ejecuta en Cloudflare Workers (ADR 0004), cuyo runtime principal es JavaScript; Python existe en Workers pero con más restricciones de paquetes y menos madurez. El esquema del diagrama y la validación tienen que ejecutarse igual en ambos lados.

El autor tiene más experiencia en Python (FastAPI, LangGraph). Elegir TypeScript amplía su stack, pero también supone una curva de aprendizaje.

## Decisión

Todo el código del proyecto es TypeScript en modo estricto, incluida la API y el banco de evaluación.

Detalles de la configuración (`tsconfig.base.json`):

- `strict`, `noUncheckedIndexedAccess` y `exactOptionalPropertyTypes` activados: el acceso a arrays y mapas devuelve `T | undefined` y una propiedad opcional no acepta `undefined` explícito. Es más estricto que la media, a cambio de detectar en compilación errores que en otro caso aparecerían en producción.
- `moduleResolution: bundler` y `verbatimModuleSyntax`.
- Las importaciones relativas llevan extensión `.ts` (`allowImportingTsExtensions`) y solo se usa sintaxis que se puede borrar sin transformar (`erasableSyntaxOnly`: sin `enum` ni `namespace`). Así Node.js 22 ejecuta los paquetes directamente con su eliminación de tipos nativa, sin `tsx` ni compilación previa.
- Versión de TypeScript fijada en 6.0. La 7.0 (compilador nativo en Go) ya es estable, pero `typescript-eslint` todavía declara compatibilidad hasta `<6.1`, y el linting con información de tipos depende de la API del compilador en JavaScript.

## Alternativas consideradas

- Backend en Python con FastAPI: el autor ya lo domina, pero obliga a duplicar el esquema en Pydantic y Zod y a mantenerlos sincronizados, y no encaja en el free tier de Workers sin restricciones.
- JavaScript sin tipos: más rápido al principio, pero el núcleo del proyecto es un modelo de datos con muchas invariantes, justo donde los tipos más ayudan.
- TypeScript 7 sin linting con tipos: se perderían reglas valiosas como `no-floating-promises` o `no-unsafe-*`.

## Consecuencias

- Positivas: un único lenguaje y un único esquema; refactors seguros entre paquetes; el proyecto suma TypeScript al stack del autor.
- Negativas: no ejercita Python. La configuración estricta exige más disciplina, por ejemplo al construir objetos con propiedades opcionales.

## Revisar si

`typescript-eslint` soporta TypeScript 7 (actualizar entonces), o si alguna pieza necesita librerías solo disponibles en Python, por ejemplo un análisis de evaluación más complejo que podría vivir en `evals/` como script aparte.
