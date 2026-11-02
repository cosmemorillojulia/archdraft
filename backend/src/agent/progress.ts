import {
  ASSIST_PROGRESS_LIMITS,
  type AssistProgress,
  type AssistStage,
  LIMITS,
} from '@archdraft/shared';
import type { LlmDelta, LlmProvider } from '../llm/provider.ts';

/** How often, at most, progress goes out while the model writes. */
const INTERVAL_MS = 250;

export type OnProgress = (progress: AssistProgress) => void;

/**
 * The provider, telling what the agent is doing on each call: thinking, then drawing as the
 * answer comes, then checking it; and fixing on the calls after the first. While the answer is
 * written it passes on the reasoning of the model, for the models that show it, and the names
 * of the components written so far. A provider that cannot stream still tells each stage.
 */
export function reporting(
  provider: LlmProvider,
  onProgress: OnProgress,
  now: () => number = Date.now,
): LlmProvider {
  let calls = 0;
  return {
    name: provider.name,
    async complete(request) {
      calls += 1;
      const first = calls === 1;
      let stage: AssistStage = first ? 'thinking' : 'fixing';
      let thought = '';
      let answer = '';
      let sent: readonly string[] = [];
      let last = -Infinity;

      const send = () => {
        const components = componentNames(answer);
        const changed = components.length !== sent.length;
        onProgress({
          stage,
          ...(thought === ''
            ? {}
            : { thought: thought.slice(-ASSIST_PROGRESS_LIMITS.thoughtLength) }),
          ...(changed ? { components } : {}),
        });
        if (changed) sent = components;
        thought = '';
        last = now();
      };

      const onDelta = (delta: LlmDelta) => {
        const was = stage;
        if (delta.reasoning) thought += delta.reasoning;
        if (delta.content) {
          answer += delta.content;
          if (first) stage = 'drawing';
        }
        if (stage !== was || now() - last >= INTERVAL_MS) send();
      };

      send();
      const text = await provider.complete({ ...request, onDelta });
      answer = text;
      if (thought !== '' || componentNames(answer).length !== sent.length) send();
      stage = 'checking';
      send();
      return text;
    },
  };
}

const LABEL = /"label"\s*:\s*"((?:[^"\\]|\\.)*)"/g;

/**
 * The names of the nodes in a piece of JSON that may still be cut off: the labels of the
 * objects that have a `kind`, which edges do not. The kind may come after the label, and is
 * then found once it is written.
 */
export function componentNames(text: string): string[] {
  const names: string[] = [];
  for (const match of text.matchAll(LABEL)) {
    const at = match.index;
    const opened = text.lastIndexOf('{', at);
    const closed = text.indexOf('}', at);
    const object = text.slice(opened, closed < 0 ? undefined : closed);
    if (opened < 0 || !/"kind"\s*:/.test(object)) continue;
    let name: unknown;
    try {
      name = JSON.parse(`"${match[1] ?? ''}"`);
    } catch {
      continue;
    }
    if (typeof name === 'string' && name.trim() !== '') {
      names.push(name.trim().slice(0, LIMITS.labelLength));
    }
    if (names.length >= LIMITS.maxNodes) break;
  }
  return names;
}
