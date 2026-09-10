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

export function formatDailyBudget(value: number, currency: string): string {
  if (!Number.isFinite(value) || value <= 0) return '—';
  const money = formatMetricMoney(value, currency);
  return money === '—' ? money : `${money}/day`;
}

function humanizeMetaStatus(value: string): string {
  const normalized = value.trim().toUpperCase();
  if (!normalized || normalized === 'UNKNOWN') return 'Unknown';
  if (normalized === 'ACTIVE') return 'Active';
  if (normalized === 'PAUSED' || normalized.endsWith('_PAUSED')) return 'Paused';
  return normalized
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function campaignDelivery(item: AnalyticsHierarchyItem): Pick<CampaignItem, 'status' | 'statusLabel'> {
  const rawStatus = item.effective_status || item.status || 'UNKNOWN';
  const normalized = rawStatus.trim().toUpperCase();
  return {
    status: normalized === 'ACTIVE'
      ? 'active'
      : normalized === 'PAUSED' || normalized.endsWith('_PAUSED')
        ? 'paused'
        : 'unknown',
    statusLabel: humanizeMetaStatus(rawStatus),
  };
}

export function hierarchyCampaignToRow(item: AnalyticsHierarchyItem): CampaignItem {
  const delivery = campaignDelivery(item);
  return {
    id: item.entity_id,
    identifier: item.entity_id,
    name: item.entity_name || `Campaign ${item.entity_id}`,
    platform: 'Meta',
    ...delivery,
    budget: formatDailyBudget(item.daily_budget, item.currency),
    leadsCount: item.leads,
    cpa: formatMetricMoney(item.cost_per_lead, item.currency),
    spend: formatMetricMoney(item.spend, item.currency),
    roi: '—',
    date: '',
    groupIds: [],
  };
}
