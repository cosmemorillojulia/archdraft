import { ARCHITECTURE_TEMPLATES, type TemplateId } from '@archdraft/core';
import { LazyMotion, MotionConfig } from 'motion/react';
import { useState } from 'react';
import { ComponentsPanel } from './components/ComponentsPanel.tsx';
import { DiagramCard } from './components/DiagramCard.tsx';
import { Header } from './components/Header.tsx';
import { PromptDock } from './components/PromptDock.tsx';
import { DiagramPreview } from './diagram/DiagramPreview.tsx';
import { strings } from './strings.ts';
import { useTheme } from './theme.ts';

const loadMotionFeatures = () => import('./motion-features.ts').then((module) => module.default);

/**
 * Editor: a fixed header over a full-size canvas, with the rest of the
 * interface floating on the canvas. See docs/modulos/web.md.
 *
 * Motion's animation features (layout animations included) load in a separate
 * chunk right after the first render, and every animation respects the
 * reduced-motion setting of the system.
 */
export function App() {
  const [theme, toggleTheme] = useTheme();
  const [templateId, setTemplateId] = useState<TemplateId>('three-tier-web');
  // The diagram is the first thing to see; the palette opens on demand.
  const [paletteOpen, setPaletteOpen] = useState(false);
  const graph = ARCHITECTURE_TEMPLATES[templateId];

  return (
    <LazyMotion features={loadMotionFeatures} strict>
      <MotionConfig reducedMotion="user">
        <div className="flex h-full flex-col">
          <Header theme={theme} onToggleTheme={toggleTheme} />

          <div className="dot-grid relative min-h-0 flex-1 overflow-hidden">
            <main
              aria-label={strings.canvas.label}
              className={`absolute inset-0 flex px-4 pt-32 pb-36 transition-[padding] duration-500 ease-out-soft sm:px-8 md:pt-6 ${paletteOpen ? 'lg:pl-80' : ''}`}
            >
              <DiagramPreview graph={graph} />
            </main>

            <aside className="pointer-events-none absolute top-3 bottom-36 left-3 z-10 hidden items-start md:flex">
              <ComponentsPanel open={paletteOpen} onOpenChange={setPaletteOpen} />
            </aside>

            <div className="pointer-events-none absolute inset-x-3 top-3 z-10 flex justify-end md:left-auto">
              <DiagramCard graph={graph} />
            </div>

            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center px-3 pb-4">
              <PromptDock templateId={templateId} onTemplateChange={setTemplateId} />
            </div>
          </div>
        </div>
      </MotionConfig>
    </LazyMotion>
  );
}
