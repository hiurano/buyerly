import { createHmac } from 'node:crypto';
import { pyRound } from '../python-numbers.ts';
import { PythonCrash } from '../rules/engine.ts';
import { pyStr, pyStrip } from '../rules/validation.ts';
import { classifyMetaTokenError, MetaApiError, MetaRateLimitDeferred, MetaValueError } from './errors.ts';
import { normalizeBasicInsight } from './insights.ts';
import {
  asDict, get, hashKey, isRecord, or, pyJsonDumps, safeFloat, safeInt, strOr, truthy, urlencode, type Json,
} from './python.ts';
import { canonicalTimezoneName, fromMetaBudgetUnits, normalizeCurrency, toMetaBudgetUnits } from './units.ts';

// The Meta Marketing API client, ported from meta_api/client.py (#611, stage
// 4). Every request it sends — method, path, params and their order, form
// body — and every result it returns match Python's for the same inputs;
// server/test/meta/client.test.ts proves it against client_parity.py.
//
// Like Python's it retries 429/5xx and network errors with exponential
// backoff and jitter (Retry-After first), reads Meta's quota headers
// (X-App-Usage, X-Business-Use-Case-Usage) and holds back non-critical
// requests when a quota runs high, signs every token with appsecret_proof,
// follows cursors itself rather than the token-bearing `paging.next` URLs,
// and never logs a token: params and bodies stay out of the log lines.
// Meta has no batching here: Python sends one request per call too.

export const ACCOUNT_STATUS_MAP: ReadonlyMap<number, string> = new Map([
  [1, 'Active (ACTIVE)'],
  [2, 'Disabled in Meta (DISABLED / Policy Ban)'],
  [3, 'Payment problem (UNSETTLED / card hold)'],
  [7, 'Under security review (PENDING_RISK_REVIEW)'],
  [8, 'Awaiting settlement (PENDING_SETTLEMENT)'],
  [9, 'Payment grace period (IN_GRACE_PERIOD)'],
  [101, 'Ad account closed (CLOSED)'],
]);

export const ACCOUNT_SUMMARY_FIELDS = 'spend,impressions,reach,frequency,cpm,clicks,unique_clicks,inline_link_clicks,outbound_clicks,actions';

const GRAPH_VERSION_PATTERN = /^v\d+\.\d+$/;
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);
const TOKEN_ERROR_CODES = new Set([190, 102, 10, 200]);

export type Priority = 'normal' | 'critical';
export type EntityLevel = 'campaign' | 'adset' | 'ad';

export interface MetaLog {
  debug(message: string): void;
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

// The shared ad set inventory cache (services/inventory_cache.py in Python).
export interface InventoryCacheProvider {
  getInventory(accountId: string): Promise<Json[] | null>;
  setInventory(accountId: string, rows: Json[], options: { ttlSeconds: number; requestStartedAt: Date }): Promise<void>;
  updateStatus(options: { accountId: string; adsetId: string; status: string }): Promise<void>;
  invalidate(accountId: string): Promise<void>;
}

export interface MetaClientOptions {
  // META_GRAPH_VERSION, like v26.0.
  graphVersion: string;
  // META_GRAPH_BASE_URL: Meta, or the fake Meta (scripts/fake_meta.py).
  baseUrl: string;
  // META_APP_SECRET, for appsecret_proof; empty sends none.
  appSecret: string;
  timeoutSeconds?: number;
  log?: MetaLog;
  cacheProvider?: InventoryCacheProvider;
  // Seams for tests and simulations: the network, the clocks, waiting and jitter.
  fetch?: typeof fetch;
  sleep?: (seconds: number) => Promise<void>;
  random?: () => number;
  // Wall clock and a monotonic clock, in seconds.
  now?: () => number;
  monotonic?: () => number;
}

interface UsageRow {
  call_count: number;
  total_cputime: number;
  total_time: number;
  estimated_time_to_regain_access?: number;
  is_high_usage?: boolean;
  updated_at?: number;
}

export interface UsageSnapshot {
  max_percent: number;
  app: Record<string, number>;
  accounts: Record<string, UsageRow>;
  updated_at: number | null;
}

// An HTTP answer from Meta, read the way httpx's Response is.
class MetaResponse {
  constructor(
    readonly status: number,
    readonly headers: Headers,
    readonly text: string,
  ) {}

  json(): unknown {
    try {
      return JSON.parse(this.text) as unknown;
    } catch (error) {
      throw new PythonCrash('JSONDecodeError', (error as Error).message);
    }
  }

  // `resp.json().get("error", {})` inside `try: … except Exception: pass`.
  errorField(): unknown {
    try {
      const payload = this.json();
      return isRecord(payload) ? get(payload, 'error', {}) : {};
    } catch {
      return {};
    }
  }
}

class NetworkError extends Error {}

// max(values, default=0)
const pyMax = (values: number[]): number => (values.length ? Math.max(...values) : 0);

// max(1.0, x): x only when it is greater, so NaN gives 1.0.
const atLeastOne = (value: number): number => (value > 1.0 ? value : 1.0);

const silent: MetaLog = { debug() {}, info() {}, warn() {}, error() {} };

export function normalizeAccountId(accountId: unknown): string {
  const account = pyStrip(truthy(accountId) ? pyStr(accountId) : '');
  if (!account) return '';
  return account.startsWith('act_') ? account : `act_${account}`;
}

// `account_id if account_id.startswith("act_") else f"act_{account_id}"`
const actId = (accountId: string): string => (accountId.startsWith('act_') ? accountId : `act_${accountId}`);

const copyRows = (rows: Json[]): Json[] => rows.map((row) => ({ ...row }));

const capitalize = (text: string): string => (text ? text[0].toUpperCase() + text.slice(1).toLowerCase() : text);

export class MetaClient {
  readonly graphVersion: string;
  readonly baseUrl: string;
  private readonly appSecret: string;
  private readonly timeoutSeconds: number;
  private readonly log: MetaLog;
  private readonly cacheProvider: InventoryCacheProvider | undefined;
  private readonly fetcher: typeof fetch;
  private readonly sleep: (seconds: number) => Promise<void>;
  private readonly random: () => number;
  private readonly now: () => number;
  private readonly monotonic: () => number;

