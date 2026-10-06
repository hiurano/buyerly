import { auditEventTypeTitle, humanizeAuditValue, KNOWN_AUDIT_EVENT_TYPES } from '@/lib/audit';
import type { InboxFacets, InboxFacetValue, InboxFilterClause, InboxSender } from '@/lib/inbox';
import type { FilterClause, FilterFieldDefinition } from '@/components/filters/filterModel';

/**
 * Linear's Inbox filter properties and their Buyerly counterparts: Project is
 * the ad account, Issue status type the event status. Issue priority has no
 * counterpart in ad events.
 */
export const FILTER_FIELDS: Array<{
  id: string;
  field: InboxFilterClause['field'];
  label: string;
  pluralLabel: string;
  optionLabel: (value: InboxFacetValue) => string;
}> = [
  {
    id: 'notificationType',
    field: 'type',
    label: 'Notification type',
    pluralLabel: 'types',
    optionLabel: (value) => auditEventTypeTitle(value.value),
  },
  { id: 'from', field: 'from', label: 'From', pluralLabel: 'senders', optionLabel: (value) => value.label || value.value },
  {
    id: 'adAccount',
    field: 'account',
    label: 'Ad account',
    pluralLabel: 'ad accounts',
    optionLabel: (value) => (value.value ? value.label || value.value : 'No ad account'),
  },
  {
    id: 'eventStatus',
    field: 'status',
    label: 'Status',
    pluralLabel: 'statuses',
    optionLabel: (value) => humanizeAuditValue(value.value),
  },
];

export const toMenuClause = (clause: InboxFilterClause): FilterClause => ({
  fieldId: FILTER_FIELDS.find((entry) => entry.field === clause.field)?.id ?? clause.field,
  operator: clause.operator,
  values: clause.values,
});

export const fromMenuClauses = (clauses: FilterClause[]): InboxFilterClause[] =>
  clauses.flatMap((clause) => {
    const entry = FILTER_FIELDS.find((candidate) => candidate.id === clause.fieldId);
    if (!entry || (clause.operator !== 'is' && clause.operator !== 'is_not')) return [];
    return [{ field: entry.field, operator: clause.operator, values: clause.values.map(String) }];
  });

export function inboxFilterFields(
  facets: InboxFacets | null,
  filters: InboxFilterClause[],
  only?: ReadonlyArray<InboxFilterClause['field']>,
  /** Everyone in the workspace for From, listed without counts as in Linear's custom filters. */
  senders?: InboxSender[] | null,
): FilterFieldDefinition<unknown>[] {
  const entries = only ? FILTER_FIELDS.filter((entry) => only.includes(entry.field)) : FILTER_FIELDS;
  return entries.map((entry) => {
    const everyone = entry.field === 'from' && senders
      ? senders.map(({ value, label }) => ({ value, label, count: 0 }))
      : null;
    const present = everyone ?? facets?.[entry.field] ?? [];
    // A chosen value stays in the menu even when nothing matches it any more;
    // a sender who has left keeps the name their notifications carry.
    const chosen = filters.find((clause) => clause.field === entry.field)?.values ?? [];
    const values = [
      ...present,
      ...chosen
        .filter((value) => !present.some((facet) => facet.value === value))
        .map((value) => facets?.[entry.field]?.find((facet) => facet.value === value) ?? { value, count: 0 }),
    ];
    return {
      id: entry.id,
      label: entry.label,
      section: 'inbox',
      type: 'enum',
      operators: ['is', 'is_not'],
      defaultOperator: 'is',
      getValue: () => null,
      pluralLabel: entry.pluralLabel,
      options: values.map((value) => ({
        value: value.value,
        label: entry.optionLabel(value),
        count: everyone ? undefined : value.count,
      })),
      unmatchedCount: entry.field === 'type' && facets
        ? KNOWN_AUDIT_EVENT_TYPES.filter((type) => !values.some((value) => value.value === type)).length
        : undefined,
    };
  });
}
