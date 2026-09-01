export type FilterValue = string | number | boolean;

export type FilterOperator =
  | 'is'
  | 'is_not'
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
}

export const FILTER_OPERATOR_LABELS: Record<FilterOperator, string> = {
  is: 'is',
  is_not: 'is not',
  contains: 'contains',
  not_contains: 'does not contain',
  gt: 'is greater than',
  gte: 'is greater than or equal to',
  lt: 'is less than',
  lte: 'is less than or equal to',
  before: 'is before',
  after: 'is after',
};

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

  if (clause.operator === 'is' || clause.operator === 'is_not') {
    const hasMatch = itemValues.some((itemValue) =>
      selectedValues.some((selectedValue) => equalValue(itemValue, selectedValue))
    );
    return clause.operator === 'is' ? hasMatch : !hasMatch;
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
    const right = new Date(String(selectedValue)).getTime();
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
