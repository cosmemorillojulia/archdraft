import { type DiagramDocument, DEFAULT_NODE_SIZE } from '@archdraft/core';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { PanelSlot } from '../src/components/PanelSlot.tsx';
import { editorStore } from '../src/editor/store.ts';
import { en as strings } from '../src/i18n/en.ts';

const document: DiagramDocument = {
  graph: {
    schemaVersion: 1,
    title: 'Test',
    provider: 'aws',
    nodes: [
      { id: 'api', kind: 'service', label: 'API' },
      { id: 'db', kind: 'relational-db', label: 'Database' },
      { id: 'vpc', kind: 'network', label: 'VPC' },
    ],
    edges: [{ id: 'api-db', source: 'api', target: 'db', protocol: 'sql' }],
  },
  layout: {
    positions: { api: { x: 0, y: 0 }, db: { x: 300, y: 0 }, vpc: { x: 0, y: 200 } },
    sizes: { api: DEFAULT_NODE_SIZE, db: DEFAULT_NODE_SIZE, vpc: { width: 240, height: 140 } },
  },
};

const nodeOf = (id: string) =>
  editorStore.getState().current?.document.graph.nodes.find((node) => node.id === id);
const edgeOf = (id: string) =>
  editorStore.getState().current?.document.graph.edges.find((edge) => edge.id === id);

function inspect(type: 'node' | 'edge', id: string) {
  act(() => editorStore.getState().select({ type, id }));
}

