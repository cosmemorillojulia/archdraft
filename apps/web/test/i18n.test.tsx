import {
  ARCHITECTURE_TEMPLATES,
  type ArchitectureGraph,
  ArchitectureGraphSchema,
  DEFAULT_NODE_SIZE,
  type DiagramDocument,
  LINT_RULE_IDS,
  lintGraph,
  NODE_KINDS,
  TEMPLATE_IDS,
  validateGraph,
} from '@archdraft/core';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App.tsx';
import { createEditorStore, editorStore } from '../src/editor/store.ts';
import { en } from '../src/i18n/en.ts';
import { es } from '../src/i18n/es.ts';
import { productName } from '../src/i18n/labels.ts';
import { detectLocale, LOCALE_KEY, localeStore } from '../src/i18n/locale.ts';
import { localizedTemplate, templateTexts } from '../src/i18n/templates.ts';

afterEach(() => {
  vi.restoreAllMocks();
});

/** Keys of a dictionary, nested ones as paths, so both languages can be compared. */
function keysOf(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return [prefix];
  return Object.entries(value).flatMap(([key, child]) => keysOf(child, `${prefix}.${key}`));
}

describe('dictionaries', () => {
  it('have the same keys in English and Spanish', () => {
    expect(keysOf(es).sort()).toEqual(keysOf(en).sort());
  });

  it('name every kind in Spanish, with a description', () => {
    for (const kind of NODE_KINDS) {
      expect(es.kinds[kind].label).not.toBe('');
      expect(es.kinds[kind].description).not.toBe('');
    }
    expect(es.kinds['relational-db'].label).toBe('Base de datos relacional');
  });

  it('say where a group goes, with the articles of each language', () => {
    expect(en.edit.placement('subnet', ['network', 'availability-zone'])).toBe(
      'A subnet goes inside a virtual network or an availability zone.',
    );
    expect(es.edit.placement('subnet', ['network', 'availability-zone'])).toBe(
      'Una subred va dentro de una red virtual o una zona de disponibilidad.',
    );
  });

  it('use singular and plural in the diagram card', () => {
    expect(en.card.components(1)).toBe('component');
    expect(en.card.connections(2)).toBe('connections');
    expect(es.card.connections(1)).toBe('conexión');
    expect(es.card.shapes(4)).toBe('figuras');
  });
});

/*
 * One graph that breaks every rule: a user calls an API directly and the API
 * has unknown replicas; it calls a worker with one replica and autoscaling
 * off; the user also reads a public, unencrypted database; a cache runs in one
 * zone; two services call each other; a chain of five synchronous hops starts
 * at a client; and a search index is connected to nothing.
 */
const everyRule: ArchitectureGraph = {
  schemaVersion: 1,
  title: 'Every rule',
  provider: 'aws',
  nodes: [
    { id: 'user', kind: 'user', label: 'User' },
    { id: 'api', kind: 'service', label: 'API' },
    {
      id: 'worker',
      kind: 'service',
      label: 'Worker',
      attributes: { replicas: 1, autoscaling: false },
    },
    {
      id: 'db',
      kind: 'relational-db',
      label: 'Orders DB',
      attributes: { publiclyAccessible: true, encryptedAtRest: false },
    },
    { id: 'cache', kind: 'cache', label: 'Cache', attributes: { multiAz: false } },
    { id: 'a', kind: 'service', label: 'A', attributes: { autoscaling: true } },
    { id: 'b', kind: 'service', label: 'B', attributes: { autoscaling: true } },
    { id: 'c', kind: 'service', label: 'C', attributes: { autoscaling: true } },
    { id: 'd', kind: 'service', label: 'D', attributes: { autoscaling: true } },
    { id: 'search', kind: 'search-index', label: 'Search' },
  ],
  edges: [
    { id: 'user-api', source: 'user', target: 'api' },
    { id: 'api-worker', source: 'api', target: 'worker' },
    { id: 'user-db', source: 'user', target: 'db', protocol: 'sql' },
    { id: 'worker-cache', source: 'worker', target: 'cache', protocol: 'tcp' },
    { id: 'api-a', source: 'api', target: 'a' },
    { id: 'a-b', source: 'a', target: 'b' },
    { id: 'b-c', source: 'b', target: 'c' },
    { id: 'c-d', source: 'c', target: 'd' },
    { id: 'd-c', source: 'd', target: 'c' },
  ],
};

