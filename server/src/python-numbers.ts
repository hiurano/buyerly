import { strip } from './graphql/areas/accounts/text.ts';

// Python's number builtins where the TypeScript server must answer what the
// Python one does, digit for digit.

// The double's exact binary value as mantissa × 2^exponent (both ≥ 0 mantissa).
function exactParts(value: number): { mantissa: bigint; exponent: number } {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, Math.abs(value));
  const high = view.getUint32(0);
  const low = view.getUint32(4);
  const biased = (high >>> 20) & 0x7ff;
  let mantissa = (BigInt(high & 0xfffff) << 32n) | BigInt(low);
  if (biased === 0) return { mantissa, exponent: -1074 };
  mantissa |= 1n << 52n;
  return { mantissa, exponent: biased - 1075 };
}

// round(x, ndigits): the exact binary value rounded to ndigits decimals, a
// tie going to the even digit, read back as the nearest double. Unlike
// toFixed (ties away from zero) and Math.round (ties up), so round(0.125, 2)
// is 0.12 and round(0.375, 2) is 0.38; 2.675 is just below its tie and gives
// 2.67 in both languages.
export function pyRound(value: number, ndigits: number): number {
  if (!Number.isFinite(value) || value === 0) return value;
  if (!Number.isInteger(ndigits) || ndigits < 0) throw new RangeError('pyRound takes ndigits >= 0');
  const { mantissa, exponent } = exactParts(value);
  if (exponent >= 0) return value;
  const numerator = mantissa * 10n ** BigInt(ndigits);
  const denominator = 1n << BigInt(-exponent);
  let quotient = numerator / denominator;
  const twice = 2n * (numerator % denominator);
  if (twice > denominator || (twice === denominator && quotient % 2n === 1n)) quotient += 1n;
  return Number(`${value < 0 ? '-' : ''}${quotient}e-${ndigits}`);
}

const DIGITS = '\\d(?:_?\\d)*';
const FLOAT_TEXT = new RegExp(
  `^[+-]?(?:(?:${DIGITS}(?:\\.(?:${DIGITS})?)?|\\.${DIGITS})(?:[eE][+-]?${DIGITS})?|inf|infinity|nan)$`,
  'i',
);

// float(x) for what JSON can hold; undefined where Python raises
// (TypeError for null, lists and objects, ValueError for other text).
export function pyFloat(value: unknown): number | undefined {
  if (typeof value === 'number') return value;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value !== 'string') return undefined;
  const text = strip(value);
  if (!FLOAT_TEXT.test(text)) return undefined;
  const lower = text.toLowerCase().replace(/^[+-]/, '');
  const negative = text.startsWith('-');
  if (lower === 'nan') return NaN;
  if (lower === 'inf' || lower === 'infinity') return negative ? -Infinity : Infinity;
  return Number(text.replace(/_/g, ''));
}

// Python truthiness of a JSON value.
export function pyTruthy(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === 'object') return Object.keys(value).length > 0;
  return Boolean(value);
}
