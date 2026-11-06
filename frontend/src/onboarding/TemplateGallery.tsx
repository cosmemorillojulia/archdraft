import {
  ARCHITECTURE_TEMPLATES,
  isContainerKind,
  isShapeKind,
  TEMPLATE_IDS,
  type TemplateId,
} from '@archdraft/shared';
import { Plus } from 'lucide-react';
import type { ReactNode } from 'react';
import { openBlank, openTemplate } from '../editor/open-document.ts';
import { useEditor } from '../editor/store.ts';
import { useLocale, useStrings } from '../i18n/locale.ts';
import { localizedTemplate } from '../i18n/templates.ts';
import { useMediaQuery, WIDE_SCREEN } from '../media.ts';
import { Modal } from './Modal.tsx';
import { TEMPLATE_ICONS } from './template-icons.ts';

/** Components of a template, not counting its groups and drawings. */
function componentCount(id: TemplateId): number {
  return ARCHITECTURE_TEMPLATES[id].nodes.filter(
    (node) => !isContainerKind(node.kind) && !isShapeKind(node.kind),
  ).length;
}

interface CardProps {
  icon: ReactNode;
  name: string;
  description: string;
  meta?: string;
  current?: boolean;
  onChoose: () => void;
}

function Card({ icon, name, description, meta, current = false, onChoose }: CardProps) {
  return (
    <button
      type="button"
      onClick={onChoose}
      aria-current={current ? 'true' : undefined}
      className="group flex flex-col gap-2 rounded-control border border-line bg-surface p-4 text-left transition-colors hover:border-accent focus-visible:border-accent aria-[current]:border-accent"
    >
      <span className="flex items-center gap-2.5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-control bg-accent/10 text-accent">
          {icon}
        </span>
        <span className="min-w-0 flex-1 font-semibold">{name}</span>
      </span>
      <span className="text-sm text-muted">{description}</span>
      {meta !== undefined && <span className="mt-auto pt-1 text-xs text-muted">{meta}</span>}
    </button>
  );
}

/**
 * The starting points, each with what it is, its cloud and its size, and a blank diagram.
 * Choosing one opens it, as the menu of the header does, and closes the gallery.
 */
export function TemplateGallery({ onClose }: { onClose: () => void }) {
  const strings = useStrings();
  const locale = useLocale();
  const current = useEditor((state) => state.current?.templateId ?? null);
  const direction = useMediaQuery(WIDE_SCREEN) ? 'LR' : 'TB';

  return (
    <Modal
      title={strings.gallery.title}
      subtitle={strings.gallery.subtitle}
      onClose={onClose}
      width="wide"
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {TEMPLATE_IDS.map((id) => {
          const Icon = TEMPLATE_ICONS[id];
          const count = componentCount(id);
          return (
            <Card
              key={id}
              icon={<Icon size={17} aria-hidden="true" />}
              name={strings.prompt.templateNames[id]}
              description={localizedTemplate(id, locale).description}
              meta={`${strings.providers[ARCHITECTURE_TEMPLATES[id].provider]} · ${count} ${strings.card.components(count)}`}
              current={id === current}
              onChoose={() => {
                void openTemplate(id, direction);
                onClose();
              }}
            />
          );
        })}
        <Card
          icon={<Plus size={17} aria-hidden="true" />}
          name={strings.header.newDiagram}
          description={strings.gallery.blank}
          onChoose={() => {
            openBlank(direction);
            onClose();
          }}
        />
      </div>
    </Modal>
  );
}
