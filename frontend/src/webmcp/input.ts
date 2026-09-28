import type { JsonSchema } from './types';

/**
 * Chrome hands the agent's arguments to a tool without checking them against
 * its input schema, so each tool checks them here. The message names the
 * field and what it accepts, so the agent can correct the call itself.
 */
export class ToolInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ToolInputError';
  }
}

function fieldPath(parent: string, key: string | number): string {
  if (typeof key === 'number') return `${parent}[${key}]`;
  return parent ? `${parent}.${key}` : key;
}

function readNumber(schema: Extract<JsonSchema, { type: 'number' | 'integer' }>, value: unknown, path: string): number {
  // Agents often quote numbers; "3.50" means the same as 3.5.
  const parsed = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (typeof parsed !== 'number' || !Number.isFinite(parsed)) {
    throw new ToolInputError(`${path} must be a number.`);
  }
  if (schema.type === 'integer' && !Number.isInteger(parsed)) {
    throw new ToolInputError(`${path} must be a whole number.`);
  }
  if (schema.enum && !schema.enum.includes(parsed)) {
    throw new ToolInputError(`${path} must be one of: ${schema.enum.join(', ')}.`);
  }
  if (schema.minimum !== undefined && parsed < schema.minimum) {
    throw new ToolInputError(`${path} must be at least ${schema.minimum}.`);
  }
  if (schema.maximum !== undefined && parsed > schema.maximum) {
    throw new ToolInputError(`${path} must be at most ${schema.maximum}.`);
  }
  return parsed;
}

function readValue(schema: JsonSchema, value: unknown, path: string): unknown {
  switch (schema.type) {
    case 'object': {
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new ToolInputError(`${path || 'The input'} must be an object.`);
      }
      const record = value as Record<string, unknown>;
      const allowed = Object.keys(schema.properties);
      const unexpected = Object.keys(record).filter((key) => !allowed.includes(key));
      if (unexpected.length > 0) {
        const where = path ? ` in ${path}` : '';
        const accepted = allowed.length > 0 ? `Accepted: ${allowed.join(', ')}.` : 'This tool takes no arguments.';
        throw new ToolInputError(`Unknown field ${unexpected.join(', ')}${where}. ${accepted}`);
      }
      const result: Record<string, unknown> = {};
      for (const [key, property] of Object.entries(schema.properties)) {
        const raw = record[key];
        // An agent may send null for an optional argument it means to skip.
        if (raw === undefined || raw === null) {
          if (schema.required?.includes(key)) {
            throw new ToolInputError(`${fieldPath(path, key)} is required.`);
          }
          if ('default' in property && property.default !== undefined) result[key] = property.default;
          continue;
        }
        result[key] = readValue(property, raw, fieldPath(path, key));
      }
      return result;
    }
    case 'array': {
      if (!Array.isArray(value)) throw new ToolInputError(`${path} must be a list.`);
      if (schema.minItems !== undefined && value.length < schema.minItems) {
        throw new ToolInputError(`${path} needs at least ${schema.minItems} item(s).`);
      }
      if (schema.maxItems !== undefined && value.length > schema.maxItems) {
        throw new ToolInputError(`${path} takes at most ${schema.maxItems} items.`);
      }
      return value.map((item, index) => readValue(schema.items, item, fieldPath(path, index)));
    }
    case 'string': {
      if (typeof value !== 'string') throw new ToolInputError(`${path} must be a string.`);
      const text = value.trim();
      if (schema.enum && !schema.enum.includes(text)) {
        throw new ToolInputError(`${path} must be one of: ${schema.enum.join(', ')}.`);
      }
      if (schema.minLength !== undefined && text.length < schema.minLength) {
        throw new ToolInputError(`${path} must not be empty.`);
      }
      if (schema.maxLength !== undefined && text.length > schema.maxLength) {
        throw new ToolInputError(`${path} must be at most ${schema.maxLength} characters.`);
      }
      return text;
    }
    case 'number':
    case 'integer':
      return readNumber(schema, value, path);
  }
}

/** The input with defaults filled in, or a ToolInputError explaining what is wrong. */
export function readToolInput<T>(schema: JsonSchema, input: unknown): T {
  return readValue(schema, input ?? {}, '') as T;
}
