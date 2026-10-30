import {
  type ArchEdge,
  type ArchitectureGraph,
  type ArchNode,
  CLOUD_PROVIDERS,
  type CloudProvider,
  DEFAULT_EDGE_STYLE,
  EDGE_PROTOCOLS,
  EDGE_STYLES,
  type EdgeProtocol,
  type EdgeStyle,
  getNodeDefinition,
  isContainerKind,
  isShapeKind,
  LIMITS,
  type NodeAttributes,
  ownEdgeRoute,
  ownEdgeStyle,
  resolveEdgeMode,
} from '@archdraft/core';
import {
  ArrowDown,
  ArrowDownToLine,
  ArrowRight,
  ArrowUp,
  ArrowUpToLine,
  Boxes,
  Cable,
  Copy,
  type LucideIcon,
  Spline,
  Trash2,
  X,
} from 'lucide-react';
import { AnimatePresence, type DragControls, m, type PanInfo, useDragControls } from 'motion/react';
import { type ReactNode, useId, useRef } from 'react';
import {
  canStack,
  type EdgePatch,
  type NodePatch,
  type Selection,
  type StackMove,
} from '../editor/operations.ts';
import { editorStore, useEditor } from '../editor/store.ts';
import { KIND_ICONS } from '../icons.ts';
import { EASE_OUT } from '../motion.ts';
import type { Strings } from '../i18n/en.ts';
import { productName } from '../i18n/labels.ts';
import { useStrings } from '../i18n/locale.ts';
import { Button, type ButtonProps } from './Button.tsx';
import { ChoiceField, NumberField, SelectField, TextField } from './fields.tsx';
import { FloatingPanel, type PanelDrag, type PanelPlacement } from './FloatingPanel.tsx';

type Flag = Exclude<keyof NodeAttributes, 'replicas'>;
const FLAGS: readonly Flag[] = [
  'multiAz',
  'autoscaling',
  'publiclyAccessible',
  'encryptedAtRest',
  'managed',
];
type TriState = 'unset' | 'yes' | 'no';

const triStateOptions = (strings: Strings): readonly { value: TriState; label: string }[] => [
  { value: 'unset', label: strings.inspector.notSet },
  { value: 'yes', label: strings.inspector.yes },
  { value: 'no', label: strings.inspector.no },
];

const toTriState = (value: boolean | undefined): TriState =>
  value === undefined ? 'unset' : value ? 'yes' : 'no';
const fromTriState = (value: TriState): boolean | undefined =>
  value === 'unset' ? undefined : value === 'yes';

/** Attributes without the empty ones; undefined when none is left. */
function cleanAttributes(attributes: NodeAttributes): NodeAttributes | undefined {
  const entries = Object.entries(attributes).filter(([, value]) => value !== undefined);
  return entries.length === 0 ? undefined : Object.fromEntries(entries);
}

/** Distance in pixels, or speed in pixels per second, that expands or collapses the sheet. */
const SHEET_DRAG_DISTANCE = 40;
const SHEET_DRAG_VELOCITY = 300;
/** Pointer movement in pixels below which a press on the handle counts as a tap. */
const TAP_SLOP = 6;
/** Cross-fade between the contents of two selections, or of the strip and the full panel. */
const SWAP = { duration: 0.15, ease: EASE_OUT };

interface InspectorProps {
  placement: PanelPlacement;
  selection: Selection;
  graph: ArchitectureGraph;
  /** On narrow screens, whether it shows every field or only a strip; ignored beside the diagram. */
  expanded: boolean;
}

/** Whether the inspector has something to show. */
export function useInspecting(placement: PanelPlacement): boolean {
  return useEditor((state) => {
    const { selection, current, connectingFrom } = state;
    if (!selection || !current) return false;
    // On narrow screens the panel steps aside while a connection waits for its target.
    if (connectingFrom !== null && placement === 'bottom') return false;
    const { nodes, edges } = current.document.graph;
    const list: readonly { id: string }[] = selection.type === 'node' ? nodes : edges;
    return list.some((item) => item.id === selection.id);
  });
}

/**
 * Floating panel with the properties of the selected component, group or
 * connection (ADR 0014). It appears when something is selected and closes
 * with its button, Escape or a click on the empty canvas. It draws only from
 * its props, so that it can play its exit with the last selection
 * (PanelSlot.tsx).
 *
 * On narrow screens it opens as a strip with the name, the type and the
 * quick actions, so that most of the diagram stays in view. Dragging its
 * handle up, or tapping it, expands it to every field; dragging it down
 * collapses it again. Each new selection opens collapsed.
 */
