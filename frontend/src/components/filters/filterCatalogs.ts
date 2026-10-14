import type {
  AdItem,
  AdSetItem,
  CampaignGroup,
  CampaignItem,
  RuleItem,
  RuleLabel,
} from '@/store/useAppStore';
import { DATE_OPERATORS, type FilterFieldDefinition, type FilterOption } from './filterModel';
import { RULE_LEVEL_LABELS, RULE_METRIC_LABELS, RULE_TIME_WINDOW_MENU_LABELS } from '@/lib/rules';
import { RULE_ACTION_NAMES, ruleState } from '@/components/rules/ruleNames';

const enumOperators = ['is', 'is_not'] as const;

const STATUS_OPTIONS: FilterOption[] = [
  { value: 'active', label: 'Active', color: '#34d399', icon: 'status-active' },
  { value: 'paused', label: 'Paused', color: '#8b8d93', icon: 'status-paused' },
];

const withCounts = <T>(
  options: FilterOption[],
  items: T[],
  getValues: (item: T) => string | string[] | null | undefined
) =>
  options.map((option) => ({
    ...option,
    count: items.filter((item) => {
      const value = getValues(item);
      const values = Array.isArray(value) ? value : value ? [value] : [];
      return values.includes(option.value);
    }).length,
  }));

const campaignGroupOptions = (groups: CampaignGroup[]): FilterOption[] => [
  ...groups.map((group) => ({
    value: group.id,
    label: group.name,
    color: group.color,
    icon: 'dot' as const,
  })),
  { value: 'ungrouped', label: 'Ungrouped', color: '#73767c', icon: 'dot' },
];

const ruleLabelOptions = (labels: RuleLabel[]): FilterOption[] => [
  { value: 'none', label: 'No labels', color: '#95a2b3', icon: 'dot' },
  ...labels.map((label) => ({
    value: label.id,
    label: label.name,
    color: label.color,
    icon: 'dot' as const,
  })),
];

const attachedRuleOptions = (rules: RuleItem[]): FilterOption[] => [
  ...rules.map((rule) => ({
    value: rule.id,
    label: rule.name,
    color: '#eab308',
    icon: 'rule' as const,
  })),
  { value: 'no-rule', label: 'No rule', color: '#73767c', icon: 'rule' },
];

const statusField = <T extends { status: string }>(items: T[]): FilterFieldDefinition<T> => ({
  id: 'status',
  label: 'Status',
  section: 'filters',
  type: 'enum',
  operators: [...enumOperators],
  defaultOperator: 'is',
  options: withCounts(STATUS_OPTIONS, items, (item) => item.status),
  getValue: (item) => item.status,
  pluralLabel: 'statuses',
});

export const createCampaignFilterFields = ({
  campaigns,
  campaignGroups,
  rules,
  campaignAttachedRules,
}: {
  campaigns: CampaignItem[];
  campaignGroups: CampaignGroup[];
  rules: RuleItem[];
  campaignAttachedRules: Record<string, string[]>;
}): FilterFieldDefinition<CampaignItem>[] => [
  statusField(campaigns),
  {
    id: 'group',
    label: 'Groups',
    section: 'filters',
    type: 'enum',
    operators: [...enumOperators],
    defaultOperator: 'is',
    options: withCounts(campaignGroupOptions(campaignGroups), campaigns, (item) =>
      item.groupIds.length ? item.groupIds : 'ungrouped'
    ),
    getValue: (item) => (item.groupIds.length ? item.groupIds : ['ungrouped']),
    pluralLabel: 'groups',
  },
  {
    id: 'rule',
    label: 'Rules',
    section: 'filters',
    type: 'enum',
    operators: [...enumOperators],
    defaultOperator: 'is',
    options: withCounts(attachedRuleOptions(rules), campaigns, (item) => {
      const attached = campaignAttachedRules[item.id] ?? [];
      return attached.length ? attached : 'no-rule';
    }),
    getValue: (item) => {
      const attached = campaignAttachedRules[item.id] ?? [];
      return attached.length ? attached : ['no-rule'];
    },
    pluralLabel: 'rules',
  },
];

