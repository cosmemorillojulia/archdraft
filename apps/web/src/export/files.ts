/** What the editor can save a diagram as. */
export type ExportFormat = 'json' | 'mermaid' | 'drawio' | 'svg' | 'png';

const EXTENSIONS: Record<ExportFormat, string> = {
  json: '.archdraft.json',
  mermaid: '.mmd',
  drawio: '.drawio',
  svg: '.svg',
  png: '.png',
};

/** File name for a diagram: its title in lower case with dashes, and the extension of the format. */
export function fileNameFor(title: string, format: ExportFormat = 'json'): string {
  const slug = title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `${slug || 'diagram'}${EXTENSIONS[format]}`;
}

/** Saves `content` as a file through a temporary link. */
export function saveFile(content: Blob | string, fileName: string, type = 'text/plain'): void {
  const blob =
    typeof content === 'string' ? new Blob([content], { type: `${type};charset=utf-8` }) : content;
  const url = URL.createObjectURL(blob);
  const anchor = window.document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  // Revoked later: some browsers start the download after the click returns.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