export function Inspector({ placement, selection, graph, expanded }: InspectorProps) {
  const headingId = useId();
  const dragControls = useDragControls();
  const node =
    selection.type === 'node' ? graph.nodes.find((item) => item.id === selection.id) : undefined;
  const edge =
    selection.type === 'edge' ? graph.edges.find((item) => item.id === selection.id) : undefined;
  const sheet = placement === 'bottom';
  const compact = sheet && !expanded;

  const drag: PanelDrag = {
    controls: dragControls,
    onDragEnd: ({ offset, velocity }: PanInfo) => {
      const up = offset.y < -SHEET_DRAG_DISTANCE || velocity.y < -SHEET_DRAG_VELOCITY;
      const down = offset.y > SHEET_DRAG_DISTANCE || velocity.y > SHEET_DRAG_VELOCITY;
      if (up !== down) editorStore.getState().expandInspector(up);
    },
  };

  return (
    <FloatingPanel placement={placement} labelledBy={headingId} {...(sheet && { drag })}>
      {sheet && <SheetHandle expanded={expanded} controls={dragControls} />}
      <AnimatePresence mode="popLayout" initial={false}>
        <m.div
          key={compact ? `${selection.id}:compact` : selection.id}
          layout={sheet ? 'position' : false}
          // While the sheet changes size, the old content leaves at once and the new one follows.
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { ...SWAP, ...(sheet && { delay: 0.06 }) } }}
          exit={{ opacity: 0, transition: sheet ? { duration: 0.06 } : SWAP }}
          className="flex min-h-0 flex-1 flex-col"
        >
          {node && <NodeForm node={node} graph={graph} headingId={headingId} compact={compact} />}
          {edge && <EdgeForm edge={edge} graph={graph} headingId={headingId} compact={compact} />}
        </m.div>
      </AnimatePresence>
    </FloatingPanel>
  );
}

/** Panel for several nodes chosen together: how many, and what can be done to all of them. */
export function GroupPanel({ placement, count }: { placement: PanelPlacement; count: number }) {
  const strings = useStrings();
  const headingId = useId();
  const title = strings.inspector.chosen(count);
  return (
    <FloatingPanel placement={placement} labelledBy={headingId}>
      <PanelHeader
        headingId={headingId}
        title={title}
        subtitle={strings.inspector.chosenHint}
        icon={
          <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-surface-muted text-muted">
            <Boxes size={18} strokeWidth={1.75} aria-hidden="true" />
          </span>
        }
        closeLabel={strings.inspector.close}
        onClose={() => editorStore.getState().select(null)}
      />
      <Actions>
        <ActionButton
          compact={false}
          variant="danger"
          icon={Trash2}
          label={strings.inspector.delete}
          aria-keyshortcuts="Delete Backspace"
          onClick={() => editorStore.getState().removeSelection()}
          className="ml-auto"
        />
      </Actions>
    </FloatingPanel>
  );
}

/**
 * Grip at the top of the inspector on narrow screens. Dragging it up or down
 * moves the whole panel (FloatingPanel.tsx); a tap, or Enter, toggles it.
 */
function SheetHandle({ expanded, controls }: { expanded: boolean; controls: DragControls }) {
  const strings = useStrings();
  const pressedAt = useRef(0);
  const label = expanded ? strings.inspector.collapse : strings.inspector.expand;
  return (
    <m.button
      type="button"
      // Kept undistorted while the panel changes size.
      layout="position"
      aria-expanded={expanded}
      aria-label={label}
      title={label}
      onPointerDown={(event) => {
        pressedAt.current = event.clientY;
        controls.start(event);
      }}
      onClick={(event) => {
        // A drag ends with a click too; only a press that stayed put, or a key, toggles.
        const tapped = event.detail === 0 || Math.abs(event.clientY - pressedAt.current) < TAP_SLOP;
        if (tapped) editorStore.getState().expandInspector(!expanded);
      }}
      className="group flex w-full shrink-0 cursor-grab touch-none justify-center rounded-t-panel pt-2 pb-1 focus-visible:-outline-offset-2 active:cursor-grabbing"
    >
      <span
        aria-hidden="true"
        className="h-1 w-9 rounded-full bg-line transition-colors group-hover:bg-muted"
      />
    </m.button>
  );
}

interface PanelTitleProps {
  headingId: string;
  title: string;
  subtitle?: string;
  icon: ReactNode;
}

