import {
  NODE_CATALOG,
  NODE_CATEGORIES,
  type NodeCategory,
  type NodeDefinition,
  type NodeKind,
} from '@archdraft/core';
import { PanelLeftClose, Search, Shapes, X } from 'lucide-react';
import { AnimatePresence, m, useDragControls } from 'motion/react';
import { type KeyboardEvent, type RefObject, useEffect, useId, useRef, useState } from 'react';
import { KIND_MIME } from '../canvas/palette-drop.ts';
import { KIND_ICONS } from '../icons.ts';
import { EASE_OUT, SPRING_POP, SPRING_SLIDE } from '../motion.ts';
import { useStrings } from '../i18n/locale.ts';
import { Button } from './Button.tsx';

const DEFINITIONS = Object.values(NODE_CATALOG);

/** Shapes first: they are the quickest way to sketch a simple flow. */
const PALETTE_ORDER = [
  'shape',
  ...NODE_CATEGORIES.filter((category) => category !== 'shape'),
] as const satisfies readonly NodeCategory[];

/** Lower case without accents, so that "cache" finds "Caché". */
const folded = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

/** Drag distance or speed, in pixels and pixels per second, that dismisses the sheet. */
const DISMISS_OFFSET = 120;
const DISMISS_VELOCITY = 500;

interface PaletteToggleProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface PaletteActions {
  /** Adds a component or group of this kind at the centre of the view. */
  onAdd: (kind: NodeKind) => void;
}

/**
 * Wide screens: floating panel beside the diagram. It slides in from the
 * left, its tiles cascade in, and the grid reflows smoothly while filtering.
 * A tile adds its component at the centre of the view when clicked, or where
 * it is dropped when dragged onto the diagram.
 */
export function ComponentsPanel({
  open,
  onOpenChange,
  onAdd,
}: PaletteToggleProps & PaletteActions) {
  const strings = useStrings();
  const headingId = useId();
  return (
    <AnimatePresence mode="wait" initial={false}>
      {open ? (
        <m.section
          key="panel"
          aria-labelledby={headingId}
          initial={{ opacity: 0, x: -24, scale: 0.98 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={{ opacity: 0, x: -24, scale: 0.98, transition: { duration: 0.18, ease: EASE_OUT } }}
          transition={SPRING_SLIDE}
          className="floating pointer-events-auto flex max-h-full w-72 flex-col rounded-panel"
        >
          <Palette
            headingId={headingId}
            columns={3}
            onClose={() => onOpenChange(false)}
            closeIcon="panel"
            onAdd={onAdd}
            draggable
            hint={strings.components.hintWide}
          />
        </m.section>
      ) : (
        <m.button
          key="toggle"
          type="button"
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -8, transition: { duration: 0.12 } }}
          transition={SPRING_SLIDE}
          whileHover={{ y: -1 }}
          whileTap={{ scale: 0.97 }}
          onClick={() => onOpenChange(true)}
          className="floating pointer-events-auto inline-flex h-10 items-center gap-2 rounded-panel px-3.5 font-medium transition-colors hover:text-accent"
        >
          <Shapes size={16} aria-hidden="true" />
          {strings.components.open}
        </m.button>
      )}
    </AnimatePresence>
  );
}

interface ComponentsSheetProps extends PaletteToggleProps {
  /** Receives focus back when the sheet closes. */
  toggleRef: RefObject<HTMLButtonElement | null>;
}

/** Narrow screens: round button that opens the palette as a bottom sheet. */
export function ComponentsSheetToggle({ open, onOpenChange, toggleRef }: ComponentsSheetProps) {
  const strings = useStrings();
  return (
    <m.button
      ref={toggleRef}
      type="button"
      aria-haspopup="dialog"
      aria-expanded={open}
      onClick={() => onOpenChange(true)}
      animate={{ opacity: open ? 0 : 1, scale: open ? 0.9 : 1 }}
      whileTap={{ scale: 0.94 }}
      transition={SPRING_SLIDE}
      className="floating pointer-events-auto inline-flex h-11 items-center gap-2 rounded-full px-4 font-medium"
    >
      <Shapes size={17} aria-hidden="true" className="text-accent" />
      {strings.components.open}
    </m.button>
  );
}

