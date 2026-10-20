import { z } from 'zod';
import { ArchitectureGraphSchema } from './schema.ts';

/**
 * JSON Schema (draft 2020-12) of the diagram format, derived from the Zod
 * schema. It is embedded in the LLM prompt and offered to providers that
 * support structured output, so the model and the validator share one contract.
 */
export function architectureGraphJsonSchema() {
  return z.toJSONSchema(ArchitectureGraphSchema, { io: 'input' });
}

export type JsonSchema = ReturnType<typeof architectureGraphJsonSchema>;
