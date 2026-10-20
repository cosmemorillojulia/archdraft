# ADR 0005: Modelo de dominio agnóstico de proveedor

- Estado: aceptada
- Fecha: 2026-10-20

## Contexto

Un diagrama de arquitectura puede describirse con los productos concretos de un proveedor (Amazon RDS, Cloud SQL) o con conceptos (base de datos relacional). Si el modelo se basa en productos, cada proveedor multiplica el vocabulario, las reglas de diseño se duplican y el modelo de lenguaje tiene que elegir entre cientos de nombres. Si se basa solo en conceptos, se pierde la precisión que espera alguien que diseña sobre AWS.

## Decisión

El modelo se basa en tipos de componente genéricos (`relational-db`, `queue`, `load-balancer`...), con un catálogo que asocia cada tipo al producto habitual de AWS, Google Cloud y Azure.

- El diagrama declara un proveedor por defecto y cada nodo puede sobrescribirlo (por ejemplo, un servicio de pagos externo dentro de un diagrama de AWS).
- `node.service` permite fijar el producto concreto cuando difiere del habitual (Aurora en lugar de RDS).
- Las reglas de diseño razonan sobre tipos y atributos (`replicas`, `multiAz`, `publiclyAccessible`), nunca sobre nombres de producto.
- Los contenedores (`region`, `availability-zone`, `network`, `subnet`, `boundary`) son nodos con un tipo especial; no participan en conexiones y su anidamiento sigue reglas explícitas.

## Alternativas consideradas

- Vocabulario por proveedor (estilo iconos oficiales de AWS): precisión máxima, pero vocabulario enorme, reglas triplicadas y peor rendimiento del LLM.
- Texto libre en el tipo de nodo: flexible, pero imposible de validar o de usar en reglas.

## Consecuencias

- Positivas: un vocabulario cerrado de 34 tipos, fácil de validar y de describir al modelo; un mismo diagrama se puede ver para cualquier proveedor; las reglas de diseño se escriben una sola vez.
- Negativas: productos muy específicos (por ejemplo AWS Step Functions) no tienen tipo propio y deben representarse con el más cercano más `service`. El mapeo a productos es orientativo y requiere mantenimiento cuando los proveedores renombran servicios.

## Revisar si

Los usuarios necesitan con frecuencia productos sin tipo equivalente; entonces se amplía el catálogo, siempre con tipos genéricos.
