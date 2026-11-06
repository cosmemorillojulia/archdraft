import {
  ARCHITECTURE_TEMPLATES,
  type ArchitectureGraph,
  type AssistRequest,
  AssistResultSchema,
  NODE_KINDS,
} from '@archdraft/shared';
import { describe, expect, it } from 'vitest';
import { assist } from '../src/agent/assist.ts';
import { extractJson } from '../src/agent/extract-json.ts';
import { catalogSummary, exampleGraph, systemPrompt } from '../src/agent/prompt.ts';
import { runWithRepair } from '../src/agent/repair.ts';
import { LlmError } from '../src/llm/errors.ts';
import { createScriptedProvider } from '../src/llm/scripted-provider.ts';

const json = (value: unknown) => JSON.stringify(value);

/** A small valid diagram, as a model would write it. */
const SHOP: Omit<ArchitectureGraph, 'schemaVersion'> = {
  title: 'Shop',
  provider: 'aws',
  nodes: [
    { id: 'user', kind: 'user', label: 'Customer' },
    { id: 'api', kind: 'api-gateway', label: 'API' },
    { id: 'db', kind: 'relational-db', label: 'Orders' },
  ],
  edges: [
    { id: 'user-api', source: 'user', target: 'api', protocol: 'https', mode: 'sync' },
    { id: 'api-db', source: 'api', target: 'db', protocol: 'sql', mode: 'sync' },
  ],
};
const shopGraph = (): ArchitectureGraph => ({ schemaVersion: 1, ...structuredClone(SHOP) });
/** The shop with its customer calling a service straight away, which the review reports. */
const exposedShop = (): ArchitectureGraph => {
  const graph = shopGraph();
  return {
    ...graph,
    nodes: graph.nodes.map((node) => (node.id === 'api' ? { ...node, kind: 'service' } : node)),
  };
};

const ADD_CACHE = {
  title: 'Add a cache',
  rationale: 'Takes reads off the database.',
  operations: [
    { op: 'addNode', node: { id: 'cache', kind: 'cache', label: 'Cache' } },
    { op: 'addEdge', edge: { id: 'api-cache', source: 'api', target: 'cache', mode: 'sync' } },
  ],
};

async function run(request: AssistRequest, answers: string[]) {
  const scripted = createScriptedProvider(answers);
  const result = await assist(scripted.provider, request);
  // Whatever the agent returns must pass the contract the editor checks.
  expect(AssistResultSchema.safeParse(result).success).toBe(true);
  return { result, requests: scripted.requests };
}

async function failure(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('Expected the call to fail');
}

describe('extractJson', () => {
  it.each([
    ['plain JSON', '{"a":1}'],
    ['a fenced block', 'Here it is:\n```json\n{"a":1}\n```\nEnjoy.'],
    ['a fence without a language', '```\n{"a":1}\n```'],
    ['text around the object', 'Sure! {"a":1} Hope it helps'],
  ])('finds the object in %s', (_, text) => {
    expect(extractJson(text)).toEqual({ a: 1 });
  });

  it.each([
    ['no object', 'I cannot do that'],
    ['an array', '[1, 2]'],
    ['broken JSON', '{"a": 1'],
    ['a closing brace before the opening one', '} nothing {'],
  ])('gives nothing for %s', (_, text) => {
    expect(extractJson(text)).toBeUndefined();
  });
});

