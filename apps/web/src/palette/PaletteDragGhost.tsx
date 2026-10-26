import {
  defaultSizeOf,
  getNodeDefinition,
  isContainerKind,
  isShapeKind,
  type NodeKind,
  type Point,
} from '@archdraft/core';
import { useReactFlow } from '@xyflow/react';
import { AnimatePresence, m } from 'motion/react';
import { createPortal } from 'react-dom';
import { useStrings } from '../i18n/locale.ts';
import { KIND_ICONS } from '../icons.ts';
import { SPRING_POP } from '../motion.ts';
import { usePaletteDrag } from './palette-drag.ts';

/**
 * What a palette tile becomes while it is dragged: the node itself, at the
 * size it will have on the diagram at the current zoom, under the pointer.
 * Over a panel, where letting go adds nothing, it fades.
 */
export function PaletteDragGhost() {
  const drag = usePaletteDrag((state) => state.drag);
  const strings = useStrings();
  const flow = useReactFlow();

  return createPortal(
    <AnimatePresence>
      {drag?.drawFrom !== null && drag?.drawFrom !== undefined && (
        <Drawing key="drawing" kind={drag.kind} from={drag.drawFrom} to={drag.point} />
      )}
      {drag && (
        <div
          key="ghost"
          aria-hidden="true"
          data-palette-ghost
          className="pointer-events-none fixed top-0 left-0 z-50"
          style={{ transform: `translate(${drag.point.x}px, ${drag.point.y}px)` }}
        >
          {drag.drawFrom === null ? (
            <Ghost
              kind={drag.kind}
              label={strings.kinds[drag.kind].label}
              zoom={flow.getZoom()}
              faded={!drag.overCanvas || drag.overDiscard}
            />
          ) : null}
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

function Ghost({
  kind,
  label,
  zoom,
  faded,
}: {
  kind: Parameters<typeof defaultSizeOf>[0];
  label: string;
  zoom: number;
  faded: boolean;
}) {
  const { width, height } = defaultSizeOf(kind);
  const definition = getNodeDefinition(kind);
  const Icon = KIND_ICONS[kind];
  const shape = isShapeKind(kind);
  const container = isContainerKind(kind);
  return (
    <m.div
      initial={{ opacity: 0, scale: 0.7 }}
      animate={{ opacity: faded ? 0.45 : 0.92, scale: faded ? 0.92 : 1 }}
      exit={{ opacity: 0, scale: 0.7, transition: { duration: 0.12 } }}
      transition={SPRING_POP}
      className="-translate-x-1/2 -translate-y-1/2"
      style={{ width: width * zoom, height: height * zoom }}
    >
      <div
        className={`flex h-full w-full origin-top-left items-center gap-2.5 border bg-surface px-3 shadow-[0_12px_28px_-8px_rgb(17_24_39/0.35)] ${
          shape && kind === 'circle' ? 'justify-center rounded-full' : 'rounded-xl'
        } ${container ? 'items-start border-dashed pt-3' : ''} ${shape ? 'justify-center' : ''}`}
        style={{
          borderColor: 'var(--accent)',
          // Drawn at zoom 1 and scaled, so it looks like the node will.
          width: width,
          height: height,
          transform: `scale(${zoom})`,
        }}
      >
        {!shape && (
          <span
            className="flex size-9 shrink-0 items-center justify-center rounded-[10px]"
            style={{
              color: `var(--cat-${definition.category})`,
              backgroundColor: `var(--cat-${definition.category}-bg)`,
            }}
          >
            <Icon size={18} strokeWidth={1.75} />
          </span>
        )}
        <span className="truncate text-[13px] font-semibold">{label}</span>
      </div>
    </m.div>
  );
}

/** The outline of a shape being drawn on the diagram, from where the press started to the pointer. */
function Drawing({ kind, from, to }: { kind: NodeKind; from: Point; to: Point }) {
  const left = Math.min(from.x, to.x);
  const top = Math.min(from.y, to.y);
  const width = Math.abs(to.x - from.x);
  const height = Math.abs(to.y - from.y);
  return (
    <div
      aria-hidden="true"
      data-palette-drawing
      className="pointer-events-none fixed z-50"
      style={{ left, top, width, height }}
    >
      {kind === 'diamond' ? (
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="h-full w-full overflow-visible"
        >
          <path
            d="M50 0 L100 50 L50 100 L0 50 Z"
            vectorEffect="non-scaling-stroke"
            strokeWidth={1.5}
            strokeLinejoin="round"
            className="fill-accent/10 stroke-accent"
          />
        </svg>
      ) : (
        <div
          className={`h-full w-full border-[1.5px] border-accent bg-accent/10 ${
            kind === 'circle' ? 'rounded-full' : 'rounded-md'
          }`}
        />
      )}
    </div>
  );
}
