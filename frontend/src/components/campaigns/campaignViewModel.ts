import type { MetaAccount } from '@/lib/types';
import { createStatusFilterFields } from '@/components/filters/filterCatalogs';
import { applyFilterClauses } from '@/components/filters/filterModel';
import type { FilterFieldDefinition, FilterClause } from '@/components/filters/filterModel';

export interface AccountGroupOption { id: number; name: string; account_ids: string[] }
export interface ViewRow { id: string; name: string; status: string; campaignId?: string; adSetId?: string }
export interface QuickSelection { fieldId: string; value: string }

export function createLiveFields<T extends ViewRow>(
  rows: T[], account: MetaAccount | undefined, groups: AccountGroupOption[] | null,
  entity: 'campaigns' | 'adsets' | 'ads', adSets: { id: string; campaignId: string }[],
): FilterFieldDefinition<T>[] {
  const parents = new Map(adSets.map(row => [row.id, row.campaignId]));
  const rules = account?.active_rules ?? [];
  const ruleValues = (row: T) => rules.filter(rule => {
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
    ...createStatusFilterFields(rows),
    { id: 'rule', label: 'Rules', section: 'filters', type: 'enum',
      operators: ['includes_all', 'includes_any', 'excludes_any', 'excludes_all'], defaultOperator: 'includes_all',
      options: [...rules.map(rule => ({ value: String(rule.preset_id), label: rule.name, icon: 'rule' as const })),
        { value: 'no-rule', label: 'No rules' }],
      getValue: row => { const values = ruleValues(row); return values.length ? values : ['no-rule']; },
      pluralLabel: 'rules' },
  ];
  const status = fields[0];
  const knownStatuses = new Set(status.options?.map(option => option.value));
  for (const value of new Set(rows.map(row => row.status))) {
    if (!knownStatuses.has(value)) status.options?.push({ value, label: value === 'unknown' ? 'Unknown status' : value });
  }
  if (groups !== null) {
    const memberships = groups.filter(group => group.account_ids.includes(account?.account_id ?? '')).map(group => String(group.id));
    fields.splice(1, 0, {
      id: 'group', label: 'Account groups', section: 'filters', type: 'enum',
      operators: ['includes_all', 'includes_any', 'excludes_any', 'excludes_all'], defaultOperator: 'includes_all',
      options: [...groups.map(group => ({ value: String(group.id), label: group.name })), { value: 'ungrouped', label: 'Ungrouped' }],
      getValue: () => memberships.length ? memberships : ['ungrouped'], pluralLabel: 'groups',
    });
  }
  return fields.map(field => ({ ...field, options: field.options?.map(option => ({ ...option,
    count: applyFilterClauses(rows, [field], [{ fieldId: field.id, operator: 'is', values: [option.value] }]).length,
  })) }));
}

export function filterView<T>(rows: T[], fields: FilterFieldDefinition<T>[], clauses: FilterClause[], quick: QuickSelection | null) {
  const baseRows = applyFilterClauses(rows, fields, clauses);
  const facets = fields.map(field => ({ id: field.id, label: field.label, options: (field.options ?? []).map(option => ({
    ...option, count: applyFilterClauses(baseRows, [field], [{ fieldId: field.id, operator: 'is', values: [option.value] }]).length,
  })).filter(option => option.count > 0) }));
  const visibleRows = quick ? applyFilterClauses(baseRows, fields, [{ fieldId: quick.fieldId, operator: 'is', values: [quick.value] }]) : baseRows;
  return { baseRows, visibleRows, facets };
}

export function groupView<T>(rows: T[], fields: FilterFieldDefinition<T>[], fieldId: string) {
  const field = fields.find(candidate => candidate.id === fieldId);
  if (!field) return [{ id: 'all', label: '', rows }];
  return (field.options ?? []).map(option => ({ id: option.value, label: option.label,
    rows: applyFilterClauses(rows, [field], [{ fieldId, operator: 'is', values: [option.value] }]),
  })).filter(group => group.rows.length > 0);
}