describe('runWithRepair', () => {
  const request = { messages: [{ role: 'user' as const, content: 'Give me n' }] };
  const readN = (answer: Record<string, unknown>) =>
    typeof answer['n'] === 'number'
      ? { ok: true as const, value: answer['n'] }
      : { ok: false as const, problems: ['"n" must be a number.'] };

  it('asks again with the last answer and its problems until it is right', async () => {
    const { provider, requests } = createScriptedProvider(['no idea', '{"n":"one"}', '{"n":1}']);
    const result = await runWithRepair(provider, request, readN);
    expect(result).toEqual({ value: 1, attempts: 3, warnings: [] });
    expect(requests[1]?.messages.at(-2)).toEqual({ role: 'assistant', content: 'no idea' });
    expect(requests[1]?.messages.at(-1)?.content).toContain('The answer is not a JSON object.');
    // Only the last answer goes back: the conversation does not grow with each retry.
    expect(requests[2]?.messages).toHaveLength(3);
    expect(requests[2]?.messages.at(-1)?.content).toContain('"n" must be a number.');
  });

  it('gives up with the last problems after the retries', async () => {
    const { provider, requests } = createScriptedProvider(['{}', '{}', '{}']);
    const error = await failure(runWithRepair(provider, request, readN));
    expect(error).toBeInstanceOf(LlmError);
    expect(error).toMatchObject({ kind: 'invalid-response' });
    expect((error as Error).message).toContain('"n" must be a number.');
    expect(requests).toHaveLength(3);
  });

  it('lets a failure of the provider through without retrying', async () => {
    const { provider, requests } = createScriptedProvider([
      new LlmError('rate-limited', 'Slow down'),
    ]);
    expect(await failure(runWithRepair(provider, request, readN))).toMatchObject({
      kind: 'rate-limited',
    });
    expect(requests).toHaveLength(1);
  });

  it('tells the model only the first problems when there are many', async () => {
    const { provider, requests } = createScriptedProvider(['{}', '{"n":1}']);
    const many = Array.from({ length: 25 }, (_, index) => `Problem ${index}.`);
    await runWithRepair(provider, request, (answer) =>
      'n' in answer ? { ok: true, value: 1 } : { ok: false, problems: many },
    );
    const repair = requests[1]?.messages.at(-1)?.content ?? '';
    expect(repair).toContain('Problem 19.');
    expect(repair).not.toContain('Problem 20.');
    expect(repair).toContain('and 5 more');
  });
});

describe('prompt', () => {
  it('offers every kind of the catalog and writes in the language asked', () => {
    for (const kind of NODE_KINDS) expect(catalogSummary()).toContain(`- ${kind} (`);
    expect(systemPrompt('es')).toContain('in Spanish');
    expect(systemPrompt('en')).toContain('in English');
  });

  it.each([
    'A shop',
    'A chatbot over our documents with RAG',
    'Un pipeline de analítica con ETL y un data warehouse',
  ])('keeps a generation request within the daily quota of the free plan: %s', async (prompt) => {
    const { requests } = await run({ task: 'generate', locale: 'en', prompt }, [
      json({ title: 'Shop', rationale: '', graph: SHOP }),
    ]);
    const characters = requests[0]?.messages.reduce((sum, { content }) => sum + content.length, 0);
    // About four characters per token: some 6,000 tokens in, a small share of 10,000 neurons a day.
    expect(characters).toBeLessThan(26_000);
  });

  it('shows the example closest to what is asked, in English or Spanish', () => {
    const titleOf = (prompt: string) => exampleGraph(prompt).title;
    expect(titleOf('A chatbot with embeddings and a vector store')).toBe(
      ARCHITECTURE_TEMPLATES['rag-chatbot'].title,
    );
    expect(titleOf('Microservicios que se comunican con eventos y colas')).toBe(
      ARCHITECTURE_TEMPLATES['event-driven-microservices'].title,
    );
    expect(titleOf('Un blog estático con un CMS')).toBe(
      ARCHITECTURE_TEMPLATES['static-site-cms'].title,
    );
    expect(titleOf('Something else entirely')).toBe(ARCHITECTURE_TEMPLATES['serverless-api'].title);
    expect(titleOf('WordPress en máquinas virtuales EC2')).toBe(
      ARCHITECTURE_TEMPLATES['web-app-on-vms'].title,
    );
    expect(titleOf('A nightly cron job that emails a report')).toBe(
      ARCHITECTURE_TEMPLATES['scheduled-job'].title,
    );
    expect(titleOf('Despliegue continuo de contenedores en Kubernetes')).toBe(
      ARCHITECTURE_TEMPLATES['container-delivery'].title,
    );
    expect(titleOf('Conectar la oficina por VPN con un firewall')).toBe(
      ARCHITECTURE_TEMPLATES['hub-spoke-network'].title,
    );
  });

  it('never shows the largest templates as examples, to keep the prompt short', () => {
    const largest = ARCHITECTURE_TEMPLATES['mlops-pipeline'];
    expect(exampleGraph('MLOps training pipeline with a model registry').title).not.toBe(
      largest.title,
    );
  });

  it('asks to read requests safely and to list nodes in the order of the flow', () => {
    const prompt = systemPrompt('en');
    expect(prompt).toContain('Secure by default');
    expect(prompt).toContain('in the order the requests flow');
    expect(prompt).toContain('"assumptions"');
  });
});

