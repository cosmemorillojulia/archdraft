/*
 * The readers of Mermaid and draw.io files. `openFileText` imports this module
 * on demand, so that they are not part of the JavaScript the editor loads at start (T22).
 */
export { importDrawio, importMermaid } from '@archdraft/shared';