describe('design findings', () => {
  const findings = lintGraph(everyRule);
  const factsOf = (finding: (typeof findings)[number]) => ({
    finding,
    labels: finding.nodeIds.map(
      (id) => everyRule.nodes.find((node) => node.id === id)?.label ?? id,
    ),
    attributes: everyRule.nodes.find((node) => node.id === finding.nodeIds[0])?.attributes,
  });

  it('cover every rule in the fixture', () => {
    expect(new Set(findings.map((finding) => finding.ruleId))).toEqual(new Set(LINT_RULE_IDS));
  });

  it('keep the English texts of the rule engine', () => {
    for (const finding of findings) {
      expect(en.lint.finding(factsOf(finding))).toEqual({
        message: finding.message,
        suggestion: finding.suggestion,
      });
    }
  });

  it('are worded in Spanish with the names of the components', () => {
    for (const finding of findings) {
      const { message, suggestion } = es.lint.finding(factsOf(finding));
      expect(message).not.toBe(finding.message);
      expect(suggestion).not.toBe(finding.suggestion);
      expect(message).toContain(`«${factsOf(finding).labels[0] ?? ''}»`);
    }
    const spanish = findings.map((finding) => es.lint.finding(factsOf(finding)).message);
    expect(spanish).toContain(
      '«API» atiende peticiones síncronas y no se sabe cuántas réplicas tiene',
    );
    expect(spanish).toContain(
      '«Worker» atiende peticiones síncronas con una sola réplica y el autoescalado desactivado',
    );
    expect(spanish).toContain(
      'El almacén de datos «Orders DB» es accesible públicamente y recibe llamadas directas de los clientes',
    );
    expect(spanish).toContain('«User» llama directamente a «API»');
    expect(spanish).toContain('«Cache» funciona en una sola zona de disponibilidad');
    expect(spanish).toContain('No se sabe si «Orders DB» abarca varias zonas de disponibilidad');
    expect(spanish).toContain('«Search» no tiene conexiones');
  });

  it('have Spanish titles and explanations for every rule', () => {
    for (const id of LINT_RULE_IDS) {
      expect(es.lint.rules[id].title).not.toBe(en.lint.rules[id].title);
      expect(es.lint.rules[id].description).not.toBe('');
    }
  });
});

describe('templates in Spanish', () => {
  const texts = templateTexts('es');

  it('translate every node and every labelled connection, and nothing else', () => {
    for (const id of TEMPLATE_IDS) {
      const template = ARCHITECTURE_TEMPLATES[id];
      const text = texts?.[id];
      expect(Object.keys(text?.nodes ?? {}).sort()).toEqual(
        template.nodes.map((node) => node.id).sort(),
      );
      expect(Object.keys(text?.edges ?? {}).sort()).toEqual(
        template.edges
          .filter((edge) => edge.label !== undefined)
          .map((edge) => edge.id)
          .sort(),
      );
    }
  });

  it('stay valid and free of findings, with the same structure', () => {
    for (const id of TEMPLATE_IDS) {
      const spanish = localizedTemplate(id, 'es');
      const english = ARCHITECTURE_TEMPLATES[id];
      expect(ArchitectureGraphSchema.safeParse(spanish).success).toBe(true);
      expect(validateGraph(spanish).filter((issue) => issue.severity === 'error')).toEqual([]);
      expect(lintGraph(spanish)).toEqual([]);
      expect(spanish.nodes.map(({ label: _label, ...node }) => node)).toEqual(
        english.nodes.map(({ label: _label, ...node }) => node),
      );
      expect(spanish.title).not.toBe(english.title);
    }
  });

  it('come back as the same object, and English is the original', () => {
    expect(localizedTemplate('rag-chatbot', 'es')).toBe(localizedTemplate('rag-chatbot', 'es'));
    expect(localizedTemplate('rag-chatbot', 'en')).toBe(ARCHITECTURE_TEMPLATES['rag-chatbot']);
  });
});

describe('product names', () => {
  const graph: ArchitectureGraph = {
    schemaVersion: 1,
    title: 'Products',
    provider: 'generic',
    nodes: [
      { id: 'mail', kind: 'service', label: 'Mailer' },
      { id: 'db', kind: 'relational-db', label: 'DB', provider: 'aws' },
      { id: 'own', kind: 'service', label: 'Own', service: 'Fly.io' },
    ],
    edges: [],
  };
  const [mail, db, own] = graph.nodes;

  it('use the name of the kind in the language of the interface when there is no product', () => {
    expect(mail && productName(mail, graph, es.kinds)).toBe('Servicio');
    expect(mail && productName(mail, graph, en.kinds)).toBe('Service');
  });

  it('keep the product of the provider and the one set on the node', () => {
    expect(db && productName(db, graph, es.kinds)).toBe('Amazon RDS');
    expect(own && productName(own, graph, es.kinds)).toBe('Fly.io');
  });
});

