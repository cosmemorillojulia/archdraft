import { type AssistProgress, AssistProgressSchema, LIMITS } from '@archdraft/shared';
import { describe, expect, it } from 'vitest';
import { componentNames, reporting } from '../src/agent/progress.ts';
import type { LlmDelta, LlmProvider } from '../src/llm/provider.ts';

/** A provider that writes `deltas` one by one, moving the clock `step` ms before each. */
function streamingProvider(
  deltas: readonly LlmDelta[],
  answer: string,
  clock: { time: number },
  step = 0,
): LlmProvider {
  return {
    name: 'streaming',
    complete(request) {
      for (const delta of deltas) {
        clock.time += step;
        request.onDelta?.(delta);
      }
      return Promise.resolve(answer);
    },
  };
}

function record() {
  const events: AssistProgress[] = [];
  return { events, onProgress: (progress: AssistProgress) => events.push(progress) };
}

const NODE = '{"nodes":[{"id":"user","kind":"user","label":"User"}';

describe('reporting', () => {
  it('tells thinking, then drawing with the reasoning and the components, then checking', async () => {
    const clock = { time: 0 };
    const deltas: LlmDelta[] = [
      { reasoning: 'A user ' },
      { reasoning: 'first.' },
      { content: NODE },
    ];
    const { events, onProgress } = record();
    const model = reporting(
      streamingProvider(deltas, `${NODE}]}`, clock),
      onProgress,
      () => clock.time,
    );

    const text = await model.complete({ messages: [] });

    expect(text).toBe(`${NODE}]}`);
    expect(model.name).toBe('streaming');
    expect(events).toEqual([
      { stage: 'thinking' },
      { stage: 'drawing', thought: 'A user first.', components: ['User'] },
      { stage: 'checking' },
    ]);
    for (const event of events) AssistProgressSchema.parse(event);
  });

  it('sends the reasoning at most every so often while the stage stays the same', async () => {
    const clock = { time: 0 };
    const deltas: LlmDelta[] = [{ reasoning: 'a' }, { reasoning: 'b' }, { reasoning: 'c' }];
    const { events, onProgress } = record();
    const model = reporting(
      streamingProvider(deltas, '{}', clock, 100),
      onProgress,
      () => clock.time,
    );

    await model.complete({ messages: [] });

    // At 100 and 200 ms nothing goes out; at 300 ms the reasoning so far does.
    expect(events).toEqual([
      { stage: 'thinking' },
      { stage: 'thinking', thought: 'abc' },
      { stage: 'checking' },
    ]);
  });

  it('flushes what the stream left unsent once the answer is complete', async () => {
    const clock = { time: 0 };
    const deltas: LlmDelta[] = [{ content: '{"nodes":[' }, { reasoning: 'late' }];
    const { events, onProgress } = record();
    const model = reporting(
      streamingProvider(deltas, `${NODE}]}`, clock),
      onProgress,
      () => clock.time,
    );

    await model.complete({ messages: [] });

    expect(events).toEqual([
      { stage: 'thinking' },
      { stage: 'drawing' },
      { stage: 'drawing', thought: 'late', components: ['User'] },
      { stage: 'checking' },
    ]);
  });

  it('tells each stage of a provider that cannot stream, and fixing on later calls', async () => {
    const whole: LlmProvider = { name: 'whole', complete: () => Promise.resolve(`${NODE}]}`) };
    const { events, onProgress } = record();
    const model = reporting(whole, onProgress, () => 0);

    await model.complete({ messages: [] });
    await model.complete({ messages: [] });

    expect(events).toEqual([
      { stage: 'thinking' },
      { stage: 'thinking', components: ['User'] },
      { stage: 'checking' },
      // Components already sent are not sent again.
      { stage: 'fixing' },
      { stage: 'fixing', components: ['User'] },
      { stage: 'checking' },
    ]);
  });

  it('keeps only the end of a very long reasoning', async () => {
    const clock = { time: 0 };
    const long = 'x'.repeat(5000) + 'end';
    const { events, onProgress } = record();
    const model = reporting(
      streamingProvider([{ reasoning: long }, { content: '{' }], '{}', clock),
      onProgress,
      () => clock.time,
    );

    await model.complete({ messages: [] });

    const thought = events[1]?.thought ?? '';
    expect(thought.endsWith('end')).toBe(true);
    expect(() => AssistProgressSchema.parse(events[1])).not.toThrow();
  });

  it('passes failures of the provider on', async () => {
    const failing: LlmProvider = {
      name: 'failing',
      complete: () => Promise.reject(new Error('down')),
    };
    const { onProgress } = record();
    await expect(reporting(failing, onProgress).complete({ messages: [] })).rejects.toThrow('down');
  });
});

describe('componentNames', () => {
  it('reads the labels of nodes and not of edges', () => {
    const text = JSON.stringify({
      nodes: [
        { id: 'a', kind: 'user', label: 'User' },
        { id: 'b', label: 'API', kind: 'api-gateway' },
      ],
      edges: [{ id: 'a-b', source: 'a', target: 'b', label: 'calls' }],
    });
    expect(componentNames(text)).toEqual(['User', 'API']);
  });

  it('reads a node cut off after its label once its kind is written', () => {
    expect(componentNames('{"nodes":[{"kind":"database","label":"Orders DB"')).toEqual([
      'Orders DB',
    ]);
    expect(componentNames('{"nodes":[{"label":"Orders DB"')).toEqual([]);
  });

  it('decodes escapes, trims names and skips empty or broken ones', () => {
    const text =
      '[{"kind":"a","label":"  Say \\"hi\\"  "},{"kind":"b","label":"   "},{"kind":"c","label":"bad \\u12"}]';
    expect(componentNames(text)).toEqual(['Say "hi"']);
  });

  it('ignores a label with no object around it', () => {
    expect(componentNames('"label":"Loose","kind":"x"')).toEqual([]);
  });

  it('cuts long names and stops at the most nodes a diagram may have', () => {
    const long = 'n'.repeat(LIMITS.labelLength + 10);
    expect(componentNames(`{"kind":"a","label":"${long}"}`)).toEqual([
      long.slice(0, LIMITS.labelLength),
    ]);
    const many = Array.from({ length: LIMITS.maxNodes + 5 }, (_, i) => ({
      kind: 'a',
      label: `N${i}`,
    }));
    expect(componentNames(JSON.stringify(many))).toHaveLength(LIMITS.maxNodes);
  });
});