describe('Inspector', () => {
  beforeEach(() => {
    editorStore.getState().load(document, { direction: 'LR', templateId: null });
  });

  it('shows nothing while nothing is selected', () => {
    render(<PanelSlot placement="side" />);
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
  });

  it('shows the fields of a component, with the product the diagram would use', () => {
    render(<PanelSlot placement="side" />);
    inspect('node', 'db');
    const panel = screen.getByRole('region', { name: 'Database' });
    expect(within(panel).getByText('Relational database')).toBeInTheDocument();
    expect(within(panel).getByLabelText(strings.inspector.name)).toHaveValue('Database');
    expect(within(panel).getByLabelText(strings.inspector.product)).toHaveAttribute(
      'placeholder',
      'Amazon RDS',
    );
    expect(within(panel).getByLabelText(strings.inspector.provider)).toHaveValue('default');
    expect(within(panel).getByText(strings.inspector.operations)).toBeInTheDocument();
  });

  it('commits a new name when the field loses focus, as one step', async () => {
    const user = userEvent.setup();
    render(<PanelSlot placement="side" />);
    inspect('node', 'api');
    const name = screen.getByLabelText(strings.inspector.name);
    await user.clear(name);
    await user.type(name, '  Orders API ');
    expect(nodeOf('api')?.label).toBe('API');
    await user.tab();
    expect(nodeOf('api')?.label).toBe('Orders API');
    expect(editorStore.getState().past).toHaveLength(1);
  });

  it('asks for a name instead of saving an empty one, and restores it', async () => {
    const user = userEvent.setup();
    render(<PanelSlot placement="side" />);
    inspect('node', 'api');
    const name = screen.getByLabelText(strings.inspector.name);
    await user.clear(name);
    expect(name).toHaveAttribute('aria-invalid', 'true');
    expect(name).toHaveAccessibleDescription(strings.inspector.errors.required);
    await user.tab();
    expect(name).toHaveValue('API');
    expect(editorStore.getState().past).toEqual([]);
  });

  it('cancels a change with Escape', async () => {
    const user = userEvent.setup();
    render(<PanelSlot placement="side" />);
    inspect('node', 'api');
    const name = screen.getByLabelText(strings.inspector.name);
    await user.type(name, ' v2{Escape}');
    expect(name).toHaveValue('API');
    expect(nodeOf('api')?.label).toBe('API');
  });

  it('sets the product and the provider, and goes back to the defaults', async () => {
    const user = userEvent.setup();
    render(<PanelSlot placement="side" />);
    inspect('node', 'db');
    await user.type(screen.getByLabelText(strings.inspector.product), 'Aurora{Enter}');
    await user.selectOptions(screen.getByLabelText(strings.inspector.provider), 'gcp');
    expect(nodeOf('db')).toMatchObject({ service: 'Aurora', provider: 'gcp' });

    await user.clear(screen.getByLabelText(strings.inspector.product));
    await user.tab();
    await user.selectOptions(screen.getByLabelText(strings.inspector.provider), 'default');
    expect(nodeOf('db')).not.toHaveProperty('service');
    expect(nodeOf('db')).not.toHaveProperty('provider');
  });

  it('records operational facts as yes, no or not set', async () => {
    const user = userEvent.setup();
    render(<PanelSlot placement="side" />);
    inspect('node', 'db');
    const multiAz = screen.getByRole('radiogroup', { name: strings.inspector.attributes.multiAz });
    await user.click(within(multiAz).getByLabelText(strings.inspector.yes));
    expect(nodeOf('db')?.attributes).toEqual({ multiAz: true });
    await user.click(within(multiAz).getByLabelText(strings.inspector.notSet));
    expect(nodeOf('db')).not.toHaveProperty('attributes');
  });

  it('accepts whole numbers of instances in range', async () => {
    const user = userEvent.setup();
    render(<PanelSlot placement="side" />);
    inspect('node', 'api');
    const replicas = screen.getByLabelText(strings.inspector.replicas);
    await user.type(replicas, '0');
    expect(replicas).toHaveAccessibleDescription(strings.inspector.errors.replicas);
    await user.clear(replicas);
    await user.type(replicas, '3{Enter}');
    expect(nodeOf('api')?.attributes).toEqual({ replicas: 3 });
  });

  it('shows only the name and description of a group', () => {
    render(<PanelSlot placement="side" />);
    inspect('node', 'vpc');
    const panel = screen.getByRole('region', { name: 'VPC' });
    expect(within(panel).getByLabelText(strings.inspector.name)).toBeInTheDocument();
    expect(within(panel).getByLabelText(strings.inspector.description)).toBeInTheDocument();
    expect(within(panel).queryByLabelText(strings.inspector.product)).not.toBeInTheDocument();
    expect(within(panel).queryByText(strings.inspector.operations)).not.toBeInTheDocument();
    expect(
      within(panel).queryByRole('button', { name: strings.inspector.connect }),
    ).not.toBeInTheDocument();
  });

  it('edits a connection: label, protocol and mode', async () => {
    const user = userEvent.setup();
    render(<PanelSlot placement="side" />);
    inspect('edge', 'api-db');
    const panel = screen.getByRole('region', { name: strings.inspector.connection });
    expect(within(panel).getByText(strings.inspector.modeHint('sync'))).toBeInTheDocument();

    await user.type(within(panel).getByLabelText(strings.inspector.label), 'Reads orders{Enter}');
    await user.selectOptions(within(panel).getByLabelText(strings.inspector.protocol), 'kafka');
    // Kafka is asynchronous unless the mode says otherwise.
    expect(within(panel).getByText(strings.inspector.modeHint('async'))).toBeInTheDocument();
    await user.click(within(panel).getByLabelText(strings.inspector.modes.sync));
    expect(edgeOf('api-db')).toMatchObject({
      label: 'Reads orders',
      protocol: 'kafka',
      mode: 'sync',
    });
  });

  it('deletes the selection and closes', async () => {
    const user = userEvent.setup();
    render(<PanelSlot placement="side" />);
    inspect('node', 'db');
    await user.click(screen.getByRole('button', { name: strings.inspector.delete }));
    expect(nodeOf('db')).toBeUndefined();
    expect(edgeOf('api-db')).toBeUndefined();
    expect(editorStore.getState().selection).toBeNull();
  });

  it('starts a connection from a component', async () => {
    const user = userEvent.setup();
    render(<PanelSlot placement="bottom" />);
    inspect('node', 'api');
    await user.click(screen.getByRole('button', { name: strings.inspector.connect }));
    expect(editorStore.getState().connectingFrom).toBe('api');
    // On narrow screens the panel steps aside so the target can be tapped.
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
  });
});
