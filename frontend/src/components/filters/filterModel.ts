export type FilterValue = string | number | boolean;

export type FilterOperator =
  | 'is'
  | 'is_not'
  | 'includes_all'
  | 'excludes_all'
  | 'includes_any'
  | 'excludes_any'
  | 'contains'
  | 'not_contains'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'before'
  | 'after';

export type FilterFieldType = 'enum' | 'text' | 'number' | 'date';

export interface FilterClause {
  fieldId: string;
  operator: FilterOperator;
  values: FilterValue[];
}

export interface FilterOption {
  value: string;
  label: string;
  count?: number;
  color?: string;
  icon?:
    | 'dot'
    | 'rule'
    | 'status-active'
    | 'status-paused'
    | 'status-triggered'
    | 'group-backlog'
    | 'group-shield'
    | 'group-rocket'
    | 'group-flask';
  keywords?: string[];
  /** A small outlined tag after the label, like Linear's "Agent" next to an agent under From. */
  badge?: string;
  /** A round picture before the label, like Linear's avatars under From: a person's photo or initials, a rule, Buyerly. */
  avatar?: FilterOptionAvatar;
}

export interface FilterOptionAvatar {
  kind: 'user' | 'rule' | 'buyerly';
  url?: string;
}

export interface FilterFieldDefinition<T> {
  id: string;
  label: string;
  section: string;
  type: FilterFieldType;
  operators: FilterOperator[];
  defaultOperator: FilterOperator;
  getValue: (item: T) => FilterValue | FilterValue[] | null | undefined;
  options?: FilterOption[];
  pluralLabel?: string;
  placeholder?: string;
  keywords?: string[];
  /** Known values with nothing to match, which Linear folds into one line. */
  unmatchedCount?: number;
}

export const FILTER_OPERATOR_LABELS: Record<FilterOperator, string> = {
  is: 'is',
  is_not: 'is not',
  includes_all: 'include all of',
  excludes_all: 'exclude if all',
  includes_any: 'include any of',
  excludes_any: 'exclude if any of',
  contains: 'contains',
  not_contains: 'does not contain',
  gt: '>',
  gte: '≥',
  lt: '<',
  lte: '≤',
  // Linear's date operators read "before" and "after".
  before: 'before',
  after: 'after',
};

/** Words for the symbols, for screen readers and the operator search. */
export const FILTER_OPERATOR_NAMES: Partial<Record<FilterOperator, string>> = {
  gt: 'greater than',
  gte: 'greater than or equal to',
  lt: 'less than',
  lte: 'less than or equal to',
};

export const NUMBER_OPERATORS: FilterOperator[] = ['gt', 'gte', 'lt', 'lte'];
export const DATE_OPERATORS: FilterOperator[] = ['after', 'before'];
export const TEXT_OPERATORS: FilterOperator[] = ['contains', 'not_contains'];

/**
 * Linear's ready-made dates under Dates: a time back from now, stored as an
 * ISO 8601 duration as Linear's own filter does ("-P1W"), so a saved filter
 * keeps meaning "the last week". A picked day is stored as "YYYY-MM-DD".
 */
export const DATE_PRESETS: { value: string; label: string }[] = [
  { value: '-P1D', label: '1 day ago' },
  { value: '-P3D', label: '3 days ago' },
  { value: '-P1W', label: '1 week ago' },
  { value: '-P1M', label: '1 month ago' },
  { value: '-P3M', label: '3 months ago' },
  { value: '-P6M', label: '6 months ago' },
  { value: '-P1Y', label: '1 year ago' },
];

