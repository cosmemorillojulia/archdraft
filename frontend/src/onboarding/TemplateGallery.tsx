import {
  ARCHITECTURE_TEMPLATES,
  isContainerKind,
  isShapeKind,
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
import { TEMPLATE_GROUPS, TEMPLATE_LEVELS } from './template-groups.ts';
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
  /** How complex it is, beside the meta. */
  badge?: string;
  current?: boolean;
  onChoose: () => void;
}

function Card({ icon, name, description, meta, badge, current = false, onChoose }: CardProps) {
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
      {/* Cut on screen to keep the cards even; the whole text is still read out. */}
      <span className="line-clamp-3 text-sm text-muted">{description}</span>
      {(meta !== undefined || badge !== undefined) && (
        <span className="mt-auto flex items-center justify-between gap-2 pt-1 text-xs text-muted">
          <span className="min-w-0 truncate">{meta}</span>
          {badge !== undefined && (
            <span className="shrink-0 rounded-full border border-line px-2 py-0.5">{badge}</span>
          )}
        </span>
      )}
    </button>
  );
}

/**
 * The starting points by what they are for (`TEMPLATE_GROUPS`), each with what it is, its cloud,
 * its size and how complex it is, and a blank diagram. Choosing one opens it, as the menu of the
 * header does, and closes the gallery.
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
      <div className="flex flex-col gap-6">
        {TEMPLATE_GROUPS.map((group) => (
          <section key={group.id} aria-labelledby={`gallery-${group.id}`}>
            <h3
              id={`gallery-${group.id}`}
              className="mb-2.5 text-xs font-semibold tracking-wide text-muted uppercase"
            >
              {strings.gallery.groups[group.id]}
            </h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {group.templates.map((id) => {
                const Icon = TEMPLATE_ICONS[id];
                const count = componentCount(id);
                return (
                  <Card
                    key={id}
                    icon={<Icon size={17} aria-hidden="true" />}
                    name={strings.prompt.templateNames[id]}
                    description={localizedTemplate(id, locale).description}
                    meta={`${strings.providers[ARCHITECTURE_TEMPLATES[id].provider]} · ${count} ${strings.card.components(count)}`}
                    badge={strings.gallery.levels[TEMPLATE_LEVELS[id]]}
                    current={id === current}
                    onChoose={() => {
                      void openTemplate(id, direction);
                      onClose();
                    }}
                  />
                );
              })}
            </div>
          </section>
        ))}
        <section aria-labelledby="gallery-blank">
          <h3
            id="gallery-blank"
            className="mb-2.5 text-xs font-semibold tracking-wide text-muted uppercase"
          >
            {strings.gallery.groups.blank}
          </h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
        </section>
      </div>
    </Modal>
  );
}
