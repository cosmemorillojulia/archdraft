# ADR 0019: Documento con disposición, enlaces comprimidos en el fragmento y autoguardado local

- Estado: aceptada
- Fecha: 2026-10-25

## Contexto

T11 pide no perder trabajo y poder compartir sin servidor (ADR 0004): autoguardado en el navegador, un enlace con el diagrama comprimido en el fragmento (`#d=`) e importación y exportación de un fichero JSON. Desde T09 la posición de cada nodo la decide quien edita, así que guardar o compartir solo el grafo (`toJson`) perdería la colocación: al abrirlo, ELK volvería a disponerlo. Todo lo que se abre viene de fuera (un fichero, un enlace manipulado, un `localStorage` de otra versión) y debe validarse como cualquier entrada no confiable.

## Decisión

- Formato: el documento completo, `{ graph, layout }`, el mismo `DiagramDocumentSchema` que guarda el editor. `documentToJson` lo escribe con el orden de claves de `toJson` y la disposición en el orden de los nodos; `importDocument` lo lee y acepta también un grafo suelto. El grafo pasa por los mismos pasos que `importJson` (JSON, migraciones y `parseArchitectureGraph`) y la disposición por su esquema; las entradas de nodos que no existen se descartan. Si faltan posiciones, el editor coloca con ELK solo esos nodos (`pinned`), y la dirección del flujo se deduce de las aristas ya colocadas.
- Enlace: JSON compacto comprimido con `CompressionStream('deflate-raw')` del navegador y escrito en base64 apto para URL tras `#d=`. Al abrirlo se limita el texto (500 000 caracteres) y lo que se descomprime (2 MB), para que un enlace manipulado no pueda agotar la memoria; cualquier fallo es un aviso y el editor sigue con lo guardado o con la plantilla. Los enlaces de más de 4000 caracteres muestran un aviso.
- Autoguardado: el documento abierto en `localStorage` con la clave `archdraft:document:v1`, 400 ms después del último cambio y al ocultar o cerrar la página. Si el navegador no deja guardar, se avisa una vez y se sigue trabajando.
- Al arrancar: el enlace si la dirección lo trae; si no, lo guardado; si no, la plantilla por defecto. Después de abrir un enlace se quita de la dirección, para que recargar abra el trabajo guardado y no vuelva al enlace. Abrir un enlace, un fichero o lo guardado es un paso del historial, como abrir una plantilla.

## Alternativas consideradas

- Guardar y compartir solo el grafo: enlaces algo más cortos, pero cada apertura vuelve a disponer el diagrama y se pierde lo colocado a mano.
- `lz-string` u otra librería de compresión: funciona en navegadores antiguos, pero añade una dependencia para algo que todos los navegadores actuales hacen de forma nativa, y comprime peor que deflate.
- Guardar varias versiones o el historial: el historial vive en memoria (ADR 0017); guardar solo el documento actual es suficiente para no perder trabajo y cabe de sobra en `localStorage`.

## Consecuencias

- Positivas: un único formato para fichero, enlace y autoguardado, validado en un solo sitio; las plantillas caben en enlaces de 1100 a 1600 caracteres; ningún diagrama sale del navegador salvo que alguien comparta el enlace.
- Negativas: las posiciones hacen el enlace más largo que el grafo solo; un diagrama grande supera el umbral del aviso y hay que compartirlo como fichero. El umbral de 4000 caracteres es una estimación, no una medida de qué aplicaciones cortan los enlaces. Solo hay un diagrama guardado por navegador: abrir otro sustituye al anterior, que se recupera con deshacer mientras la página siga abierta.

## Revisar si

Se necesitan varios diagramas guardados, los enlaces resultan demasiado largos en la práctica, o el formato del documento cambia de forma incompatible (entonces, una versión nueva de la clave y una migración).
