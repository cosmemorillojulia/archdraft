# ADR 0008: Iconografía neutral en lugar de los iconos oficiales de los proveedores

- Estado: aceptada
- Fecha: 2026-10-20

## Contexto

AWS, Google Cloud y Azure publican paquetes de iconos para diagramas de arquitectura. Cada paquete tiene sus propias condiciones de uso, pensadas para que los clientes dibujen sus diagramas; no está claro que permitan redistribuirlos dentro de un repositorio de código abierto ni usarlos en una herramienta de terceros. Además, el modelo es agnóstico de proveedor (ADR 0005).

## Decisión

Los nodos usan iconos de Lucide (licencia ISC), elegidos por tipo de componente en el catálogo (`NodeDefinition.icon`). El proveedor se indica con un distintivo de texto y color en el nodo y con el nombre del producto (`resolveServiceName`).

## Alternativas consideradas

- Iconos oficiales de cada proveedor: aspecto familiar, pero riesgo de licencia, tres veces más recursos y dependencia de que el modelo elija bien el producto.
- Iconos dibujados a medida: coherentes, pero mucho trabajo de diseño.

## Consecuencias

- Positivas: sin riesgo de licencia; estilo visual coherente; el mismo icono vale para todos los proveedores.
- Negativas: menos reconocible a primera vista para alguien acostumbrado a los diagramas oficiales de AWS.

## Revisar si

Se confirma por escrito que las condiciones de algún proveedor permiten este uso, en cuyo caso podrían ofrecerse como tema opcional.
