import { readFileSync, writeFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MetaClient } from '../../src/meta/client.ts';
import { classifyMetaTokenError, MetaTokenAuthError } from '../../src/meta/errors.ts';
import { normalizeBasicInsight } from '../../src/meta/insights.ts';
import { evaluateMetaConnectionHealth, MetaOAuthClient } from '../../src/meta/oauth.ts';
import { canonicalTimezoneName, fromMetaBudgetUnits, toMetaBudgetUnits } from '../../src/meta/units.ts';
import { PythonCrash } from '../../src/rules/engine.ts';
import { scenarios, fuzzCases, oauthScenarios, functionCases, type Case, type ClientCase, type OAuthCase, type FnCase, type Answer } from './cases.ts';

// The Meta client (src/meta/) must keep talking to Meta as it does now: for
// every case below it runs over scripted answers, and must send the same
// requests — method, URL with its query string byte for byte (param order,
// encoding, appsecret_proof), form body — wait the same, keep the same quota
// snapshot and return the same results or the same errors as recorded in
// test/fixtures/meta-client-answers.json. The cases cover every read and write
// method, pagination, retries and backoff, quota headers and deferral, Meta's
// error codes and odd payloads (a seeded generator).
//
// The answers were recorded from this client at d86703f8, the last commit
// where CI proved it request-equal to Python's meta_api/ on these very cases
// (#611; src/meta/ is unchanged since), so they are Python's answers too
// (#685). After a deliberate change in how the client talks to Meta, record
// them again: RECORD_FIXTURES=1 npx vitest run test/meta/client.test.ts.

const FIXTURE = join(import.meta.dirname, '../fixtures/meta-client-answers.json');
const RECORD = Boolean(process.env.RECORD_FIXTURES);
const recorded: Record<string, Answer[]> = RECORD ? {} : (JSON.parse(readFileSync(FIXTURE, 'utf8')) as Record<string, Answer[]>);

// JSON as the answers are recorded, a datetime as its timestamp. A Date's
// toJSON runs before the replacer, so the replacer reads the holder.
const asJson = (value: unknown): unknown =>
  JSON.parse(
    JSON.stringify(value, function (this: Record<string, unknown>, key: string, item: unknown) {
      const raw = this[key];
      return raw instanceof Date ? { $ts: raw.getTime() / 1000 } : item;
    }) ?? 'null',
  );

function failure(error: unknown): Record<string, unknown> {
  if (error instanceof MetaTokenAuthError) return { fail: error.name, message: error.message, details: error.details() };
  if (error instanceof PythonCrash) return { fail: 'crash', message: error.pythonType };
  const { name, message } = error as Error;
  if (['MetaRateLimitDeferred', 'MetaOAuthRemoteError', 'MetaApiError', 'MetaValueError'].includes(name)) return { fail: name, message };
  // A JavaScript error is a bug of the port, never a match.
  return { fail: `js:${name}`, message };
}

interface Recorder {
  requests: Array<Record<string, unknown>>;
  fetch: typeof fetch;
}

function scripted(responses: ClientCase['responses']): Recorder {
  const queue = [...(responses ?? [])];
  const requests: Array<Record<string, unknown>> = [];
  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    requests.push({
      method: init?.method ?? 'GET',
      url: input instanceof Request ? input.url : input.toString(),
      body: typeof init?.body === 'string' && init.body !== '' ? init.body : null,
      contentType: headers.get('content-type'),
    });
    const answer = queue.shift() ?? { status: 200, headers: {}, body: '{}' };
    if ('network_error' in answer) throw new TypeError('fetch failed', { cause: new Error(answer.network_error) });
    return new Response(answer.body, { status: answer.status, headers: answer.headers ?? {} });
  }) as typeof fetch;
  return { requests, fetch: fetcher };
}

type Port = (client: MetaClient, args: Record<string, never>) => Promise<unknown>;

