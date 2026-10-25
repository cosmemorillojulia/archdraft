import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const fileOf = (path: string) => join(import.meta.dirname, '..', path);
const read = (path: string) => readFileSync(fileOf(path), 'utf8');

describe('logo', () => {
  it('is the diagram A in the colours of the brand, with a title', () => {
    const svg = read('public/favicon.svg');
    expect(svg).toContain('viewBox="0 0 512 512"');
    expect(svg).toContain('<title>Archdraft</title>');
    for (const colour of ['#12284A', '#8FB0DE', '#F4F6F9']) expect(svg).toContain(colour);
  });

  it('is linked as the icon of the page and of the iOS home screen', () => {
    const html = read('index.html');
    expect(html).toContain('<link rel="icon" type="image/svg+xml" href="/favicon.svg" />');
    expect(html).toContain('<link rel="apple-touch-icon" href="/apple-touch-icon.png" />');
    // A 180 × 180 PNG: the signature, then the width and height in the IHDR chunk.
    const png = readFileSync(fileOf('public/apple-touch-icon.png'));
    expect(png.subarray(1, 4).toString()).toBe('PNG');
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([180, 180]);
  });
});
