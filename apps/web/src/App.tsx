import type { NodeKind, TemplateId } from '@archdraft/core';
import type { LayoutDirection } from '@archdraft/layout';
import { ReactFlowProvider, useReactFlow } from '@xyflow/react';
import { AnimatePresence, LazyMotion, m, MotionConfig } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DiagramCanvas } from './canvas/DiagramCanvas.tsx';
import type { Insets } from './canvas/geometry.ts';
import {
  ComponentsPanel,
  ComponentsSheet,
  ComponentsSheetToggle,
} from './components/ComponentsPanel.tsx';
import { DiagramCard } from './components/DiagramCard.tsx';
import { EditorNotice } from './components/EditorNotice.tsx';
import { Header } from './components/Header.tsx';
import { PanelSlot } from './components/PanelSlot.tsx';
import { PromptDock } from './components/PromptDock.tsx';
import { openTemplate } from './editor/open-template.ts';
import { useEditorShortcuts } from './editor/shortcuts.ts';
import { editorStore, useEditor } from './editor/store.ts';
import { EXTRA_WIDE_SCREEN, useMediaQuery, WIDE_SCREEN } from './media.ts';
import { useReview } from './review/review-store.ts';
import { EASE_OUT } from './motion.ts';
import { strings } from './strings.ts';

/**
 * Zoom of the first view: the diagram is not shrunk below it and the canvas
 * pans instead, so node labels stay at 12 px or more on phones.
 */
const NARROW_READABLE_ZOOM = 0.9;
const WIDE_READABLE_ZOOM = 0.6;

/** Width of the palette panel plus its margins, in pixels. */
const PALETTE_WIDTH = 304;

const DEFAULT_TEMPLATE: TemplateId = 'three-tier-web';

/** Space taken by the floating interface around the canvas, in pixels. */
function canvasInsets(wide: boolean, paletteOpen: boolean): Insets {
  return wide
    ? { top: 24, right: 24, bottom: 150, left: paletteOpen ? PALETTE_WIDTH + 16 : 24 }
    : { top: 150, right: 16, bottom: 200, left: 16 };
}

const loadMotionFeatures = () => import('./motion-features.ts').then((module) => module.default);

/**
 * Editor: a fixed header over a full-size canvas, with the rest of the
 * interface floating on the canvas. See docs/modulos/web.md.
 *
 * Motion's animation features (layout animations included) load in a separate
 * chunk right after the first render, and every animation respects the
 * reduced-motion setting of the system. The React Flow provider wraps the
 * whole editor, so the palette can place components at the centre of the view.
 */
export function App() {
  return (
    <LazyMotion features={loadMotionFeatures} strict>
      <MotionConfig reducedMotion="user">
        <ReactFlowProvider>
          <Editor />
        </ReactFlowProvider>
      </MotionConfig>
    </LazyMotion>
  );
}

/**
 * The palette sits beside the diagram on wide screens and opens as a bottom
 * sheet on narrow ones; while the sheet is open the rest of the page is
 * inert. Selecting something opens the inspector, and the review status of
 * the diagram card opens the design review, in the same place: beside the
 * diagram card on wide screens, and in place of the prompt on narrow ones.
 */
function Editor() {
  // The diagram is the first thing to see; the palette opens on demand.
  const [paletteOpen, setPaletteOpen] = useState(false);
  const wide = useMediaQuery(WIDE_SCREEN);
  const extraWide = useMediaQuery(EXTRA_WIDE_SCREEN);
  const sheetToggleRef = useRef<HTMLButtonElement>(null);
  const canvasRef = useRef<HTMLElement>(null);
  const sheetOpen = paletteOpen && !wide;
  const graph = useEditor((state) => state.current?.document.graph);
  const templateId = useEditor((state) => state.opening ?? state.current?.templateId ?? null);
  const selecting = useEditor((state) => state.selection !== null);
  const reviewing = useReview((state) => state.open);
  // On narrow screens a panel takes the place of the prompt.
  const panelOpen = selecting || reviewing;
  const flow = useReactFlow();
  const insets = useMemo(() => canvasInsets(wide, paletteOpen), [wide, paletteOpen]);

  useEditorShortcuts(!sheetOpen);

  // Templates are laid out in the direction that suits the screen they are opened on.
  const direction: LayoutDirection = wide ? 'LR' : 'TB';
  const firstDirection = useRef(direction);
  useEffect(() => {
    void openTemplate(DEFAULT_TEMPLATE, firstDirection.current);
  }, []);

  const addAtCentre = useCallback(
    (kind: NodeKind) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const centre = flow.screenToFlowPosition({
        x: rect.left + insets.left + (rect.width - insets.left - insets.right) / 2,
        y: rect.top + insets.top + (rect.height - insets.top - insets.bottom) / 2,
      });
      editorStore.getState().addNode(kind, centre);
      if (!wide) setPaletteOpen(false);
    },
    [flow, insets, wide],
  );

  return (
    <>
      <div inert={sheetOpen} className="flex h-full flex-col">
        <Header />

        <div className="relative min-h-0 flex-1 overflow-hidden bg-canvas">
          <main ref={canvasRef} aria-label={strings.canvas.label} className="absolute inset-0">
            <DiagramCanvas
              insets={insets}
              readableZoom={wide ? WIDE_READABLE_ZOOM : NARROW_READABLE_ZOOM}
              showMiniMap={extraWide}
              controlsClassName={wide ? 'bottom-4 left-3' : 'bottom-34 left-3'}
              inspectorPlacement={wide ? 'side' : 'bottom'}
            />
          </main>

          {wide && (
            <aside className="pointer-events-none absolute top-3 bottom-36 left-3 z-10 flex items-start">
              <ComponentsPanel
                open={paletteOpen}
                onOpenChange={setPaletteOpen}
                onAdd={addAtCentre}
              />
            </aside>
          )}

          <div className="pointer-events-none absolute inset-x-3 top-3 bottom-36 z-10 flex flex-col items-end gap-3 md:left-auto md:w-80">
            {graph && <DiagramCard graph={graph} />}
            {wide && <PanelSlot placement="side" />}
          </div>

          <div className="pointer-events-none absolute inset-x-3 top-3 z-30 flex justify-center md:top-4">
            <EditorNotice />
          </div>

          <AnimatePresence initial={false}>
            {!(panelOpen && !wide) && (
              <m.div
                key="compose"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 16, transition: { duration: 0.16, ease: EASE_OUT } }}
                transition={{ duration: 0.25, ease: EASE_OUT }}
                className="pointer-events-none absolute inset-x-0 bottom-0 z-20"
              >
                {!wide && (
                  <div className="pointer-events-none absolute right-3 bottom-34">
                    <ComponentsSheetToggle
                      open={paletteOpen}
                      onOpenChange={setPaletteOpen}
                      toggleRef={sheetToggleRef}
                    />
                  </div>
                )}
                <div className="pointer-events-none flex justify-center px-3 pb-4">
                  <PromptDock
                    templateId={templateId}
                    onTemplateChange={(id) => void openTemplate(id, direction)}
                  />
                </div>
              </m.div>
            )}
          </AnimatePresence>

          {!wide && (
            <div className="pointer-events-none absolute inset-x-3 bottom-3 z-30 flex justify-center">
              <PanelSlot placement="bottom" />
            </div>
          )}
        </div>
      </div>

      {!wide && (
        <ComponentsSheet
          open={paletteOpen}
          onOpenChange={setPaletteOpen}
          toggleRef={sheetToggleRef}
          onAdd={addAtCentre}
        />
      )}
    </>
  );
}
