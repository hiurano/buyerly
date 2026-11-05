import { invalidInput } from '../../errors.ts';

// The pydantic body models of this area, checked as pydantic checks them:
// every field in order, a type error or a field validator's ValueError per
// field, all messages joined (bridge.py _validation_error). Extra keys are
// ignored, as these models do not forbid them.

export type FieldCheck<T> = (value: unknown) => T;

// Raised by a field validator: pydantic's "Value error, …" (dropped again by
// invalidInput, as the client shows it).
export class ValueError extends Error {}

type Shape = Record<string, FieldCheck<unknown>>;
type Parsed<S extends Shape> = { [K in keyof S]: ReturnType<S[K]> };

class TypeIssue extends Error {}

export function model<S extends Shape>(shape: S): (input: unknown) => Parsed<S> {
  return (input) => {
    // A missing input is an empty body, as bridge.py validates None as {}.
    const body = input ?? {};
    if (typeof body !== 'object' || Array.isArray(body)) {
      throw invalidInput(['Input should be a valid dictionary or object to extract fields from']);
    }
    const values = body as Record<string, unknown>;
    const messages: string[] = [];
    const parsed: Record<string, unknown> = {};
    for (const [name, check] of Object.entries(shape)) {
      if (!(name in values)) {
        messages.push('Field required');
        continue;
      }
      try {
        parsed[name] = check(values[name]);
      } catch (error) {
        if (error instanceof ValueError) messages.push(`Value error, ${error.message}`);
        else if (error instanceof TypeIssue) messages.push(error.message);
        else throw error;
      }
    }
    if (messages.length) throw invalidInput(messages);
    return parsed as Parsed<S>;
  };
}

export function string<T = string>(validate: (value: string) => T = (value) => value as T): FieldCheck<T> {
  return (value) => {
    if (typeof value !== 'string') throw new TypeIssue('Input should be a valid string');
    return validate(value);
  };
}

export function dictionary<T = Record<string, unknown>>(
  validate: (value: Record<string, unknown>) => T = (value) => value as T,
): FieldCheck<T> {
  return (value) => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new TypeIssue('Input should be a valid dictionary');
    }
    return validate(value as Record<string, unknown>);
  };
}

// len(json.dumps(value, separators=(",", ":"))): Python escapes every
// non-ASCII UTF-16 unit as \uXXXX (ensure_ascii), six characters each.
export function pythonJsonLength(value: unknown): number {
  const text = JSON.stringify(value);
  let length = text.length;
  for (let i = 0; i < text.length; i += 1) if (text.charCodeAt(i) > 0x7f) length += 5;
  return length;
}