const RELATIVE_DATE = /^-P(\d{1,3})([DWMY])$/;
const DAY_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** The moment a filter date stands for: a preset counts back from `now`, a day starts at local midnight. */
export const resolveFilterDate = (value: FilterValue, now: Date = new Date()): number => {
  const text = String(value);
  const relative = RELATIVE_DATE.exec(text);
  if (relative) {
    const amount = Number(relative[1]);
    const date = new Date(now);
    if (relative[2] === 'D') date.setDate(date.getDate() - amount);
    if (relative[2] === 'W') date.setDate(date.getDate() - amount * 7);
    if (relative[2] === 'M') date.setMonth(date.getMonth() - amount);
    if (relative[2] === 'Y') date.setFullYear(date.getFullYear() - amount);
    return date.getTime();
  }
  if (DAY_DATE.test(text)) {
    const [year, month, day] = text.split('-').map(Number);
    return new Date(year, month - 1, day).getTime();
  }
  return new Date(text).getTime();
};

export const filterDateLabel = (value: FilterValue): string => {
  const preset = DATE_PRESETS.find((candidate) => candidate.value === value);
  if (preset) return preset.label;
  const relative = RELATIVE_DATE.exec(String(value));
  if (relative) {
    const unit = { D: 'day', W: 'week', M: 'month', Y: 'year' }[relative[2] as 'D' | 'W' | 'M' | 'Y'];
    return `${relative[1]} ${unit}${relative[1] === '1' ? '' : 's'} ago`;
  }
  const time = resolveFilterDate(value);
  if (!Number.isFinite(time)) return String(value);
  return new Date(time).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const KNOWN_OPERATORS = new Set(Object.keys(FILTER_OPERATOR_LABELS));

/**
 * Filters read back from an address or a saved view: anything malformed is
 * dropped, so a hand-edited link opens the list with what still makes sense.
 */
export const sanitizeFilterClauses = (value: unknown): FilterClause[] => {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.slice(0, 20).flatMap((clause): FilterClause[] => {
    if (typeof clause !== 'object' || clause === null) return [];
    const { fieldId, operator, values } = clause as Record<string, unknown>;
    if (typeof fieldId !== 'string' || !/^[A-Za-z][\w.-]{0,63}$/.test(fieldId) || seen.has(fieldId)) return [];
    if (typeof operator !== 'string' || !KNOWN_OPERATORS.has(operator) || !Array.isArray(values)) return [];
    if (values.length === 0 || values.length > 100) return [];
    const clean = values.filter((item): item is FilterValue =>
      (typeof item === 'string' && item.length <= 200)
      || (typeof item === 'number' && Number.isFinite(item))
      || typeof item === 'boolean');
    if (clean.length !== values.length) return [];
    seen.add(fieldId);
    return [{ fieldId, operator: operator as FilterOperator, values: clean }];
  });
};

/** Linear says "is any of" once a clause holds more than one value. */
export const filterOperatorLabel = (operator: FilterOperator, valueCount: number) =>
  operator === 'is' && valueCount > 1 ? 'is any of' : FILTER_OPERATOR_LABELS[operator];

const asArray = (value: FilterValue | FilterValue[] | null | undefined): FilterValue[] => {
  if (value === null || value === undefined) return [];
  return Array.isArray(value) ? value : [value];
};

const normalizedString = (value: FilterValue) => String(value).trim().toLocaleLowerCase();

const equalValue = (left: FilterValue, right: FilterValue) => {
  if (typeof left === 'number' && typeof right === 'number') return left === right;
  if (typeof left === 'boolean' && typeof right === 'boolean') return left === right;
  return normalizedString(left) === normalizedString(right);
};

export const matchesFilterClause = <T>(
  item: T,
  field: FilterFieldDefinition<T>,
  clause: FilterClause
) => {
  const itemValues = asArray(field.getValue(item));
  const selectedValues = clause.values;

  if (selectedValues.length === 0) return true;

  if (clause.operator === 'includes_all' || clause.operator === 'excludes_all') {
    const all = selectedValues.every((selected) => itemValues.some((value) => equalValue(value, selected)));
    return clause.operator === 'includes_all' ? all : !all;
  }

  if (['is', 'is_not', 'includes_any', 'excludes_any'].includes(clause.operator)) {
    const hasMatch = itemValues.some((itemValue) =>
      selectedValues.some((selectedValue) => equalValue(itemValue, selectedValue))
    );
    return clause.operator === 'is' || clause.operator === 'includes_any' ? hasMatch : !hasMatch;
  }

  const itemValue = itemValues[0];
  const selectedValue = selectedValues[0];
  if (itemValue === undefined || selectedValue === undefined) return false;

  if (clause.operator === 'contains' || clause.operator === 'not_contains') {
    const contains = normalizedString(itemValue).includes(normalizedString(selectedValue));
    return clause.operator === 'contains' ? contains : !contains;
  }

  if (clause.operator === 'before' || clause.operator === 'after') {
    const left = new Date(String(itemValue)).getTime();
    const right = resolveFilterDate(selectedValue);
    if (!Number.isFinite(left) || !Number.isFinite(right)) return false;
    return clause.operator === 'before' ? left < right : left > right;
  }

  const left = typeof itemValue === 'number' ? itemValue : Number(itemValue);
  const right = typeof selectedValue === 'number' ? selectedValue : Number(selectedValue);
  if (!Number.isFinite(left) || !Number.isFinite(right)) return false;

  if (clause.operator === 'gt') return left > right;
  if (clause.operator === 'gte') return left >= right;
  if (clause.operator === 'lt') return left < right;
  if (clause.operator === 'lte') return left <= right;
  return false;
};

export const applyFilterClauses = <T>(
  items: T[],
  fields: FilterFieldDefinition<T>[],
  clauses: FilterClause[]
) => {
  if (clauses.length === 0) return items;
  const fieldsById = new Map(fields.map((field) => [field.id, field]));

  return items.filter((item) =>
    clauses.every((clause) => {
      const field = fieldsById.get(clause.fieldId);
      return field ? matchesFilterClause(item, field, clause) : true;
    })
  );
};

export const upsertFilterClause = (clauses: FilterClause[], nextClause: FilterClause) => {
  const existingIndex = clauses.findIndex((clause) => clause.fieldId === nextClause.fieldId);
  if (existingIndex === -1) return [...clauses, nextClause];

  const next = [...clauses];
  next[existingIndex] = nextClause;
  return next;
};

export const removeFilterClause = (clauses: FilterClause[], fieldId: string) =>
  clauses.filter((clause) => clause.fieldId !== fieldId);

export const getFilterValueSummary = <T>(
  field: FilterFieldDefinition<T>,
  clause: FilterClause
) => {
  if (clause.values.length === 0) return 'Any';
  if (field.type === 'date') return filterDateLabel(clause.values[0]);
  if (field.type === 'number') {
    const number = Number(clause.values[0]);
    return Number.isFinite(number) ? number.toLocaleString('en-US') : String(clause.values[0]);
  }
  if (clause.values.length > 1) {
    return `${clause.values.length} ${field.pluralLabel ?? 'values'}`;
  }

  const value = clause.values[0];
  const option = field.options?.find((candidate) => equalValue(candidate.value, value));
  return option?.label ?? String(value);
};

export const getFilterValueAccessibleName = <T>(
  field: FilterFieldDefinition<T>,
  clause: FilterClause
) =>
  clause.values
    .map((value) => {
      if (field.type === 'date' || field.type === 'number') return getFilterValueSummary(field, clause);
      const option = field.options?.find((candidate) => equalValue(candidate.value, value));
      return option?.label ?? String(value);
    })
    .join(', ');

export const parseDisplayNumber = (value: string | number) => {
  if (typeof value === 'number') return value;
  const normalized = value.replace(/,/g, '').replace(/[^0-9.-]/g, '');
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const normalizeDisplayDate = (value: string) => {
  const parsed = new Date(value);
  if (Number.isFinite(parsed.getTime())) return parsed.toISOString();

  const currentYear = new Date().getFullYear();
  const withYear = new Date(`${value} ${currentYear}`);
  return Number.isFinite(withYear.getTime()) ? withYear.toISOString() : value;
};
