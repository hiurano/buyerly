import type { CampaignItem } from '@/store/useAppStore';
import type { AnalyticsHierarchyItem, MetaAccount } from '@/lib/types';

const KNOWN_CURRENCY = /^[A-Z]{3}$/;

export function eligibleMetaAccounts(accounts: MetaAccount[]): MetaAccount[] {
  return accounts.filter((account) => account.is_active !== false);
}

export function metaAccountLabel(account: MetaAccount): string {
  const name = account.custom_name?.trim() || account.name.trim() || account.account_id;
  return `${name} · ${account.account_id}`;
}

export function formatMetricMoney(value: number | null, currency: string): string {
  const normalizedCurrency = currency.trim().toUpperCase();
  if (value === null || !Number.isFinite(value) || !KNOWN_CURRENCY.test(normalizedCurrency)) {
    return '—';
  }
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: normalizedCurrency,
      currencyDisplay: 'code',
    }).format(value);
  } catch {
    return '—';
  }
}

export function hierarchyCampaignToRow(item: AnalyticsHierarchyItem): CampaignItem {
  return {
    id: item.entity_id,
    identifier: item.entity_id,
    name: item.entity_name || `Campaign ${item.entity_id}`,
    platform: 'Meta',
    status: 'unknown',
    budget: '—',
    leadsCount: item.leads,
    cpa: formatMetricMoney(item.cost_per_lead, item.currency),
    spend: formatMetricMoney(item.spend, item.currency),
    roi: '—',
    date: '',
    groupIds: [],
  };
}