  private inventoryCacheSeconds = 5 * 60;
  private readonly inventoryCache = new Map<string, [number, Json[]]>();
  private adaptivePollingEnabled = true;
  private usageSoftLimitPercent = 60;
  private usageHardLimitPercent = 80;
  private usageTtlSeconds = 15 * 60;
  private usageSnapshot: UsageSnapshot = { max_percent: 0, app: {}, accounts: {}, updated_at: null };

  constructor(options: MetaClientOptions) {
    const version = options.graphVersion.trim();
    if (!GRAPH_VERSION_PATTERN.test(version)) throw new MetaValueError('META_GRAPH_VERSION must look like v26.0');
    this.graphVersion = version;
    this.baseUrl = `${options.baseUrl.replace(/\/+$/, '')}/${version}`;
    this.appSecret = options.appSecret;
    this.timeoutSeconds = options.timeoutSeconds ?? 15;
    this.log = options.log ?? silent;
    this.cacheProvider = options.cacheProvider;
    this.fetcher = options.fetch ?? fetch;
    this.sleep = options.sleep ?? ((seconds) => new Promise((resolve) => setTimeout(resolve, seconds * 1000)));
    this.random = options.random ?? Math.random;
    this.now = options.now ?? (() => Date.now() / 1000);
    this.monotonic = options.monotonic ?? (() => performance.now() / 1000);
  }

  // Operator-controlled limits, applied without recreating the client.
  configureAutomation({
    inventoryCacheMinutes = 5,
    adaptivePollingEnabled = true,
    usageSoftLimitPercent = 60,
    usageHardLimitPercent = 80,
    usageTtlMinutes = 15,
  }: {
    inventoryCacheMinutes?: number;
    adaptivePollingEnabled?: boolean;
    usageSoftLimitPercent?: number;
    usageHardLimitPercent?: number;
    usageTtlMinutes?: number;
  } = {}): void {
    this.inventoryCacheSeconds = Math.max(60, Math.trunc(inventoryCacheMinutes) * 60);
    this.adaptivePollingEnabled = Boolean(adaptivePollingEnabled);
    this.usageSoftLimitPercent = Math.max(1, Math.trunc(usageSoftLimitPercent));
    this.usageHardLimitPercent = Math.max(this.usageSoftLimitPercent + 1, Math.trunc(usageHardLimitPercent));
    this.usageTtlSeconds = Math.max(60, Math.trunc(usageTtlMinutes) * 60);
  }

  getUsageSnapshot(): UsageSnapshot {
    const accounts: Record<string, UsageRow> = {};
    for (const [key, value] of Object.entries(this.usageSnapshot.accounts)) accounts[key] = { ...value };
    return {
      max_percent: safeInt(this.usageSnapshot.max_percent),
      app: { ...this.usageSnapshot.app },
      accounts,
      updated_at: this.usageSnapshot.updated_at,
    };
  }

  private protect(payload: Array<[string, unknown]> | null): Array<[string, unknown]> | null {
    if (payload === null) return null;
    const protectedPayload = [...payload];
    const token = strOr(protectedPayload.find(([key]) => key === 'access_token')?.[1], '');
    if (token && this.appSecret) {
      protectedPayload.push(['appsecret_proof', createHmac('sha256', this.appSecret).update(token, 'utf8').digest('hex')]);
    }
    return protectedPayload;
  }

  private async respectUsageLimit(accountId: string, priority: Priority): Promise<void> {
    if (!this.adaptivePollingEnabled) return;
    if (priority === 'critical') return;
    const now = this.now();

    // 1. The app-wide quota (X-App-Usage).
    const appUsage = this.usageSnapshot.app;
    const appUpdated = safeFloat(this.usageSnapshot.updated_at ?? 0);
    let appPercent = 0;
    if (!appUpdated || now - appUpdated <= this.usageTtlSeconds) {
      appPercent = pyMax(Object.values(appUsage).map(safeInt));
    }
    if (appPercent >= this.usageHardLimitPercent) {
      throw new MetaRateLimitDeferred(`Meta App quota is at ${appPercent}%; non-critical polling is deferred`);
    }

    // 2. The ad account's quota (X-Business-Use-Case-Usage).
    let accountPercent = 0;
    const target = normalizeAccountId(accountId);
    if (target) {
      const accounts = this.usageSnapshot.accounts;
      let row: UsageRow | undefined = accounts[target];
      if (!row && target.startsWith('act_')) row = accounts[target.slice(4)];
      if (row) {
        const updated = safeFloat(row.updated_at ?? 0);
        if (!updated || now - updated <= this.usageTtlSeconds) {
          accountPercent = Math.max(safeInt(row.call_count), safeInt(row.total_cputime), safeInt(row.total_time));
        }
      }
      if (accountPercent >= this.usageHardLimitPercent) {
        throw new MetaRateLimitDeferred(
          `Meta quota for account ${accountId} is at ${accountPercent}%; non-critical polling is deferred`,
        );
      }
    } else {
      const rawMax = safeInt(this.usageSnapshot.max_percent);
      if (rawMax >= this.usageHardLimitPercent && Object.keys(appUsage).length === 0) {
        throw new MetaRateLimitDeferred(`Meta quota is at ${rawMax}%; non-critical polling is deferred`);
      }
    }

    const pressurePercent = Math.max(appPercent, accountPercent);
    if (pressurePercent >= this.usageSoftLimitPercent) {
      const pressure = pressurePercent - this.usageSoftLimitPercent + 1;
      await this.sleep(Math.min(2.0, 0.05 * pressure) + this.uniform(0.0, 0.15));
    }
  }

  // random.uniform(a, b)
  private uniform(low: number, high: number): number {
    return low + (high - low) * this.random();
  }