describe('assist: generate', () => {
  it('returns the diagram as one proposal in which everything is new', async () => {
    const { result, requests } = await run(
      { task: 'generate', locale: 'es', prompt: 'Una tienda', provider: 'aws' },
      [json({ title: 'Tienda', rationale: 'Una API y una base de datos.', graph: SHOP })],
    );
    expect(result).toMatchObject({ task: 'generate', attempts: 1, warnings: [] });
    const [proposal] = result.proposals;
    expect(proposal?.graph).toEqual(shopGraph());
    expect(proposal?.changes.nodes.added).toEqual(['user', 'api', 'db']);
    expect(requests[0]?.messages[1]?.content).toContain('Use "aws" as the provider');
    expect(requests[0]?.jsonSchema).toBeDefined();
  });

  it('lets the description choose the provider when the request does not', async () => {
    const { requests } = await run({ task: 'generate', locale: 'en', prompt: 'A shop on GCP' }, [
      json({ title: 'Shop', rationale: '', graph: SHOP }),
    ]);
    expect(requests[0]?.messages[1]?.content).toContain(
      'Use the cloud provider the description names',
    );
  });

  it('sends the validation problems back and takes the corrected diagram', async () => {
    const broken = { ...SHOP, edges: [{ id: 'x', source: 'api', target: 'nowhere' }] };
    const { result, requests } = await run({ task: 'generate', locale: 'en', prompt: 'A shop' }, [
      json({ title: 'Shop', graph: broken }),
      json({ title: '', graph: SHOP }),
      json({ title: 'Shop', rationale: 'Fixed.', graph: SHOP }),
    ]);
    expect(result.attempts).toBe(3);
    expect(requests[1]?.messages.at(-1)?.content).toContain('unknown node "nowhere"');
    expect(requests[2]?.messages.at(-1)?.content).toContain('"title" must be a non-empty string.');
  });

  it('asks again when the diagram is missing', async () => {
    const { requests } = await run({ task: 'generate', locale: 'en', prompt: 'A shop' }, [
      json({ title: 'Shop' }),
      json({ title: 'Shop', rationale: '', graph: SHOP }),
    ]);
    expect(requests[1]?.messages.at(-1)?.content).toContain('"graph" must be an object.');
  });

  it('passes on what the assistant decided by itself, and leaves out what is not text', async () => {
    const { result } = await run({ task: 'generate', locale: 'en', prompt: 'A shop' }, [
      json({
        title: 'Shop',
        rationale: '',
        assumptions: [
          'Orders are kept in a managed database.',
          42,
          ' ',
          ...Array<string>(9).fill('More'),
        ],
        graph: SHOP,
      }),
    ]);
    const assumptions = result.proposals[0]?.assumptions ?? [];
    expect(assumptions[0]).toBe('Orders are kept in a managed database.');
    expect(assumptions).toHaveLength(6);
  });

  it('asks once to fix a design that opens a risk, and takes the fix', async () => {
    const open = {
      ...SHOP,
      nodes: SHOP.nodes.map((node) =>
        node.id === 'db' ? { ...node, attributes: { publiclyAccessible: true } } : node,
      ),
    };
    const { result, requests } = await run({ task: 'generate', locale: 'en', prompt: 'A shop' }, [
      json({ title: 'Shop', rationale: '', graph: open }),
      json({ title: 'Shop', rationale: '', graph: SHOP }),
    ]);
    expect(result.attempts).toBe(2);
    const review = requests[1]?.messages.at(-1)?.content ?? '';
    expect(review).toContain('public-database');
    expect(review).toContain('"assumptions"');
    const db = result.proposals[0]?.graph.nodes.find((node) => node.id === 'db');
    expect(db?.attributes).toBeUndefined();
  });

  it('keeps the first design when the fix of its risks is not valid', async () => {
    const open = {
      ...SHOP,
      nodes: SHOP.nodes.map((node) =>
        node.id === 'db' ? { ...node, attributes: { publiclyAccessible: true } } : node,
      ),
    };
    const { result, requests } = await run({ task: 'generate', locale: 'en', prompt: 'A shop' }, [
      json({ title: 'Shop', rationale: '', graph: open }),
      'not JSON',
    ]);
    expect(requests).toHaveLength(2);
    expect(result.attempts).toBe(2);
    const db = result.proposals[0]?.graph.nodes.find((node) => node.id === 'db');
    expect(db?.attributes).toEqual({ publiclyAccessible: true });
  });

  it('cuts titles that are too long instead of failing', async () => {
    const { result } = await run({ task: 'generate', locale: 'en', prompt: 'A shop' }, [
      json({ title: 'T'.repeat(500), rationale: 'R'.repeat(5000), graph: SHOP }),
    ]);
    expect(result.proposals[0]?.title).toHaveLength(120);
    expect(result.proposals[0]?.rationale).toHaveLength(1000);
  });
});

