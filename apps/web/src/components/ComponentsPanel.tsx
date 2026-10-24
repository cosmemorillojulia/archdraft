import { NODE_CATALOG, NODE_CATEGORIES, type NodeDefinition } from '@archdraft/core';
import { PanelLeftClose, Search, Shapes } from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';
import { useId, useState } from 'react';
import { EASE_OUT, SPRING_POP, SPRING_SLIDE } from '../motion.ts';
import { KIND_ICONS } from '../icons.ts';
import { strings } from '../strings.ts';
import { Button } from './Button.tsx';

const DEFINITIONS = Object.values(NODE_CATALOG);

interface ComponentsPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Floating palette with every kind of the catalog, grouped by category and
 * searchable. It slides in from the left, its tiles cascade in, and the grid
 * reflows smoothly while filtering.
 */
export function ComponentsPanel({ open, onOpenChange }: ComponentsPanelProps) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      {open ? (
        <m.div
          key="panel"
          initial={{ opacity: 0, x: -24, scale: 0.98 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={{ opacity: 0, x: -24, scale: 0.98, transition: { duration: 0.18, ease: EASE_OUT } }}
          transition={SPRING_SLIDE}
          className="flex max-h-full"
        >
          <Palette onClose={() => onOpenChange(false)} />
        </m.div>
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

function Palette({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('');
  const headingId = useId();
  const needle = query.trim().toLowerCase();
  const groups = NODE_CATEGORIES.map((category) => ({
    category,
    definitions: DEFINITIONS.filter(
      (definition) =>
        definition.category === category && definition.label.toLowerCase().includes(needle),
    ),
  })).filter((group) => group.definitions.length > 0);
  let order = 0;

  return (
    <section
      aria-labelledby={headingId}
      className="floating pointer-events-auto flex max-h-full w-72 flex-col rounded-panel"
    >
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
          <PanelLeftClose size={17} aria-hidden="true" />
        </Button>
      </div>
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
      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-3 pb-3">
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
              <ul className="grid grid-cols-3 gap-1.5">
                <AnimatePresence initial={true} mode="popLayout">
                  {definitions.map((definition) => (
                    <PaletteTile
                      key={definition.kind}
                      definition={definition}
                      delay={Math.min(order++ * 0.012, 0.3)}
                    />
                  ))}
                </AnimatePresence>
              </ul>
            </m.div>
          ))}
        </AnimatePresence>
      </div>
    </section>
  );
}

function PaletteTile({ definition, delay }: { definition: NodeDefinition; delay: number }) {
  const Icon = KIND_ICONS[definition.kind];
  return (
    <m.li
      layout
      title={definition.description}
      initial={{ opacity: 0, scale: 0.85, y: 6 }}
      animate={{ opacity: 1, scale: 1, y: 0, transition: { ...SPRING_POP, delay } }}
      exit={{ opacity: 0, scale: 0.85, transition: { duration: 0.12 } }}
      whileHover={{ y: -2 }}
      className="group flex cursor-default flex-col items-center gap-1.5 rounded-control px-1 py-2.5 text-center transition-colors hover:bg-surface-muted"
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
      <span className="text-[0.6875rem] leading-tight">{definition.label}</span>
    </m.li>
  );
}