  // _parse_usage_headers: the quota headers into the usage snapshot. A header
  // Python cannot read is skipped from the point it breaks, as there.
  private parseUsageHeaders(headers: Headers, accountId: string): UsageRow {
    const now = this.now();
    const usage: UsageRow = {
      call_count: 0,
      total_cputime: 0,
      total_time: 0,
      estimated_time_to_regain_access: 0,
      is_high_usage: false,
      updated_at: now,
    };

    const businessHeader = headers.get('x-business-use-case-usage');
    if (businessHeader) {
      try {
        const data = asDict(JSON.parse(businessHeader));
        for (const [accountKey, metrics] of Object.entries(data)) {
          const normalized = normalizeAccountId(accountKey);
          const accountUsage: UsageRow = {
            call_count: 0,
            total_cputime: 0,
            total_time: 0,
            estimated_time_to_regain_access: 0,
            is_high_usage: false,
            updated_at: now,
          };
          if (!Array.isArray(metrics) && typeof metrics !== 'string' && !isRecord(metrics)) {
            throw new TypeError('not iterable');
          }
          const list: unknown[] = Array.isArray(metrics) ? metrics : typeof metrics === 'string' ? Array.from(metrics) : Object.keys(metrics);
          for (const metric of list) {
            const row = asDict(metric);
            const calls = safeInt(get(row, 'call_count', 0));
            const cpu = safeInt(get(row, 'total_cputime', 0));
            const time = safeInt(get(row, 'total_time', 0));
            const regain = safeInt(get(row, 'estimated_time_to_regain_access', 0));
            accountUsage.call_count = Math.max(accountUsage.call_count, calls);
            accountUsage.total_cputime = Math.max(accountUsage.total_cputime, cpu);
            accountUsage.total_time = Math.max(accountUsage.total_time, time);
            accountUsage.estimated_time_to_regain_access = Math.max(accountUsage.estimated_time_to_regain_access!, regain);
            usage.call_count = Math.max(usage.call_count, calls);
            usage.total_cputime = Math.max(usage.total_cputime, cpu);
            usage.total_time = Math.max(usage.total_time, time);
            usage.estimated_time_to_regain_access = Math.max(usage.estimated_time_to_regain_access!, regain);
            if (calls >= 80 || cpu >= 80 || time >= 80) {
              accountUsage.is_high_usage = true;
              usage.is_high_usage = true;
              this.log.warn(
                `⚠️ [BUC Rate Warning] Meta API Usage is HIGH for ${accountId || accountKey}: ` +
                  `call_count=${calls}%, cputime=${cpu}%, time=${time}%, regain_in=${regain}m`,
              );
            }
          }
          this.usageSnapshot.accounts[normalized] = accountUsage;
        }
        if (accountId) this.usageSnapshot.accounts[normalizeAccountId(accountId)] = { ...usage };
      } catch (error) {
        this.log.debug(`Failed to parse x-business-use-case-usage header: ${(error as Error).message}`);
      }
    }

    const appHeader = headers.get('x-app-usage');
    if (appHeader) {
      try {
        const data = asDict(JSON.parse(appHeader));
        const app = {
          call_count: safeInt(get(data, 'call_count', 0)),
          total_cputime: safeInt(get(data, 'total_cputime', 0)),
          total_time: safeInt(get(data, 'total_time', 0)),
        };
        this.usageSnapshot.app = app;
        if (Math.max(app.call_count, app.total_cputime, app.total_time) >= 80) {
          usage.is_high_usage = true;
          this.log.warn(`⚠️ [App Rate Warning] Meta App Usage is HIGH: ${app.call_count}%`);
        }
      } catch (error) {
        this.log.debug(`Failed to parse x-app-usage header: ${(error as Error).message}`);
      }
    }

    const accountMax = pyMax(
      Object.values(this.usageSnapshot.accounts)
        .filter((row) => now - safeFloat(row.updated_at ?? 0) <= this.usageTtlSeconds)
        .map((row) => Math.max(safeInt(row.call_count), safeInt(row.total_cputime), safeInt(row.total_time))),
    );
    const appMax = pyMax(Object.values(this.usageSnapshot.app).map(safeInt));
    this.usageSnapshot.max_percent = Math.max(accountMax, appMax);
    this.usageSnapshot.updated_at = now;
    return usage;
  }

  private async send(method: 'GET' | 'POST', url: string, params: Array<[string, unknown]> | null, data: Array<[string, unknown]> | null): Promise<MetaResponse> {
    const target = params ? `${url}?${urlencode(params)}` : url;
    const init: RequestInit = { method, signal: AbortSignal.timeout(this.timeoutSeconds * 1000) };
    if (method === 'POST') {
      init.headers = { 'content-type': 'application/x-www-form-urlencoded' };
      init.body = urlencode(data ?? []);
    }
    let response: Response;
    let text: string;
    try {
      response = await this.fetcher(target, init);
      text = await response.text();
    } catch (error) {
      const cause = (error as Error & { cause?: Error }).cause;
      throw new NetworkError(cause?.message || (error as Error).message || (error as Error).name);
    }
    return new MetaResponse(response.status, response.headers, text);
  }

  // _request_with_retry: one call to Meta with backoff on 429/5xx and network
  // errors, the quota headers read on every answer, Meta's errors mapped.
  private async request(
    method: 'GET' | 'POST',
    url: string,
    { params = null, data = null, accountId = '', maxRetries = 3, priority = 'normal' }: {
      params?: Array<[string, unknown]> | null;
      data?: Array<[string, unknown]> | null;
      accountId?: string;
      maxRetries?: number;
      priority?: Priority;
    },
  ): Promise<MetaResponse> {
    await this.respectUsageLimit(accountId, priority);
    const requestParams = this.protect(params);
    const requestData = this.protect(data);
    for (let attempt = 0; attempt < maxRetries; attempt += 1) {
      let response: MetaResponse;
      try {
        response = method === 'GET' ? await this.send('GET', url, requestParams, null) : await this.send('POST', url, requestParams, requestData);
      } catch (error) {
        if (!(error instanceof NetworkError)) throw error;
        if (attempt < maxRetries - 1) {
          const backoff = atLeastOne(2.0 * 2 ** attempt + this.uniform(-0.3, 0.3));
          this.log.warn(
            `Network error connecting to Meta API (NetworkError) on ${url}; retrying in ${backoff.toFixed(2)}s (attempt ${attempt + 1}/${maxRetries})`,
          );
          await this.sleep(backoff);
          continue;
        }
        this.log.error(`Network connection to Meta API failed after ${maxRetries} attempts: ${error.message}`);
        throw new MetaApiError(`Network error connecting to Meta API: ${error.message}`);
      }

      this.parseUsageHeaders(response.headers, accountId);
      if (response.status === 200) return response;

      if (RETRYABLE_STATUSES.has(response.status)) {
        const errorJson = asDict(response.errorField());
        const errorMessage = pyStr(get(errorJson, 'message', response.text));
        if (attempt < maxRetries - 1) {
          const retryAfter = safeFloat(response.headers.get('retry-after'));
          // `retry_after or …`: NaN is true in Python; max(1.0, nan) is 1.0.
          const backoff = atLeastOne(retryAfter !== 0 ? retryAfter : 2.0 * 2 ** attempt + this.uniform(-0.3, 0.3));
          this.log.warn(
            `Meta API temporary error ${response.status} on ${url} for ${accountId}; retrying in ${backoff.toFixed(2)}s ` +
              `(attempt ${attempt + 1}/${maxRetries}): ${errorMessage}`,
          );
          await this.sleep(backoff);
          continue;
        }
        this.log.error(`Meta API temporary error exhausted after ${maxRetries} attempts (${response.status}): ${errorMessage}`);
        throw new MetaApiError(`Meta API Error (${response.status}): ${errorMessage}`);
      }

      const errorData = asDict(response.errorField());
      const errorCode = get(errorData, 'code');
      const errorSubcode = get(errorData, 'error_subcode');
      const errorMessage = get(errorData, 'message', response.text);
      this.log.error(
        `Meta API Error (${response.status}, code ${pyStr(errorCode)}, subcode ${pyStr(errorSubcode)}) for ${accountId}: ${pyStr(errorMessage)}`,
      );
      if (typeof errorCode === 'number' && TOKEN_ERROR_CODES.has(errorCode)) {
        throw classifyMetaTokenError(errorData, errorMessage);
      }
      throw new MetaApiError(`Meta API Error (${response.status}): ${pyStr(errorMessage)}`);
    }
    throw new MetaApiError('Unexpected end of request execution loop');
  }

