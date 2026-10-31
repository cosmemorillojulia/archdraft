/** Variables Vite puts in the build (docs/modulos/web.md). */
interface ImportMetaEnv {
  /** Where the API of the assistant runs; without it, the assistant is not offered. */
  readonly VITE_API_URL?: string;
}
