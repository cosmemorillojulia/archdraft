# ADR 0020: Interfaz en inglés y español

- Estado: aceptada
- Fecha: 2026-10-25
- Modifica: ADR 0009 (la interfaz deja de ser solo en inglés)

## Contexto

ADR 0009 dejó la interfaz en inglés y todas las cadenas en un único módulo, para poder añadir español más adelante sin reescribir componentes. El propietario pidió un botón que cambie entre inglés y español, en lugar del enlace al código fuente de la cabecera.

No bastaba con traducir las cadenas de `apps/web`. Parte del texto que se ve viene de `@archdraft/core`, en inglés: los nombres y descripciones de los tipos de nodo, el producto genérico cuando un componente no nombra ninguno (`resolveServiceName` devuelve el nombre del tipo), los títulos, explicaciones y mensajes de las reglas de diseño, y las plantillas.

## Decisión

- Dos diccionarios con las mismas claves: `i18n/en.ts` y `i18n/es.ts`. El tipo `Strings` sale del inglés con los textos ensanchados a `string`, así que al español no le puede faltar ni sobrar una clave.
- El idioma vive en un store de Zustand (`i18n/locale.ts`). Los componentes leen el diccionario con `useStrings()` y se vuelven a pintar al cambiar de idioma, también los nodos y aristas memoizados de React Flow. El código fuera de React (rechazos de ediciones, avisos al abrir ficheros) usa `currentStrings()` en el momento de escribir el mensaje.
- Idioma inicial: el elegido antes en este navegador (`archdraft:locale`), si no español cuando el navegador lo prefiere, y si no inglés. El atributo `lang` de la página lo sigue.
- `core` sigue en inglés y sin dependencia de idioma. El diccionario inglés reutiliza sus textos (catálogo, reglas, mensajes de los hallazgos) y el español los redacta en `apps/web` a partir de los mismos datos que usó la regla: el id de la regla, la gravedad, los nodos y aristas del hallazgo y los atributos del primer nodo. Un test comprueba que el diccionario inglés devuelve exactamente el texto de `core` para un grafo que dispara todas las reglas, y que el español nombra los componentes.
- Las plantillas tienen una traducción por id de nodo y de arista (`i18n/templates.ts`), con un test que exige que esté completa y que la plantilla traducida siga siendo válida y sin hallazgos. Se abren en el idioma de la interfaz. Los códigos de región, los productos y los nombres de eventos no se traducen.
- Lo que escribe el usuario no se traduce: un diagrama es su contenido. La excepción es una plantilla sin editar (el grafo es el mismo objeto que la plantilla en el idioma anterior), que al cambiar de idioma se sustituye por la del idioma nuevo, conservando la disposición y sin añadir un paso al historial.
- Un único botón en la cabecera, como el del tema, muestra la bandera del idioma al que lleva, que gira al pulsarlo. Su nombre accesible está escrito en ese idioma («Ver en español», «View in English») y lleva su atributo `lang`. Las banderas son SVG en línea, porque los emojis de bandera no se ven en Windows.

## Alternativas consideradas

- Una librería de i18n (i18next, FormatJS): añade peso y un formato de mensajes para dos idiomas y unas 300 cadenas que caben en objetos tipados.
- Textos traducidos en `core` con un parámetro de idioma: mezcla la presentación con el dominio y obliga a los futuros consumidores (API, evaluaciones) a cargar ambos idiomas.
- Volver a montar toda la aplicación con una `key` por idioma: más simple, pero reinicia la vista, los paneles abiertos y la animación de construcción del diagrama.

## Consecuencias

- Positivas: la interfaz entera, los hallazgos y las plantillas se leen en español; añadir un tercer idioma es añadir un diccionario y la traducción de las plantillas.
- Negativas: los mensajes de error de validación que vienen de `core` o de Zod (una edición rara que deja el grafo inválido, un fichero JSON mal formado) siguen en inglés dentro de una frase en español. Los mensajes que ya están en pantalla al cambiar de idioma se quedan como estaban. Los nombres en español son más largos, así que los nombres de los componentes ocupan hasta dos líneas en lugar de cortarse.

## Revisar si

Se añade un tercer idioma o la API empieza a devolver textos para el usuario; entonces conviene valorar mensajes con claves y parámetros en `core`.
