import { ARCHITECTURE_TEMPLATES } from '@archdraft/core';
import { useState } from 'react';
import { BuildPanel } from './layout/BuildPanel.tsx';
import { Canvas } from './layout/Canvas.tsx';
import { DetailsPanel } from './layout/DetailsPanel.tsx';
import { Header } from './layout/Header.tsx';
import { strings } from './strings.ts';
import { useTheme } from './theme.ts';

type Pane = 'build' | 'diagram' | 'details';
const PANES: readonly Pane[] = ['build', 'diagram', 'details'];

const DEFAULT_GRAPH = ARCHITECTURE_TEMPLATES['three-tier-web'];

/**
 * Editor shell. On wide screens the three panes sit side by side; below the
 * `lg` breakpoint a switcher shows one pane at a time.
 */
export function App() {
  const [theme, toggleTheme] = useTheme();
  const [pane, setPane] = useState<Pane>('diagram');
  const display = (target: Pane) => (target === pane ? 'flex' : 'hidden lg:flex');

  return (
    <div className="flex h-full flex-col">
      <Header theme={theme} onToggleTheme={toggleTheme} />

      <nav
        aria-label={strings.panes.switcher}
        className="flex shrink-0 border-b border-rule lg:hidden"
      >
        {PANES.map((target) => (
          <button
            key={target}
            type="button"
            aria-pressed={target === pane}
            onClick={() => setPane(target)}
            className="-mb-px flex-1 border-b-2 border-transparent py-2.5 text-sm font-medium text-lead aria-pressed:border-diazo aria-pressed:text-graphite"
          >
            {strings.panes[target]}
          </button>
        ))}
      </nav>

      <main className="flex min-h-0 flex-1">
        <aside
          aria-label={strings.panes.build}
          className={`${display('build')} w-full shrink-0 flex-col overflow-y-auto p-4 lg:w-80 lg:border-r lg:border-rule`}
        >
          <BuildPanel />
        </aside>
        <div className={`${display('diagram')} min-w-0 flex-1`}>
          <Canvas graph={DEFAULT_GRAPH} />
        </div>
        <aside
          aria-label={strings.panes.details}
          className={`${display('details')} w-full shrink-0 flex-col lg:w-80 lg:border-l lg:border-rule`}
        >
          <DetailsPanel />
        </aside>
      </main>
    </div>
  );
}
