# ADR 0025: Límite diario por dirección con Durable Objects

- Estado: aceptada
- Fecha: 2026-11-10

## Contexto

La API no tiene cuentas, así que lo único que separa a una persona de otra es la dirección IP. El modelo por defecto, Workers AI, da 10.000 neurons al día en el plan gratuito, que alcanzan para unas veinte generaciones (`docs/modulos/backend.md`); si alguien las gasta todas, el asistente deja de funcionar para los demás hasta las 00:00 UTC. Hace falta un límite de peticiones por dirección y por día que cumpla ADR 0004 (coste cero, sin tarjeta), que no guarde más datos personales de los necesarios y que se pueda probar sin el entorno de Workers.

Opciones disponibles en el plan gratuito, consultadas en la documentación oficial de Cloudflare el 2026-11-10:

- Binding de rate limiting (`ratelimits`): `limit({ key })` con un periodo de 10 o 60 segundos como únicos valores. Los contadores son aproximados, de cada ubicación de Cloudflare y con consistencia eventual, y la propia documentación desaconseja usar la IP como clave.
- Durable Objects con SQLite, el único tipo del plan gratuito: 100.000 peticiones y 100.000 filas escritas al día, 5 GB en total. Cada objeto atiende sus peticiones de una en una y tiene alarmas.
- Workers KV: consistencia eventual y un límite diario de escrituras en el plan gratuito muy por debajo de las 100.000 peticiones del Worker (1.000 al día en la última consulta conocida; la página de precios no se pudo comprobar el 2026-11-10).

## Decisión

Un Durable Object `UsageCounter` por dirección, con nombre igual a la huella SHA-256 de la dirección IPv4 o del prefijo /64 de la IPv6. Cada petición válida a `/v1/assist` llama por RPC a `consume(limit)`, que cuenta la petición si quedan y, si no, responde que no sin escribir nada. La primera petición del día programa una alarma a las 00:00 UTC que borra el objeto. Pasado el límite, la API responde 429 `rate-limited` con `Retry-After` hasta la medianoche UTC, la misma hora a la que se reinicia la cuota de Workers AI. El límite es la variable `DAILY_ASSIST_LIMIT`, 10 por defecto.

La lógica de contar es una función pura sobre la parte del almacenamiento que usa (`consumeDailyUse`), y el objeto solo se la pasa. Si el contador falla, la petición sigue y el fallo queda en el registro: un contador caído no debe apagar el asistente.

## Alternativas consideradas

- Binding de rate limiting: no puede contar por día y no es exacto. Sirve para frenar ráfagas, no para repartir una cuota diaria.
- Workers KV: con consistencia eventual dos peticiones seguidas leen la misma cuenta, y una escritura por petición agota antes el límite diario de escrituras que el de peticiones.
- Un único contador global en lugar de uno por dirección: protege la cuota igual de bien, pero una sola persona puede dejar sin asistente a todas las demás. Se puede añadir más adelante con el mismo objeto y otro nombre.
- No limitar y depender del 429 del proveedor: es lo que había, y deja la cuota en manos de quien más pida.
- Reglas de rate limiting del panel de Cloudflare (WAF): se configuran fuera del repositorio y no se prueban con el resto del código.

## Consecuencias

- Positivas: cuenta exacta por día, sin coste y sin servicios nuevos; el contador se prueba en Node.js con un almacenamiento en memoria; nada de una dirección dura más que el día en que se usó.
- Negativas: cada petición al asistente hace una llamada más (al Durable Object) y una escritura. Varias personas detrás de la misma dirección (una oficina, una red móvil con NAT) comparten el límite. La huella de una IPv4 se puede revertir probando todas las direcciones, así que protege del vistazo, no de quien tenga acceso a los datos: lo que protege de verdad es el borrado diario.

## Revisar si

- Cloudflare cambia los límites de Durable Objects en el plan gratuito o añade periodos diarios al binding de rate limiting.
- El editor tiene cuentas de usuario, que serían mejor clave que la dirección.
- La cuota del modelo deja de ser el recurso escaso, por ejemplo con un proveedor de pago.