  // Every cursor page, without following the token-bearing `paging.next` URLs.
  private async fetchPaginated(
    url: string,
    params: Array<[string, unknown]>,
    { accountId, maxPages = 500, priority = 'normal' }: { accountId: string; maxPages?: number; priority?: Priority },
  ): Promise<Json[]> {
    const pageParams = [...params];
    const rows: Json[] = [];
    const seen = new Set<string>();
    for (let page = 0; page < maxPages; page += 1) {
      const response = await this.request('GET', url, { params: pageParams, accountId, priority });
      const payload = asDict(response.json());
      const pageRows = get(payload, 'data', []);
      if (Array.isArray(pageRows)) for (const row of pageRows) if (isRecord(row)) rows.push(row);

      const paging = asDict(or(get(payload, 'paging'), {}));
      const nextPage = get(paging, 'next');
      const cursor = get(asDict(or(get(paging, 'cursors'), {})), 'after');
      if (!truthy(nextPage)) return rows;
      if (!truthy(cursor) || seen.has(hashKey(cursor))) throw new MetaApiError('Meta pagination stopped on an invalid cursor');
      seen.add(hashKey(cursor));
      const index = pageParams.findIndex(([key]) => key === 'after');
      if (index >= 0) pageParams[index] = ['after', cursor];
      else pageParams.push(['after', cursor]);
    }
    throw new MetaApiError(`Meta pagination exceeded ${maxPages} pages`);
  }

  // Time zone, name, status and currency of an ad account.
  async getAccountInfo(accountId: string, accessToken: string, { priority = 'normal' }: { priority?: Priority } = {}): Promise<Json> {
    const account = actId(accountId);
    const response = await this.request('GET', `${this.baseUrl}/${account}`, {
      params: [
        ['fields', 'id,name,timezone_name,currency,account_status,disable_reason'],
        ['access_token', accessToken],
      ],
      accountId: account,
      priority,
    });
    const data = asDict(response.json());
    const statusCode = get(data, 'account_status', 1);
    data.currency = normalizeCurrency(truthy(get(data, 'currency')) ? pyStr(get(data, 'currency')) : '');
    data.timezone_name = canonicalTimezoneName(get(data, 'timezone_name'));
    hashKey(statusCode); // a list or dict cannot be looked up: TypeError, as in Python
    const known = typeof statusCode === 'number' || typeof statusCode === 'boolean' ? ACCOUNT_STATUS_MAP.get(Number(statusCode)) : undefined;
    data.status_label = known ?? `Unknown status (${pyStr(statusCode)})`;
    return data;
  }

  // Meta's period: explicit account-local days when known (#212), else the preset.
  static periodParams(datePreset: string, since = '', until = ''): Array<[string, unknown]> {
    if (since && until) return [['time_range', pyJsonDumps({ since, until })]];
    return [['date_preset', datePreset]];
  }

  // Exact account-level totals for a period, independent of today's ad set list.
  async getAccountInsightsSummary(
    accountId: string,
    accessToken: string,
    datePreset = 'today',
    { since = '', until = '' }: { since?: string; until?: string } = {},
  ): Promise<Json> {
    const account = actId(accountId);
    const rows = await this.fetchPaginated(
      `${this.baseUrl}/${account}/insights`,
      [
        ['level', 'account'],
        ['fields', ACCOUNT_SUMMARY_FIELDS],
        ...MetaClient.periodParams(datePreset, since, until),
        ['limit', 100],
        ['access_token', accessToken],
      ],
      { accountId: account },
    );
    if (rows.length === 0) return { ...normalizeBasicInsight({}) };
    if (rows.length !== 1) throw new MetaApiError(`Meta returned ${rows.length} account-level insight rows without a time breakdown`);
    return { ...normalizeBasicInsight(rows[0]) };
  }