/** Icon, title and subtitle at the top of a panel. */
function PanelTitle({ headingId, title, subtitle, icon }: PanelTitleProps) {
  return (
    <>
      {icon}
      <div className="min-w-0 flex-1">
        <h2 id={headingId} className="truncate leading-tight font-semibold">
          {title}
        </h2>
        {subtitle !== undefined && <p className="truncate text-xs text-muted">{subtitle}</p>}
      </div>
    </>
  );
}

export function PanelHeader({
  closeLabel,
  onClose,
  ...title
}: PanelTitleProps & {
  closeLabel: string;
  onClose: () => void;
}) {
  return (
    <div className="flex items-center gap-3 border-b border-line py-2.5 pr-2 pl-3.5">
      <PanelTitle {...title} />
      <Button
        variant="ghost"
        size="icon"
        aria-label={closeLabel}
        title={closeLabel}
        onClick={onClose}
      >
        <X size={17} aria-hidden="true" />
      </Button>
    </div>
  );
}

/** The collapsed inspector: the title of the selection beside its quick actions. */
function PanelStrip({ actions, ...title }: PanelTitleProps & { actions: ReactNode }) {
  return (
    <div className="flex items-center gap-3 pr-2 pb-2.5 pl-3.5">
      <PanelTitle {...title} />
      <div className="flex shrink-0 items-center gap-0.5 [&>button]:size-10">{actions}</div>
    </div>
  );
}

function Actions({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-0.5 border-t border-line px-2 py-1.5 [&>button]:h-8 [&>button]:gap-1.5 [&>button]:px-2 [&>button]:text-[13px]">
      {children}
    </div>
  );
}

/** A button of the actions bar, or only its icon, named by its label, in the strip. */
function ActionButton({
  compact,
  icon: Icon,
  label,
  ...props
}: ButtonProps & { compact: boolean; icon: LucideIcon; label: string }) {
  return (
    <Button
      size={compact ? 'icon' : 'default'}
      {...(compact && { 'aria-label': label, title: label })}
      {...props}
    >
      <Icon size={compact ? 18 : 15} aria-hidden="true" />
      {!compact && label}
    </Button>
  );
}

/** Moves a box in front of or behind the ones it overlaps; any kind of box has it. */
function OrderControls({ id, graph }: { id: string; graph: ArchitectureGraph }) {
  const strings = useStrings();
  const can = canStack(graph, id);
  const moves: readonly { move: StackMove; icon: LucideIcon; label: string; enabled: boolean }[] = [
    {
      move: 'front',
      icon: ArrowUpToLine,
      label: strings.inspector.bringToFront,
      enabled: can.forward,
    },
    { move: 'forward', icon: ArrowUp, label: strings.inspector.bringForward, enabled: can.forward },
    {
      move: 'backward',
      icon: ArrowDown,
      label: strings.inspector.sendBackward,
      enabled: can.backward,
    },
    {
      move: 'back',
      icon: ArrowDownToLine,
      label: strings.inspector.sendToBack,
      enabled: can.backward,
    },
  ];
  return (
    <section className="flex flex-col gap-2 border-t border-line pt-3.5">
      <h3 className="text-xs font-semibold">{strings.inspector.order}</h3>
      <div className="grid grid-cols-4 gap-1.5">
        {moves.map(({ move, icon: Icon, label, enabled }) => (
          <Button
            key={move}
            variant="ghost"
            size="icon"
            aria-label={label}
            title={label}
            disabled={!enabled}
            onClick={() => editorStore.getState().stackNode(id, move)}
            className="w-full border border-line"
          >
            <Icon size={16} aria-hidden="true" />
          </Button>
        ))}
      </div>
    </section>
  );
}

