import {
  type ArchEdge,
  type ArchitectureGraph,
  type ArchNode,
  LIMITS,
  SCHEMA_VERSION,
} from '@archdraft/shared';
import { z } from 'zod';
import { createApp } from '../src/http/app.ts';
import { createScriptedProvider } from '../src/llm/scripted-provider.ts';

/**
 * CPU time the Worker spends on a request to `/v1/assist`, measured in
 * Node.js with a model that answers at once (docs/modulos/backend.md, Tiempo
 * de CPU). What is left is the work the free plan counts against its 10 ms:
 * reading the body, checking it with the contract, writing the prompt,
 * reading and validating the answer, the design review and the changes.
 * Waiting for the model is not CPU time.
 */

// Zod compiles its checks with `new Function` where it can, which Workers do not
// allow (zod/v4/core/util.js, allowsEval); measure the path the Worker takes.
z.config({ jitless: true });

/** The largest diagram the schema accepts: 20 networks of 9 services, chained. */
export function largestGraph(): ArchitectureGraph {
  const nodes: ArchNode[] = [];
  const edges: ArchEdge[] = [];
  const networks = LIMITS.maxNodes / 10;
  for (let n = 0; n < networks; n++) {
    nodes.push({ id: `net${n}`, kind: 'network', label: `Network ${n}` });
    for (let s = 0; s < 9; s++) {
      nodes.push({
        id: `s${n}-${s}`,
        kind: 'service',
        label: `Service ${n}.${s}`,
        parentId: `net${n}`,
        attributes: { replicas: 2 },
      });
      if (s > 0) {
        edges.push({
          id: `e${n}-${s}`,
          source: `s${n}-${s - 1}`,
          target: `s${n}-${s}`,
          mode: 'sync',
        });
      }
    }
    if (n > 0) edges.push({ id: `x${n}`, source: `s${n - 1}-8`, target: `s${n}-0`, mode: 'async' });
  }
  return { schemaVersion: SCHEMA_VERSION, title: 'Largest', provider: 'aws', nodes, edges };
}

const RELABEL = { op: 'updateNode', id: 's0-0', changes: { label: 'Entry service' } };

interface CpuCase {
  readonly name: string;
  readonly request: object;
  readonly answer: object;
}

function cases(): CpuCase[] {
  const graph = largestGraph();
  const { schemaVersion: _version, ...answerGraph } = graph;
  const titled = { title: 'Largest', rationale: 'Every service twice.' };
  return [
    {
      name: 'generate, 200 nodes back',
      request: { task: 'generate', locale: 'en', prompt: 'Many services on AWS' },
      answer: { ...titled, graph: answerGraph },
    },
    {
      name: 'edit, 200 nodes',
      request: { task: 'edit', locale: 'en', prompt: 'Rename the entry', graph },
      answer: { ...titled, operations: [RELABEL] },
    },
    {
      name: 'improve, 200 nodes',
      request: { task: 'improve', locale: 'en', graph },
      answer: { proposals: [{ ...titled, operations: [RELABEL] }] },
    },
    {
      name: 'extend, 200 nodes in and out',
      request: { task: 'extend', locale: 'en', graph },
      answer: {
        ...titled,
        graph: {
          ...answerGraph,
          nodes: answerGraph.nodes.map((node) => ({ ...node, label: `${node.label}!` })),
        },
      },
    },
  ];
}

export interface CpuMeasure {
  readonly name: string;
  readonly status: number;
  /** The first request of a fresh process, when nothing is cached yet. */
  readonly firstMs: number;
  readonly medianMs: number;
  readonly maxMs: number;
}

async function cpuMsOf(task: () => Promise<number>): Promise<{ ms: number; status: number }> {
  const before = process.cpuUsage();
  const status = await task();
  const used = process.cpuUsage(before);
  return { ms: (used.user + used.system) / 1000, status };
}

/** Runs each case `runs` times, each request with its own app as a Worker would reuse one. */
export async function measureCpu(runs: number): Promise<CpuMeasure[]> {
  const measures: CpuMeasure[] = [];
  for (const { name, request, answer } of cases()) {
    const body = JSON.stringify(request);
    const reply = JSON.stringify(answer);
    const times: number[] = [];
    let status = 0;
    for (let run = 0; run < runs; run++) {
      const { provider } = createScriptedProvider([reply]);
      const app = createApp({ provider: () => provider, log: () => undefined });
      const measured = await cpuMsOf(async () => {
        const response = await app.request(
          '/v1/assist',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body,
          },
          {},
        );
        await response.text();
        return response.status;
      });
      times.push(measured.ms);
      status = measured.status;
    }
    const sorted = [...times].sort((a, b) => a - b);
    measures.push({
      name,
      status,
      firstMs: times[0] ?? 0,
      medianMs: sorted[Math.floor(sorted.length / 2)] ?? 0,
      maxMs: sorted.at(-1) ?? 0,
    });
  }
  return measures;
}
