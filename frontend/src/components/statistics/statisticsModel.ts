import type { AnalyticsHierarchyItem, AnalyticsHierarchyResponse } from '@/lib/types';
import { formatMetricMoney } from '@/components/campaigns/liveCampaigns';

export type EntityLevel = AnalyticsHierarchyResponse['level'];
export type ReportingPeriod = AnalyticsHierarchyResponse['period'];

/**
 * The conversion event a workspace is actually buying. Statistics has one
 * primary result rather than a hard-coded metric, because the same screen
 * serves lead generation, registration and purchase objectives.
 */
export type ResultKind = 'purchases' | 'leads' | 'registrations';

export interface ResultDefinition {
  kind: ResultKind;
  /** Card and column heading for the volume metric. */
  label: string;
  /** Sentence-case plural used inside supporting copy. */
  noun: string;
  /** Card and column heading for the efficiency metric. */
  costLabel: string;
  count: (item: AnalyticsHierarchyItem) => number;
  cost: (item: AnalyticsHierarchyItem) => number | null;
}

export const RESULT_DEFINITIONS: Record<ResultKind, ResultDefinition> = {
  purchases: {
    kind: 'purchases',
    label: 'Purchases',
    noun: 'purchases',
    costLabel: 'Cost per purchase',
    count: (item) => item.purchases,
    cost: (item) => item.cost_per_purchase,
  },
  leads: {
    kind: 'leads',
    label: 'Leads',
    noun: 'leads',
    costLabel: 'Cost per lead',
    count: (item) => item.leads,
    cost: (item) => item.cost_per_lead,
  },
  registrations: {
    kind: 'registrations',
    label: 'Registrations',
    noun: 'registrations',
    costLabel: 'Cost per registration',
    count: (item) => item.registrations,
    cost: (item) => item.cost_per_registration,
  },
};

/** Preference order when several conversion events carry the same volume. */
const RESULT_PRIORITY: ResultKind[] = ['purchases', 'leads', 'registrations'];

/**
 * The primary result is detected from real volume instead of being assumed.
 * With no conversions at all the screen still needs a label, so it falls back
 * to leads and the cards render the underlying zero honestly.
 */
export function detectPrimaryResult(items: AnalyticsHierarchyItem[]): ResultKind {
  let detected: ResultKind = 'leads';
  let best = 0;
  for (const kind of RESULT_PRIORITY) {
    const total = items.reduce((sum, item) => sum + RESULT_DEFINITIONS[kind].count(item), 0);
    if (total > best) {
      best = total;
      detected = kind;
    }
  }
  return detected;
}

/**
 * The volume a row needs before its cost per result is treated as a signal
 * rather than noise. Below it the row is reported as undecidable, which is a
 * separate statement from "performing badly".
 */
export const MIN_RESULTS_FOR_DECISION = 10;

export type DecisionState = 'on-target' | 'watch' | 'attention' | 'insufficient' | 'untargeted';

export interface DecisionVerdict {
  state: DecisionState;
  /** Short badge text. Always carries meaning without its color. */
  label: string;
  /** One sentence explaining the badge. */
  detail: string;
  /**
   * True when the verdict says nothing about this row specifically. The missing
   * target is a property of the ad account, so the table states it once in the
   * overview instead of repeating it on every line.
   */
  quiet?: boolean;
}

export const DECISION_ORDER: DecisionState[] = [
  'attention',
  'watch',
  'on-target',
  'untargeted',
  'insufficient',
];

export const DECISION_PRESENTATION: Record<DecisionState, {
  title: string;
  description: string;
  dotColor: string;
  textClass: string;
}> = {
  attention: {
    title: 'Needs attention',
    description: 'Cost per result is materially above target',
    dotColor: 'var(--statistics-state-attention)',
    textClass: 'text-[var(--statistics-state-attention)]',
  },
  watch: {
    title: 'Watch',
    description: 'Approaching the target threshold',
    dotColor: 'var(--statistics-state-watch)',
    textClass: 'text-[var(--statistics-state-watch)]',
  },
  'on-target': {
    title: 'On target',
    description: 'Cost per result is inside target',
    dotColor: 'var(--statistics-state-on-target)',
    textClass: 'text-[var(--statistics-state-on-target)]',
  },
  untargeted: {
    title: 'No target set',
    description: 'Enough volume to judge, but no cost target to judge against',
    dotColor: 'var(--statistics-state-unknown)',
    textClass: 'text-[var(--text-tertiary)]',
  },
  insufficient: {
    title: 'Not enough data',
    description: 'Too few results in this period to decide',
    dotColor: 'var(--statistics-state-unknown)',
    textClass: 'text-[var(--text-tertiary)]',
  },
};

/** Above this share over target the row is reported as needing attention. */
const ATTENTION_DEVIATION = 0.15;
/** Above this share over target the row is reported as worth watching. */
const WATCH_DEVIATION = 0.05;

/**
 * Turns volume, efficiency and the configured target into the single decision
 * statement the row carries. `target` is null until the ad account stores one,
 * and that case is reported rather than guessed.
 */