describe('assist: edit', () => {
  it('applies the operations to the diagram it was asked on', async () => {
    const { result, requests } = await run(
      { task: 'edit', locale: 'en', prompt: 'Add a cache', graph: shopGraph() },
      [json(ADD_CACHE)],
    );
    const [proposal] = result.proposals;
    expect(proposal?.operations).toHaveLength(2);
    expect(proposal?.changes.nodes.added).toEqual(['cache']);
    expect(proposal?.graph.nodes.map((node) => node.id)).toEqual(['user', 'api', 'db', 'cache']);
    expect(requests[0]?.messages[1]?.content).toContain('"label":"Orders"');
  });

  it('corrects an operation on a node that is not there', async () => {
    const wrong = {
      ...ADD_CACHE,
      operations: [{ op: 'updateNode', id: 'database', changes: { label: 'Orders DB' } }],
    };
    const right = {
      ...ADD_CACHE,
      operations: [{ op: 'updateNode', id: 'db', changes: { label: 'Orders DB' } }],
    };
    const { result, requests } = await run(
      { task: 'edit', locale: 'en', prompt: 'Rename the database', graph: shopGraph() },
      [json(wrong), json(right)],
    );
    expect(result.attempts).toBe(2);
    expect(requests[1]?.messages.at(-1)?.content).toContain(
      'operation 0: There is no node "database" to update',
    );
  });

  it('refuses operations that leave the diagram invalid or change nothing', async () => {
    const { requests } = await run(
      { task: 'edit', locale: 'en', prompt: 'Add a cache', graph: shopGraph() },
      [
        json({
          ...ADD_CACHE,
          operations: [{ op: 'addEdge', edge: { id: 'x', source: 'api', target: 'api' } }],
        }),
        json({
          ...ADD_CACHE,
          operations: [{ op: 'updateNode', id: 'api', changes: { label: 'API' } }],
        }),
        json(ADD_CACHE),
      ],
    );
    expect(requests[1]?.messages.at(-1)?.content).toContain('the diagram would be invalid');
    expect(requests[2]?.messages.at(-1)?.content).toContain('the operations change nothing');
  });

  it('does not review a risk the diagram already had', async () => {
    // The customer already calls the API straight away: the edit does not add that risk.
    const { requests } = await run(
      { task: 'edit', locale: 'en', prompt: 'Add a cache', graph: exposedShop() },
      [json(ADD_CACHE)],
    );
    expect(requests).toHaveLength(1);
  });

  it('reports malformed operations by their path', async () => {
    const { requests } = await run(
      { task: 'edit', locale: 'en', prompt: 'Paint it', graph: shopGraph() },
      [json({ ...ADD_CACHE, operations: [{ op: 'paint', id: 'api' }] }), json(ADD_CACHE)],
    );
    expect(requests[1]?.messages.at(-1)?.content).toContain('operations.0');
  });
});

