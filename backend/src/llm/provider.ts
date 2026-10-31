/**
 * The one thing the agent needs from a language model: text in, text out.
 * Providers do the network call; everything else (prompts, parsing,
 * validation, retries) lives in the agent, so it runs the same with any of them.
 */

export interface LlmMessage {
  readonly role: 'system' | 'user' | 'assistant';
  readonly content: string;
}

export interface LlmRequest {
  readonly messages: readonly LlmMessage[];
  /**
   * JSON Schema the answer must follow. A provider that can enforce it does;
   * the others at least ask for a JSON object. The prompt always describes it too.
   */
  readonly jsonSchema?: object;
  readonly temperature?: number;
  readonly maxTokens?: number;
  readonly signal?: AbortSignal;
}

export interface LlmProvider {
  /** Provider and model, for logs: `workers-ai:@cf/meta/llama-3.3-70b-instruct-fp8-fast`. */
  readonly name: string;
  /** The text of the answer. Rejects with an `LlmError`. */
  complete(request: LlmRequest): Promise<string>;
}
