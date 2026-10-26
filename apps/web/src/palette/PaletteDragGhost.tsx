import {
  defaultSizeOf,
  getNodeDefinition,
  isContainerKind,
  isShapeKind,
  type NodeKind,
} from '@archdraft/core';
import { useReactFlow } from '@xyflow/react';
import { AnimatePresence, m } from 'motion/react';
import { createPortal } from 'react-dom';
import { useStrings } from '../i18n/locale.ts';
import { KIND_ICONS } from '../icons.ts';
import { SPRING_POP } from '../motion.ts';
import { SHAPE_FILL, ShapeBody } from '../canvas/ShapeNode.tsx';
import { usePaletteDrag, type DrawnBox } from './palette-drag.ts';

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
      {drag?.drawing !== null && drag?.drawing !== undefined && (
        <Drawing key="drawing" kind={drag.kind} box={drag.drawing} />
      )}
      {drag && (
        <div
          key="ghost"
          aria-hidden="true"
          data-palette-ghost
          className="pointer-events-none fixed top-0 left-0 z-50"
          style={{ transform: `translate(${drag.point.x}px, ${drag.point.y}px)` }}
        >
          {/* A shape over the diagram is drawn, not carried: the crosshair is its cursor. */}
          {drag.drawing === null &&
          !(
            drag.mode === 'carry' &&
            isShapeKind(drag.kind) &&
            drag.overCanvas &&
            !drag.overDiscard
          ) ? (
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

/** A shape being drawn on the diagram: the very figure it will be, so nothing changes on release. */
function Drawing({ kind, box }: { kind: NodeKind; box: DrawnBox }) {
  const left = Math.min(box.from.x, box.to.x);
  const top = Math.min(box.from.y, box.to.y);
  return (
    <div
      aria-hidden="true"
      data-palette-drawing
      className="pointer-events-none fixed z-50"
      style={{
        left,
        top,
        width: Math.abs(box.to.x - box.from.x),
        height: Math.abs(box.to.y - box.from.y),
      }}
    >
      <ShapeBody kind={kind} stroke="var(--accent)" fill={SHAPE_FILL(kind)} selected />
    </div>
  );
}
