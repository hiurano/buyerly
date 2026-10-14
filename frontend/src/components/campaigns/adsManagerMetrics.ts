import type { AdsManagerEntity } from '@/store/useAppStore';
import type { AnalyticsHierarchyItem } from '@/lib/types';

/**
 * Every figure Ads Manager can show, sort and filter by (#389), in column
 * order. Each one reads straight from a `GET /api/analytics/hierarchy` row
 * for the chosen period, so the column, its ordering and its filter can never
 * disagree. Leads, registrations and purchases each come with their own cost
 * instead of one "Results / CPA" that was always leads.
 */
export type AdsManagerMetricId =
  | 'budget'
  | 'spend'
  | 'impressions'
  | 'reach'
  | 'cpm'
  | 'clicks'
  | 'ctr'
  | 'cpc'
  | 'linkClicks'
  | 'linkCtr'
  | 'linkCpc'
  | 'landingPageViews'
  | 'leads'
  | 'cpl'
  | 'registrations'
  | 'cpreg'
  | 'purchases'
  | 'cpp';

export type AdsManagerMetrics = Record<AdsManagerMetricId, number | null>;

export type MetricFormat = 'money' | 'budget' | 'count' | 'percent';

export interface AdsManagerMetric {
  id: AdsManagerMetricId;
  label: string;
  format: MetricFormat;
  width: string;
  /** Offered as a number filter under Metrics. */
  filter: boolean;
  /** Levels the figure exists on; all three when absent. */
  levels?: AdsManagerEntity[];
  read: (item: Partial<AnalyticsHierarchyItem>) => number | null;
}

const number = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const field = (key: keyof AnalyticsHierarchyItem) => (item: Partial<AnalyticsHierarchyItem>) => number(item[key]);

export const ADS_MANAGER_METRICS: AdsManagerMetric[] = [
  {
    id: 'budget', label: 'Budget', format: 'budget', width: '120px', filter: true, levels: ['campaigns', 'adsets'],
    // A campaign on ad set budgets, or an ad set under a campaign budget, has none of its own.
    read: (item) => { const value = number(item.daily_budget); return value !== null && value > 0 ? value : null; },
  },
  { id: 'spend', label: 'Spend', format: 'money', width: '100px', filter: true, read: field('spend') },
  { id: 'impressions', label: 'Impressions', format: 'count', width: '96px', filter: true, read: field('impressions') },
  { id: 'reach', label: 'Reach', format: 'count', width: '84px', filter: false, read: field('reach') },
  { id: 'cpm', label: 'CPM', format: 'money', width: '96px', filter: true, read: field('cpm') },
  { id: 'clicks', label: 'Clicks', format: 'count', width: '72px', filter: true, read: field('clicks') },
  { id: 'ctr', label: 'CTR', format: 'percent', width: '72px', filter: true, read: field('ctr') },
  { id: 'cpc', label: 'CPC', format: 'money', width: '90px', filter: true, read: field('cpc') },
  { id: 'linkClicks', label: 'Link clicks', format: 'count', width: '84px', filter: false, read: field('link_clicks') },
  { id: 'linkCtr', label: 'Link CTR', format: 'percent', width: '76px', filter: false, read: field('ctr_link') },
  { id: 'linkCpc', label: 'Link CPC', format: 'money', width: '90px', filter: false, read: field('cpc_link') },
  { id: 'landingPageViews', label: 'Landing page views', format: 'count', width: '100px', filter: false, read: field('landing_page_views') },
  { id: 'leads', label: 'Leads', format: 'count', width: '72px', filter: true, read: field('leads') },
  { id: 'cpl', label: 'CPL', format: 'money', width: '96px', filter: true, read: field('cost_per_lead') },
  { id: 'registrations', label: 'Registrations', format: 'count', width: '96px', filter: true, read: field('registrations') },
  { id: 'cpreg', label: 'CPReg', format: 'money', width: '96px', filter: true, read: field('cost_per_registration') },
  { id: 'purchases', label: 'Purchases', format: 'count', width: '84px', filter: true, read: field('purchases') },
  { id: 'cpp', label: 'CPP', format: 'money', width: '96px', filter: true, read: field('cost_per_purchase') },
];

export const metricsFor = (entity: AdsManagerEntity) =>
  ADS_MANAGER_METRICS.filter((metric) => !metric.levels || metric.levels.includes(entity));

export const findMetric = (id: string) => ADS_MANAGER_METRICS.find((metric) => metric.id === id);

export function readMetrics(item: Partial<AnalyticsHierarchyItem>): AdsManagerMetrics {
  return Object.fromEntries(ADS_MANAGER_METRICS.map((metric) => [metric.id, metric.read(item)])) as AdsManagerMetrics;
}

/** The reporting windows the hierarchy API serves, as Meta names them. */
export const ADS_MANAGER_PERIODS = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'last_3d', label: 'Last 3 days' },
  { value: 'last_7d', label: 'Last 7 days' },
] as const;

export type AdsManagerPeriod = (typeof ADS_MANAGER_PERIODS)[number]['value'];

/** `?period=` of the address; today when it names none or something unknown. */
export function periodFromSearch(search: string): AdsManagerPeriod {
  const value = new URLSearchParams(search).get('period');
  return ADS_MANAGER_PERIODS.some((period) => period.value === value) ? value as AdsManagerPeriod : 'today';
}
