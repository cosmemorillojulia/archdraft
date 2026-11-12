# ADR 0027: Presupuesto de tamaño con un script propio y Lighthouse CI sin instalarlo

- Estado: aceptada
- Fecha: 2026-11-12

## Contexto

T22 pide comprobar en CI el tamaño del JavaScript inicial del editor y pasar Lighthouse CI con umbrales. El proyecto evita dependencias que no se justifiquen (skill `ingeniero-senior`, ADR 0010), y `@lhci/cli` trae Lighthouse, Puppeteer y sus dependencias, decenas de paquetes que solo usaría un job de CI. Hay que decidir qué se mide como «inicial», con qué herramienta y dónde corre cada comprobación.

## Decisión

- El presupuesto lo comprueba `frontend/scripts/check-size.ts` con `size-budget.ts`, unas cien líneas entre las dos partes, sin dependencias, al final de `pnpm --filter @archdraft/web build`. Lo inicial es lo que enlaza `index.html`: el script de entrada, los módulos que precarga y las hojas de estilo, medidos comprimidos con gzip. Así entra en `pnpm check` y en cada build de despliegue, no solo en un job aparte.
- Los límites son 280 KiB de JavaScript y 15 KiB de CSS, con poco margen sobre lo que hay (267 y 12): subirlos exige tocar `scripts/size-budget.ts` en un commit que diga por qué.
- Lighthouse CI se ejecuta con `pnpm dlx @lhci/cli@0.16.1`, con la versión fijada en el script `test:lighthouse`, en un job `lighthouse` propio que usa el Chrome que trae el runner. No entra en el lockfile ni en `pnpm install`.
- Los umbrales de Lighthouse se aplican a la mediana de tres ejecuciones y son holgados en rendimiento (0,75), porque la puntuación de una máquina compartida varía; las categorías estables (accesibilidad, buenas prácticas, SEO) y las métricas de carga (LCP, CLS) tienen umbrales estrictos.

## Alternativas consideradas

- `size-limit` o `bundlesize`: hacen lo mismo con más configuración y dependencias, y calculan lo inicial a partir de ficheros que hay que listar, mientras que `index.html` ya dice qué descarga el navegador.
- El aviso de tamaño de chunk de Vite (`chunkSizeWarningLimit`): mide cada chunk por separado y solo avisa, sin fallar; no distingue lo que se carga al inicio de lo que se carga bajo demanda.
- `@lhci/cli` como dependencia de desarrollo: versión en el lockfile y caché de pnpm, a cambio de instalar en cada máquina y en cada job unos paquetes que solo usa uno.
- Lighthouse desde Playwright con `playwright-lighthouse`: reutiliza el Chromium de los tests de extremo a extremo, pero depende de un paquete de terceros poco mantenido y no ofrece las aserciones ni los informes de Lighthouse CI.
- Lighthouse dentro del job `e2e`: ahorra un arranque, pero mezcla dos tipos de fallo en un job y alarga el que ya es más lento.

## Consecuencias

- Positivas: una dependencia grande nueva en la carga inicial rompe `pnpm check` en local, antes de llegar a CI; Lighthouse vigila la carga real del build sin pesar en la instalación del repositorio.
- Negativas: `pnpm dlx` descarga Lighthouse CI en cada ejecución del job, sin la caché de pnpm, y las dependencias que trae no quedan fijadas por el lockfile. La puntuación de rendimiento puede variar entre ejecuciones; un fallo aislado se repite antes de tocar el código.

## Revisar si

El job `lighthouse` falla por variación y no por cambios del editor, la descarga de `pnpm dlx` lo hace lento o inestable, o el editor pasa a tener varias páginas de entrada.
