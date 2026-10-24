import { ARCHITECTURE_TEMPLATES, type TemplateId } from '@archdraft/core';
import { useState } from 'react';
import { ComponentsPanel } from './components/ComponentsPanel.tsx';
import { PromptDock } from './components/PromptDock.tsx';
import { TopBar } from './components/TopBar.tsx';
import { DiagramPreview } from './diagram/DiagramPreview.tsx';
import { strings } from './strings.ts';
import { useTheme } from './theme.ts';

/**
 * Canvas-first editor: the diagram fills the window and the interface floats
 * over it, see docs/modulos/web.md.
 */
export function App() {
  const [theme, toggleTheme] = useTheme();
  const [templateId, setTemplateId] = useState<TemplateId>('three-tier-web');
  // The diagram is the first thing to see; the palette opens on demand.
  const [paletteOpen, setPaletteOpen] = useState(false);
  const graph = ARCHITECTURE_TEMPLATES[templateId];

  return (
    <div className="dot-grid relative h-full overflow-hidden">
      <main
        aria-label={strings.canvas.label}
        className={`absolute inset-0 flex px-4 pt-20 pb-36 transition-[padding] duration-300 ease-out-soft sm:px-8 ${paletteOpen ? 'lg:pl-80' : ''}`}
      >
        <DiagramPreview graph={graph} />
      </main>

      <TopBar graph={graph} theme={theme} onToggleTheme={toggleTheme} />

      <aside className="pointer-events-none absolute top-17 bottom-36 left-3 z-10 flex items-start">
        <ComponentsPanel open={paletteOpen} onOpenChange={setPaletteOpen} />
      </aside>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center px-3 pb-4">
        <PromptDock templateId={templateId} onTemplateChange={setTemplateId} />
      </div>
    </div>
  );
}