// Python's keyword calls, as the port's methods take them.
const CLIENT: Record<string, Port> = {
  get_account_info: (c, a) => c.getAccountInfo(a.account_id, a.access_token, { priority: a.priority }),
  get_account_insights_summary: (c, a) => c.getAccountInsightsSummary(a.account_id, a.access_token, a.date_preset, { since: a.since, until: a.until }),
  get_adsets_insights: (c, a) => c.getAdsetsInsights(a.account_id, a.access_token, a.date_preset, a.currency, a.priority),
  get_hierarchical_insights: (c, a) =>
    c.getHierarchicalInsights(a.account_id, a.access_token, {
      datePreset: a.date_preset,
      currency: a.currency,
      accountName: a.account_name,
      priority: a.priority,
      reportingDate: a.reporting_date,
      includeIdleInventory: a.include_idle_inventory,
    }),
  get_ads_insights: (c, a) => c.getAdsInsights(a.account_id, a.access_token, a.date_preset, a.currency, a.priority),
  get_campaigns_inventory: (c, a) => c.getCampaignsInventory(a.account_id, a.access_token, a.priority),
  get_campaigns_insights: (c, a) => c.getCampaignsInsights(a.account_id, a.access_token, a.date_preset, a.currency, a.priority),
  get_adset_state: (c, a) => c.getAdsetState(a.adset_id, a.access_token, a.currency),
  get_entity_state: (c, a) => c.getEntityState(a.entity_id, a.access_token, a.entity_level, a.currency),
  set_adset_status: (c, a) => c.setAdsetStatus(a.adset_id, a.access_token, a.status, a.account_id),
  set_ad_status: (c, a) => c.setAdStatus(a.ad_id, a.access_token, a.status, a.account_id),
  set_campaign_status: (c, a) => c.setCampaignStatus(a.campaign_id, a.access_token, a.status, a.account_id),
  set_entity_status: (c, a) => c.setEntityStatus(a.entity_id, a.access_token, a.status, a.entity_level, a.account_id),
  update_entity_budget: (c, a) =>
    c.updateEntityBudget(a.entity_id, a.access_token, a.new_daily_budget_dollars, a.currency, a.entity_level, a.account_id),
  update_adset_budget: (c, a) => c.updateAdsetBudget(a.adset_id, a.access_token, a.new_daily_budget_dollars, a.currency, a.account_id),
  invalidate_inventory_cache: (c, a) => c.invalidateInventoryCache(a.account_id).then(() => null),
};

async function portClient(testCase: ClientCase, responses = testCase.responses): Promise<Answer> {
  const options = testCase.options ?? {};
  const recorder = scripted(responses);
  const sleeps: number[] = [];
  const now = testCase.now ?? 1_790_000_000;
  let client: MetaClient;
  try {
    client = new MetaClient({
      graphVersion: options.graph_version ?? 'v26.0',
      baseUrl: options.base_url ?? 'https://graph.facebook.com',
      appSecret: options.app_secret ?? '',
      fetch: recorder.fetch,
      sleep: async (seconds) => {
        sleeps.push(seconds);
      },
      random: () => 0.5,
      now: () => now,
      monotonic: () => now,
    });
  } catch (error) {
    return { construct: failure(error) };
  }
  if (options.automation) {
    const a = options.automation;
    client.configureAutomation({
      inventoryCacheMinutes: a.inventory_cache_minutes,
      adaptivePollingEnabled: a.adaptive_polling_enabled,
      usageSoftLimitPercent: a.usage_soft_limit_percent,
      usageHardLimitPercent: a.usage_hard_limit_percent,
      usageTtlMinutes: a.usage_ttl_minutes,
    });
  }
  const results: unknown[] = [];
  for (const call of testCase.calls) {
    try {
      results.push({ ok: asJson(await CLIENT[call.fn](client, (call.args ?? {}) as Record<string, never>)) });
    } catch (error) {
      results.push(failure(error));
    }
  }
  return { requests: recorder.requests, results, sleeps, usage: asJson(client.getUsageSnapshot()) };
}

async function portOAuth(testCase: OAuthCase): Promise<Answer> {
  const recorder = scripted(testCase.responses);
  const o = testCase.options;
  const client = new MetaOAuthClient({
    appId: o.app_id,
    appSecret: o.app_secret,
    redirectUri: o.redirect_uri,
    graphVersion: o.graph_version,
    loginConfigId: o.login_config_id,
    fetch: recorder.fetch,
  });
  const calls: Record<string, (args: Record<string, never>) => unknown> = {
    build_authorization_url: (a) => client.buildAuthorizationUrl(a.state),
    appsecret_proof: (a) => client.appsecretProof(a.access_token),
    exchange_code: (a) => client.exchangeCode(a.code),
    debug_token: (a) => client.debugToken(a.access_token),
    get_identity: (a) => client.getIdentity(a.access_token),
    discover_ad_accounts: (a) => client.discoverAdAccounts(a.access_token),
    revoke_permissions: (a) => client.revokePermissions(a.access_token),
  };
  const results: unknown[] = [];
  for (const call of testCase.calls) {
    try {
      results.push({ ok: asJson(await calls[call.fn]((call.args ?? {}) as Record<string, never>)) });
    } catch (error) {
      results.push(failure(error));
    }
  }
  return { requests: recorder.requests, results };
}

