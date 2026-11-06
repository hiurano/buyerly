import { META_TIMEZONE_ALIASES } from '../graphql/areas/accounts/clock.ts';
import { normalizeCurrency, UNKNOWN_CURRENCY } from '../graphql/areas/accounts/currency.ts';
import { pyFloat, pyRound } from '../python-numbers.ts';
import { PythonCrash } from '../rules/engine.ts';
import { pyStr, pyStrip } from '../rules/validation.ts';
import { MetaValueError } from './errors.ts';
import { truthy } from './python.ts';

// core/currency.py and core/timezones.py as the Meta client uses them.

export { normalizeCurrency, UNKNOWN_CURRENCY };

// Meta returns management budgets in the account currency's minor unit;
// these currencies have no fractional one.
export const ZERO_DECIMAL_CURRENCIES = new Set(['CLP', 'ISK', 'JPY', 'KRW', 'PYG', 'VND']);

const currencyOf = (value: unknown): string => normalizeCurrency(value === null || value === undefined ? '' : pyStr(value));

export function currencyMinorUnitFactor(currency: unknown): number {
  return ZERO_DECIMAL_CURRENCIES.has(currencyOf(currency)) ? 1 : 100;
}

// from_meta_budget_units: float(value or 0) / factor, 0.0 for what is not a number.
export function fromMetaBudgetUnits(value: unknown, currency: unknown): number {
  const amount = truthy(value) ? pyFloat(value) : 0;
  if (amount === undefined) return 0;
  return amount / currencyMinorUnitFactor(currency);
}

// to_meta_budget_units: whole minor units, refused for an unknown currency,
// a non-number or less than one unit.
export function toMetaBudgetUnits(value: unknown, currency: unknown): number {
  const code = currencyOf(currency);
  if (code === UNKNOWN_CURRENCY) throw new MetaValueError('Account currency is unknown; budget mutation is blocked.');
  const amount = pyFloat(value);
  if (amount === undefined || !Number.isFinite(amount)) throw new MetaValueError('Budget must be a finite number.');
  const minor = amount * currencyMinorUnitFactor(code);
  if (!Number.isFinite(minor)) throw new PythonCrash('OverflowError', 'cannot convert float infinity to integer');
  const units = pyRound(minor, 0);
  if (units < 1) throw new MetaValueError('Budget must be at least one minor currency unit.');
  return units + 0;
}

// canonical_timezone_name: Meta's legacy zone names stored canonically.
export function canonicalTimezoneName(value: unknown): string {
  const name = pyStrip(truthy(value) ? pyStr(value) : '');
  return META_TIMEZONE_ALIASES[name] ?? name;
}
