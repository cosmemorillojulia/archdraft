import { LlmError } from './errors.ts';
import type { LlmProvider, LlmRequest } from './provider.ts';

/** One turn of a script: the text to answer, or the error to fail with. */
export type ScriptedTurn = string | LlmError;

/**
 * A provider that plays back answers in order and records what it was asked,
 * for tests of the agent and of the API without a model. Running out of
 * answers fails loudly, so a test never passes on a call it did not expect.
 */
export function createScriptedProvider(turns: readonly ScriptedTurn[]) {
  const requests: LlmRequest[] = [];
  const provider: LlmProvider = {
    name: 'scripted',
    complete(request) {
      requests.push(request);
      const turn = turns[requests.length - 1];
      if (turn === undefined) {
        return Promise.reject(
          new Error(`Scripted provider has no answer for call ${requests.length}`),
        );
      }
      return turn instanceof LlmError ? Promise.reject(turn) : Promise.resolve(turn);
    },
  };
  return { provider, requests };
}
