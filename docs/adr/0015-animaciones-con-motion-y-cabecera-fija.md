# ADR 0015: Animaciones con Motion y cabecera fija

- Estado: aceptada
- Fecha: 2026-10-24
- Modifica: ADR 0014 (la barra superior flotante vuelve a ser una cabecera fija)

## Contexto

Tras el rediseño de T25 (ADR 0014), el propietario pidió tres cosas: volver a la cabecera fija de T07, que le parecía más profesional, sin el logotipo y solo con el nombre; una interfaz todavía más visual; y animaciones fluidas en todo el recorrido del usuario.

Las animaciones que pide la experiencia son de varios tipos: entrada y salida de elementos que desaparecen del DOM (paleta, diagrama al cambiar de plantilla), elementos que se recolocan (mosaicos al filtrar, indicador de la plantilla activa), trazado de líneas SVG y muelles con interrupción natural. Con CSS solo se resuelven bien las transiciones de propiedades de elementos que siguen montados.

## Decisión

- Cabecera fija a todo el ancho con el nombre del producto, su descripción, el enlace al código y el cambio de tema. El título del diagrama, su tamaño y el estado de la revisión pasan a una tarjeta flotante sobre el lienzo.
- Animaciones con Motion (`motion/react`) mediante `LazyMotion` y componentes `m`, con el conjunto de funciones `domMax` cargado en un chunk aparte después del primer render. `MotionConfig reducedMotion="user"` respeta la preferencia del sistema.
- Tokens de movimiento compartidos en `src/motion.ts` (curva de salida suave, muelle para elementos pequeños, muelle para paneles e indicadores) para que todo se mueva con el mismo carácter.
- El cambio de tema usa la API View Transitions con un revelado circular desde el botón; donde no existe, o con movimiento reducido, el cambio es inmediato.

## Alternativas consideradas

- Solo CSS: sin dependencias, pero sin animaciones de salida, sin recolocación fluida de listas y con muelles imposibles; habría que reimplementar parte de una librería de animación.
- React Spring: muelles de calidad, pero sin un equivalente sencillo a `layoutId` ni a `AnimatePresence`, que son la base del indicador deslizante y de las salidas.
- GSAP: muy potente para secuencias, pero imperativo y ajeno al modelo de componentes de React; su licencia ha cambiado varias veces.
- Mantener la barra flotante de ADR 0014: descartado por preferencia explícita del propietario.

## Consecuencias

- Positivas: la interfaz responde a cada acción con movimiento coherente; las salidas y recolocaciones son fluidas; el diagrama se entiende mejor al construirse por capas y al resaltar las conexiones de un componente.
- Negativas: unos 20 KB comprimidos más en el bundle inicial y unos 32 KB en el chunk de funciones de Motion. Los tests desactivan las animaciones con `MotionGlobalConfig.skipAnimations` y esperan a que terminen las salidas.

## Revisar si

El presupuesto de tamaño de T22 no se cumple, o el lienzo de React Flow (T08) necesita un modelo de animación incompatible.