const FUNCTIONS: Record<string, (...args: never[]) => unknown> = {
  classify: (errorData: never, fallback: never) => failure(classifyMetaTokenError(errorData, fallback)),
  normalize_basic_insight: (insight: never) => normalizeBasicInsight(insight),
  from_meta_budget_units: (value: never, currency: never) => fromMetaBudgetUnits(value, currency),
  to_meta_budget_units: (value: never, currency: never) => toMetaBudgetUnits(value, currency),
  canonical_timezone_name: (value: never) => canonicalTimezoneName(value),
  connection_health: (debug: never, now: number) => evaluateMetaConnectionHealth(debug, new Date(now * 1000)),
  period_params: (preset: string, since: string, until: string) => Object.fromEntries(MetaClient.periodParams(preset, since, until)),
};

function portFn(testCase: FnCase): Answer {
  try {
    return { ok: asJson(FUNCTIONS[testCase.fn](...(testCase.args as never[]))) };
  } catch (error) {
    return failure(error);
  }
}

async function port(testCase: Case): Promise<Answer> {
  if (testCase.kind === 'client') {
    return portClient(testCase);
  }
  if (testCase.kind === 'oauth') return portOAuth(testCase);
  return portFn(testCase);
}

const label = (testCase: Case, index: number): string =>
  `${index}: ${testCase.kind === 'fn' ? testCase.fn : (testCase.name ?? testCase.calls.map((call) => call.fn).join(','))}`;

async function compare(group: string, cases: Case[]): Promise<void> {
  const answers: Answer[] = [];
  for (const testCase of cases) answers.push(await port(testCase));
  if (RECORD) {
    recorded[group] = answers;
    // One answer per line: a change shows as the cases it touched.
    const groups = Object.entries(recorded).map(([name, list]) => `${JSON.stringify(name)}: [\n${list.map((answer) => JSON.stringify(answer)).join(',\n')}\n]`);
    writeFileSync(FIXTURE, `{\n${groups.join(',\n')}\n}\n`);
    return;
  }
  const expected = recorded[group];
  expect(expected, group).toHaveLength(cases.length);
  for (const [index, testCase] of cases.entries()) expect(answers[index], label(testCase, index)).toEqual(expected[index]);
}

describe('the Meta client answers as recorded', () => {
  it('in the written scenarios', async () => {
    await compare('scenarios', scenarios());
  });

  it('on generated payloads', async () => {
    await compare('generated', fuzzCases(400));
  });

  it('for OAuth', async () => {
    await compare('oauth', oauthScenarios());
  });

  it('in its pure functions', async () => {
    await compare('functions', functionCases());
  });
});

describe('the Meta client on its own', () => {
  it('signs requests and reads an ad account', async () => {
    const recorder = scripted([{ status: 200, headers: {}, body: JSON.stringify({ id: 'act_1', currency: 'usd', timezone_name: 'US/Hawaii', account_status: 1 }) }]);
    const client = new MetaClient({ graphVersion: 'v26.0', baseUrl: 'https://graph.facebook.com', appSecret: 'secret', fetch: recorder.fetch });
    const account = await client.getAccountInfo('1', 'token');
    expect(account).toMatchObject({ currency: 'USD', timezone_name: 'Pacific/Honolulu', status_label: 'Active (ACTIVE)' });
    const proof = createHmac('sha256', 'secret').update('token').digest('hex');
    expect(recorder.requests[0].url).toBe(
      `https://graph.facebook.com/v26.0/act_1?fields=id%2Cname%2Ctimezone_name%2Ccurrency%2Caccount_status%2Cdisable_reason&access_token=token&appsecret_proof=${proof}`,
    );
  });
});
