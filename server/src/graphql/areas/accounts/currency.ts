import { strip } from './text.ts';

// core/currency.py: a safe ISO-like currency code, never a guessed USD.
export const UNKNOWN_CURRENCY = 'UNKNOWN';

export function normalizeCurrency(value: string | null | undefined): string {
  const code = strip(String(value || '')).toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : UNKNOWN_CURRENCY;
}
