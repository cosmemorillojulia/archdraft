import { ARCHITECTURE_TEMPLATES, type TemplateId } from '@archdraft/core';
import { LazyMotion, MotionConfig } from 'motion/react';
import { useRef, useState } from 'react';
import {
  ComponentsPanel,
  ComponentsSheet,
  ComponentsSheetToggle,
} from './components/ComponentsPanel.tsx';
import { DiagramCard } from './components/DiagramCard.tsx';
import { Header } from './components/Header.tsx';
import { PromptDock } from './components/PromptDock.tsx';
import { DiagramPreview } from './diagram/DiagramPreview.tsx';
import { useMediaQuery, WIDE_SCREEN } from './media.ts';
import { strings } from './strings.ts';

/**
 * Smallest scale of the diagram before the canvas scrolls instead of
 * shrinking it: node labels stay at 12 px or more on phones.
 */
const NARROW_MIN_SCALE = 0.9;
const WIDE_MIN_SCALE = 0.6;

const loadMotionFeatures = () => import('./motion-features.ts').then((module) => module.default);

/**
 * Editor: a fixed header over a full-size canvas, with the rest of the
 * interface floating on the canvas. The palette sits beside the diagram on
 * wide screens and opens as a bottom sheet on narrow ones; while the sheet is
 * open the rest of the page is inert. See docs/modulos/web.md.
 *
 * Motion's animation features (layout animations included) load in a separate
 * chunk right after the first render, and every animation respects the
 * reduced-motion setting of the system.
 */
export function App() {
  const [templateId, setTemplateId] = useState<TemplateId>('three-tier-web');
  // The diagram is the first thing to see; the palette opens on demand.
  const [paletteOpen, setPaletteOpen] = useState(false);
  const wide = useMediaQuery(WIDE_SCREEN);
  const sheetToggleRef = useRef<HTMLButtonElement>(null);
  const sheetOpen = paletteOpen && !wide;
  const graph = ARCHITECTURE_TEMPLATES[templateId];

  return (
    <LazyMotion features={loadMotionFeatures} strict>
      <MotionConfig reducedMotion="user">
        <div inert={sheetOpen} className="flex h-full flex-col">
          <Header />

          <div className="dot-grid relative min-h-0 flex-1 overflow-hidden">
            <main
              aria-label={strings.canvas.label}
              className={`absolute inset-0 flex px-4 pt-32 pb-48 transition-[padding] duration-500 ease-out-soft sm:px-8 md:pt-6 md:pb-36 ${paletteOpen && wide ? 'lg:pl-80' : ''}`}
            >
              <DiagramPreview
                graph={graph}
                direction={wide ? 'LR' : 'TB'}
                minScale={wide ? WIDE_MIN_SCALE : NARROW_MIN_SCALE}
              />
            </main>

            {wide && (
              <aside className="pointer-events-none absolute top-3 bottom-36 left-3 z-10 flex items-start">
                <ComponentsPanel open={paletteOpen} onOpenChange={setPaletteOpen} />
              </aside>
            )}

            <div className="pointer-events-none absolute inset-x-3 top-3 z-10 flex justify-end md:left-auto">
              <DiagramCard graph={graph} />
            </div>

            {!wide && (
              <div className="pointer-events-none absolute right-3 bottom-34 z-20">
                <ComponentsSheetToggle
                  open={paletteOpen}
                  onOpenChange={setPaletteOpen}
                  toggleRef={sheetToggleRef}
                />
              </div>
            )}

            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center px-3 pb-4">
              <PromptDock templateId={templateId} onTemplateChange={setTemplateId} />
            </div>
          </div>
        </div>

        {!wide && (
          <ComponentsSheet
            open={paletteOpen}
            onOpenChange={setPaletteOpen}
            toggleRef={sheetToggleRef}
          />
        )}
      </MotionConfig>
    </LazyMotion>
  );
}