  // Every ad set with its status and the period's independent metrics.
  async getAdsetsInsights(
    accountId: string,
    accessToken: string,
    datePreset = 'today',
    currency = 'UNKNOWN',
    priority: Priority = 'normal',
  ): Promise<Json[]> {
    const account = actId(accountId);
    const requestStartedAt = new Date(this.now() * 1000);
    let adsets: Json[] | null = null;
    if (this.cacheProvider) adsets = await this.cacheProvider.getInventory(account);
    if (adsets === null) {
      const cached = this.inventoryCache.get(account);
      if (cached && cached[0] > this.monotonic()) adsets = copyRows(cached[1]);
    }
    if (adsets === null) {
      adsets = await this.fetchPaginated(
        `${this.baseUrl}/${account}/adsets`,
        [
          // campaign_id lets a rule aim at one campaign instead of the whole account.
          ['fields', 'id,name,campaign_id,status,effective_status,daily_budget'],
          ['limit', 100],
          ['access_token', accessToken],
        ],
        { accountId: account, priority },
      );
      this.inventoryCache.set(account, [this.monotonic() + this.inventoryCacheSeconds, copyRows(adsets)]);
      if (this.cacheProvider) {
        await this.cacheProvider.setInventory(account, copyRows(adsets), { ttlSeconds: this.inventoryCacheSeconds, requestStartedAt });
      }
    }

    const insightRows = await this.fetchPaginated(
      `${this.baseUrl}/${account}/insights`,
      [
        ['level', 'adset'],
        ['fields', 'campaign_id,adset_id,adset_name,spend,impressions,clicks,inline_link_clicks,cpc,ctr,actions,cost_per_action_type'],
        ['date_preset', datePreset],
        ['limit', 100],
        ['access_token', accessToken],
      ],
      { accountId: account, priority },
    );
    // Keyed by the raw adset_id, as Python's dict is: an id Meta sends as a
    // number does not match the ad set's string id.
    const insights = new Map<string, [unknown, Json]>();
    for (const item of insightRows) {
      if (!truthy(get(item, 'adset_id'))) continue;
      const key = hashKey(item.adset_id);
      const existing = insights.get(key);
      insights.set(key, [existing ? existing[0] : item.adset_id, item]);
    }

    const unified: Json[] = [];
    const processed = new Set<string>();
    const money = normalizeCurrency(currency);
    for (const adset of adsets) {
      if (!Object.prototype.hasOwnProperty.call(adset, 'id')) throw new PythonCrash('KeyError', "'id'");
      const adsetId = pyStr(adset.id);
      processed.add(adsetId);
      if (!Object.prototype.hasOwnProperty.call(adset, 'name')) throw new PythonCrash('KeyError', "'name'");
      const name = adset.name;
      const status = get(adset, 'status', 'UNKNOWN');
      const effectiveStatus = get(adset, 'effective_status', status);

      const insight = insights.get(hashKey(adsetId))?.[1] ?? {};
      const normalized = normalizeBasicInsight(insight);
      const { spend, impressions, clicks } = normalized;
      const cpc = safeFloat(get(insight, 'cpc', 0));
      const ctr = safeFloat(get(insight, 'ctr', 0));

      // Dead archived or deleted ad sets with no activity in the period.
      if ((effectiveStatus === 'ARCHIVED' || effectiveStatus === 'DELETED') && spend === 0 && impressions === 0 && clicks === 0) continue;

      unified.push({
        adset_id: adsetId,
        adset_name: name,
        campaign_id: pyStr(or(get(adset, 'campaign_id'), or(get(insight, 'campaign_id'), ''))),
        status,
        effective_status: effectiveStatus,
        spend,
        clicks,
        link_clicks: normalized.link_clicks,
        leads: normalized.leads,
        registrations: normalized.registrations,
        purchases: normalized.purchases,
        impressions,
        cpc: pyRound(cpc, 2),
        ctr: pyRound(ctr, 2),
        daily_budget: fromMetaBudgetUnits(get(adset, 'daily_budget', 0), currency),
        currency: money,
      });
    }

    // Ad sets that spent in the period but are missing from the list.
    for (const [rawId, insight] of insights.values()) {
      if (processed.has(pyStr(rawId))) continue;
      const normalized = normalizeBasicInsight(insight);
      if (normalized.spend > 0 || normalized.impressions > 0) {
        unified.push({
          adset_id: pyStr(rawId),
          adset_name: or(get(insight, 'adset_name'), `AdSet ${pyStr(rawId)}`),
          campaign_id: pyStr(or(get(insight, 'campaign_id'), '')),
          status: 'ARCHIVED',
          effective_status: 'ARCHIVED',
          spend: normalized.spend,
          clicks: normalized.clicks,
          link_clicks: normalized.link_clicks,
          leads: normalized.leads,
          registrations: normalized.registrations,
          purchases: normalized.purchases,
          impressions: normalized.impressions,
          cpc: pyRound(safeFloat(get(insight, 'cpc', 0)), 2),
          ctr: pyRound(safeFloat(get(insight, 'ctr', 0)), 2),
          daily_budget: 0,
          currency: money,
        });
      }
    }
    return unified;
  }