export const createAdSetFilterFields = ({
  adSets,
  campaigns,
  campaignGroups,
  rules,
  campaignAttachedRules,
}: {
  adSets: AdSetItem[];
  campaigns: CampaignItem[];
  campaignGroups: CampaignGroup[];
  rules: RuleItem[];
  campaignAttachedRules: Record<string, string[]>;
}): FilterFieldDefinition<AdSetItem>[] => {
  const campaignById = new Map(campaigns.map((campaign) => [campaign.id, campaign]));
  const getCampaign = (item: AdSetItem) => campaignById.get(item.campaignId);

  return [
    statusField(adSets),
    {
      id: 'group', label: 'Groups', section: 'filters', type: 'enum',
      operators: [...enumOperators], defaultOperator: 'is',
      options: withCounts(campaignGroupOptions(campaignGroups), adSets, (item) => {
        const groups = getCampaign(item)?.groupIds ?? [];
        return groups.length ? groups : 'ungrouped';
      }),
      getValue: (item) => {
        const groups = getCampaign(item)?.groupIds ?? [];
        return groups.length ? groups : ['ungrouped'];
      },
      pluralLabel: 'groups',
    },
    {
      id: 'rule', label: 'Rules', section: 'filters', type: 'enum',
      operators: [...enumOperators], defaultOperator: 'is',
      options: withCounts(attachedRuleOptions(rules), adSets, (item) => {
        const attached = campaignAttachedRules[item.campaignId] ?? [];
        return attached.length ? attached : 'no-rule';
      }),
      getValue: (item) => {
        const attached = campaignAttachedRules[item.campaignId] ?? [];
        return attached.length ? attached : ['no-rule'];
      },
      pluralLabel: 'rules',
    },
  ];
};

export const createAdFilterFields = ({
  ads,
  adSets,
  campaigns,
  campaignGroups,
  rules,
  campaignAttachedRules,
}: {
  ads: AdItem[];
  adSets: AdSetItem[];
  campaigns: CampaignItem[];
  campaignGroups: CampaignGroup[];
  rules: RuleItem[];
  campaignAttachedRules: Record<string, string[]>;
}): FilterFieldDefinition<AdItem>[] => {
  const adSetById = new Map(adSets.map((adSet) => [adSet.id, adSet]));
  const campaignById = new Map(campaigns.map((campaign) => [campaign.id, campaign]));
  const getCampaign = (item: AdItem) => {
    const adSet = adSetById.get(item.adSetId);
    return adSet ? campaignById.get(adSet.campaignId) : undefined;
  };

  return [
    statusField(ads),
    {
      id: 'group', label: 'Groups', section: 'filters', type: 'enum',
      operators: [...enumOperators], defaultOperator: 'is',
      options: withCounts(campaignGroupOptions(campaignGroups), ads, (item) => {
        const groups = getCampaign(item)?.groupIds ?? [];
        return groups.length ? groups : 'ungrouped';
      }),
      getValue: (item) => {
        const groups = getCampaign(item)?.groupIds ?? [];
        return groups.length ? groups : ['ungrouped'];
      },
      pluralLabel: 'groups',
    },
    {
      id: 'rule', label: 'Rules', section: 'filters', type: 'enum',
      operators: [...enumOperators], defaultOperator: 'is',
      options: withCounts(attachedRuleOptions(rules), ads, (item) => {
        const campaign = getCampaign(item);
        const attached = campaign ? campaignAttachedRules[campaign.id] ?? [] : [];
        return attached.length ? attached : 'no-rule';
      }),
      getValue: (item) => {
        const campaign = getCampaign(item);
        const attached = campaign ? campaignAttachedRules[campaign.id] ?? [] : [];
        return attached.length ? attached : ['no-rule'];
      },
      pluralLabel: 'rules',
    },
  ];
};

const RULE_STATE_OPTIONS: FilterOption[] = [
  ...STATUS_OPTIONS,
  { value: 'needs_review', label: 'Needs review', color: '#f2994a', icon: 'dot' },
];

const ruleConditions = (rule: RuleItem) => rule.preset.conditions ?? [];

/** Where an attached rule looks in an ad account; "Not attached" when it runs nowhere. */
const ruleScopes = (rule: RuleItem): string[] => {
  const levels = rule.preset.attached_account_ids.map((id) => rule.preset.attached_scopes?.[id]?.level ?? 'account');
  return levels.length ? [...new Set(levels)] : ['none'];
};

/**
 * The Rules page's filters (#390): what a rule is, what it does and where
 * it runs, then its dates. Every enum lists what rules can hold, with counts.
 */
