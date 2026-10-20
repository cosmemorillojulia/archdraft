# ADR 0007: React Flow para el lienzo y ELK para la disposición automática

- Estado: aceptada
- Fecha: 2026-10-20

## Contexto

El editor necesita un lienzo interactivo con nodos personalizados, nodos de grupo anidados (VPC, subredes), conexiones con estilos, zoom, minimapa y edición. Además, los diagramas generados por el modelo no traen posiciones: hay que calcular una disposición legible automáticamente, respetando los contenedores.

## Decisión

- Lienzo: React Flow (`@xyflow/react` v12), con nodos de grupo para los contenedores y nodos personalizados para los componentes.
- Disposición: ELK.js con el algoritmo `layered`, que soporta grafos jerárquicos (nodos dentro de contenedores) y aristas ortogonales. Se ejecuta en un Web Worker para no bloquear la interfaz.
- El modelo semántico (`ArchitectureGraph`) no guarda posiciones. Las posiciones forman una capa de presentación separada, de modo que regenerar o editar con IA no destruye el trabajo manual de colocación.

## Alternativas consideradas

- Dagre: más simple y ligero, pero no gestiona bien grafos jerárquicos con contenedores.
- Lienzo propio con SVG o Canvas: control total, pero semanas de trabajo en interacción que React Flow ya resuelve.
- Mermaid como motor de renderizado: genera imágenes, no un editor.
- tldraw o Excalidraw: pizarras de dibujo libre, no editores de grafos con semántica.

## Consecuencias

- Positivas: interacción madura desde el primer día; disposición jerárquica de calidad.
- Negativas: ELK.js pesa del orden de cientos de KB, por lo que se carga de forma diferida. El adaptador entre el modelo de dominio y los nodos de React Flow es código propio que hay que testear.

## Revisar si

El tamaño de ELK penaliza demasiado la carga inicial, o React Flow cambia su licencia (MIT a fecha de esta decisión).