  // Hierarchy facts (account, campaigns, ad sets, ads) with the inventory as
  // the authority on identity and delivery, insights joined by Meta ID. With
  // reportingDate every insights request asks for exactly that local day;
  // includeIdleInventory false leaves out entities that did not deliver.
  async getHierarchicalInsights(
    accountId: string,
    accessToken: string,
    {
      datePreset = 'today',
      currency = 'UNKNOWN',
      accountName = '',
      priority = 'normal',
      reportingDate = '',
      includeIdleInventory = true,
    }: {
      datePreset?: string;
      currency?: string;
      accountName?: string;
      priority?: Priority;
      reportingDate?: string;
      includeIdleInventory?: boolean;
    } = {},
  ): Promise<Json[]> {
    const account = actId(accountId);
    const money = normalizeCurrency(currency);
    const facts: Json[] = [];
    const periodParams = MetaClient.periodParams(datePreset, reportingDate, reportingDate);
    const withDate = (fact: Json): Json => {
      if (reportingDate) fact.date = reportingDate;
      return fact;
    };

    const metricFact = (
      level: EntityLevel,
      entityId: string,
      entityName: string,
      parentId: string,
      insight: Json,
      status = 'UNKNOWN',
      effectiveStatus = 'UNKNOWN',
      dailyBudget = 0,
    ): Json => {
      const n = normalizeBasicInsight(insight);
      const actions = get(insight, 'actions');
      return withDate({
        account_id: account,
        entity_level: level,
        entity_id: entityId,
        entity_name: entityName,
        parent_entity_id: parentId,
        currency: money,
        ...ratios(n),
        raw_actions: Array.isArray(actions) ? actions : [],
        status,
        effective_status: effectiveStatus,
        daily_budget: dailyBudget,
      });
    };

    // 1. The account's own fact.
    const summary = (await this.getAccountInsightsSummary(account, accessToken, datePreset, { since: reportingDate, until: reportingDate })) as unknown as Parameters<typeof ratios>[0];
    facts.push(withDate({
      account_id: account,
      entity_level: 'account',
      entity_id: account,
      entity_name: accountName || account,
      parent_entity_id: '',
      currency: money,
      ...ratios(summary),
      raw_actions: [],
      status: 'ACTIVE',
      effective_status: 'ACTIVE',
      daily_budget: 0,
    }));

    // 2. The inventory is authoritative even without delivery.
    const inventorySpecs: Array<[EntityLevel, string, string]> = [
      ['campaign', 'campaigns', 'id,name,status,effective_status,daily_budget'],
      ['adset', 'adsets', 'id,name,campaign_id,status,effective_status,daily_budget'],
      ['ad', 'ads', 'id,name,campaign_id,adset_id,status,effective_status'],
    ];
    const inventory = new Map<EntityLevel, Json[]>();
    for (const [level, edge, fields] of inventorySpecs) {
      inventory.set(level, await this.fetchPaginated(
        `${this.baseUrl}/${account}/${edge}`,
        [['fields', fields], ['limit', 100], ['access_token', accessToken]],
        { accountId: account, priority },
      ));
    }

    // 3. Period metrics joined onto the inventory by Meta ID.
    const metricFields = 'spend,impressions,reach,frequency,cpm,clicks,unique_clicks,inline_link_clicks,outbound_clicks,actions';
    const hierarchyFields: Record<EntityLevel, string> = {
      campaign: `campaign_id,campaign_name,${metricFields}`,
      adset: `campaign_id,adset_id,adset_name,${metricFields}`,
      ad: `campaign_id,adset_id,ad_id,ad_name,${metricFields}`,
    };
    const idKeys: Record<EntityLevel, string> = { campaign: 'campaign_id', adset: 'adset_id', ad: 'ad_id' };
    const nameKeys: Record<EntityLevel, string> = { campaign: 'campaign_name', adset: 'adset_name', ad: 'ad_name' };
    const parentOf = (level: EntityLevel, source: Json): string => {
      if (level === 'campaign') return account;
      if (level === 'adset') return pyStr(or(get(source, 'campaign_id'), ''));
      return pyStr(or(get(source, 'adset_id'), ''));
    };

    const insightsByLevel = new Map<EntityLevel, Map<string, Json>>();
    for (const level of ['campaign', 'adset', 'ad'] as const) {
      const rows = await this.fetchPaginated(
        `${this.baseUrl}/${account}/insights`,
        [['level', level], ['fields', hierarchyFields[level]], ...periodParams, ['limit', 100], ['access_token', accessToken]],
        { accountId: account, priority },
      );
      const byId = new Map<string, Json>();
      for (const row of rows) if (truthy(get(row, idKeys[level]))) byId.set(pyStr(row[idKeys[level]]), row);
      insightsByLevel.set(level, byId);
    }

    for (const level of ['campaign', 'adset', 'ad'] as const) {
      const byId = insightsByLevel.get(level)!;
      const inventoryIds = new Set<string>();
      for (const entity of inventory.get(level)!) {
        const entityId = pyStr(or(get(entity, 'id'), ''));
        if (!entityId) continue;
        inventoryIds.add(entityId);
        if (!includeIdleInventory && !byId.has(entityId)) continue;
        const status = pyStr(or(get(entity, 'status'), 'UNKNOWN'));
        const effectiveStatus = pyStr(or(get(entity, 'effective_status'), status));
        facts.push(metricFact(
          level,
          entityId,
          pyStr(or(get(entity, 'name'), `${capitalize(level)} ${entityId}`)),
          parentOf(level, entity),
          byId.get(entityId) ?? {},
          status,
          effectiveStatus,
          level !== 'ad' ? fromMetaBudgetUnits(get(entity, 'daily_budget'), money) : 0,
        ));
      }
      // Period activity of an entity no longer in the inventory.
      for (const [entityId, insight] of byId) {
        if (inventoryIds.has(entityId)) continue;
        facts.push(metricFact(
          level,
          entityId,
          pyStr(or(get(insight, nameKeys[level]), `${capitalize(level)} ${entityId}`)),
          parentOf(level, insight),
          insight,
        ));
      }
    }
    return facts;
  }

  // Ads with their period metrics, shaped like getAdsetsInsights.
  async getAdsInsights(
    accountId: string,
    accessToken: string,
    datePreset = 'today',
    currency = 'UNKNOWN',
    priority: Priority = 'normal',
  ): Promise<Json[]> {
    const account = normalizeAccountId(accountId);
    const ads = await this.fetchPaginated(
      `${this.baseUrl}/${account}/ads`,
      [['fields', 'id,name,adset_id,campaign_id,status,effective_status'], ['limit', 100], ['access_token', accessToken]],
      { accountId: account, priority },
    );
    const insightRows = await this.fetchPaginated(
      `${this.baseUrl}/${account}/insights`,
      [
        ['level', 'ad'],
        ['fields', 'campaign_id,adset_id,ad_id,ad_name,spend,impressions,clicks,inline_link_clicks,cpc,ctr,actions,cost_per_action_type'],
        ['date_preset', datePreset],
        ['limit', 100],
        ['access_token', accessToken],
      ],
      { accountId: account, priority },
    );
    const insightsById = new Map<string, Json>();
    for (const row of insightRows) if (truthy(get(row, 'ad_id'))) insightsById.set(pyStr(row.ad_id), row);

    const money = normalizeCurrency(currency);
    const unified: Json[] = [];
    for (const ad of ads) {
      const adId = pyStr(or(get(ad, 'id'), ''));
      if (!adId) continue;
      const status = pyStr(or(get(ad, 'status'), 'UNKNOWN'));
      const effectiveStatus = pyStr(or(get(ad, 'effective_status'), status));
      const insight = insightsById.get(adId) ?? {};
      const normalized = normalizeBasicInsight(insight);
      const { spend, impressions, clicks } = normalized;
      if ((effectiveStatus === 'ARCHIVED' || effectiveStatus === 'DELETED') && spend === 0 && impressions === 0 && clicks === 0) continue;
      unified.push({
        ad_id: adId,
        ad_name: pyStr(or(get(ad, 'name'), `Ad ${adId}`)),
        adset_id: pyStr(or(get(ad, 'adset_id'), or(get(insight, 'adset_id'), ''))),
        campaign_id: pyStr(or(get(ad, 'campaign_id'), or(get(insight, 'campaign_id'), ''))),
        status,
        effective_status: effectiveStatus,
        spend,
        clicks,
        link_clicks: normalized.link_clicks,
        leads: normalized.leads,
        registrations: normalized.registrations,
        purchases: normalized.purchases,
        impressions,
        cpc: pyRound(safeFloat(get(insight, 'cpc', 0)), 2),
        ctr: pyRound(safeFloat(get(insight, 'ctr', 0)), 2),
        currency: money,
      });
    }
    return unified;
  }

