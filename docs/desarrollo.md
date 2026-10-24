# Guía de desarrollo

## Requisitos

- Node.js 22.12 o superior (`.nvmrc` fija la 22).
- pnpm 10 (la versión exacta está en `packageManager` de `package.json`; con Corepack se activa sola).

```bash
pnpm install
pnpm check
```

## Scripts

| Script                                     | Qué hace                                                                                         |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| `pnpm check`                               | Todo lo que ejecuta CI, en el mismo orden: formato, lint, typecheck, tests con cobertura y build |
| `pnpm test`                                | Tests de todos los paquetes                                                                      |
| `pnpm test:coverage`                       | Tests con umbrales de cobertura                                                                  |
| `pnpm lint`                                | ESLint con información de tipos                                                                  |
| `pnpm typecheck`                           | `tsc --noEmit` en cada paquete                                                                   |
| `pnpm format` / `pnpm format:check`        | Prettier                                                                                         |
| `pnpm --filter @archdraft/core test:watch` | Tests de un paquete en modo observación                                                          |
| `pnpm --filter web dev`                    | Editor en modo desarrollo en `http://localhost:5173/archdraft/` (ver `modulos/web.md`)           |

## Herramientas y por qué

| Herramienta                | Versión   | Motivo                                                                                                                          |
| -------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript                 | 6.0       | Modo estricto; la 7.0 aún no la soporta `typescript-eslint` (ADR 0003)                                                          |
| ESLint + typescript-eslint | 10 / 8.72 | Configuración plana con `recommendedTypeChecked`: detecta promesas sin esperar, uso inseguro de `any` y aserciones innecesarias |
| Prettier                   | 3         | Formato sin discusiones; ESLint no se ocupa del estilo                                                                          |
| Vitest                     | 5         | Rápido, compatible con Vite (que usará el editor) y con cobertura V8 integrada                                                  |
| pnpm workspaces            | 10        | ADR 0002                                                                                                                        |

Reglas de ESLint añadidas a la configuración recomendada:

- `consistent-type-imports`: las importaciones solo de tipos usan `type`, necesario con `verbatimModuleSyntax`.
- `no-unused-vars` con excepción para nombres que empiezan por `_`.
- `eqeqeq` y aviso ante `console.log` (se permiten `console.warn` y `console.error`).
- En `apps/web`, las reglas recomendadas de `eslint-plugin-react-hooks` y las variables globales del navegador.

## Configuración de TypeScript

`tsconfig.base.json` es la base de todos los paquetes. Opciones menos habituales y su motivo:

| Opción                                              | Motivo                                                                                                    |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `noUncheckedIndexedAccess`                          | `array[i]` y `map.get(k)` devuelven `T \| undefined` y obligan a comprobarlo                              |
| `exactOptionalPropertyTypes`                        | Distingue una propiedad ausente de una presente con `undefined`, importante para un formato JSON estricto |
| `allowImportingTsExtensions` + `erasableSyntaxOnly` | Node.js ejecuta los `.ts` directamente; prohíbe `enum` y `namespace`                                      |
| `verbatimModuleSyntax`                              | Las importaciones de tipos se eliminan de forma predecible                                                |
| `noEmit`                                            | Nadie compila con `tsc`: los empaquetadores y Node.js se encargan                                         |

Cada paquete tiene su `tsconfig.json`, que extiende la base y define sus `types` (por ejemplo `node`, o `@cloudflare/workers-types` en la API).

## Integración continua

`.github/workflows/ci.yml` se ejecuta en cada push a `main` y en cada pull request:

1. Instala con `pnpm install --frozen-lockfile`: si el lockfile no corresponde con `package.json`, falla.
2. Ejecuta formato, lint, typecheck, tests con cobertura y build.

Tiene permisos de solo lectura, cancela ejecuciones anteriores de la misma rama y un tiempo máximo de 15 minutos.

Dependabot (`.github/dependabot.yml`) propone actualizaciones semanales de npm, agrupando las de desarrollo, y mensuales de las acciones de GitHub.

## Flujo de trabajo

Resumen de ADR 0011 y CONTRIBUTING.md:

1. Rama por tarea: `feat/t02-lint-engine`.
2. Commits atómicos con Conventional Commits (`feat:`, `fix:`, `refactor:`, `test:`, `docs:`...).
3. Pasada de simplificación y revisión del diff completo antes de integrar.
4. `pnpm check` en verde.
5. `git merge --no-ff` a `main` con mensaje convencional e identificador de tarea.

## Skills de asistencia

`.claude/skills/` contiene las skills usadas durante el desarrollo asistido:

| Skill                    | Origen                              | Uso                                                     |
| ------------------------ | ----------------------------------- | ------------------------------------------------------- |
| `ingeniero-senior`       | Propia del proyecto                 | Criterio al planificar, implementar y cerrar cada tarea |
| `code-review-excellence` | wshobson/agents, MIT, sin modificar | Revisión del diff de cada tarea antes del merge         |

Además, la pasada de simplificación usa la skill integrada `simplify` de Claude Code cuando el entorno la ofrece; al ser integrada, no se copia al repositorio. Prettier ignora la carpeta `.claude`; la licencia y el origen de la skill de terceros están en su carpeta.

## Convenciones de código

- Datos inmutables y funciones puras en `packages/*`.
- Toda entrada no confiable pasa por `parseArchitectureGraph` o por un esquema Zod.
- Nada de `any`; si un tipo externo es impreciso, se acota en el borde.
- Comentarios solo para explicar el porqué, no el qué.
- Tests junto al paquete, en `test/`, con nombres que describen comportamiento.
