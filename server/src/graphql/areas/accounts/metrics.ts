// The figures a window of daily facts reports (services/analytics_store.py
// _period_metrics, core/metrics.py round_half_up and cost_per_event).

// round_half_up: the float's shortest decimal form, rounded half up (away
// from zero), as a person and Ads Manager round; Python's Decimal(repr(x)).
export function roundHalfUp(value: number | null | undefined, digits = 2): number {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return number;
  const sign = number < 0 ? '-' : '';
  const [mantissa, exponentText] = Math.abs(number).toExponential().split('e');
  const significant = mantissa.replace('.', '');
  // How many significant digits lie before the rounding position.
  const keep = Number(exponentText) + 1 + digits;
  let kept: bigint;
  if (keep < 0) kept = 0n;
  else if (keep >= significant.length) kept = BigInt(significant) * 10n ** BigInt(keep - significant.length);
  else {
    kept = keep === 0 ? 0n : BigInt(significant.slice(0, keep));
    if (significant.charCodeAt(keep) >= '5'.charCodeAt(0)) kept += 1n;
  }
  return Number(`${sign}${kept}e-${digits}`);
}

export function costPerEvent(spend: number, eventCount: number, digits?: number): number | null {
  const count = Math.trunc(eventCount || 0);
  if (count <= 0) return null;
  const value = (spend || 0) / count;
  return digits === undefined ? value : roundHalfUp(value, digits);
}

export interface FactFigures {
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  link_clicks: number;
  outbound_clicks: number;
  landing_page_views: number;
  leads: number;
  registrations: number;
  purchases: number;
}

const total = (facts: FactFigures[], key: keyof FactFigures): number => facts.reduce((sum, fact) => sum + fact[key], 0);

// Spend, clicks and conversions add up; reach doesn't (the same person on two
// days), so its maximum is the honest floor.
export function periodMetrics(facts: FactFigures[]): Record<string, number | null> {
  const spend = roundHalfUp(total(facts, 'spend'), 2);
  const impressions = total(facts, 'impressions');
  const reach = facts.reduce((max, fact) => Math.max(max, fact.reach), 0);
  const clicks = total(facts, 'clicks');
  const linkClicks = total(facts, 'link_clicks');
  const outboundClicks = total(facts, 'outbound_clicks');
  const landingPageViews = total(facts, 'landing_page_views');
  const leads = total(facts, 'leads');
  const registrations = total(facts, 'registrations');
  const purchases = total(facts, 'purchases');
  // No impressions, no ratio: "—" as in Ads Manager, never a measured 0.00.
  const perImpression = (value: number, scale: number): number | null =>
    impressions > 0 ? roundHalfUp((value * scale) / impressions, 2) : null;
  return {
    spend: roundHalfUp(spend, 2),
    impressions,
    reach,
    cpm: perImpression(spend, 1000),
    clicks,
    link_clicks: linkClicks,
    outbound_clicks: outboundClicks,
    landing_page_views: landingPageViews,
    cpc: costPerEvent(spend, clicks, 2),
    ctr: perImpression(clicks, 100),
    cpc_link: costPerEvent(spend, linkClicks, 2),
    ctr_link: perImpression(linkClicks, 100),
    ctr_outbound: perImpression(outboundClicks, 100),
    leads,
    registrations,
    purchases,
    cost_per_lead: costPerEvent(spend, leads, 2),
    cost_per_registration: costPerEvent(spend, registrations, 2),
    cost_per_purchase: costPerEvent(spend, purchases, 2),
    cost_per_landing_page_view: costPerEvent(spend, landingPageViews, 2),
  };
}