function NodeForm({
  node,
  graph,
  headingId,
  compact,
}: {
  node: ArchNode;
  graph: ArchitectureGraph;
  headingId: string;
  /** Only the title and the quick actions (the collapsed inspector). */
  compact: boolean;
}) {
  const strings = useStrings();
  const definition = getNodeDefinition(node.kind);
  const Icon = KIND_ICONS[node.kind];
  const container = isContainerKind(node.kind);
  // Shapes, like groups, have no product, provider or operations; unlike groups, they connect.
  const plain = container || isShapeKind(node.kind);
  const update = (patch: NodePatch) => editorStore.getState().updateNode(node.id, patch);
  const { service: _service, ...withoutService } = node;
  const defaultService = productName(withoutService, graph, strings.kinds);
  const attributes = node.attributes ?? {};

  const providerOptions = [
    {
      value: 'default' as const,
      label: strings.inspector.providerDefault(strings.providers[graph.provider]),
    },
    ...CLOUD_PROVIDERS.map((provider) => ({ value: provider, label: strings.providers[provider] })),
  ];

  const title = {
    headingId,
    // A shape or text with no name is introduced by what it is.
    title: node.label === '' ? strings.kinds[node.kind].label : node.label,
    subtitle: strings.kinds[node.kind].label,
    icon: (
      <span
        className="flex size-9 shrink-0 items-center justify-center rounded-[10px]"
        style={{
          color: `var(--cat-${definition.category})`,
          backgroundColor: `var(--cat-${definition.category}-bg)`,
        }}
      >
        <Icon size={18} strokeWidth={1.75} aria-hidden="true" />
      </span>
    ),
  };
  const actions = (
    <>
      {!container && (
        <ActionButton
          compact={compact}
          variant="ghost"
          icon={Spline}
          label={strings.inspector.connect}
          onClick={() => editorStore.getState().startConnection(node.id)}
        />
      )}
      <ActionButton
        compact={compact}
        variant="ghost"
        icon={Copy}
        label={strings.inspector.duplicate}
        aria-keyshortcuts="Control+D Meta+D"
        onClick={() => editorStore.getState().duplicateSelection()}
      />
      <ActionButton
        compact={compact}
        variant="danger"
        icon={Trash2}
        label={strings.inspector.delete}
        aria-keyshortcuts="Delete Backspace"
        onClick={() => editorStore.getState().removeSelection()}
        {...(!compact && { className: 'ml-auto' })}
      />
    </>
  );

  if (compact) return <PanelStrip {...title} actions={actions} />;

  return (
    <>
      <PanelHeader
        {...title}
        closeLabel={strings.inspector.close}
        onClose={() => editorStore.getState().select(null)}
      />
      <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto overscroll-contain px-3.5 py-3">
        <TextField
          label={strings.inspector.name}
          value={node.label}
          maxLength={LIMITS.labelLength}
          required={!isShapeKind(node.kind)}
          onCommit={(label) => update({ label })}
        />
        {!plain && (
          <>
            <TextField
              label={strings.inspector.product}
              value={node.service ?? ''}
              placeholder={defaultService}
              maxLength={LIMITS.serviceLength}
              onCommit={(service) => update({ service: service === '' ? undefined : service })}
            />
            <SelectField<CloudProvider | 'default'>
              label={strings.inspector.provider}
              value={node.provider ?? 'default'}
              options={providerOptions}
              onChange={(provider) =>
                update({ provider: provider === 'default' ? undefined : provider })
              }
            />
          </>
        )}
        <TextField
          label={strings.inspector.description}
          value={node.description ?? ''}
          maxLength={LIMITS.descriptionLength}
          multiline
          onCommit={(description) =>
            update({ description: description === '' ? undefined : description })
          }
        />
        {node.attachedTo !== undefined && (
          <section className="flex items-center justify-between gap-2 rounded-lg bg-surface-muted px-3 py-2 text-xs">
            <span className="min-w-0 truncate">
              {strings.inspector.fixedTo(
                graph.nodes.find((host) => host.id === node.attachedTo)?.label || node.attachedTo,
              )}
            </span>
            <Button
              variant="ghost"
              onClick={() => update({ attachedTo: undefined })}
              className="shrink-0"
            >
              {strings.inspector.detach}
            </Button>
          </section>
        )}
        <OrderControls id={node.id} graph={graph} />
        {!plain && (
          <section className="flex flex-col gap-2.5 border-t border-line pt-3.5">
            <h3 className="text-xs font-semibold">{strings.inspector.operations}</h3>
            <NumberField
              label={strings.inspector.replicas}
              value={attributes.replicas}
              min={1}
              max={LIMITS.maxReplicas}
              placeholder={strings.inspector.notSet}
              error={strings.inspector.errors.replicas}
              onCommit={(replicas) =>
                update({ attributes: cleanAttributes({ ...attributes, replicas }) })
              }
            />
            {FLAGS.map((flag) => (
              <ChoiceField
                key={flag}
                label={strings.inspector.attributes[flag]}
                value={toTriState(attributes[flag])}
                options={triStateOptions(strings)}
                onChange={(value) =>
                  update({
                    attributes: cleanAttributes({ ...attributes, [flag]: fromTriState(value) }),
                  })
                }
              />
            ))}
          </section>
        )}
      </div>
      <Actions>{actions}</Actions>
    </>
  );
}

