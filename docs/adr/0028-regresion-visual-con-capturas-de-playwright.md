# ADR 0028: Regresión visual con capturas de Playwright en el repositorio

- Estado: aceptada
- Fecha: 2026-11-13

## Contexto

T26 pide pruebas de regresión visual de las pantallas clave que corran en CI. Ya hay tests de extremo a extremo con Playwright sobre el build (ADR 0026). Una captura depende de la máquina: la versión de Chromium, las fuentes del sistema y el suavizado del texto cambian algunos píxeles aunque la interfaz sea la misma. Las imágenes de referencia tienen que poder generarse en local y compararse en el runner de GitHub sin cuentas ni servicios de pago (ADR 0004).

## Decisión

- `toHaveScreenshot` de Playwright en `frontend/e2e/visual.spec.ts`, en un proyecto `visual` propio dentro del job `e2e` de CI.
- Imágenes de referencia en `frontend/e2e/__screenshots__`, versionadas en git y sin sufijo de plataforma: CI y las máquinas de desarrollo son Linux.
- Para que las capturas se parezcan entre máquinas: la fuente del editor viaja en el build (no depende del sistema), el proyecto pide movimiento reducido (sin entradas animadas ni partículas), Chromium dibuja el texto sin hinting ni suavizado subpíxel y en sRGB, y cada test espera a las fuentes y a que terminen las animaciones.
- Tolerancia del 2 % de píxeles distintos (`maxDiffPixelRatio`): absorbe los bordes del texto y deja fuera un panel movido, cortado o que falta.
- Ocho pantallas: editor, revisión de diseño, propuesta del asistente, galería y diagrama vacío en escritorio claro; paleta en escritorio oscuro; editor y hoja de componentes en móvil.

## Alternativas consideradas

- Ejecutar los tests en la imagen Docker oficial de Playwright en CI y en local: da capturas idénticas píxel a píxel, pero el entorno de desarrollo actual no puede descargar esa imagen y obliga a tener Docker para regenerar las referencias.
- Servicios de comparación visual (Chromatic, Percy, Argos): revisión cómoda de diferencias, pero necesitan cuenta y secretos y sus planes gratuitos tienen cuota.
- Referencias por plataforma (sufijo `-linux`, `-darwin`): triplican las imágenes y cada cambio de diseño exige regenerarlas en todas.
- Comparar el árbol de accesibilidad o el DOM en lugar de imágenes: estable, pero no detecta solapes, cortes ni colores, que es lo que interesa aquí.

## Consecuencias

- Positivas: un cambio que mueve, tapa o recorta un panel de las pantallas clave falla en CI y deja en el informe la captura esperada, la obtenida y la diferencia.
- Negativas: un cambio de diseño intencionado obliga a regenerar las referencias (`pnpm test:e2e --update-snapshots`) y revisarlas en el diff. Diferencias de menos del 2 % (un icono cambiado en una esquina) pueden pasar sin ser detectadas. Si Chromium cambia mucho el dibujado de texto en una versión nueva, hay que regenerar las referencias.

## Revisar si

Los tests fallan en CI sin cambios en la interfaz, o hay que regenerar referencias por motivos ajenos al diseño más de una vez por mes: entonces conviene fijar la imagen Docker de Playwright.
