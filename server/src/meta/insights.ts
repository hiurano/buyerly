import { pyStr } from '../rules/validation.ts';
import { asDict, get, isRecord, iterate, safeFloat, safeInt, sortedStrings, type Json } from './python.ts';

// MetaClient's reading of an insights row (meta_api/client.py
// _action_values … _normalize_basic_insight): independent funnel counts,
// never a sum of synonymous action rows.

export interface BasicInsight {
  spend: number;
  impressions: number;
  reach: number;
  frequency: number;
  cpm: number;
  clicks: number;
  unique_clicks: number;
  link_clicks: number;
  outbound_clicks: number;
  landing_page_views: number;
  leads: number;
  registrations: number;
  purchases: number;
}

export function actionValues(rows: unknown): Map<string, number> {
  const values = new Map<string, number>();
  for (const row of iterate(rows)) {
    if (!isRecord(row)) continue;
    const actionType = pyStr(get(row, 'action_type', ''));
    if (actionType) values.set(actionType, safeInt(get(row, 'value', 0)));
  }
  return values;
}

export function firstActionValue(rows: unknown, ...aliases: string[]): number {
  const values = actionValues(rows);
  for (const alias of aliases) {
    const value = values.get(alias);
    if (value !== undefined) return value;
  }
  if (values.size === 1) return values.values().next().value!;
  return 0;
}

const LEAD_ALIASES = [
  'lead', 'omni_lead', 'omni:lead', 'offsite_conversion.fb_pixel_lead', 'onsite_conversion.lead_grouped',
  'onsite_web_lead', 'onsite_lead', 'leadgen.other', 'leadgen', 'leadgen_grouped',
];
const REGISTRATION_ALIASES = [
  'complete_registration', 'omni_complete_registration', 'omni:complete_registration',
  'offsite_conversion.fb_pixel_complete_registration', 'onsite_conversion.registration_grouped',
  'onsite_web_complete_registration',
];
const PURCHASE_ALIASES = [
  'purchase', 'omni_purchase', 'omni:purchase', 'offsite_conversion.fb_pixel_purchase',
  'onsite_conversion.purchase_grouped', 'onsite_web_purchase',
];
const LEAD_KEYWORDS = ['lead', 'form', 'submit', 'contact', 'schedule', 'appli', 'request'];
const REGISTRATION_KEYWORDS = ['reg', 'signup', 'sign_up', 'account'];
const PURCHASE_KEYWORDS = ['purchase', 'buy', 'order', 'sale', 'checkout', 'deposit'];

export function conversionCounts(insight: Json): { leads: number; registrations: number; purchases: number } {
  const actions = actionValues(get(insight, 'actions'));
  const firstValue = (aliases: string[]): number => {
    for (const alias of aliases) {
      const value = actions.get(alias);
      if (value !== undefined) return value;
    }
    return 0;
  };

  let leads = firstValue(LEAD_ALIASES);
  let registrations = firstValue(REGISTRATION_ALIASES);
  let purchases = firstValue(PURCHASE_ALIASES);

  // Custom conversions matched by meaning (custom:form_submitted, …).
  const custom = new Map<string, number>();
  for (const [key, value] of actions) {
    if (value > 0 && (key.startsWith('offsite_conversion.custom.') || key.startsWith('custom:') || key.startsWith('omni_custom'))) {
      custom.set(key, value);
    }
  }
  const keys = sortedStrings(custom.keys());
  const byKeyword = (keywords: string[]): number | undefined => {
    for (const key of keys) {
      const lower = key.toLowerCase();
      if (keywords.some((keyword) => lower.includes(keyword))) return custom.get(key)!;
    }
    return undefined;
  };

  if (leads === 0) leads = byKeyword(LEAD_KEYWORDS) ?? leads;
  if (registrations === 0) registrations = byKeyword(REGISTRATION_KEYWORDS) ?? registrations;
  if (purchases === 0) purchases = byKeyword(PURCHASE_KEYWORDS) ?? purchases;

  // An unclassified custom conversion (offsite_conversion.custom.<id>) counts as a lead.
  if (leads === 0 && keys.length > 0) leads = custom.get(keys[0])!;

  return { leads, registrations, purchases };
}

export function normalizeBasicInsight(value: unknown): BasicInsight {
  const insight = asDict(value);
  const counts = conversionCounts(insight);
  const spend = safeFloat(get(insight, 'spend', 0));
  const impressions = safeInt(get(insight, 'impressions', 0));
  const reach = safeInt(get(insight, 'reach', 0));
  let frequency = safeFloat(get(insight, 'frequency', 0));
  let cpm = safeFloat(get(insight, 'cpm', 0));
  if (frequency <= 0 && reach > 0) frequency = impressions / reach;
  if (cpm <= 0 && impressions > 0) cpm = (spend / impressions) * 1000;

  return {
    spend,
    impressions,
    reach,
    frequency,
    cpm,
    clicks: safeInt(get(insight, 'clicks', 0)),
    unique_clicks: safeInt(get(insight, 'unique_clicks', 0)),
    link_clicks: safeInt(get(insight, 'inline_link_clicks', 0)),
    outbound_clicks: firstActionValue(get(insight, 'outbound_clicks'), 'outbound_click', 'omni_outbound_click', 'omni:outbound_click'),
    landing_page_views: firstActionValue(
      get(insight, 'actions'),
      'landing_page_view',
      'omni_landing_page_view',
      'omni:landing_page_view',
      'offsite_conversion.fb_pixel_landing_page_view',
    ),
    ...counts,
  };
}
