import {
  type ArchEdge,
  type ArchitectureGraph,
  type ArchNode,
  CLOUD_PROVIDERS,
  type CloudProvider,
  EDGE_PROTOCOLS,
  type EdgeProtocol,
  getNodeDefinition,
  isContainerKind,
  isShapeKind,
  LIMITS,
  type NodeAttributes,
  resolveEdgeMode,
} from '@archdraft/core';
import { ArrowRight, Cable, Copy, Spline, Trash2, X } from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';
import { type ReactNode, useId } from 'react';
import type { EdgePatch, NodePatch, Selection } from '../editor/operations.ts';
import { editorStore, useEditor } from '../editor/store.ts';
import { KIND_ICONS } from '../icons.ts';
import { EASE_OUT } from '../motion.ts';
import type { Strings } from '../i18n/en.ts';
import { productName } from '../i18n/labels.ts';
import { useStrings } from '../i18n/locale.ts';
import { Button } from './Button.tsx';
import { ChoiceField, NumberField, SelectField, TextField } from './fields.tsx';
import { FloatingPanel, type PanelPlacement } from './FloatingPanel.tsx';

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

interface InspectorProps {
  placement: PanelPlacement;
  selection: Selection;
  graph: ArchitectureGraph;
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
 */
export function Inspector({ placement, selection, graph }: InspectorProps) {
  const headingId = useId();
  const node =
    selection.type === 'node' ? graph.nodes.find((item) => item.id === selection.id) : undefined;
  const edge =
    selection.type === 'edge' ? graph.edges.find((item) => item.id === selection.id) : undefined;

  return (
    <FloatingPanel placement={placement} labelledBy={headingId}>
      <AnimatePresence mode="popLayout" initial={false}>
        <m.div
          key={selection.id}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15, ease: EASE_OUT }}
          className="flex min-h-0 flex-1 flex-col"
        >
          {node && <NodeForm node={node} graph={graph} headingId={headingId} />}
          {edge && <EdgeForm edge={edge} graph={graph} headingId={headingId} />}
        </m.div>
      </AnimatePresence>
    </FloatingPanel>
  );
}

export function PanelHeader({
  headingId,
  title,
  subtitle,
  icon,
  closeLabel,
  onClose,
}: {
  headingId: string;
  title: string;
  subtitle?: string;
  icon: ReactNode;
  closeLabel: string;
  onClose: () => void;
}) {
  return (
    <div className="flex items-center gap-3 border-b border-line py-2.5 pr-2 pl-3.5">
      {icon}
      <div className="min-w-0 flex-1">
        <h2 id={headingId} className="truncate leading-tight font-semibold">
          {title}
        </h2>
        {subtitle !== undefined && <p className="truncate text-xs text-muted">{subtitle}</p>}
      </div>
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

function Actions({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-0.5 border-t border-line px-2 py-1.5 [&>button]:h-8 [&>button]:gap-1.5 [&>button]:px-2 [&>button]:text-[13px]">
      {children}
    </div>
  );
}

function NodeForm({
  node,
  graph,
  headingId,
}: {
  node: ArchNode;
  graph: ArchitectureGraph;
  headingId: string;
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

  return (
    <>
      <PanelHeader
        headingId={headingId}
        closeLabel={strings.inspector.close}
        onClose={() => editorStore.getState().select(null)}
        title={node.label}
        subtitle={strings.kinds[node.kind].label}
        icon={
          <span
            className="flex size-9 shrink-0 items-center justify-center rounded-[10px]"
            style={{
              color: `var(--cat-${definition.category})`,
              backgroundColor: `var(--cat-${definition.category}-bg)`,
            }}
          >
            <Icon size={18} strokeWidth={1.75} aria-hidden="true" />
          </span>
        }
      />
      <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto overscroll-contain px-3.5 py-3">
        <TextField
          label={strings.inspector.name}
          value={node.label}
          maxLength={LIMITS.labelLength}
          required
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
      <Actions>
        {!container && (
          <Button variant="ghost" onClick={() => editorStore.getState().startConnection(node.id)}>
            <Spline size={15} aria-hidden="true" />
            {strings.inspector.connect}
          </Button>
        )}
        <Button
          variant="ghost"
          aria-keyshortcuts="Control+D Meta+D"
          onClick={() => editorStore.getState().duplicateSelection()}
        >
          <Copy size={15} aria-hidden="true" />
          {strings.inspector.duplicate}
        </Button>
        <Button
          variant="danger"
          aria-keyshortcuts="Delete Backspace"
          onClick={() => editorStore.getState().removeSelection()}
          className="ml-auto"
        >
          <Trash2 size={15} aria-hidden="true" />
          {strings.inspector.delete}
        </Button>
      </Actions>
    </>
  );
}

function EdgeForm({
  edge,
  graph,
  headingId,
}: {
  edge: ArchEdge;
  graph: ArchitectureGraph;
  headingId: string;
}) {
  const strings = useStrings();
  const labelOf = (id: string) => graph.nodes.find((node) => node.id === id)?.label ?? id;
  const update = (patch: EdgePatch) => editorStore.getState().updateEdge(edge.id, patch);
  const { mode: _mode, ...withoutMode } = edge;
  const inferred = resolveEdgeMode(withoutMode);

  return (
    <>
      <PanelHeader
        headingId={headingId}
        closeLabel={strings.inspector.close}
        onClose={() => editorStore.getState().select(null)}
        title={strings.inspector.connection}
        icon={
          <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-surface-muted text-muted">
            <Cable size={18} strokeWidth={1.75} aria-hidden="true" />
          </span>
        }
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
      </div>
      <Actions>
        <Button
          variant="danger"
          aria-keyshortcuts="Delete Backspace"
          onClick={() => editorStore.getState().removeSelection()}
          className="ml-auto"
        >
          <Trash2 size={15} aria-hidden="true" />
          {strings.inspector.delete}
        </Button>
      </Actions>
    </>
  );
}