export function decide(
  results: number,
  costPerResult: number | null,
  target: number | null,
): DecisionVerdict {
  if (results < MIN_RESULTS_FOR_DECISION) {
    return {
      state: 'insufficient',
      label: 'Not enough data',
      detail: `${formatCount(results)} of ${MIN_RESULTS_FOR_DECISION} results needed to judge this period.`,
    };
  }
  if (costPerResult === null) {
    return {
      state: 'untargeted',
      label: 'Cost unavailable',
      detail: 'Cost per result is unavailable for this row.',
    };
  }
  if (target === null || target <= 0) {
    return {
      state: 'untargeted',
      label: 'No target set',
      detail: 'This ad account has no stored cost target, so the value is reported without a verdict.',
      quiet: true,
    };
  }
  const deviation = (costPerResult - target) / target;
  const magnitude = `${Math.abs(deviation * 100).toFixed(0)}%`;
  if (deviation > ATTENTION_DEVIATION) {
    return {
      state: 'attention',
      label: `${magnitude} above target`,
      detail: 'Cost per result is materially above the stored target.',
    };
  }
  if (deviation > WATCH_DEVIATION) {
    return {
      state: 'watch',
      label: `${magnitude} above target`,
      detail: 'Cost per result is drifting above the stored target.',
    };
  }
  if (deviation < -WATCH_DEVIATION) {
    return {
      state: 'on-target',
      label: `${magnitude} below target`,
      detail: 'Cost per result is inside the stored target.',
    };
  }
  return {
    state: 'on-target',
    label: 'At target',
    detail: 'Cost per result matches the stored target.',
  };
}

export function formatCount(value: number): string {
  return Number.isFinite(value) ? new Intl.NumberFormat('en-US').format(value) : '—';
}

export function formatPercent(value: number | null): string {
  return value !== null && Number.isFinite(value) ? `${value.toFixed(2)}%` : '—';
}

export function formatRatio(value: number | null): string {
  return value !== null && Number.isFinite(value) ? `${value.toFixed(2)}×` : '—';
}

/** Impressions per person reached. Unavailable when Meta returned no reach. */
export function frequency(item: AnalyticsHierarchyItem): number | null {
  return item.reach > 0 ? item.impressions / item.reach : null;
}

/** Results per link click. Unavailable when no link click was recorded. */
export function conversionRate(item: AnalyticsHierarchyItem, kind: ResultKind): number | null {
  const clicks = item.link_clicks;
  return clicks > 0 ? (RESULT_DEFINITIONS[kind].count(item) / clicks) * 100 : null;
}

export interface DiagnosticEntry {
  label: string;
  value: string;
}

export interface DiagnosticSection {
  id: string;
  title: string;
  entries: DiagnosticEntry[];
}

/**
 * The metrics that explain why a primary KPI moved. They are deliberately kept
 * out of the default table and revealed only after a row is opened.
 */
export function buildDiagnostics(
  item: AnalyticsHierarchyItem,
  kind: ResultKind,
): DiagnosticSection[] {
  const money = (value: number | null) => formatMetricMoney(value, item.currency);
  const secondaryResults = RESULT_PRIORITY.filter((candidate) => candidate !== kind).map((candidate) => {
    const definition = RESULT_DEFINITIONS[candidate];
    return [
      { label: definition.label, value: formatCount(definition.count(item)) },
      { label: definition.costLabel, value: money(definition.cost(item)) },
    ];
  }).flat();

  return [
    {
      id: 'delivery',
      title: 'Delivery',
      entries: [
        { label: 'Impressions', value: formatCount(item.impressions) },
        { label: 'Reach', value: item.reach > 0 ? formatCount(item.reach) : 'Unavailable' },
        { label: 'Frequency', value: formatRatio(frequency(item)) },
        { label: 'CPM', value: money(item.cpm) },
        { label: 'Daily budget', value: item.daily_budget > 0 ? money(item.daily_budget) : 'Unavailable' },
      ],
    },
    {
      id: 'traffic',
      title: 'Traffic',
      entries: [
        { label: 'Clicks', value: formatCount(item.clicks) },
        { label: 'CTR', value: formatPercent(item.ctr) },
        { label: 'CPC', value: money(item.cpc) },
        { label: 'Link clicks', value: formatCount(item.link_clicks) },
        { label: 'Link CTR', value: formatPercent(item.ctr_link) },
        { label: 'Cost per link click', value: money(item.cpc_link) },
        { label: 'Outbound CTR', value: formatPercent(item.ctr_outbound) },
      ],
    },
    {
      id: 'funnel',
      title: 'Funnel',
      entries: [
        { label: 'Landing page views', value: formatCount(item.landing_page_views) },
        { label: 'Cost per landing page view', value: money(item.cost_per_landing_page_view) },
        { label: `${RESULT_DEFINITIONS[kind].label} per link click`, value: formatPercent(conversionRate(item, kind)) },
        ...secondaryResults,
      ],
    },
  ];
}

export const CHILD_LEVEL: Partial<Record<EntityLevel, EntityLevel>> = {
  campaign: 'adset',
  adset: 'ad',
};
