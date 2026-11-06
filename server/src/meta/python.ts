import { PythonCrash } from '../rules/engine.ts';
import { pyStr } from '../rules/validation.ts';
import { pyFloat, pyTruthy } from '../python-numbers.ts';

// The Python idioms meta_api/ leans on, for JSON values from Meta: the port
// must read odd payloads exactly as Python does, including where Python
// raises (PythonCrash, an exception meta_api does not catch).

export type Json = Record<string, unknown>;

export const isRecord = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const truthy = pyTruthy;

// `a or b`
export const or = <T>(value: unknown, fallback: T): unknown => (pyTruthy(value) ? value : fallback);

// str(x or "")
export const strOr = (value: unknown, fallback: string): string => (pyTruthy(value) ? pyStr(value) : fallback);

// dict.get(key, default): the stored value when the key is there, even null.
export const get = (row: Json, key: string, fallback?: unknown): unknown =>
  Object.prototype.hasOwnProperty.call(row, key) ? row[key] : fallback;

// x.get(...) on a value that is not a dict: AttributeError.
export function asDict(value: unknown, what = 'object'): Json {
  if (isRecord(value)) return value;
  throw new PythonCrash('AttributeError', `'${typeName(value)}' ${what} has no attribute 'get'`);
}

export function typeName(value: unknown): string {
  if (value === null || value === undefined) return 'NoneType';
  if (Array.isArray(value)) return 'list';
  if (typeof value === 'string') return 'str';
  if (typeof value === 'boolean') return 'bool';
  if (typeof value === 'number') return Number.isInteger(value) ? 'int' : 'float';
  return 'dict';
}

// MetaClient._safe_float: float(x or 0.0), 0.0 on TypeError/ValueError.
export function safeFloat(value: unknown): number {
  if (!pyTruthy(value)) return 0;
  return pyFloat(value) ?? 0;
}

// MetaClient._safe_int: int(float(x or 0)), 0 on TypeError/ValueError; int()
// of an infinity is an OverflowError Python does not catch.
export function safeInt(value: unknown): number {
  const number = safeFloat(value);
  if (Number.isNaN(number)) return 0;
  if (!Number.isFinite(number)) throw new PythonCrash('OverflowError', 'cannot convert float infinity to integer');
  return Math.trunc(number) + 0;
}

// `for row in rows or []`: what iterating a JSON value yields. A dict yields
// its keys and a string its characters; a number or true cannot be iterated.
export function iterate(value: unknown): unknown[] {
  if (!pyTruthy(value)) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') return Array.from(value);
  if (isRecord(value)) return Object.keys(value);
  throw new PythonCrash('TypeError', `'${typeName(value)}' object is not iterable`);
}

// A dict key as Python hashes it: 1, 1.0 and True are one key, "1" another;
// a list or dict cannot be a key.
export function hashKey(value: unknown): string {
  if (typeof value === 'string') return `s:${value}`;
  if (typeof value === 'number') return `n:${value}`;
  if (typeof value === 'boolean') return `n:${value ? 1 : 0}`;
  if (value === null || value === undefined) return 'none';
  throw new PythonCrash('TypeError', `unhashable type: '${typeName(value)}'`);
}

// sorted() of strings: by code point, not by UTF-16 unit.
export function sortedStrings(values: Iterable<string>): string[] {
  return [...values].sort((a, b) => {
    const left = Array.from(a);
    const right = Array.from(b);
    for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
      const difference = left[index].codePointAt(0)! - right[index].codePointAt(0)!;
      if (difference !== 0) return difference;
    }
    return left.length - right.length;
  });
}

// urllib.parse.quote_plus, which httpx applies to query params and form
// bodies: only letters, digits and "_.-~" stay as they are.
export function quotePlus(text: string): string {
  return encodeURIComponent(text)
    .replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)
    .replace(/%20/g, '+');
}

// httpx's primitive_value_to_str: how a param value reaches the wire.
export function paramText(value: unknown): string {
  if (value === true) return 'true';
  if (value === false) return 'false';
  if (value === null || value === undefined) return '';
  return pyStr(value);
}

// urlencode(params) with httpx's rendering of each value.
export function urlencode(params: Array<[string, unknown]>): string {
  return params.map(([key, value]) => `${quotePlus(key)}=${quotePlus(paramText(value))}`).join('&');
}

// json.dumps(dict_of_strings) with Python's default separators and ASCII escapes.
export function pyJsonDumps(value: Record<string, string>): string {
  const ascii = (text: string) =>
    JSON.stringify(text).replace(/[\u0080-￿]/g, (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`);
  return `{${Object.entries(value).map(([key, item]) => `${ascii(key)}: ${ascii(item)}`).join(', ')}}`;
}
