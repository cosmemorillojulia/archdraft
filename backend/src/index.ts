import { createApp } from './http/app.ts';

/** The Durable Object behind the `USAGE` binding: daily use per address. */
export { UsageCounter } from './usage-counter.ts';

/** Entry point of the Worker (wrangler.jsonc). */
export default createApp();