/**
 * Bottom sheet with the palette. It slides up with a spring, and closes with
 * its button, Escape, a tap on the backdrop, or by dragging its handle down.
 * Tapping a tile adds its component at the centre of the view.
 */
export function ComponentsSheet({
  open,
  onOpenChange,
  toggleRef,
  onAdd,
}: ComponentsSheetProps & PaletteActions) {
  const strings = useStrings();
  const headingId = useId();
  const dragControls = useDragControls();
  const sheetRef = useRef<HTMLDivElement>(null);
  const wasOpen = useRef(open);

  useEffect(() => {
    if (open) sheetRef.current?.focus();
    else if (wasOpen.current) toggleRef.current?.focus();
    wasOpen.current = open;
  }, [open, toggleRef]);

  const close = () => onOpenChange(false);

  return (
    <AnimatePresence>
      {open && (
        <m.div
          key="backdrop"
          aria-hidden="true"
          onClick={close}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25, ease: EASE_OUT }}
          className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]"
        />
      )}
      {open && (
        <m.div
          key="sheet"
          ref={sheetRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={headingId}
          tabIndex={-1}
          // The sheet itself takes focus when it opens, so Escape is handled here too.
          onKeyDown={(event) => {
            if (event.key === 'Escape') close();
          }}
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%', transition: { duration: 0.22, ease: EASE_OUT } }}
          transition={SPRING_SLIDE}
          drag="y"
          dragControls={dragControls}
          dragListener={false}
          dragConstraints={{ top: 0, bottom: 0 }}
          dragElastic={{ top: 0, bottom: 0.7 }}
          onDragEnd={(_event, info) => {
            if (info.offset.y > DISMISS_OFFSET || info.velocity.y > DISMISS_VELOCITY) close();
          }}
          className="fixed inset-x-0 bottom-0 z-50 flex max-h-[80dvh] flex-col rounded-t-[22px] border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] shadow-[0_-12px_40px_-12px_rgb(0_0_0/0.3)] outline-none"
        >
          <div
            onPointerDown={(event) => dragControls.start(event)}
            className="flex cursor-grab touch-none justify-center pt-2.5 pb-1 active:cursor-grabbing"
          >
            <span aria-hidden="true" className="h-1.5 w-10 rounded-full bg-line" />
          </div>
          <Palette
            headingId={headingId}
            columns={4}
            onClose={close}
            closeIcon="x"
            onAdd={onAdd}
            draggable={false}
            hint={strings.components.hintNarrow}
          />
        </m.div>
      )}
    </AnimatePresence>
  );
}

interface PaletteProps extends PaletteActions {
  headingId: string;
  columns: 3 | 4;
  onClose: () => void;
  closeIcon: 'panel' | 'x';
  /** Whether tiles can be dragged onto the diagram. */
  draggable: boolean;
  hint: string;
}