  // Name and real delivery state of every campaign in the ad account.
  async getCampaignsInventory(accountId: string, accessToken: string, priority: Priority = 'normal'): Promise<Json[]> {
    const account = normalizeAccountId(accountId);
    const rows = await this.fetchPaginated(
      `${this.baseUrl}/${account}/campaigns`,
      [['fields', 'id,name,status,effective_status'], ['limit', 100], ['access_token', accessToken]],
      { accountId: account, priority },
    );
    return rows
      .filter((row) => truthy(get(row, 'id')))
      .map((row) => ({
        campaign_id: pyStr(or(get(row, 'id'), '')),
        campaign_name: pyStr(or(get(row, 'name'), `Campaign ${pyStr(get(row, 'id'))}`)),
        status: pyStr(or(get(row, 'status'), 'UNKNOWN')),
        effective_status: pyStr(or(get(row, 'effective_status'), or(get(row, 'status'), 'UNKNOWN'))),
      }));
  }

  // Campaign totals read at the campaign level, for windows where summing ad sets is not exact.
  async getCampaignsInsights(
    accountId: string,
    accessToken: string,
    datePreset = 'today',
    currency = 'UNKNOWN',
    priority: Priority = 'normal',
  ): Promise<Json[]> {
    const account = normalizeAccountId(accountId);
    const rows = await this.fetchPaginated(
      `${this.baseUrl}/${account}/insights`,
      [
        ['level', 'campaign'],
        ['fields', 'campaign_id,spend,impressions,clicks,inline_link_clicks,cpc,ctr,actions,cost_per_action_type'],
        ['date_preset', datePreset],
        ['limit', 100],
        ['access_token', accessToken],
      ],
      { accountId: account, priority },
    );
    const money = normalizeCurrency(currency);
    const unified: Json[] = [];
    for (const row of rows) {
      const campaignId = pyStr(or(get(row, 'campaign_id'), ''));
      if (!campaignId) continue;
      const normalized = normalizeBasicInsight(row);
      unified.push({
        campaign_id: campaignId,
        spend: normalized.spend,
        clicks: normalized.clicks,
        link_clicks: normalized.link_clicks,
        leads: normalized.leads,
        registrations: normalized.registrations,
        purchases: normalized.purchases,
        impressions: normalized.impressions,
        cpc: pyRound(safeFloat(get(row, 'cpc', 0)), 2),
        ctr: pyRound(safeFloat(get(row, 'ctr', 0)), 2),
        currency: money,
      });
    }
    return unified;
  }

  // The live state of an ad set, for guarded undo checks.
  async getAdsetState(adsetId: string, accessToken: string, currency = 'UNKNOWN'): Promise<Json> {
    const response = await this.request('GET', `${this.baseUrl}/${adsetId}`, {
      params: [['fields', 'id,account_id,name,status,effective_status,daily_budget'], ['access_token', accessToken]],
      accountId: adsetId,
    });
    const payload = asDict(response.json());
    return {
      account_id: pyStr(or(get(payload, 'account_id'), '')),
      adset_id: pyStr(or(get(payload, 'id'), adsetId)),
      adset_name: pyStr(or(get(payload, 'name'), '')),
      status: pyStr(or(get(payload, 'status'), 'UNKNOWN')).toUpperCase(),
      effective_status: pyStr(or(get(payload, 'effective_status'), or(get(payload, 'status'), 'UNKNOWN'))).toUpperCase(),
      daily_budget: fromMetaBudgetUnits(get(payload, 'daily_budget'), currency),
      currency: normalizeCurrency(currency),
    };
  }

  // The live state of a campaign, ad set or ad, for undo checks. An ad has
  // no budget; its daily_budget stays present and zero.
  async getEntityState(entityId: string, accessToken: string, entityLevel: string = 'adset', currency = 'UNKNOWN'): Promise<Json> {
    if (entityLevel === 'adset') return this.getAdsetState(entityId, accessToken, currency);
    const fields = entityLevel === 'ad' ? 'id,account_id,name,status,effective_status' : 'id,account_id,name,status,effective_status,daily_budget';
    const response = await this.request('GET', `${this.baseUrl}/${entityId}`, {
      params: [['fields', fields], ['access_token', accessToken]],
      accountId: entityId,
    });
    const payload = asDict(response.json());
    return {
      account_id: pyStr(or(get(payload, 'account_id'), '')),
      entity_id: pyStr(or(get(payload, 'id'), entityId)),
      entity_name: pyStr(or(get(payload, 'name'), '')),
      status: pyStr(or(get(payload, 'status'), 'UNKNOWN')).toUpperCase(),
      effective_status: pyStr(or(get(payload, 'effective_status'), or(get(payload, 'status'), 'UNKNOWN'))).toUpperCase(),
      daily_budget: fromMetaBudgetUnits(get(payload, 'daily_budget'), currency),
      currency: normalizeCurrency(currency),
    };
  }

  // ---------------------------------------------------------------------
  // Writes. They change real delivery and budgets in Meta; an operation uses
  // them only with a test that proves its requests equal Python's
  // (test/meta/delivery.test.ts, #611 stage 4).

  // A write answered 200: `success: true`, or the error Python raises.
  private confirmWrite(response: MetaResponse, failure: string): void {
    const payload = response.json();
    if (isRecord(payload) && get(payload, 'success') === true) return;
    const errorData = asDict(isRecord(payload) ? get(payload, 'error', {}) : asDict(payload));
    const message = pyStr(get(errorData, 'message', response.text));
    this.log.error(`${failure}: ${message}`);
    throw new MetaApiError(`Meta API Error (${response.status}): ${message}`);
  }

