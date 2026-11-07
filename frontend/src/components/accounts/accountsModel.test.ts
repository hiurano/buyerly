// The pure Ad accounts model (#388).
import { describe, expect, it } from 'vitest';
import { applyFilterClauses } from '@/components/filters/filterModel';
import { routeAt, pathForTab } from '@/lib/routing';
import {
  ACCOUNTS_VIEW_DEFAULTS, accountName, accountStatus, connectionProblem, sortAccounts, accountGroupsFor,
  createAccountFilterFields, naturalAccountDirection, formatAddedDate, accountPagePath, accountAdsManagerPath,
} from './accountsModel';

const account = (id: any, fields = {}) => ({
  id, account_id: `act_${id}`, name: `Meta ${id}`, custom_name: '', note: '', connection_type: 'facebook_login',
  account_status: 1, status_label: 'Active (ACTIVE)', rules_enabled: false, is_active: true, active_rules: [],
  currency: 'USD', created_at: '2026-10-01 10:00', today_metrics: null,
  health: { status: 'healthy', cause: 'none', consecutive_failures: 0, last_success_at: null, last_error_at: null, last_error_code: '', last_error_message: '', last_checked_at: null },
  ...fields,
});

const accounts = [
  account(1, { custom_name: 'Bravo', today_metrics: { spend: 50, leads: 2, registrations: 0, cpl: 25, cpreg: null } }),
  account(2, { name: 'alpha', account_status: 3, rules_enabled: true, active_rules: [{ preset_id: 7, name: 'Stop' }], created_at: '2026-10-05 08:00' }),
  account(3, { name: 'Charlie', account_status: 2, health: { status: 'critical', cause: 'user', last_error_message: 'Token expired' }, today_metrics: { spend: 300, leads: 0, registrations: 1, cpl: null, cpreg: 300 } }),
];

const teams = [{ id: 10, name: 'Media', account_ids: [1, 3] }];

// Ordering: names case-insensitively, spend largest first with no figure last, newest added first.
const ids = (list: any) => list.map((item: any) => item.id);

// Grouping by Lead, as Linear's Projects: each member who leads, then "No lead".
const leads = [{ user_id: 5, name: 'Bo Buyer' }, { user_id: 6, name: 'Ann Admin' }];

const led = accounts.map((account, index) => ({ ...account, lead_user_id: index === 0 ? 5 : null }));

// Filter: Status, Team, Lead, Automation, Name or ID.
const fields = createAccountFilterFields(accounts as never, teams);

