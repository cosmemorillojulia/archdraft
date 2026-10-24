import { NODE_CATALOG, NODE_CATEGORIES, type NodeDefinition } from '@archdraft/core';
import { PanelLeftClose, Search, Shapes } from 'lucide-react';
import { useId, useState } from 'react';
import { KIND_ICONS } from '../icons.ts';
import { strings } from '../strings.ts';
import { Button } from './Button.tsx';

const DEFINITIONS = Object.values(NODE_CATALOG);

interface ComponentsPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Floating palette with every kind of the catalog, grouped by category and searchable. */
export function ComponentsPanel({ open, onOpenChange }: ComponentsPanelProps) {
  const [query, setQuery] = useState('');
  const headingId = useId();

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => onOpenChange(true)}
        className="floating pointer-events-auto inline-flex h-10 animate-fade items-center gap-2 rounded-panel px-3.5 font-medium transition-colors hover:text-accent"
      >
        <Shapes size={16} aria-hidden="true" />
        {strings.components.open}
      </button>
    );
  }

  const needle = query.trim().toLowerCase();
  const groups = NODE_CATEGORIES.map((category) => ({
    category,
    definitions: DEFINITIONS.filter(
      (definition) =>
        definition.category === category && definition.label.toLowerCase().includes(needle),
    ),
  })).filter((group) => group.definitions.length > 0);

  return (
    <section
      aria-labelledby={headingId}
      className="floating pointer-events-auto flex max-h-full w-72 animate-rise flex-col rounded-panel"
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
          onClick={() => onOpenChange(false)}
        >
          <PanelLeftClose size={17} aria-hidden="true" />
        </Button>
      </div>
      <div className="px-3 pb-2">
        <label className="flex h-9 items-center gap-2 rounded-control bg-surface-muted px-3 text-muted focus-within:ring-2 focus-within:ring-focus">
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
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        {groups.length === 0 && (
          <p className="px-1 py-6 text-center text-muted">
            {strings.components.noMatches(query.trim())}
          </p>
        )}
        {groups.map(({ category, definitions }) => (
          <div key={category} className="pt-3">
            <h3 className="px-1 pb-1.5 text-xs font-medium text-muted">
              {strings.components.categories[category]}
            </h3>
            <ul className="grid grid-cols-3 gap-1.5">
              {definitions.map((definition) => (
                <PaletteTile key={definition.kind} definition={definition} />
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

function PaletteTile({ definition }: { definition: NodeDefinition }) {
  const Icon = KIND_ICONS[definition.kind];
  return (
    <li
      title={definition.description}
      className="flex flex-col items-center gap-1.5 rounded-control px-1 py-2.5 text-center transition-colors hover:bg-surface-muted"
    >
      <span
        className="flex size-9 items-center justify-center rounded-[10px]"
        style={{
          color: `var(--cat-${definition.category})`,
          backgroundColor: `var(--cat-${definition.category}-bg)`,
        }}
      >
        <Icon size={18} strokeWidth={1.75} aria-hidden="true" />
      </span>
      <span className="text-[0.6875rem] leading-tight">{definition.label}</span>
    </li>
  );
}
