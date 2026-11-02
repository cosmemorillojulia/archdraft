# ADR 0023: Un asistente que revisa lo que diseña y lo enseña antes de aplicarlo

- Estado: aceptada
- Fecha: 2026-11-01

## Contexto

La gente pide al asistente cosas incompletas («una API con base de datos», sin decir cómo llega nadie a ella), ambiguas o inseguras («que la base de datos sea pública»). El modelo las dibujaba tal cual, y el editor no decía qué había decidido por su cuenta. Al aplicar una propuesta, el lienzo resaltaba en un único color lo que cambiaba o se quitaba, pero no lo que se añadía, porque aún no estaba en el diagrama. El panel solo daba recuentos («2 nuevos · 1 cambiado»). Las ediciones se aplicaban siempre al momento, aunque quitaran piezas. Los nodos nuevos se colocaban apartados de sus vecinos, en el borde del diagrama. La cuota gratuita sigue siendo de una llamada por tarea, más reparaciones (ADR 0022).

## Decisión

- El prompt enseña a leer una petición: completar lo imprescindible, elegir la lectura más habitual y hacer la versión segura de lo que se pide inseguro, salvo que la persona insista. Cada propuesta trae `assumptions`, frases cortas con lo que el asistente decidió y la petición no decía. El campo va antes del diagrama en la respuesta, para que el modelo lo decida antes de dibujar.
- Revisión en el backend: si un diagrama válido de `generate`, `edit`, `simplify` o `extend` añade hallazgos de `public-database`, `unprotected-entry`, `unencrypted-data` o `sync-cycle`, se pide una vez que los corrija, o que explique en `assumptions` por qué los mantiene. Si la corrección no es válida, se queda la primera respuesta. Gasta una llamada solo cuando hay riesgo.
- El ejemplo del prompt de `generate` es la plantilla que más se parece a la petición, en lugar de siempre la API serverless.
- Se pide escribir los nodos en el orden del flujo. Como ELK respeta el orden del modelo, ese orden decide en buena parte lo ordenado que queda el diagrama.
- En el editor, la propuesta abierta se dibuja en el lienzo tal como quedará, con el mismo layout que se aplicará: lo nuevo en verde, lo que cambia en ámbar y lo que se quita en rojo y discontinuo, con una etiqueta en palabras. Lo demás se atenúa. El panel dice, para cada propuesta, qué decidió el asistente, qué hallazgos de la revisión resuelve o trae, y qué cambia, pieza a pieza. Al señalar una pieza de la lista, esa pieza se destaca en el lienzo.
- Una edición que quita un componente o toca más de 8 piezas se enseña primero en lugar de aplicarse. Tras aplicar cualquier cambio, el panel muestra un resumen con Deshacer hasta que la persona lo cierra, elige otra cosa o sigue editando.
- Disposición: un nodo nuevo se coloca junto a lo que conecta, detrás de quien lo llama y a su altura, en el hueco libre más cercano a cualquier lado. Dentro de un grupo no pasa de su ancho, así que el grupo crece a través del flujo y no hacia el grupo de al lado. Si el cambio añade, quita o reagrupa más del 40 % de los nodos, se propone reordenar el diagrama entero, con un botón para elegir.

## Alternativas consideradas

- Rechazar los diseños inseguros: la persona puede querer uno a propósito, y una respuesta rechazada gasta todos los reintentos.
- Una llamada aparte para clasificar o aclarar la petición antes de diseñar: duplica el coste de cada uso en el plan gratuito.
- Que el modelo haga preguntas en lugar de responder: deja a la persona sin diagrama. Decidir, decir qué se decidió y dejar deshacer resuelve lo mismo en un solo paso.
- Mostrar la vista previa solo al pasar el ratón: cambiaba el lienzo al recorrer la lista y no se podía leer con calma. La propuesta abierta se queda dibujada.

## Consecuencias

- Positivas: se ve lo que se va a aplicar antes de aplicarlo, y lo que se aplicó después. Los diseños salen seguros por defecto sin bloquear a quien quiere otra cosa. Los cambios quedan junto a la parte del diagrama que tocan.
- Negativas: una respuesta con riesgos cuesta dos llamadas. Mientras se ve una propuesta, el lienzo es de solo lectura. Al reordenar todo, lo que se quita no se dibuja en la vista previa, porque su posición ya no significa nada; sigue en la lista de cambios.

## Revisar si

La cuota permite varias llamadas por petición (preguntar antes de diseñar), o el banco de evaluación muestra que la revisión no mejora la proporción de diseños seguros.