describe('accounts model', () => {
  // Defaults: list, no grouping, Name A→Z, the columns a buyer needs, Lead as Linear's Projects.
  it('Defaults: list, no grouping, Name A→Z, the columns a buyer needs, Lead as Linear\'s Projects', () => {
    expect(ACCOUNTS_VIEW_DEFAULTS.grouping).toBe('none');
    expect(ACCOUNTS_VIEW_DEFAULTS.ordering).toBe('name');
    expect(Object.keys(ACCOUNTS_VIEW_DEFAULTS.properties)).toStrictEqual(['status', 'lead', 'spend', 'leads', 'rules']);
  });

  // The buyer's own name wins over Meta's; Meta's status reads in words.
  it('The buyer\'s own name wins over Meta\'s; Meta\'s status reads in words', () => {
    expect(accountName(accounts[0])).toBe('Bravo');
    expect(accountName(accounts[1])).toBe('alpha');
    expect(accountStatus(accounts[1]).label).toBe('Unsettled');
    expect(accountStatus(accounts[2]).label).toBe('Disabled');
    expect(accountStatus(account(9, { account_status: 999 })).label).toBe('Unknown');
  });

  // A connection problem only while the health is degraded or critical, or the connection is gone.
  it('A connection problem only while the health is degraded or critical, or the connection is gone', () => {
    expect(connectionProblem(accounts[0] as never)).toBe(null);
    expect(connectionProblem(accounts[2] as never)).toBe('Token expired');
    expect(connectionProblem(account(4, { health: { status: 'degraded', cause: 'meta', last_error_message: '' } }) as never)).toMatch(/Meta is not answering/);
    expect(connectionProblem(account(5, { status_label: 'Meta connection required', health: undefined }) as never)).toMatch(/Reconnect/);
  });

  // Ordering: names case-insensitively, spend largest first with no figure last, newest added first.
  it('Ordering: names case-insensitively, spend largest first with no figure last, newest added first', () => {
    expect(ids(sortAccounts(accounts as never, 'name', 'asc'))).toStrictEqual([2, 1, 3]);
    expect(ids(sortAccounts(accounts as never, 'name', 'desc'))).toStrictEqual([3, 1, 2]);
    expect(ids(sortAccounts(accounts as never, 'spend', 'desc'))).toStrictEqual([3, 1, 2]);
    expect(ids(sortAccounts(accounts as never, 'spend', 'asc')), 'no figure stays last').toStrictEqual([1, 3, 2]);
    expect(ids(sortAccounts(accounts as never, 'added', 'desc'))).toStrictEqual([2, 1, 3]);
    expect(ids(sortAccounts(accounts as never, 'status', 'asc')), 'Active, then payment issues, then Disabled').toStrictEqual([1, 2, 3]);
    expect(naturalAccountDirection('spend')).toBe('desc');
    expect(naturalAccountDirection('name')).toBe('asc');
  });

  // Grouping: every status and every team, with "No team" last.
  it('Grouping: every status and every team, with "No team" last', () => {
    const byTeam = accountGroupsFor('team', accounts as never, teams);
    expect(byTeam.map((group) => [group.label, ids(group.rows)])).toStrictEqual([['Media', [1, 3]], ['No team', [2]]]);
    const byStatus = accountGroupsFor('status', accounts as never, teams).filter((group) => group.rows.length);
    expect(byStatus.map((group) => group.label)).toStrictEqual(['Active', 'Unsettled', 'Disabled']);
    expect(accountGroupsFor('none', accounts as never, teams)).toStrictEqual([]);
  });

  // Grouping by Lead, as Linear's Projects: each member who leads, then "No lead".
  it('Grouping by Lead, as Linear\'s Projects: each member who leads, then "No lead"', () => {
    expect(accountGroupsFor('lead', led as never, teams, leads).map((group) => [group.label, ids(group.rows)])).toStrictEqual([['Bo Buyer', [led[0].id]], ['Ann Admin', []], ['No lead', led.slice(1).map((account) => account.id)]]);
  });

  // Filter: Status, Team, Lead, Automation, Name or ID.
  it('Filter: Status, Team, Lead, Automation, Name or ID', () => {
    expect(fields.map((field) => field.id)).toStrictEqual(['status', 'team', 'lead', 'automation', 'name']);
    const leadFields = createAccountFilterFields(led as never, teams, leads);
    expect(ids(applyFilterClauses(led as never, leadFields, [{ fieldId: 'lead', operator: 'is', values: ['5'] }]))).toStrictEqual([led[0].id]);
    expect(ids(applyFilterClauses(led as never, leadFields, [{ fieldId: 'lead', operator: 'is', values: ['none'] }]))).toStrictEqual(led.slice(1).map((account) => account.id));
    const filter = (clauses: any) => ids(applyFilterClauses(accounts as never, fields, clauses));
    expect(filter([{ fieldId: 'status', operator: 'is', values: ['active'] }])).toStrictEqual([1]);
    expect(filter([{ fieldId: 'team', operator: 'is', values: ['none'] }])).toStrictEqual([2]);
    expect(filter([{ fieldId: 'team', operator: 'is_not', values: ['10'] }])).toStrictEqual([2]);
    expect(filter([{ fieldId: 'automation', operator: 'is', values: ['on'] }])).toStrictEqual([2]);
    expect(filter([{ fieldId: 'name', operator: 'contains', values: ['ACT_3'] }])).toStrictEqual([3]);
    expect(filter([{ fieldId: 'name', operator: 'contains', values: ['brav'] }])).toStrictEqual([1]);
    expect(fields[0].options!.find((option) => option.value === 'active')!.count).toBe(1);
    expect(formatAddedDate('2026-10-05 08:00')).toBe('Oct 5, 2026');
    expect(formatAddedDate('')).toBe('—');
  });

  // Addresses: /accounts and /accounts/{act_id}; Ads Manager opens on the account.
  it('Addresses: /accounts and /accounts/{act_id}; Ads Manager opens on the account', () => {
    expect(accountPagePath('alpha', 'act_1')).toBe('/alpha/accounts/act_1');
    expect(accountAdsManagerPath('alpha', 'act_1')).toBe('/alpha/ads-manager/campaigns?account=act_1');
    expect(pathForTab('alpha', 'accounts')).toBe('/alpha/accounts');
    const at = (pathname: any) => routeAt({ pathname, search: '' });
    expect(at('/alpha/accounts')).toStrictEqual({ kind: 'workspace', workspace: 'alpha', tab: 'accounts' });
    expect(at('/alpha/accounts/act_1')).toStrictEqual({ kind: 'workspace', workspace: 'alpha', tab: 'accounts', recordId: 'act_1' });
    expect(at('/alpha/accounts/act_1/x').kind).toBe('unknown');
  });
});
