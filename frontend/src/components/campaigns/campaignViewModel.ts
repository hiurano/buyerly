import type { MetaAccount } from '@/lib/types';
import { applyFilterClauses, NUMBER_OPERATORS, TEXT_OPERATORS } from '@/components/filters/filterModel';
import type { FilterFieldDefinition, FilterClause, FilterOption } from '@/components/filters/filterModel';
import { metricsFor, type AdsManagerMetrics } from './adsManagerMetrics';

export interface AccountGroupOption { id: number; name: string; account_ids: string[] }
export interface ViewRow {
  id: string; name: string; status: string; effectiveStatus?: string; campaignId?: string; adSetId?: string;
  accountId?: string; metrics?: AdsManagerMetrics;
}
type Entity = 'campaigns' | 'adsets' | 'ads';
interface ParentOption { id: string; name?: string }

/**
 * Metrics as number filters (> ≥ < ≤) for the period on screen, in their own
 * section under the properties (#385, #389).
 */
function metricFields<T extends ViewRow>(entity: Entity): FilterFieldDefinition<T>[] {
  return metricsFor(entity).filter((metric) => metric.filter).map((metric) => ({
    id: metric.id, label: metric.label, section: 'metrics', type: 'number',
    operators: [...NUMBER_OPERATORS], defaultOperator: 'gt',
    getValue: (row: T) => row.metrics?.[metric.id] ?? null,
  }));
}

/**
 * Links and saved views from before #389 named leads "results" and CPL "cpa";
 * they keep meaning the same rows.
 */
export function migrateAdsManagerClauses(clauses: FilterClause[]): FilterClause[] {
  const renamed: Record<string, string> = { results: 'leads', cpa: 'cpl' };
  const ids = new Set(clauses.map((clause) => clause.fieldId));
  return clauses.flatMap((clause) => {
    const fieldId = renamed[clause.fieldId];
    if (!fieldId) return [clause];
    return ids.has(fieldId) ? [] : [{ ...clause, fieldId }];
  });
}

/** A parent the rows belong to, as a filter and a grouping: only parents with rows are listed, A→Z. */
function parentField<T extends ViewRow>(
  id: 'campaign' | 'adSet', label: string, pluralLabel: string, parents: ParentOption[], rows: T[], getValue: (row: T) => string,
): FilterFieldDefinition<T> {
  const present = new Set(rows.map(getValue));
  return {
    id, label, section: 'filters', type: 'enum',
    operators: ['is', 'is_not'], defaultOperator: 'is',
    options: parents
      .filter((parent) => present.has(parent.id))
      .map((parent) => ({ value: parent.id, label: parent.name || parent.id }))
      .sort((left, right) => left.label.localeCompare(right.label)),
    getValue, pluralLabel,
  };
}

/**
 * Where a row's delivery really stands, from Meta's `effective_status`
 * rather than the switch the buyer set: a switched-on campaign Meta rejected
 * is "Disapproved", one whose ad set is off is "Paused" (#367).
 */
export const DELIVERY_STATUS_OPTIONS: FilterOption[] = [
  { value: 'active', label: 'Active', color: '#34d399', icon: 'status-active' },
  { value: 'paused', label: 'Paused', color: '#8b8d93', icon: 'status-paused' },
  { value: 'in_review', label: 'In review', color: '#f2c94c', icon: 'dot' },
  { value: 'disapproved', label: 'Disapproved', color: '#eb5757', icon: 'dot' },
  { value: 'with_issues', label: 'With issues', color: '#f2994a', icon: 'dot' },
  { value: 'archived', label: 'Archived', color: '#73767c', icon: 'dot' },
  { value: 'unknown', label: 'Unknown status', color: '#73767c', icon: 'dot' },
];

export function deliveryStatus(row: Pick<ViewRow, 'status' | 'effectiveStatus'>): string {
  const effective = (row.effectiveStatus ?? '').trim().toUpperCase();
  if (!effective) return ['active', 'paused'].includes(row.status) ? row.status : 'unknown';
  if (effective === 'ACTIVE') return 'active';
  if (effective === 'PAUSED' || effective.endsWith('_PAUSED')) return 'paused';
  if (['PENDING_REVIEW', 'IN_PROCESS', 'PREAPPROVED'].includes(effective)) return 'in_review';
  if (effective === 'DISAPPROVED') return 'disapproved';
  if (['WITH_ISSUES', 'PENDING_BILLING_INFO'].includes(effective)) return 'with_issues';
  if (['ARCHIVED', 'DELETED'].includes(effective)) return 'archived';
  return 'unknown';
}

/** Active and Paused always; any other delivery state only while some row is in it. */
function deliveryStatusField<T extends ViewRow>(rows: T[]): FilterFieldDefinition<T> {
  const present = new Set(rows.map(deliveryStatus));
  return {
    id: 'status', label: 'Delivery', section: 'filters', type: 'enum',
    operators: ['is', 'is_not'], defaultOperator: 'is',
    options: DELIVERY_STATUS_OPTIONS.filter(option => ['active', 'paused'].includes(option.value) || present.has(option.value)),
    getValue: row => deliveryStatus(row),
    pluralLabel: 'statuses',
  };
}
export interface QuickSelection { fieldId: string; value: string }

/** An ad account as Ads Manager names it: its own name, without the Meta id. */
export const adAccountName = (account: MetaAccount) => account.custom_name?.trim() || account.name?.trim() || account.account_id;

/**
 * The ad account of each row, as Linear's Project: a filter and a grouping
 * over every account on screen, A→Z.
 */
