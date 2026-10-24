import { type KeyboardEvent, type ReactNode, useId, useRef, useState } from 'react';

export interface TabItem {
  id: string;
  label: string;
  content: ReactNode;
}

interface TabsProps {
  label: string;
  tabs: readonly TabItem[];
}

/**
 * Tabs following the WAI-ARIA pattern: one tab stop for the whole list,
 * arrow keys, Home and End move between tabs and select them.
 */
export function Tabs({ label, tabs }: TabsProps) {
  const [selected, setSelected] = useState(0);
  const baseId = useId();
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const onKeyDown = (event: KeyboardEvent) => {
    const last = tabs.length - 1;
    const targets: Record<string, number> = {
      ArrowRight: selected === last ? 0 : selected + 1,
      ArrowLeft: selected === 0 ? last : selected - 1,
      Home: 0,
      End: last,
    };
    const next = targets[event.key];
    if (next === undefined) return;
    event.preventDefault();
    setSelected(next);
    tabRefs.current[next]?.focus();
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        role="tablist"
        aria-label={label}
        onKeyDown={onKeyDown}
        className="flex shrink-0 gap-5 border-b border-rule px-4"
      >
        {tabs.map((tab, index) => (
          <button
            key={tab.id}
            ref={(element) => {
              tabRefs.current[index] = element;
            }}
            type="button"
            role="tab"
            id={`${baseId}-tab-${tab.id}`}
            aria-selected={index === selected}
            aria-controls={`${baseId}-panel-${tab.id}`}
            tabIndex={index === selected ? 0 : -1}
            onClick={() => setSelected(index)}
            className="-mb-px border-b-2 border-transparent py-3 text-sm font-medium text-lead transition-colors hover:text-graphite aria-selected:border-diazo aria-selected:text-graphite"
          >
            {tab.label}
          </button>
        ))}
      </div>
      {tabs.map((tab, index) => (
        <div
          key={tab.id}
          role="tabpanel"
          id={`${baseId}-panel-${tab.id}`}
          aria-labelledby={`${baseId}-tab-${tab.id}`}
          hidden={index !== selected}
          tabIndex={0}
          className="min-h-0 flex-1 overflow-y-auto p-4"
        >
          {tab.content}
        </div>
      ))}
    </div>
  );
}