  private static checkStatus(status: string): void {
    if (status !== 'PAUSED' && status !== 'ACTIVE') throw new MetaValueError(`Invalid status: ${status}. Must be 'PAUSED' or 'ACTIVE'.`);
  }

  // Pause or start an ad set.
  async setAdsetStatus(adsetId: string, accessToken: string, status: string, accountId: string | null = null): Promise<true> {
    MetaClient.checkStatus(status);
    const response = await this.request('POST', `${this.baseUrl}/${adsetId}`, {
      data: [['status', status], ['access_token', accessToken]],
      accountId: adsetId,
      priority: 'critical',
    });
    this.confirmWrite(response, `Failed to set adset ${adsetId} status`);
    for (const [, rows] of this.inventoryCache.values()) {
      for (const row of rows) {
        if (pyStr(get(row, 'id')) === adsetId) {
          row.status = status;
          row.effective_status = status;
        }
      }
    }
    if (this.cacheProvider) {
      await this.cacheProvider.updateStatus({ accountId: normalizeAccountId(accountId ?? ''), adsetId, status });
    }
    this.log.info(`Successfully set adset ${adsetId} status to ${status}`);
    return true;
  }

  // Pause or start an ad.
  async setAdStatus(adId: string, accessToken: string, status: string, accountId: string | null = null): Promise<true> {
    void accountId;
    MetaClient.checkStatus(status);
    const response = await this.request('POST', `${this.baseUrl}/${adId}`, {
      data: [['status', status], ['access_token', accessToken]],
      accountId: adId,
      priority: 'critical',
    });
    this.confirmWrite(response, `Failed to set ad ${adId} status`);
    this.log.info(`Successfully set ad ${adId} status to ${status}`);
    return true;
  }

  // Pause or start a campaign; its ad sets follow, so the cached inventory goes.
  async setCampaignStatus(campaignId: string, accessToken: string, status: string, accountId: string | null = null): Promise<true> {
    MetaClient.checkStatus(status);
    const response = await this.request('POST', `${this.baseUrl}/${campaignId}`, {
      data: [['status', status], ['access_token', accessToken]],
      accountId: campaignId,
      priority: 'critical',
    });
    this.confirmWrite(response, `Failed to set campaign ${campaignId} status`);
    const account = normalizeAccountId(accountId ?? '');
    if (this.cacheProvider && account) await this.cacheProvider.invalidate(account);
    this.inventoryCache.delete(account);
    this.log.info(`Successfully set campaign ${campaignId} status to ${status}`);
    return true;
  }

  // Delivery state written at the entity's own level.
  async setEntityStatus(entityId: string, accessToken: string, status: string, entityLevel: string = 'adset', accountId: string | null = null): Promise<true> {
    if (entityLevel === 'campaign') return this.setCampaignStatus(entityId, accessToken, status, accountId);
    if (entityLevel === 'ad') return this.setAdStatus(entityId, accessToken, status, accountId);
    return this.setAdsetStatus(entityId, accessToken, status, accountId);
  }

  // The daily budget, on the campaign (budget optimization) or the ad set;
  // an ad has none and is refused before any request.
  async updateEntityBudget(
    entityId: string,
    accessToken: string,
    newDailyBudget: number,
    currency = 'UNKNOWN',
    entityLevel: string = 'adset',
    accountId: string | null = null,
  ): Promise<true> {
    const level = entityLevel === 'campaign' || entityLevel === 'adset' ? entityLevel : 'adset';
    if (entityLevel === 'ad') throw new MetaValueError('An ad has no budget of its own.');
    const units = toMetaBudgetUnits(newDailyBudget, currency);
    const response = await this.request('POST', `${this.baseUrl}/${entityId}`, {
      data: [['daily_budget', String(units)], ['access_token', accessToken]],
      accountId: entityId,
      priority: 'critical',
    });
    this.confirmWrite(response, `Failed to update ${level} ${entityId} budget`);
    for (const [, rows] of this.inventoryCache.values()) {
      for (const row of rows) if (pyStr(get(row, 'id')) === entityId) row.daily_budget = String(units);
    }
    const account = normalizeAccountId(accountId ?? '');
    if (this.cacheProvider && account) await this.cacheProvider.invalidate(account);
    this.log.info(`Successfully updated ${level} ${entityId} daily budget to ${Number(newDailyBudget).toFixed(2)} ${normalizeCurrency(currency)}`);
    return true;
  }

  // The ad-set-only budget write some callers use.
  async updateAdsetBudget(adsetId: string, accessToken: string, newDailyBudget: number, currency = 'UNKNOWN', accountId: string | null = null): Promise<true> {
    return this.updateEntityBudget(adsetId, accessToken, newDailyBudget, currency, 'adset', accountId);
  }

  async invalidateInventoryCache(accountId: string): Promise<void> {
    const account = normalizeAccountId(accountId);
    if (!account) return;
    this.inventoryCache.delete(account);
    if (this.cacheProvider) await this.cacheProvider.invalidate(account);
  }
}

// A fact's figures and their ratios, as metric_fact and the account fact compute them.
function ratios(n: {
  spend: number; impressions: number; reach: number; frequency: number; cpm: number; clicks: number; unique_clicks: number;
  link_clicks: number; outbound_clicks: number; landing_page_views: number; leads: number; registrations: number; purchases: number;
}): Json {
  const { spend, impressions, clicks, link_clicks: link, outbound_clicks: outbound, landing_page_views: views, leads, registrations, purchases } = n;
  return {
    spend,
    impressions,
    reach: n.reach,
    frequency: n.frequency,
    cpm: n.cpm,
    clicks,
    unique_clicks: n.unique_clicks,
    link_clicks: link,
    outbound_clicks: outbound,
    landing_page_views: views,
    cpc: clicks > 0 ? spend / clicks : 0,
    cpc_link: link > 0 ? spend / link : null,
    ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
    ctr_link: impressions > 0 ? (link / impressions) * 100 : null,
    ctr_outbound: impressions > 0 ? (outbound / impressions) * 100 : null,
    leads,
    registrations,
    purchases,
    cost_per_lead: leads > 0 ? spend / leads : null,
    cost_per_registration: registrations > 0 ? spend / registrations : null,
    cost_per_purchase: purchases > 0 ? spend / purchases : null,
    cost_per_landing_page_view: views > 0 ? spend / views : null,
  };
}
