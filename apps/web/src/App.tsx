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
import { DiagramCanvas } from './canvas/DiagramCanvas.tsx';
import type { Insets } from './canvas/geometry.ts';
import { EXTRA_WIDE_SCREEN, useMediaQuery, WIDE_SCREEN } from './media.ts';
import { strings } from './strings.ts';

/**
 * Zoom of the first view: the diagram is not shrunk below it and the canvas
 * pans instead, so node labels stay at 12 px or more on phones.
 */
const NARROW_READABLE_ZOOM = 0.9;
const WIDE_READABLE_ZOOM = 0.6;

/** Width of the palette panel plus its margins, in pixels. */
const PALETTE_WIDTH = 304;

/** Space taken by the floating interface around the canvas, in pixels. */
function canvasInsets(wide: boolean, paletteOpen: boolean): Insets {
  return wide
    ? { top: 24, right: 24, bottom: 150, left: paletteOpen ? PALETTE_WIDTH + 16 : 24 }
    : { top: 150, right: 16, bottom: 200, left: 16 };
}

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
  const extraWide = useMediaQuery(EXTRA_WIDE_SCREEN);
  const sheetToggleRef = useRef<HTMLButtonElement>(null);
  const sheetOpen = paletteOpen && !wide;
  const graph = ARCHITECTURE_TEMPLATES[templateId];

  return (
    <LazyMotion features={loadMotionFeatures} strict>
      <MotionConfig reducedMotion="user">
        <div inert={sheetOpen} className="flex h-full flex-col">
          <Header />

          <div className="relative min-h-0 flex-1 overflow-hidden bg-canvas">
            <main aria-label={strings.canvas.label} className="absolute inset-0">
              <DiagramCanvas
                graph={graph}
                direction={wide ? 'LR' : 'TB'}
                insets={canvasInsets(wide, paletteOpen)}
                readableZoom={wide ? WIDE_READABLE_ZOOM : NARROW_READABLE_ZOOM}
                showMiniMap={extraWide}
                controlsClassName={wide ? 'bottom-4 left-3' : 'bottom-34 left-3'}
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
