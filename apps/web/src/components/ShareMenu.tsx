import { type DiagramDocument, documentToJson } from '@archdraft/core';
import { Check, Copy, Download, FolderOpen, Link2, Share2, TriangleAlert, X } from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';
import { type ChangeEvent, type KeyboardEvent, useEffect, useId, useRef, useState } from 'react';
import { openDocumentText } from '../editor/open-document.ts';
import { useEditor } from '../editor/store.ts';
import { useMediaQuery, WIDE_SCREEN } from '../media.ts';
import { EASE_OUT } from '../motion.ts';
import { LONG_LINK_CHARS, shareLink } from '../persist/share-link.ts';
import { strings } from '../strings.ts';
import { Button } from './Button.tsx';

/** File name for a diagram: its title in lower case with dashes. */
export function fileNameFor(title: string): string {
  const slug = title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `${slug || 'diagram'}.archdraft.json`;
}

function download(document: DiagramDocument): void {
  const blob = new Blob([documentToJson(document)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = window.document.createElement('a');
  anchor.href = url;
  anchor.download = fileNameFor(document.graph.title);
  anchor.click();
  // Revoked later: some browsers start the download after the click returns.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Header button and popover to share the diagram as a link and to download
 * or open it as a JSON file (T11). The link holds the whole diagram,
 * compressed, in its fragment.
 */
export function ShareMenu() {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const headingId = useId();

  const close = (returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) buttonRef.current?.focus();
  };

  // A press outside the button and the panel closes it.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
      setOpen(false);
    };
    window.addEventListener('pointerdown', onPointerDown);
    return () => window.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return;
    // Handled here, so the editor does not also clear its selection.
    event.preventDefault();
    close(true);
  };

  return (
    <div className="relative">
      <Button
        ref={buttonRef}
        variant="ghost"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((current) => !current)}
        className="max-md:size-8 max-md:px-0"
      >
        <Share2 size={16} aria-hidden="true" />
        <span className="max-md:sr-only">{strings.share.open}</span>
      </Button>
      <AnimatePresence>
        {open && (
          <m.div
            ref={panelRef}
            id={panelId}
            role="dialog"
            aria-labelledby={headingId}
            tabIndex={-1}
            onKeyDown={onKeyDown}
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{
              opacity: 0,
              y: -6,
              scale: 0.97,
              transition: { duration: 0.14, ease: EASE_OUT },
            }}
            transition={{ duration: 0.2, ease: EASE_OUT }}
            style={{ transformOrigin: 'top right' }}
            className="floating absolute top-full right-0 z-50 mt-2 w-[min(22rem,calc(100vw-1.5rem))] rounded-panel outline-none max-md:fixed max-md:top-14 max-md:right-3"
          >
            <SharePanelContent headingId={headingId} onDone={() => close(false)} />
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SharePanelContent({ headingId, onDone }: { headingId: string; onDone: () => void }) {
  const document = useEditor((state) => state.current?.document);
  const wide = useMediaQuery(WIDE_SCREEN);
  const [created, setCreated] = useState<{ for: DiagramDocument; link: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [copyFailed, setCopyFailed] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const linkId = useId();
  const noteId = useId();

  // A new link for every version of the diagram while the panel is open.
  useEffect(() => {
    if (!document) return;
    let current = true;
    shareLink(document)
      .then((link) => {
        if (current) setCreated({ for: document, link });
      })
      .catch((error: unknown) => console.error('Could not create the link', error));
    return () => {
      current = false;
    };
  }, [document]);

  const link = created && created.for === document ? created.link : null;

  const copy = async () => {
    if (link === null) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(link);
      setCopyFailed(false);
    } catch (error) {
      console.warn('Could not copy the link', error);
      setCopyFailed(true);
      inputRef.current?.select();
    }
  };

  const openFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    onDone();
    await openDocumentText(await file.text(), 'file', wide ? 'LR' : 'TB');
  };

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between py-2 pr-2 pl-4">
        <h2 id={headingId} className="font-semibold">
          {strings.share.title}
        </h2>
        <Button
          variant="ghost"
          size="icon"
          aria-label={strings.share.close}
          title={strings.share.close}
          onClick={onDone}
        >
          <X size={16} aria-hidden="true" />
        </Button>
      </div>

      <section className="flex flex-col gap-2 px-4 pb-3">
        <label
          htmlFor={linkId}
          className="flex items-center gap-1.5 text-xs font-medium text-muted"
        >
          <Link2 size={13} aria-hidden="true" />
          {strings.share.link}
        </label>
        <div className="flex gap-1.5">
          <input
            ref={inputRef}
            id={linkId}
            readOnly
            value={link ?? strings.share.creating}
            aria-describedby={noteId}
            onFocus={(event) => event.target.select()}
            className="h-9 min-w-0 flex-1 truncate rounded-control bg-surface-muted px-3 text-xs text-ink outline-none focus:ring-2 focus:ring-focus"
          />
          <Button
            variant="primary"
            disabled={link === null}
            onClick={() => void copy()}
            className="min-w-30 shrink-0 whitespace-nowrap"
          >
            {copied !== null && copied === link ? (
              <Check size={15} aria-hidden="true" />
            ) : (
              <Copy size={15} aria-hidden="true" />
            )}
            {copied !== null && copied === link ? strings.share.copied : strings.share.copy}
          </Button>
        </div>
        <div id={noteId} className="flex flex-col gap-1.5 text-xs text-muted" aria-live="polite">
          <p>{strings.share.linkNote}</p>
          {copyFailed && <p className="text-danger">{strings.share.copyFailed}</p>}
          {link !== null && link.length > LONG_LINK_CHARS && (
            <p className="flex gap-1.5 text-warning">
              <TriangleAlert size={14} aria-hidden="true" className="mt-px shrink-0" />
              {strings.share.longLink(link.length)}
            </p>
          )}
        </div>
      </section>

      <section className="flex flex-col gap-2 border-t border-line px-4 pt-3 pb-4">
        <h3 className="text-xs font-medium text-muted">{strings.share.file}</h3>
        <div className="flex flex-wrap gap-1.5">
          <Button disabled={!document} onClick={() => document && download(document)}>
            <Download size={15} aria-hidden="true" />
            {strings.share.download}
          </Button>
          <Button onClick={() => fileRef.current?.click()}>
            <FolderOpen size={15} aria-hidden="true" />
            {strings.share.openFile}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            aria-label={strings.share.openFile}
            onChange={(event) => void openFile(event)}
            className="sr-only"
            tabIndex={-1}
          />
        </div>
        <p className="text-xs text-muted">{strings.share.fileHint}</p>
      </section>
    </div>
  );
}