export const createRuleFilterFields = ({
  rules,
  ruleLabels,
  accounts = [],
}: {
  rules: RuleItem[];
  ruleLabels: RuleLabel[];
  accounts?: { account_id: string; name: string }[];
}): FilterFieldDefinition<RuleItem>[] => {
  const options = (list: FilterOption[], getValues: (rule: RuleItem) => string | string[]) => withCounts(list, rules, getValues);
  const metricOptions: FilterOption[] = Object.entries(RULE_METRIC_LABELS).map(([value, label]) => ({ value, label }));
  const windowOptions: FilterOption[] = Object.entries(RULE_TIME_WINDOW_MENU_LABELS).map(([value, label]) => ({ value, label }));
  const accountOptions: FilterOption[] = [
    ...accounts.map((account) => ({ value: account.account_id, label: account.name, keywords: [account.account_id] })),
    { value: 'none', label: 'Not attached' },
  ];
  const metricsOf = (rule: RuleItem) => [...new Set(ruleConditions(rule).map((condition) => condition.metric))];
  const windowsOf = (rule: RuleItem) => [...new Set(ruleConditions(rule).map((condition) => condition.time_window))];
  const accountsOf = (rule: RuleItem) => (rule.preset.attached_account_ids.length ? rule.preset.attached_account_ids : ['none']);
  return [
    {
      id: 'status', label: 'Status', section: 'filters', type: 'enum',
      operators: [...enumOperators], defaultOperator: 'is',
      options: options(RULE_STATE_OPTIONS, ruleState),
      getValue: ruleState, pluralLabel: 'statuses',
    },
    // Linear's Labels: include any of, include all of, exclude if any of; "No labels" first.
    {
      id: 'label', label: 'Labels', section: 'filters', type: 'enum',
      operators: ['includes_any', 'includes_all', 'excludes_any'], defaultOperator: 'includes_any',
      options: options(ruleLabelOptions(ruleLabels), (item) => (item.labelIds.length ? item.labelIds : 'none')),
      getValue: (item) => (item.labelIds.length ? item.labelIds : ['none']), pluralLabel: 'labels',
    },
    {
      id: 'action', label: 'Action', section: 'filters', type: 'enum',
      operators: [...enumOperators], defaultOperator: 'is',
      options: options(Object.entries(RULE_ACTION_NAMES).map(([value, label]) => ({ value, label })), (item) => item.actionKind),
      getValue: (item) => item.actionKind, pluralLabel: 'actions',
    },
    {
      id: 'level', label: 'Applies to', section: 'filters', type: 'enum',
      operators: [...enumOperators], defaultOperator: 'is',
      options: options((['campaign', 'adset', 'ad'] as const).map((value) => ({ value, label: RULE_LEVEL_LABELS[value] })), (item) => item.preset.level ?? 'adset'),
      getValue: (item) => item.preset.level ?? 'adset', pluralLabel: 'levels', keywords: ['level'],
    },
    {
      id: 'metric', label: 'Metric', section: 'filters', type: 'enum',
      operators: ['includes_any', 'includes_all', 'excludes_any'], defaultOperator: 'includes_any',
      options: options(metricOptions, metricsOf),
      getValue: metricsOf, pluralLabel: 'metrics', keywords: ['condition'],
    },
    {
      id: 'window', label: 'Window', section: 'filters', type: 'enum',
      operators: ['includes_any', 'excludes_any'], defaultOperator: 'includes_any',
      options: options(windowOptions, windowsOf),
      getValue: windowsOf, pluralLabel: 'windows', keywords: ['period', 'lifetime'],
    },
    {
      id: 'account', label: 'Ad account', section: 'filters', type: 'enum',
      operators: ['includes_any', 'excludes_any'], defaultOperator: 'includes_any',
      options: options(accountOptions, accountsOf),
      getValue: accountsOf, pluralLabel: 'ad accounts', keywords: ['attached', 'runs on'],
    },
    {
      id: 'scope', label: 'Scope', section: 'filters', type: 'enum',
      operators: ['includes_any', 'excludes_any'], defaultOperator: 'includes_any',
      options: options([
        { value: 'account', label: 'Whole account' },
        { value: 'campaign', label: 'Campaigns' },
        { value: 'adset', label: 'Ad sets' },
        { value: 'none', label: 'Not attached' },
      ], ruleScopes),
      getValue: ruleScopes, pluralLabel: 'scopes',
    },
    {
      id: 'name', label: 'Name', section: 'filters', type: 'text',
      operators: ['contains', 'not_contains'], defaultOperator: 'contains',
      placeholder: 'Name or RUL-…', keywords: ['title', 'id', 'search'],
      getValue: (item) => `${item.name} ${item.identifier}`,
    },
    // Linear's Dates: one row, each date with its ready-made values (#385); "Never" for the two that may be missing.
    {
      id: 'lastRun', label: 'Last action', section: 'dates', type: 'date',
      operators: [...DATE_OPERATORS], defaultOperator: 'after', allowNever: true,
      getValue: (item) => item.preset.last_run_at || null,
    },
    {
      id: 'lastCheck', label: 'Last check', section: 'dates', type: 'date',
      operators: [...DATE_OPERATORS], defaultOperator: 'after', allowNever: true,
      getValue: (item) => item.preset.last_checked_at || null,
    },
    {
      id: 'created', label: 'Created date', section: 'dates', type: 'date',
      operators: [...DATE_OPERATORS], defaultOperator: 'after',
      getValue: (item) => item.preset.created_at || null,
    },
  ];
};