function EdgeForm({
  edge,
  graph,
  headingId,
  compact,
}: {
  edge: ArchEdge;
  graph: ArchitectureGraph;
  headingId: string;
  /** Only the title and the quick actions (the collapsed inspector). */
  compact: boolean;
}) {
  const strings = useStrings();
  const labelOf = (id: string) => {
    const node = graph.nodes.find((candidate) => candidate.id === id);
    return node === undefined ? id : node.label || strings.kinds[node.kind].label;
  };
  const update = (patch: EdgePatch) => editorStore.getState().updateEdge(edge.id, patch);
  const { mode: _mode, ...withoutMode } = edge;
  const inferred = resolveEdgeMode(withoutMode);
  const layout = useEditor((state) => state.current?.document.layout);
  const ownStyle = layout === undefined ? undefined : ownEdgeStyle(layout, edge.id);
  const diagramStyle = layout?.edgeStyle ?? DEFAULT_EDGE_STYLE;
  const routed = layout !== undefined && ownEdgeRoute(layout, edge.id) !== undefined;

  const title = {
    headingId,
    title: strings.inspector.connection,
    icon: (
      <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-surface-muted text-muted">
        <Cable size={18} strokeWidth={1.75} aria-hidden="true" />
      </span>
    ),
  };
  const remove = (
    <ActionButton
      compact={compact}
      variant="danger"
      icon={Trash2}
      label={strings.inspector.delete}
      aria-keyshortcuts="Delete Backspace"
      onClick={() => editorStore.getState().removeSelection()}
      {...(!compact && { className: 'ml-auto' })}
    />
  );

  if (compact) {
    return (
      <PanelStrip
        {...title}
        subtitle={`${labelOf(edge.source)} → ${labelOf(edge.target)}`}
        actions={remove}
      />
    );
  }

  return (
    <>
      <PanelHeader
        {...title}
        closeLabel={strings.inspector.close}
        onClose={() => editorStore.getState().select(null)}
      />
      <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto overscroll-contain px-3.5 py-3">
        <p className="flex items-center gap-2 text-sm">
          <span className="truncate font-medium">{labelOf(edge.source)}</span>
          <ArrowRight size={14} aria-hidden="true" className="shrink-0 text-muted" />
          <span className="truncate font-medium">{labelOf(edge.target)}</span>
        </p>
        <TextField
          label={strings.inspector.label}
          value={edge.label ?? ''}
          placeholder={edge.protocol && strings.protocols[edge.protocol]}
          maxLength={LIMITS.labelLength}
          onCommit={(label) => update({ label: label === '' ? undefined : label })}
        />
        <SelectField<EdgeProtocol | 'none'>
          label={strings.inspector.protocol}
          value={edge.protocol ?? 'none'}
          options={[
            { value: 'none', label: strings.inspector.protocolNone },
            ...EDGE_PROTOCOLS.map((protocol) => ({
              value: protocol,
              label: strings.protocols[protocol],
            })),
          ]}
          onChange={(protocol) => update({ protocol: protocol === 'none' ? undefined : protocol })}
        />
        <div className="flex flex-col gap-1.5">
          <ChoiceField<'auto' | 'sync' | 'async'>
            label={strings.inspector.mode}
            value={edge.mode ?? 'auto'}
            options={[
              { value: 'auto', label: strings.inspector.modes.auto },
              { value: 'sync', label: strings.inspector.modes.sync },
              { value: 'async', label: strings.inspector.modes.async },
            ]}
            onChange={(mode) => update({ mode: mode === 'auto' ? undefined : mode })}
          />
          <p className="text-xs text-muted">{strings.inspector.modeHint(edge.mode ?? inferred)}</p>
        </div>
        <div className="flex flex-col gap-1.5">
          <ChoiceField<'auto' | EdgeStyle>
            label={strings.inspector.edgeStyle}
            value={ownStyle ?? 'auto'}
            options={[
              { value: 'auto', label: strings.inspector.edgeStyles.auto },
              ...EDGE_STYLES.map((style) => ({
                value: style,
                label: strings.inspector.edgeStyles[style],
              })),
            ]}
            onChange={(style) =>
              editorStore.getState().setEdgeStyle(edge.id, style === 'auto' ? undefined : style)
            }
          />
          {ownStyle === undefined && (
            <p className="text-xs text-muted">{strings.inspector.edgeStyleFollows(diagramStyle)}</p>
          )}
        </div>
        <div className="flex flex-col items-start gap-1.5">
          <p className="text-xs text-muted">{strings.inspector.edgeRouteHint}</p>
          {routed && (
            <Button
              size="default"
              onClick={() => editorStore.getState().setEdgeRoute(edge.id, null)}
            >
              {strings.inspector.edgeRouteReset}
            </Button>
          )}
        </div>
      </div>
      <Actions>{remove}</Actions>
    </>
  );
}