describe('language detection', () => {
  it('prefers the language chosen before, then a Spanish browser, then English', () => {
    const languages = vi.spyOn(navigator, 'languages', 'get');
    languages.mockReturnValue(['es-ES', 'en']);
    expect(detectLocale()).toBe('es');
    languages.mockReturnValue(['fr-FR']);
    expect(detectLocale()).toBe('en');
    localStorage.setItem(LOCALE_KEY, 'es');
    expect(detectLocale()).toBe('es');
    localStorage.setItem(LOCALE_KEY, 'klingon');
    expect(detectLocale()).toBe('en');
  });
});

describe('editing in Spanish', () => {
  const document: DiagramDocument = {
    graph: {
      schemaVersion: 1,
      title: 'Test',
      provider: 'aws',
      nodes: [
        { id: 'api', kind: 'service', label: 'API' },
        { id: 'db', kind: 'relational-db', label: 'DB' },
      ],
      edges: [{ id: 'api-db', source: 'api', target: 'db' }],
    },
    layout: {
      positions: { api: { x: 0, y: 0 }, db: { x: 300, y: 0 } },
      sizes: { api: DEFAULT_NODE_SIZE, db: DEFAULT_NODE_SIZE },
    },
  };

  it('names new components and explains rejected edits in Spanish', () => {
    localeStore.getState().setLocale('es');
    const store = createEditorStore();
    store.getState().load(document, { direction: 'LR', templateId: null });
    store.getState().addNode('cache', { x: 100, y: 400 });
    expect(store.getState().current?.document.graph.nodes.at(-1)?.label).toBe('Caché');
    store.getState().connect('api', 'db');
    expect(store.getState().message?.text).toBe(es.edit.alreadyConnected);
  });
});

describe('language switch', () => {
  const diagramNamed = (title: string) =>
    screen.findByRole('group', { name: es.canvas.diagramLabel(title) });

  it('switches the interface and an untouched template, and is remembered', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole('group', {
      name: en.canvas.diagramLabel(ARCHITECTURE_TEMPLATES['three-tier-web'].title),
    });
    // The button shows the language the interface is in.
    const toggle = screen.getByRole('button', { name: en.header.language.label });
    expect(toggle).toHaveTextContent('EN');
    expect(toggle).toHaveAttribute('title', en.header.language.hint);

    await user.click(toggle);
    expect(document.documentElement.lang).toBe('es');
    expect(localStorage.getItem(LOCALE_KEY)).toBe('es');
    expect(screen.getByRole('banner')).toHaveTextContent(es.tagline);
    const back = screen.getByRole('button', { name: es.header.language.label });
    await waitFor(() => expect(back).toHaveTextContent(/^ES$/));
    expect(back).toHaveAttribute('title', es.header.language.hint);
    const title = localizedTemplate('three-tier-web', 'es').title;
    const diagram = await diagramNamed(title);
    expect(within(diagram).getByText('Aplicación web')).toBeInTheDocument();
    // Translating the template is not a step of the history.
    expect(editorStore.getState().past).toHaveLength(0);

    // Once edited, the diagram is the user's work and keeps its words.
    act(() => editorStore.getState().updateNode('app', { label: 'Tienda' }));
    await user.click(back);
    expect(document.documentElement.lang).toBe('en');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: en.header.language.label })).toHaveTextContent(
        /^EN$/,
      ),
    );
    expect(screen.getByRole('banner')).toHaveTextContent(en.tagline);
    expect(
      await screen.findByRole('group', { name: en.canvas.diagramLabel(title) }),
    ).toBeInTheDocument();
  });

  it('opens templates in the language of the interface', async () => {
    const user = userEvent.setup();
    localeStore.getState().setLocale('es');
    render(<App />);
    await diagramNamed(localizedTemplate('three-tier-web', 'es').title);
    await user.click(screen.getByRole('button', { name: es.prompt.templates }));
    await user.click(
      screen.getByRole('menuitemradio', { name: es.prompt.templateNames['rag-chatbot'] }),
    );
    expect(await diagramNamed(localizedTemplate('rag-chatbot', 'es').title)).toBeInTheDocument();
  });

  it('finds components by their Spanish name without accents, or by their English name', async () => {
    const user = userEvent.setup();
    localeStore.getState().setLocale('es');
    render(<App />);
    await user.click(screen.getByRole('button', { name: es.components.open }));
    const palette = await screen.findByRole('dialog', { name: es.components.title });
    const search = within(palette).getByRole('searchbox', { name: es.components.search });
    await user.type(search, 'cache');
    expect(within(palette).getByText('Caché')).toBeInTheDocument();
    await user.clear(search);
    await user.type(search, 'relational');
    expect(within(palette).getByText('Base de datos relacional')).toBeInTheDocument();
  });

  it('leaves out the corner link of React Flow', async () => {
    render(<App />);
    await screen.findByRole('group', {
      name: en.canvas.diagramLabel(ARCHITECTURE_TEMPLATES['three-tier-web'].title),
    });
    expect(document.querySelector('.react-flow__attribution')).toBeNull();
  });
});
