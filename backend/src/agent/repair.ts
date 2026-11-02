import type { AssistWarning } from '@archdraft/shared';
import { LlmError } from '../llm/errors.ts';
import type { LlmMessage, LlmProvider, LlmRequest } from '../llm/provider.ts';
import { extractJson } from './extract-json.ts';

/** What reading an answer gave: the value, or what is wrong with it, in words for the model. */
export type Interpretation<T> =
  | {
      readonly ok: true;
      readonly value: T;
      readonly warnings?: readonly AssistWarning[];
      /**
       * Risks of an answer that is valid: worth asking once to fix them. If
       * the fixed answer is not usable, this one is kept.
       */
      readonly review?: readonly string[];
    }
  | { readonly ok: false; readonly problems: readonly string[] };

export type Interpret<T> = (
  answer: Record<string, unknown>,
  /** On the last attempt an answer that is only partly right may still be taken. */
  lastAttempt: boolean,
) => Interpretation<T>;

export interface Repaired<T> {
  readonly value: T;
  readonly attempts: number;
  readonly warnings: readonly AssistWarning[];
}

/** Retries after the first answer. Two is where small models stop getting better. */
export const MAX_RETRIES = 2;

/** Problems told to the model at most; more only fill its context. */
const MAX_PROBLEMS = 20;

/**
 * Asks the model, reads the answer and, while it is not right, asks again
 * with its last answer and the exact problems found. This is the cheapest way
 * to raise the share of valid answers of small models (docs/arquitectura.md).
 * A valid answer with risks is reviewed once: the model is asked to fix them,
 * and the first answer stands if the fix is not valid. Only the last answer
 * is sent back, so the conversation does not grow with each retry. Fails with
 * `invalid-response` and the last problems.
 */
export async function runWithRepair<T>(
  provider: LlmProvider,
  request: LlmRequest,
  interpret: Interpret<T>,
  maxRetries: number = MAX_RETRIES,
): Promise<Repaired<T>> {
  let messages: readonly LlmMessage[] = request.messages;
  let problems: readonly string[] = [];
  let kept: Omit<Repaired<T>, 'attempts'> | undefined;
  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    const text = await provider.complete({ ...request, messages });
    const answer = extractJson(text);
    const result = answer
      ? interpret(answer, attempt === maxRetries + 1)
      : { ok: false as const, problems: ['The answer is not a JSON object.'] };
    if (result.ok) {
      const repaired = { value: result.value, warnings: result.warnings ?? [] };
      const review = kept === undefined ? (result.review ?? []) : [];
      if (review.length === 0 || attempt === maxRetries + 1) {
        return { ...repaired, attempts: attempt };
      }
      kept = repaired;
      messages = [
        ...request.messages,
        { role: 'assistant', content: text },
        { role: 'user', content: reviewMessage(review) },
      ];
      continue;
    }
    // The fix of a reviewed answer went wrong: the answer before it is still good.
    if (kept !== undefined) return { ...kept, attempts: attempt };
    problems = result.problems;
    messages = [
      ...request.messages,
      { role: 'assistant', content: text },
      { role: 'user', content: repairMessage(problems) },
    ];
  }
  throw new LlmError(
    'invalid-response',
    `The model did not give a valid answer after ${maxRetries + 1} attempts: ${problems.slice(0, 3).join(' ')}`,
  );
}

function listed(problems: readonly string[]): string[] {
  const lines = problems.slice(0, MAX_PROBLEMS).map((problem) => `- ${problem}`);
  if (problems.length > MAX_PROBLEMS) lines.push(`- …and ${problems.length - MAX_PROBLEMS} more.`);
  return lines;
}

function repairMessage(problems: readonly string[]): string {
  return [
    'Your answer cannot be used:',
    ...listed(problems),
    'Answer again with the whole JSON object, fixed, and nothing else.',
  ].join('\n');
}

function reviewMessage(risks: readonly string[]): string {
  return [
    'The design rules of the editor found risks in your answer:',
    ...listed(risks),
    'Fix them and answer again with the whole JSON object, and nothing else. If the person asked for one of them explicitly, keep it and say why in "assumptions".',
  ].join('\n');
}
