import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MetaClient } from '../../src/meta/client.ts';
import { MetaApiError } from '../../src/meta/errors.ts';

// The port against the running fake Meta (scripts/fake_meta.py under
// uvicorn, as compose.dev.yaml runs it): reads at every level, then writes
// that change what the fake Meta reports and are put back. Python with
// requirements.txt runs in CI; elsewhere set PYTHON, or the test is skipped.

const REPO = join(import.meta.dirname, '../../..');
const PYTHON = process.env.PYTHON ?? 'python3';
const PORT = 18093;
const ACCOUNT = 'act_1000000000000001';
const ADSET = '1202100000000002';

let server: ChildProcess | undefined;
let available = false;

beforeAll(async () => {
  server = spawn(PYTHON, ['-m', 'uvicorn', 'scripts.fake_meta:app', '--host', '127.0.0.1', '--port', String(PORT)], {
    cwd: REPO,
    env: { ...process.env, PYTHONPATH: REPO, FAKE_META_STATE: join(mkdtempSync(join(tmpdir(), 'fake-meta-')), 'state.json') },
    stdio: 'ignore',
  });
  server.on('error', () => undefined);
  for (let attempt = 0; attempt < 100 && server.exitCode === null; attempt += 1) {
    try {
      if ((await fetch(`http://127.0.0.1:${PORT}/health`)).ok) {
        available = true;
        break;
      }
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (!available && process.env.CI) throw new Error('the fake Meta did not start');
}, 20_000);

afterAll(() => {
  server?.kill();
});

const client = () =>
  new MetaClient({ graphVersion: 'v26.0', baseUrl: `http://127.0.0.1:${PORT}`, appSecret: 'fake-secret', sleep: async () => undefined });

describe('the Meta client against the fake Meta', () => {
  it('reads an ad account at every level', async ({ skip }) => {
    if (!available) skip();
    const meta = client();
    const account = await meta.getAccountInfo(ACCOUNT, 'any-token');
    expect(account).toMatchObject({ id: ACCOUNT, currency: 'EUR', timezone_name: 'Europe/Amsterdam', status_label: 'Active (ACTIVE)' });

    const facts = await meta.getHierarchicalInsights(ACCOUNT, 'any-token', { currency: 'EUR', accountName: 'NL' });
    const levels = new Set(facts.map((fact) => fact.entity_level));
    expect([...levels].sort()).toEqual(['account', 'ad', 'adset', 'campaign']);
    const accountFact = facts.find((fact) => fact.entity_level === 'account')!;
    const campaignSpend = facts.filter((fact) => fact.entity_level === 'campaign').reduce((sum, fact) => sum + (fact.spend as number), 0);
    // A campaign's numbers are the sums of its ads in the fake Meta, the account's of its campaigns.
    expect(campaignSpend).toBeCloseTo(accountFact.spend as number, 1);

    const adsets = await meta.getAdsetsInsights(ACCOUNT, 'any-token', 'maximum', 'EUR');
    expect(adsets.find((row) => row.adset_id === ADSET)).toMatchObject({ daily_budget: 150, currency: 'EUR' });
    // More ad sets than one page of the fake Meta's 25: pagination followed.
    const ads = await meta.getAdsInsights(ACCOUNT, 'any-token', 'maximum', 'EUR');
    expect(ads.length).toBeGreaterThan(0);
    expect((await meta.getCampaignsInventory(ACCOUNT, 'any-token')).length).toBeGreaterThan(0);
  });

  it('writes status and budget, and Meta reports them', async ({ skip }) => {
    if (!available) skip();
    const meta = client();
    await meta.setAdsetStatus(ADSET, 'any-token', 'PAUSED', ACCOUNT);
    expect(await meta.getEntityState(ADSET, 'any-token', 'adset', 'EUR')).toMatchObject({ status: 'PAUSED', daily_budget: 150 });
    await meta.updateEntityBudget(ADSET, 'any-token', 151.25, 'EUR', 'adset', ACCOUNT);
    expect(await meta.getAdsetState(ADSET, 'any-token', 'EUR')).toMatchObject({ daily_budget: 151.25 });

    await meta.updateEntityBudget(ADSET, 'any-token', 150, 'EUR', 'adset', ACCOUNT);
    await meta.setEntityStatus(ADSET, 'any-token', 'ACTIVE', 'adset', ACCOUNT);
    expect(await meta.getAdsetState(ADSET, 'any-token', 'EUR')).toMatchObject({ status: 'ACTIVE', daily_budget: 150 });
  });

  it('maps the fake Meta errors', async ({ skip }) => {
    if (!available) skip();
    await expect(client().getAccountInfo('act_404', 'any-token')).rejects.toThrow(MetaApiError);
    // An ad has no budget of its own: refused before any request.
    await expect(client().updateEntityBudget('1', 'any-token', 10, 'EUR', 'ad')).rejects.toThrow('An ad has no budget of its own.');
  });
});
