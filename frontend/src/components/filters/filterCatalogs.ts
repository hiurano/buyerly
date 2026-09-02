import type {
  AdItem,
  AdSetItem,
  CampaignGroup,
  CampaignItem,
  RuleGroup,
  RuleItem,
} from '@/store/useAppStore';
import type { FilterFieldDefinition, FilterOption } from './filterModel';

const enumOperators = ['is', 'is_not'] as const;

const STATUS_OPTIONS: FilterOption[] = [
  { value: 'active', label: 'Active', color: '#34d399', icon: 'status-active' },
  { value: 'paused', label: 'Paused', color: '#8b8d93', icon: 'status-paused' },
];

const RULE_STATUS_OPTIONS: FilterOption[] = [
  ...STATUS_OPTIONS,
  { value: 'triggered', label: 'Triggered', color: '#fbbf24', icon: 'status-triggered' },
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

const ruleGroupOptions = (groups: RuleGroup[]): FilterOption[] => [
  ...groups.map((group) => ({
    value: group.id,
    label: group.name,
    icon: (`group-${group.icon === 'custom' ? 'backlog' : group.icon}`) as FilterOption['icon'],
  })),
  { value: 'ungrouped', label: 'Ungrouped', icon: 'group-backlog' },
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

export const createRuleFilterFields = ({
  rules,
  ruleGroups,
}: {
  rules: RuleItem[];
  ruleGroups: RuleGroup[];
}): FilterFieldDefinition<RuleItem>[] => [
  {
    id: 'status', label: 'Status', section: 'filters', type: 'enum',
    operators: [...enumOperators], defaultOperator: 'is',
    options: withCounts(RULE_STATUS_OPTIONS, rules, (item) => item.status),
    getValue: (item) => item.status, pluralLabel: 'statuses',
  },
  {
    id: 'group', label: 'Groups', section: 'filters', type: 'enum',
    operators: [...enumOperators], defaultOperator: 'is',
    options: withCounts(ruleGroupOptions(ruleGroups), rules, (item) => item.groupId ?? 'ungrouped'),
    getValue: (item) => item.groupId ?? 'ungrouped', pluralLabel: 'groups',
  },
];