function Palette({ headingId, columns, onClose, closeIcon, onAdd, draggable, hint }: PaletteProps) {
  const strings = useStrings();
  const [query, setQuery] = useState('');
  const needle = folded(query.trim());
  // The English name also matches, since many cloud terms are known in English.
  const matches = (definition: NodeDefinition) =>
    folded(strings.kinds[definition.kind].label).includes(needle) ||
    folded(definition.label).includes(needle);
  const groups = PALETTE_ORDER.map((category) => ({
    category,
    definitions: DEFINITIONS.filter(
      (definition) => definition.category === category && matches(definition),
    ),
  })).filter((group) => group.definitions.length > 0);
  let order = 0;

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return;
    event.stopPropagation();
    onClose();
  };
  const CloseIcon = closeIcon === 'panel' ? PanelLeftClose : X;

  return (
    <div onKeyDown={onKeyDown} className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between py-2 pr-2 pl-4">
        <h2 id={headingId} className="font-semibold">
          {strings.components.title}
        </h2>
        <Button
          variant="ghost"
          size="icon"
          aria-label={strings.components.close}
          title={strings.components.close}
          onClick={onClose}
        >
          <CloseIcon size={17} aria-hidden="true" />
        </Button>
      </div>
      <p className="-mt-1 px-4 pb-2 text-xs text-muted">{hint}</p>
      <div className="px-3 pb-2">
        <label className="flex h-9 items-center gap-2 rounded-control bg-surface-muted px-3 text-muted transition-shadow focus-within:ring-2 focus-within:ring-focus">
          <Search size={15} aria-hidden="true" />
          <span className="sr-only">{strings.components.search}</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={strings.components.search}
            className="min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-muted"
          />
        </label>
      </div>
      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-3 pb-3">
        <AnimatePresence initial={false}>
          {groups.length === 0 && (
            <m.p
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="px-1 py-6 text-center text-muted"
            >
              {strings.components.noMatches(query.trim())}
            </m.p>
          )}
        </AnimatePresence>
        <AnimatePresence initial={false} mode="popLayout">
          {groups.map(({ category, definitions }) => (
            <m.div
              key={category}
              layout
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2, ease: EASE_OUT }}
              className="pt-3"
            >
              <h3 className="px-1 pb-1.5 text-xs font-medium text-muted">
                {strings.components.categories[category]}
              </h3>
              <ul className={`grid gap-1.5 ${columns === 4 ? 'grid-cols-4' : 'grid-cols-3'}`}>
                <AnimatePresence initial={true} mode="popLayout">
                  {definitions.map((definition) => (
                    <PaletteTile
                      key={definition.kind}
                      definition={definition}
                      delay={Math.min(order++ * 0.012, 0.3)}
                      onAdd={onAdd}
                      draggable={draggable}
                    />
                  ))}
                </AnimatePresence>
              </ul>
            </m.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

interface PaletteTileProps extends PaletteActions {
  definition: NodeDefinition;
  delay: number;
  draggable: boolean;
}

function PaletteTile({ definition, delay, onAdd, draggable }: PaletteTileProps) {
  const strings = useStrings();
  const Icon = KIND_ICONS[definition.kind];
  const text = strings.kinds[definition.kind];
  return (
    <m.li
      layout
      initial={{ opacity: 0, scale: 0.85, y: 6 }}
      animate={{ opacity: 1, scale: 1, y: 0, transition: { ...SPRING_POP, delay } }}
      exit={{ opacity: 0, scale: 0.85, transition: { duration: 0.12 } }}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.95 }}
    >
      <button
        type="button"
        title={text.description}
        aria-label={strings.components.add(text.label)}
        draggable={draggable}
        onDragStart={(event) => {
          event.dataTransfer.setData(KIND_MIME, definition.kind);
          event.dataTransfer.effectAllowed = 'copy';
        }}
        onClick={() => onAdd(definition.kind)}
        className={`group flex w-full flex-col items-center gap-1.5 rounded-control px-1 py-2.5 text-center transition-colors hover:bg-surface-muted ${
          draggable ? 'cursor-grab active:cursor-grabbing' : ''
        }`}
      >
        <span
          className="flex size-9 items-center justify-center rounded-[10px] transition-transform duration-200 group-hover:scale-110"
          style={{
            color: `var(--cat-${definition.category})`,
            backgroundColor: `var(--cat-${definition.category}-bg)`,
          }}
        >
          <Icon size={18} strokeWidth={1.75} aria-hidden="true" />
        </span>
        <span aria-hidden="true" className="text-[0.6875rem] leading-tight">
          {text.label}
        </span>
      </button>
    </m.li>
  );
}