describe('assist: improve', () => {
  const RENAME = {
    title: 'Clearer name',
    rationale: 'Says what it stores.',
    operations: [{ op: 'updateNode', id: 'db', changes: { label: 'Orders database' } }],
  };
  const BROKEN = {
    title: 'Broken',
    rationale: '',
    operations: [{ op: 'removeNode', id: 'ghost' }],
  };

  it('tells the model the findings of the design rules', async () => {
    const { requests } = await run({ task: 'improve', locale: 'en', graph: exposedShop() }, [
      json({ proposals: [ADD_CACHE] }),
    ]);
    const content = requests[0]?.messages[1]?.content ?? '';
    expect(content).toContain('unprotected-entry');
    expect(content).toContain('Suggestion:');
  });

  it('passes on what to focus on, and accepts an improvement of the diagram itself', async () => {
    const graph = structuredClone(ARCHITECTURE_TEMPLATES['three-tier-web']);
    const { requests } = await run(
      { task: 'improve', locale: 'en', graph, prompt: 'Lower the cost' },
      [
        json({
          proposals: [
            { ...RENAME, operations: [{ op: 'updateDiagram', changes: { title: 'Web app' } }] },
          ],
        }),
      ],
    );
    const content = requests[0]?.messages[1]?.content ?? '';
    expect(content).toContain('Lower the cost');
  });

  it('returns every valid proposal, each applied on its own', async () => {
    const { result } = await run({ task: 'improve', locale: 'en', graph: shopGraph() }, [
      json({ proposals: [ADD_CACHE, RENAME] }),
    ]);
    expect(result.proposals.map((proposal) => proposal.title)).toEqual([
      'Add a cache',
      'Clearer name',
    ]);
    // The rename is applied to the diagram as it is, without the cache of the first proposal.
    expect(result.proposals[1]?.graph.nodes.some((node) => node.id === 'cache')).toBe(false);
  });

  it('asks again while a proposal is invalid, and on the last attempt keeps the valid ones', async () => {
    const answer = json({ proposals: [ADD_CACHE, BROKEN] });
    const { result, requests } = await run({ task: 'improve', locale: 'en', graph: shopGraph() }, [
      answer,
      answer,
      answer,
    ]);
    expect(requests).toHaveLength(3);
    expect(requests[1]?.messages.at(-1)?.content).toContain('proposals.1: operation 0');
    expect(result.proposals).toHaveLength(1);
    expect(result.warnings).toContain('proposals-dropped');
  });

  it('fails when no proposal is valid', async () => {
    const { provider } = createScriptedProvider([
      json({ proposals: [BROKEN] }),
      json({ proposals: [] }),
      json({ proposals: ['nonsense'] }),
    ]);
    const error = await failure(
      assist(provider, { task: 'improve', locale: 'en', graph: shopGraph() }),
    );
    expect(error).toMatchObject({ kind: 'invalid-response' });
  });

  it('warns when a proposal gives the design rules more to report', async () => {
    const exposeDb = {
      title: 'Open the database',
      rationale: '',
      operations: [
        { op: 'updateNode', id: 'db', changes: { attributes: { publiclyAccessible: true } } },
      ],
    };
    const { result } = await run({ task: 'improve', locale: 'en', graph: shopGraph() }, [
      json({ proposals: [exposeDb] }),
    ]);
    expect(result.warnings).toEqual(['more-findings']);
  });
});

describe('assist: simplify and extend', () => {
  const SMALLER = { ...SHOP, nodes: SHOP.nodes.slice(0, 2), edges: SHOP.edges.slice(0, 1) };
  const BIGGER = {
    ...SHOP,
    nodes: [...SHOP.nodes, { id: 'logs', kind: 'monitoring', label: 'Logs' }],
  };

  it('offers a simpler diagram with what it removes', async () => {
    const { result, requests } = await run(
      { task: 'simplify', locale: 'en', graph: shopGraph(), prompt: 'Keep the database' },
      [json({ title: 'Smaller', rationale: 'Fewer parts.', graph: SMALLER })],
    );
    expect(result.warnings).toEqual([]);
    expect(result.proposals[0]?.changes.nodes.removed).toEqual(['db']);
    expect(requests[0]?.messages[1]?.content).toContain('simpler architecture');
    expect(requests[0]?.messages[1]?.content).toContain('Keep the database');
  });

  it('offers a more complete diagram with what it adds', async () => {
    const { result, requests } = await run({ task: 'extend', locale: 'en', graph: shopGraph() }, [
      json({ title: 'Production ready', rationale: 'Adds monitoring.', graph: BIGGER }),
    ]);
    expect(result.warnings).toEqual([]);
    expect(result.proposals[0]?.changes.nodes.added).toEqual(['logs']);
    expect(requests[0]?.messages[1]?.content).toContain('more complete architecture');
  });

  it('warns when the proposal goes the other way', async () => {
    const simplified = await run({ task: 'simplify', locale: 'en', graph: shopGraph() }, [
      json({ title: 'Bigger', rationale: '', graph: BIGGER }),
    ]);
    expect(simplified.result.warnings).toEqual(['not-simpler']);
    const extended = await run({ task: 'extend', locale: 'en', graph: shopGraph() }, [
      json({ title: 'Smaller', rationale: '', graph: SMALLER }),
    ]);
    expect(extended.result.warnings).toEqual(['not-more-complete']);
  });

  it('asks again when the diagram comes back unchanged, or invalid', async () => {
    const { requests } = await run({ task: 'extend', locale: 'en', graph: shopGraph() }, [
      json({ title: 'Same', rationale: '', graph: SHOP }),
      json({ title: 'Broken', rationale: '', graph: { ...SHOP, nodes: [] } }),
      json({ title: 'More', rationale: '', graph: BIGGER }),
    ]);
    expect(requests[1]?.messages.at(-1)?.content).toContain('the same as the current one');
    expect(requests[2]?.messages.at(-1)?.content).toContain('graph:');
  });
});
