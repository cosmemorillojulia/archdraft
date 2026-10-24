/**
 * elkjs' bundled build treats any context that has `self` but no `document`
 * as its own dedicated worker: it starts listening for messages and stops
 * exporting the in-thread engine that `@archdraft/layout` uses. The layout
 * worker runs that engine on purpose, so it declares an empty `document`
 * before elkjs loads. Import this module before `@archdraft/layout`.
 */
const scope = globalThis as { document?: unknown };
scope.document ??= {};
