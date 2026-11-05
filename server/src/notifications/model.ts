// The pydantic models behind the Notifications area's bodies and stored JSON,
// checked as pydantic checks them in lax (Python) mode: fields in order,
// defaults for missing ones, unknown keys ignored, nested models, and every
// problem in pydantic's own words (bridge.py _validation_error joins them).
// Only the field types this area uses are here.

// A check returns the value or reports into `issues` and returns undefined.
export type Check<T> = (value: unknown, issues: string[]) => T | undefined;

// Raised by a field validator: pydantic's "Value error, …".
export class ValueError extends Error {}

interface FieldSpec<T> {
  check: Check<T>;
  // Missing fields take it; without one a missing field is "Field required".
  fallback?: () => T;
}

export function field<T>(check: Check<T>, fallback?: () => T): FieldSpec<T> {
  return { check, fallback };
}

type Shape = Record<string, FieldSpec<unknown>>;
export type Parsed<S extends Shape> = { [K in keyof S]: S[K] extends FieldSpec<infer T> ? T : never };

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

// A BaseModel `name`, as a field type or as the body itself.
export function model<S extends Shape>(name: string, shape: S): Check<Parsed<S>> {
  return (value, issues) => {
    if (!isObject(value)) {
      issues.push(`Input should be a valid dictionary or instance of ${name}`);
      return undefined;
    }
    const before = issues.length;
    const parsed: Record<string, unknown> = {};
    for (const [key, spec] of Object.entries(shape)) {
      if (!(key in value)) {
        if (spec.fallback) parsed[key] = spec.fallback();
        else issues.push('Field required');
        continue;
      }
      parsed[key] = spec.check(value[key], issues);
    }
    return issues.length === before ? (parsed as Parsed<S>) : undefined;
  };
}

// The body or stored value checked by `check`; null and the issues when it fails.
export function validate<T>(check: Check<T>, value: unknown): { value: T; issues: [] } | { value: null; issues: string[] } {
  const issues: string[] = [];
  const result = check(value, issues);
  return issues.length || result === undefined ? { value: null, issues } : { value: result, issues: [] };
}

// pydantic's lax bool: true/false, 0/1, and the usual words in any case.
const TRUE_WORDS = new Set(['1', 'on', 't', 'true', 'y', 'yes']);
const FALSE_WORDS = new Set(['0', 'off', 'f', 'false', 'n', 'no']);

export const bool: Check<boolean> = (value, issues) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number' && (value === 0 || value === 1)) return value === 1;
  if (typeof value === 'string') {
    const word = value.toLowerCase();
    if (TRUE_WORDS.has(word)) return true;
    if (FALSE_WORDS.has(word)) return false;
  }
  issues.push(typeof value === 'string' || (typeof value === 'number' && Number.isInteger(value))
    ? 'Input should be a valid boolean, unable to interpret input'
    : 'Input should be a valid boolean');
  return undefined;
};

// A str with Field(max_length=…) and an after-validator; len() counts code points.
export function str(maxLength?: number, after?: (value: string) => string): Check<string> {
  return (value, issues) => {
    if (typeof value !== 'string') {
      issues.push('Input should be a valid string');
      return undefined;
    }
    if (maxLength !== undefined && [...value].length > maxLength) {
      issues.push(`String should have at most ${maxLength} characters`);
      return undefined;
    }
    if (!after) return value;
    try {
      return after(value);
    } catch (error) {
      if (!(error instanceof ValueError)) throw error;
      issues.push(`Value error, ${error.message}`);
      return undefined;
    }
  };
}

// Literal["a", "b", …].
export function literal<T extends string>(choices: readonly T[]): Check<T> {
  const quoted = choices.map((choice) => `'${choice}'`);
  const message = `Input should be ${quoted.slice(0, -1).join(', ')} or ${quoted[quoted.length - 1]}`;
  return (value, issues) => {
    if (typeof value === 'string' && (choices as readonly string[]).includes(value)) return value as T;
    issues.push(message);
    return undefined;
  };
}

// list[item] with Field(max_length=…): too long is the only problem reported.
export function list<T>(item: Check<T>, maxLength?: number): Check<T[]> {
  return (value, issues) => {
    if (!Array.isArray(value)) {
      issues.push('Input should be a valid list');
      return undefined;
    }
    if (maxLength !== undefined && value.length > maxLength) {
      issues.push(`List should have at most ${maxLength} items after validation, not ${value.length}`);
      return undefined;
    }
    const before = issues.length;
    const parsed = value.map((entry) => item(entry, issues));
    return issues.length === before ? (parsed as T[]) : undefined;
  };
}

// A field validator run on what the type check let through.
export function after<T, U>(check: Check<T>, validator: (value: T) => U): Check<U> {
  return (value, issues) => {
    const before = issues.length;
    const parsed = check(value, issues);
    if (issues.length !== before || parsed === undefined) return undefined;
    try {
      return validator(parsed);
    } catch (error) {
      if (!(error instanceof ValueError)) throw error;
      issues.push(`Value error, ${error.message}`);
      return undefined;
    }
  };
}