function accountField<T extends ViewRow>(accounts: MetaAccount[]): FilterFieldDefinition<T> {
  return {
    id: 'account', label: 'Ad account', section: 'filters', type: 'enum',
    operators: ['is', 'is_not'], defaultOperator: 'is',
    options: accounts
      .map((account) => ({ value: account.account_id, label: adAccountName(account) }))
      .sort((left, right) => left.label.localeCompare(right.label)),
    getValue: (row) => row.accountId ?? '',
    pluralLabel: 'ad accounts',
  };
}

export function createLiveFields<T extends ViewRow>(
  rows: T[], accounts: MetaAccount[], groups: AccountGroupOption[] | null,
  entity: Entity, adSets: { id: string; campaignId: string; name?: string }[],
  campaigns: ParentOption[] = [],
): FilterFieldDefinition<T>[] {
  const parents = new Map(adSets.map(row => [row.id, row.campaignId]));
  const campaignOf = (row: T) => row.campaignId || parents.get(row.adSetId ?? '') || '';
  const accountsById = new Map(accounts.map(account => [account.account_id, account]));
  // Each account attaches its own rules; the filter offers every one of them once.
  const rules = [...new Map(accounts.flatMap(account => account.active_rules ?? [])
    .map(rule => [rule.preset_id, rule])).values()];
  const ruleValues = (row: T) => (accountsById.get(row.accountId ?? '')?.active_rules ?? []).filter(rule => {
    const scope = rule.scope ?? { level: 'account', ids: [] };
    if (scope.level === 'account') return true;
    if (scope.level === 'campaign') {
      const campaignId = entity === 'campaigns' ? row.id : entity === 'adsets' ? row.campaignId : parents.get(row.adSetId ?? '');
      return campaignId !== undefined && scope.ids.includes(campaignId);
    }
    // An ad-set scope does not target the parent campaign.
    return entity !== 'campaigns' && scope.ids.includes(entity === 'adsets' ? row.id : row.adSetId ?? '');
  }).map(rule => String(rule.preset_id));
  const fields: FilterFieldDefinition<T>[] = [
    deliveryStatusField(rows),
    accountField<T>(accounts),
    ...(entity !== 'campaigns' ? [parentField('campaign', 'Campaign', 'campaigns', campaigns, rows, campaignOf)] : []),
    ...(entity === 'ads' ? [parentField('adSet', 'Ad set', 'ad sets', adSets, rows, (row: T) => row.adSetId ?? '')] : []),
    { id: 'rule', label: 'Rules', section: 'filters', type: 'enum',
      operators: ['includes_all', 'includes_any', 'excludes_any', 'excludes_all'], defaultOperator: 'includes_all',
      options: [...rules.map(rule => ({ value: String(rule.preset_id), label: rule.name, icon: 'rule' as const })),
        { value: 'no-rule', label: 'No rules' }],
      getValue: row => { const values = ruleValues(row); return values.length ? values : ['no-rule']; },
      pluralLabel: 'rules' },
  ];
  if (groups !== null) {
    const memberships = (row: T) => groups.filter(group => group.account_ids.includes(row.accountId ?? '')).map(group => String(group.id));
    fields.push({
      id: 'group', label: 'Account groups', section: 'filters', type: 'enum',
      operators: ['includes_all', 'includes_any', 'excludes_any', 'excludes_all'], defaultOperator: 'includes_all',
      options: [...groups.map(group => ({ value: String(group.id), label: group.name })), { value: 'ungrouped', label: 'Ungrouped' }],
      getValue: row => { const ids = memberships(row); return ids.length ? ids : ['ungrouped']; }, pluralLabel: 'groups',
    });
  }
  fields.push({
    id: 'name', label: 'Name', section: 'filters', type: 'text',
    operators: [...TEXT_OPERATORS], defaultOperator: 'contains',
    placeholder: 'Name or ID', keywords: ['title', 'id', 'search'],
    getValue: (row) => `${row.name} ${row.id}`,
  });
  return [...fields.map(field => ({ ...field, options: field.options?.map(option => ({ ...option,
    count: applyFilterClauses(rows, [field], [{ fieldId: field.id, operator: 'is', values: [option.value] }]).length,
  })) })), ...metricFields<T>(entity)];
}

export function filterView<T>(rows: T[], fields: FilterFieldDefinition<T>[], clauses: FilterClause[], quick: QuickSelection | null) {
  const baseRows = applyFilterClauses(rows, fields, clauses);
  const facets = fields.map(field => ({ id: field.id, label: field.label, options: (field.options ?? []).map(option => ({
    ...option, count: applyFilterClauses(baseRows, [field], [{ fieldId: field.id, operator: 'is', values: [option.value] }]).length,
  })).filter(option => option.count > 0) }));
  const visibleRows = quick ? applyFilterClauses(baseRows, fields, [{ fieldId: quick.fieldId, operator: 'is', values: [quick.value] }]) : baseRows;
  return { baseRows, visibleRows, facets };
}

/** Every group of the grouping, empty ones included; the view decides which show and in what order. */
export function groupView<T>(rows: T[], fields: FilterFieldDefinition<T>[], fieldId: string) {
  const field = fields.find(candidate => candidate.id === fieldId);
  if (!field) return [{ id: 'all', label: '', rows }];
  return (field.options ?? []).map(option => ({ id: option.value, label: option.label,
    rows: applyFilterClauses(rows, [field], [{ fieldId, operator: 'is', values: [option.value] }]),
  }));
}
