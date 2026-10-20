# ADR 0002: Monorepo con pnpm workspaces y paquetes internos sin compilar

- Estado: aceptada
- Fecha: 2026-10-20

## Contexto

El sistema tiene al menos cuatro piezas que comparten código: el editor web, la API, la librería de dominio y el banco de evaluación. El esquema del diagrama, la validación y las reglas de diseño deben ser idénticos en el navegador y en el servidor. Separarlos en repositorios obligaría a publicar paquetes en un registro y a sincronizar versiones para cada cambio.

## Decisión

Un único repositorio gestionado con pnpm workspaces:

- `apps/*`: aplicaciones desplegables (`web`, `api`).
- `packages/*`: librerías puras compartidas (`core`, más adelante `layout`).
- `evals/`: banco de evaluación de la generación.

Los paquetes internos exportan directamente su código TypeScript (`"exports": { ".": "./src/index.ts" }`) en lugar de compilarse a `dist/`. Quien los consume (Vite, Wrangler, Vitest o Node.js con eliminación de tipos) ya sabe procesar TypeScript.

No se añade un orquestador de tareas como Turborepo o Nx. Los scripts raíz usan `pnpm -r`.

## Alternativas consideradas

- Varios repositorios: versionado y publicación de paquetes para cada cambio en el esquema, sin beneficio a esta escala.
- npm o Yarn workspaces: funcionan, pero pnpm es más rápido, ahorra disco y su resolución estricta impide usar dependencias no declaradas.
- Turborepo: su caché aporta poco con cuatro paquetes y unos segundos de build. Añade configuración y una dependencia más.
- Compilar los paquetes internos a `dist/`: obliga a un paso de build y a vigilar que esté actualizado durante el desarrollo.

## Consecuencias

- Positivas: un cambio en el esquema y sus consumidores va en un solo commit; CI único; tipos compartidos sin publicar nada.
- Negativas: los paquetes internos no son publicables tal cual en npm. Si algún día se publica `@archdraft/core`, habrá que añadir un paso de build.

## Revisar si

El tiempo de CI supera unos diez minutos por repetir trabajo (entonces Turborepo con caché), o si se quiere publicar `core` como librería independiente.
