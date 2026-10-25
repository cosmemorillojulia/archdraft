import { type DiagramDocument, documentToJson } from '@archdraft/core';

/** The shared diagram travels in the fragment, `#d=…`, which browsers never send to a server. */
const FRAGMENT_PREFIX = '#d=';

/** Links longer than this get a warning: chat and mail apps may cut them. */
export const LONG_LINK_CHARS = 4000;

/** Limits for opening untrusted links: the encoded text and the text it expands to. */
const MAX_ENCODED_CHARS = 500_000;
const MAX_DOCUMENT_BYTES = 2_000_000;

export class ShareLinkError extends Error {
  readonly reason: 'damaged' | 'too-large';
  constructor(reason: 'damaged' | 'too-large', options?: ErrorOptions) {
    super(reason === 'damaged' ? 'The link is damaged' : 'The link is too large', options);
    this.name = 'ShareLinkError';
    this.reason = reason;
  }
}

async function readAll(stream: ReadableStream<Uint8Array>, maxBytes: number): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > maxBytes) {
      await reader.cancel();
      throw new ShareLinkError('too-large');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  // In slices, so that a large document does not overflow the argument list.
  for (let start = 0; start < bytes.length; start += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(start, start + 0x8000));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) throw new ShareLinkError('damaged');
  try {
    const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  } catch (cause) {
    throw new ShareLinkError('damaged', { cause });
  }
}

/** The document as compact JSON, compressed with raw deflate and written in URL-safe base64. */
export async function encodeDocument(document: DiagramDocument): Promise<string> {
  const json = documentToJson(document, { indent: 0 });
  const body = new Response(json).body;
  if (!body) throw new Error('Could not read the document as a stream');
  const compressed = await readAll(
    body.pipeThrough(new CompressionStream('deflate-raw')),
    Number.POSITIVE_INFINITY,
  );
  return toBase64Url(compressed);
}

/**
 * The JSON text inside an encoded document. Throws ShareLinkError when the
 * text is not valid base64, does not inflate, or would expand beyond the
 * size limit; the JSON itself is checked by importDocument.
 */
export async function decodeDocument(encoded: string): Promise<string> {
  if (encoded.length > MAX_ENCODED_CHARS) throw new ShareLinkError('too-large');
  const bytes = fromBase64Url(encoded);
  const body = new Response(bytes).body;
  if (!body) throw new ShareLinkError('damaged');
  let inflated: Uint8Array;
  try {
    inflated = await readAll(
      body.pipeThrough(new DecompressionStream('deflate-raw')),
      MAX_DOCUMENT_BYTES,
    );
  } catch (cause) {
    if (cause instanceof ShareLinkError) throw cause;
    throw new ShareLinkError('damaged', { cause });
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(inflated);
  } catch (cause) {
    throw new ShareLinkError('damaged', { cause });
  }
}

/** Link to the editor that opens `document`. */
export async function shareLink(
  document: DiagramDocument,
  location: Pick<Location, 'origin' | 'pathname'> = window.location,
): Promise<string> {
  return `${location.origin}${location.pathname}${FRAGMENT_PREFIX}${await encodeDocument(document)}`;
}

/** The encoded document of a `#d=…` fragment, or null if the fragment is something else. */
export function linkPayload(hash: string): string | null {
  return hash.startsWith(FRAGMENT_PREFIX) ? hash.slice(FRAGMENT_PREFIX.length) : null;
}
