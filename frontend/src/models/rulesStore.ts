import { reaction } from 'mobx';
import { ApiError } from '@/lib/api';
import type { MetaAccount } from '@/lib/types';
import { eligibleMetaAccounts } from '@/components/campaigns/liveCampaigns';
import type { AdsManagerMetrics } from '@/components/campaigns/adsManagerMetrics';
import {
  ACCOUNT_SCOPE,
  assignRuleToAccount,
  attachedRuleScope,
  detachRuleFromAccount,
  setAttachedRuleScope,
  changePresetsLabels,
  createRuleLabel as createRuleLabelRequest,
  createRulePreset,
  deleteRuleLabel as deleteRuleLabelRequest,
  deleteRulePreset,
  formatAction,
  formatCondition,
  formatRelativeTime,
  formatScope,
  presetToWriteRequest,
  randomLabelColor,
  ruleCurrency,
  setPresetLabels,
  updateRuleLabel as updateRuleLabelRequest,
  updateRulePreset,
} from '@/lib/rules';
import type {
  RuleAction,
  RuleLabelPayload,
  RuleLabelWriteRequest,
  RulePresetPayload,
  RulePresetWriteRequest,
  RuleScope,
} from '@/lib/rules';
import { pushHistory } from '@/lib/undoHistory';
import { pool, type Query } from './pool';
import { adAccountsQuery, fetchAccounts, presetsQuery, ruleLabelsQuery } from './queries';
import { OUT_OF_SCOPE, scopeStore } from './scopeStore';
import { selectionStore } from './selectionStore';
import { makeStore, useStore } from './store';
import { viewStore } from './viewStore';

/** What Rules shows, read through the pool. */
const RULE_QUERIES: readonly Query<any>[] = [presetsQuery, ruleLabelsQuery, adAccountsQuery];

export interface CampaignItem {
  id: string;
  /** The Meta ad account it belongs to (`act_…`). */
  accountId?: string;
  /** That ad account's name, for the Ad account column. */
  accountName?: string;
  identifier: string;
  name: string;
  platform: 'Meta' | 'TikTok' | 'Google';
  status: 'active' | 'paused' | 'unknown';
  statusLabel: string;
  /** Meta's `effective_status`: whether it is really delivering, and why not. */
  effectiveStatus?: string;
  budget: string;
  leadsCount: number;
  cpa: string;
  spend: string;
  roi: string;
  date: string;
  groupIds: string[];
  /** Every figure for the period Ads Manager shows, as numbers (#389). */
  metrics?: AdsManagerMetrics;
  currency?: string;
}

export interface AdSetItem {
  id: string;
  /** The Meta ad account it belongs to (`act_…`). */
  accountId?: string;
  /** That ad account's name, for the Ad account column. */
  accountName?: string;
  identifier: string;
  name: string;
  campaignId: string;
  campaignName: string;
  platform: 'Meta' | 'TikTok' | 'Google';
  status: 'active' | 'paused' | 'unknown';
  statusLabel: string;
  /** Meta's `effective_status`: whether it is really delivering, and why not. */
  effectiveStatus?: string;
  budget: string;
  leadsCount: number;
  cpa: string;
  spend: string;
  roi: string;
  audience: string;
  date: string;
  metrics?: AdsManagerMetrics;
  currency?: string;
}

export interface AdItem {
  id: string;
  /** The Meta ad account it belongs to (`act_…`). */
  accountId?: string;
  /** That ad account's name, for the Ad account column. */
  accountName?: string;
  identifier: string;
  name: string;
  adSetId: string;
  adSetName: string;
  /** Empty when the ad's ad set is not in the inventory. */
  campaignId?: string;
  campaignName: string;
  platform: 'Meta' | 'TikTok' | 'Google';
  status: 'active' | 'paused' | 'unknown';
  statusLabel: string;
  /** Meta's `effective_status`: whether it is really delivering, and why not. */
  effectiveStatus?: string;
  leadsCount: number;
  cpa: string;
  spend: string;
  ctr: string;
  cpc: string;
  date: string;
  metrics?: AdsManagerMetrics;
  currency?: string;
}

/**
 * View model for one rule preset. Display strings are derived once here from
 * the API payload, which stays attached so an edit can round-trip every field
 * the write endpoint requires.
 */
export interface RuleItem {
  id: string;
  presetId: number;
  identifier: string;
  name: string;
  condition: string;
  action: string;
  /** Raw action, so styling never has to sniff the display label. */
  actionKind: RuleAction;
  scope?: string;
  status: 'active' | 'paused';
  /** Last action, relative ("3h ago"); "Never" when the rule never acted. */
  lastRun: string;
  /** Last check, matched or not; "Never" before the worker checked it. */
  lastCheck: string;
  /** The rule's labels (#383); a rule can carry several, or none. */
  labelIds: string[];
  /** Set when the runtime holds the rule back until it is re-saved. */
  needsReview: boolean;
  reviewReason: string;
  preset: RulePresetPayload;
}

/** A rule label, as Linear's issue labels (#383). */
export interface RuleLabel {
  id: string;
  name: string;
  color: string;
  description: string;
  ruleCount: number;
  /** ISO time it was last put on a rule; empty when never. */
  lastAppliedAt: string;
  createdAt: string;
}

export type RulesLoadState = 'idle' | 'loading' | 'ready' | 'error';

/** A buyer-managed bucket used only to organize campaigns in the campaign view. */
export interface CampaignGroup {
  id: string;
  name: string;
  color: string;
  accentColor: string;
}

export interface RulesEnabledOutcome {
  changed: string[];
  unchanged: string[];
  skipped: string[];
  failed: { id: string; error: string }[];
}

function presetToRuleItem(
  preset: RulePresetPayload,
  accounts: MetaAccount[],
): RuleItem {
  return {
    id: String(preset.id),
    presetId: preset.id,
    identifier: `RUL-${String(preset.id).padStart(2, '0')}`,
    name: preset.name,
    condition: formatCondition(preset, ruleCurrency(preset, accounts)),
    action: formatAction(preset),
    actionKind: preset.action,
    scope: formatScope(preset),
    status: preset.enabled ? 'active' : 'paused',
    lastRun: formatRelativeTime(preset.last_run_at),
    lastCheck: formatRelativeTime(preset.last_checked_at ?? ''),
    labelIds: (preset.label_ids ?? []).map(String),
    needsReview: preset.needs_review,
    reviewReason: preset.review_reason,
    preset,
  };
}

function toRuleLabel(label: RuleLabelPayload): RuleLabel {
  return {
    id: String(label.id),
    name: label.name,
    color: label.color,
    description: label.description,
    ruleCount: label.rule_count,
    lastAppliedAt: label.last_applied_at,
    createdAt: label.created_at,
  };
}

function requestErrorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return 'Could not reach the server. Please try again.';
}

/**
 * Entity id → rule ids aimed at it, for one scope level. Account-wide rules are
 * deliberately absent: they run on everything, so listing them per entity would
 * read as a targeted attachment the buyer never made.
 */
function entityRuleIndex(
  scopes: Record<string, RuleScope>,
  level: 'campaign' | 'adset',
): Record<string, string[]> {
  const index: Record<string, string[]> = {};
  for (const [ruleId, scope] of Object.entries(scopes)) {
    if (scope.level !== level) continue;
    for (const entityId of scope.ids) {
      (index[entityId] ??= []).push(ruleId);
    }
  }
  return index;
}

/** The per-entity indexes of several ad accounts in one: Meta ids never repeat across accounts. */
function mergeRuleIndexes(
  scopes: Record<string, RuleScope>[],
  level: 'campaign' | 'adset',
): Record<string, string[]> {
  return Object.assign({}, ...scopes.map((accountScopes) => entityRuleIndex(accountScopes, level)));
}

const sameIds = (left: string[], right: string[]) =>
  left.length === right.length && left.every((id, index) => id === right[index]);

const byName = (a: RuleLabel, b: RuleLabel) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });

/**
 * The workspace's rules and labels as Rules shows them, read through the
 * model pool (#488), and the rules attached to the ad accounts Ads Manager
 * shows; with the writes that change them.
 */
export class RulesStore {
  // Campaigns / Ads Manager
  campaigns: CampaignItem[] = [];
  campaignGroups: CampaignGroup[] = [];
  adSets: AdSetItem[] = [];
  ads: AdItem[] = [];
  /** Ad accounts whose rule attachments are currently loaded: every one Ads Manager shows. */
  attachedRulesAccountIds: string[] = [];
  /** Ad account → rule id → the scope it is attached with on that account. */
  attachedRuleScopes: Record<string, Record<string, RuleScope>> = {};
  /** Ad account → attached rule ids in its stored order, which breaks ties between rules. */
  attachedRuleOrder: Record<string, string[]> = {};
  /** Campaign id → rules aimed at that campaign, derived from the scopes; Meta ids are unique across accounts. */
  campaignAttachedRules: Record<string, string[]> = {};
  /** Ad set id → rules aimed at that ad set. */
  adSetAttachedRules: Record<string, string[]> = {};
  attachmentError = '';
  attachmentsLoadState: RulesLoadState = 'idle';

  // Rules (served by /api/presets and /api/rule-labels)
  rules: RuleItem[] = [];
  /** The workspace's rule labels, by name. */
  ruleLabels: RuleLabel[] = [];
  /** Ad accounts a rule can be attached to, loaded with the rules. */
  ruleAccounts: MetaAccount[] = [];
  rulesLoadState: RulesLoadState = 'idle';
  rulesError = '';
  /** Last failed write, surfaced next to the list without discarding it. */
  rulesMutationError = '';

  #rulesRequest = 0;
  #attachmentsRequest = 0;
  /** A rule change is being written and read back; the next one waits for it. */
  #attachmentWriting = false;
  /** The pool's answers the rules on screen were made from. */
  #shownFrom: unknown[] = [];
  /** Rules reads under way: their three answers are shown together once all are in, never one by one. */
  #rulesReading = 0;

  constructor() {
    makeStore(this);
    scopeStore.onWorkspaceChange(() => {
      this.#rulesRequest += 1;
      this.#attachmentsRequest += 1;
      this.set({
        ...this.emptyAccountState(),
        campaignGroups: [],
        rules: [], ruleLabels: [], ruleAccounts: [], rulesLoadState: 'idle',
        rulesError: '', rulesMutationError: '',
      });
      selectionStore.resetAccount();
      viewStore.resetAccount();
    });
    // A change in the pool (a write elsewhere, a read behind a page) reaches the rules already shown.
    reaction(
      () => RULE_QUERIES.map((query) => pool.result(query.key).data),
      () => {
        if (this.#rulesReading === 0 && this.rulesLoadState === 'ready') this.showPooledRules();
      },
    );
  }

  clearAttachmentError() {
    this.attachmentError = '';
  }

  clearRulesMutationError() {
    this.rulesMutationError = '';
  }

  toggleCampaignGroup(id: string, groupId: string) {
    this.campaigns = this.campaigns.map((c) =>
      c.id === id
        ? {
            ...c,
            groupIds: c.groupIds.includes(groupId)
              ? c.groupIds.filter((item) => item !== groupId)
              : [...c.groupIds, groupId],
          }
        : c
    );
  }

  /** `accounts`: ones just read by the `accounts` query, so their `active_rules` need no second read. */
  async loadRuleAttachments(accountIds: string[], loadedAccounts?: MetaAccount[]) {
    const inScope = scopeStore.captureScope();
    if (!inScope()) return;
    const request = ++this.#attachmentsRequest;
    const current = () => inScope() && request === this.#attachmentsRequest;
    const sameAccounts = sameIds(this.attachedRulesAccountIds, accountIds);
    // Invalidate other accounts before awaiting anything, including a failed read.
    // Reading the same accounts back after a change keeps the cells as they are
    // until the answer comes, so they never flash back to no rules.
    const refresh = accountIds.length > 0 && sameAccounts && this.attachmentsLoadState === 'ready';
    if (!refresh) {
      if (!sameAccounts) {
        selectionStore.resetAccount();
        viewStore.resetAccount();
      }
      this.set({ ...(sameAccounts ? {} : this.emptyAccountState()),
        attachedRulesAccountIds: accountIds, attachedRuleScopes: {}, attachedRuleOrder: {}, campaignAttachedRules: {},
        adSetAttachedRules: {}, attachmentError: '',
        attachmentsLoadState: accountIds.length > 0 ? 'loading' : 'idle' });
    }
    if (accountIds.length === 0) return;
    try {
      const accounts = loadedAccounts ?? await fetchAccounts();
      if (!current()) return;
      const scopes: Record<string, Record<string, RuleScope>> = {};
      const order: Record<string, string[]> = {};
      for (const accountId of accountIds) {
        const account = accounts.find((item) => item.account_id === accountId);
        if (!account) throw new Error('Account unavailable');
        scopes[accountId] = Object.fromEntries(
          (account.active_rules ?? []).map((rule) => [String(rule.preset_id), attachedRuleScope(rule)]),
        );
        order[accountId] = (account.active_rules ?? []).map((rule) => String(rule.preset_id));
      }
      this.set({
        attachedRuleScopes: scopes,
        attachedRuleOrder: order,
        campaignAttachedRules: mergeRuleIndexes(Object.values(scopes), 'campaign'),
        adSetAttachedRules: mergeRuleIndexes(Object.values(scopes), 'adset'),
        attachmentsLoadState: 'ready',
      });
    } catch (error) {
      if (!current()) return;
      this.set({ attachedRuleScopes: {}, attachedRuleOrder: {}, campaignAttachedRules: {}, adSetAttachedRules: {},
        attachmentError: requestErrorMessage(error), attachmentsLoadState: 'error' });
    }
  }

  /**
   * Aims a rule at these campaigns or ad sets of one ad account, or takes it
   * off them when it already targets every one of them, as a multi-select
   * picker does.
   */
  async toggleRuleForEntities(accountId: string, level: 'campaign' | 'adset', entityIds: string[], ruleId: string) {
    const inScope = scopeStore.captureScope();
    const request = this.#attachmentsRequest;
    const current = () => inScope() && request === this.#attachmentsRequest;
    if (!current() || this.#attachmentWriting || this.attachmentsLoadState !== 'ready' || entityIds.length === 0) return;
    const { attachedRulesAccountIds, attachedRuleScopes } = this;
    if (!attachedRulesAccountIds.includes(accountId)) return;

    const presetId = Number(ruleId);
    const scope = attachedRuleScopes[accountId]?.[ruleId];

    // A rule already aimed somewhere else has a target this control cannot
    // express. Silently rewriting it would widen or destroy what the buyer set.
    if (scope && scope.level !== level) {
      this.set({
        attachmentError:
          scope.level === 'account'
            ? 'This rule runs on the whole ad account. Change its scope on the Rules screen.'
            : scope.level === 'campaign'
            ? 'This rule targets individual campaigns. Detach it there, or change its scope on the Rules screen.'
            : 'This rule targets individual ad sets. Detach it there, or change its scope on the Rules screen.',
      });
      return;
    }

    this.set({ attachmentError: '' });
    this.#attachmentWriting = true;
    try {
      if (!scope) {
        await assignRuleToAccount(accountId, presetId, {
          level,
          ids: entityIds,
        });
      } else {
        const nextIds = entityIds.every((id) => scope.ids.includes(id))
          ? scope.ids.filter((id) => !entityIds.includes(id))
          : [...scope.ids, ...entityIds.filter((id) => !scope.ids.includes(id))];
        if (nextIds.length === 0) {
          // A targeted rule with nothing left to target has no work to do.
          await detachRuleFromAccount(accountId, presetId);
        } else {
          await setAttachedRuleScope(accountId, presetId, {
            level,
            ids: nextIds,
          });
        }
      }
      if (!current()) return;
      // The Rules screen's per-account notes read the same attachments.
      if (this.rulesLoadState === 'ready') void this.loadRules();
      await this.loadRuleAttachments(attachedRulesAccountIds);
    } catch (error) {
      if (!current()) return;
      this.set({ attachmentError: requestErrorMessage(error) });
    } finally {
      this.#attachmentWriting = false;
    }
  }

  /**
   * Reads the rules, their labels and ad accounts again. `ifStale`, for a page
   * visit: what the pool holds shows at once and is read again only when stale (#488).
   */
  async loadRules({ ifStale = false }: { ifStale?: boolean } = {}) {
    const inScope = scopeStore.captureScope();
    if (!inScope()) return;
    const request = ++this.#rulesRequest;
    const current = () => inScope() && request === this.#rulesRequest;
    if (ifStale && this.showPooledRules()) {
      // Held: drawn already; read again behind the page only once stale, and shown by the reaction.
      for (const query of RULE_QUERIES) pool.ensure(query);
      return;
    }
    // A refresh after a mutation keeps the loaded list on screen; only the
    // first load of a workspace shows the loading state.
    if (this.rulesLoadState !== 'ready') this.set({ rulesLoadState: 'loading', rulesError: '' });
    // Ad accounts are needed to offer "run on this ad account"; a failure there must not hide the rules.
    this.#rulesReading += 1;
    await Promise.all(RULE_QUERIES.map((query) => pool.fetch(query, { afterWrite: true })));
    this.#rulesReading -= 1;
    if (!current()) return;
    if (!this.showPooledRules()) {
      const error = pool.result(presetsQuery.key).error || pool.result(ruleLabelsQuery.key).error;
      this.set({ rulesError: error || 'Something went wrong. Please try again.', rulesLoadState: 'error' });
    }
  }

  async toggleRuleStatus(id: string) {
    const current = scopeStore.captureScope();
    if (!current()) return;
    const rule = this.rules.find((item) => item.id === id);
    if (!rule) return;
    // A rule the runtime holds back cannot be switched on from the list; the
    // conditions have to be re-saved first.
    if (rule.needsReview && rule.status === 'paused') {
      this.set({
        rulesMutationError:
          rule.reviewReason || 'This rule must be re-saved before it can be enabled.',
      });
      return;
    }
    const enabled = rule.status === 'paused';
    this.set({ rulesMutationError: '' });
    try {
      await updateRulePreset(
        rule.presetId,
        presetToWriteRequest(rule.preset, { enabled }),
      );
      if (!current()) return;
      await this.loadRules();
      if (!current()) return;
      pushHistory({
        label: `${enabled ? 'resume' : 'pause'} ${rule.name}`,
        undo: () => applyRulesEnabled([id], !enabled),
        redo: () => applyRulesEnabled([id], enabled),
      });
    } catch (error) {
      if (!current()) return;
      this.set({ rulesMutationError: requestErrorMessage(error) });
    }
  }

  /** Enables or pauses each rule; rules held for review are never enabled. */
  async setRulesEnabled(ids: string[], enabled: boolean): Promise<RulesEnabledOutcome> {
    const current = scopeStore.captureScope();
    const outcome: RulesEnabledOutcome = { changed: [], unchanged: [], skipped: [], failed: [] };
    if (!current()) return outcome;
    this.set({ rulesMutationError: '' });
    for (const id of ids) {
      if (!current()) return outcome;
      const rule = this.rules.find((item) => item.id === id);
      if (!rule) continue;
      if ((rule.status !== 'paused') === enabled) {
        outcome.unchanged.push(id);
        continue;
      }
      // Same guard as the row toggle: a rule held back must be re-saved first.
      if (enabled && rule.needsReview) {
        outcome.skipped.push(id);
        continue;
      }
      try {
        await updateRulePreset(rule.presetId, presetToWriteRequest(rule.preset, { enabled }));
        outcome.changed.push(id);
      } catch (error) {
        if (!current()) return outcome;
        outcome.failed.push({ id, error: requestErrorMessage(error) });
      }
    }
    if (current() && outcome.changed.length > 0) await this.loadRules();
    return outcome;
  }

  /** Creates a rule; `payload.label_ids` puts labels on it in the same write. */
  async addRule(payload: RulePresetWriteRequest) {
    const current = scopeStore.captureScope();
    if (!current()) return;
    this.set({ rulesMutationError: '' });
    try {
      await createRulePreset(payload);
      if (!current()) return;
      await this.loadRules();
      await this.refreshAttachments(payload);
    } catch (error) {
      if (!current()) return;
      this.set({ rulesMutationError: requestErrorMessage(error) });
      throw error;
    }
  }

  /** Creates a label (a random palette color unless one is given); throws on failure. */
  async createRuleLabel(name: string, color?: string, description?: string): Promise<RuleLabel> {
    const current = scopeStore.captureScope();
    if (!current()) throw new Error(OUT_OF_SCOPE);
    const created = toRuleLabel(
      await createRuleLabelRequest({ name, color: color ?? randomLabelColor(), description: description ?? '' }),
    );
    if (current()) this.set({ ruleLabels: [...this.ruleLabels, created].sort(byName) });
    return created;
  }

  /** Renames, recolors or redescribes a label; throws on failure. */
  async updateRuleLabel(id: string, patch: RuleLabelWriteRequest) {
    const current = scopeStore.captureScope();
    if (!current()) throw new Error(OUT_OF_SCOPE);
    const updated = toRuleLabel(await updateRuleLabelRequest(Number(id), patch));
    if (!current()) return;
    this.set({ ruleLabels: this.ruleLabels.map((label) => (label.id === id ? updated : label)).sort(byName) });
  }

  /** Deletes without asking and returns its Recently deleted entry; throws on failure. */
  async deleteRuleLabel(id: string): Promise<number> {
    const current = scopeStore.captureScope();
    if (!current()) throw new Error(OUT_OF_SCOPE);
    if (!this.ruleLabels.some((item) => item.id === id)) throw new Error('This label no longer exists.');
    const response = await deleteRuleLabelRequest(Number(id));
    return response.deleted_item_id;
  }

  /** A rule's whole set of labels; shown at once, saved in one write. */
  async setRuleLabels(ruleId: string, labelIds: string[]) {
    const current = scopeStore.captureScope();
    const rule = this.rules.find((item) => item.id === ruleId);
    if (!current() || !rule) return;
    const before = rule.labelIds;
    if (before.length === labelIds.length && before.every((id) => labelIds.includes(id))) return;
    // The row changes at once, as Linear's does; the write follows.
    const apply = async (ids: string[]) => {
      this.set({ rules: this.rules.map((item) => (item.id === ruleId ? { ...item, labelIds: ids } : item)) });
      try {
        await setPresetLabels(rule.presetId, ids.map(Number));
      } finally {
        if (current()) await this.loadRules();
      }
    };
    this.set({ rulesMutationError: '' });
    try {
      await apply(labelIds);
      if (!current()) return;
      pushHistory({
        label: `change labels of ${rule.name}`,
        undo: () => apply(before),
        redo: () => apply(labelIds),
      });
    } catch (error) {
      if (!current()) return;
      this.set({ rulesMutationError: requestErrorMessage(error) });
    }
  }

  /** Puts labels on, or takes them off, several rules at once. */
  async changeRulesLabels(ruleIds: string[], change: { add?: string[]; remove?: string[] }) {
    const current = scopeStore.captureScope();
    const rules = this.rules.filter((item) => ruleIds.includes(item.id));
    if (!current() || rules.length === 0) return;
    const add = change.add ?? [];
    const remove = change.remove ?? [];
    const before = new Map(rules.map((rule) => [rule.id, rule.labelIds]));
    const next = (ids: string[]) => [...ids.filter((id) => !remove.includes(id)), ...add.filter((id) => !ids.includes(id) && !remove.includes(id))];
    this.set({
      rulesMutationError: '',
      rules: this.rules.map((item) => (before.has(item.id) ? { ...item, labelIds: next(item.labelIds) } : item)),
    });
    try {
      await changePresetsLabels(rules.map((rule) => rule.presetId), { add: add.map(Number), remove: remove.map(Number) });
      if (!current()) return;
      await this.loadRules();
      if (!current()) return;
      // Undo puts back each rule's own labels, not the inverse change.
      const restore = async () => {
        await Promise.all(rules.map((rule) => setPresetLabels(rule.presetId, (before.get(rule.id) ?? []).map(Number))));
        if (current()) await this.loadRules();
      };
      pushHistory({
        label: `change labels of ${rules.length === 1 ? rules[0].name : `${rules.length} rules`}`,
        undo: restore,
        redo: async () => {
          await changePresetsLabels(rules.map((rule) => rule.presetId), { add: add.map(Number), remove: remove.map(Number) });
          if (current()) await this.loadRules();
        },
      });
    } catch (error) {
      if (!current()) return;
      this.set({ rulesMutationError: requestErrorMessage(error) });
      await this.loadRules();
    }
  }

  async deleteRule(id: string): Promise<number> {
    const current = scopeStore.captureScope();
    if (!current()) throw new Error(OUT_OF_SCOPE);
    if (!this.rules.some((item) => item.id === id)) throw new Error('This rule no longer exists.');
    const response = await deleteRulePreset(Number(id));
    if (current()) selectionStore.forgetRule(id);
    return response.deleted_item_id;
  }

  async updateRule(ruleId: string, payload: RulePresetWriteRequest) {
    const current = scopeStore.captureScope();
    if (!current() || !(this.rules.some(item => item.id === ruleId))) return;
    this.set({ rulesMutationError: '' });
    try {
      await updateRulePreset(Number(ruleId), payload);
      if (!current()) return;
      await this.loadRules();
      await this.refreshAttachments(payload);
    } catch (error) {
      if (!current()) return;
      this.set({ rulesMutationError: requestErrorMessage(error) });
      throw error;
    }
  }

  /** Attach the rule to a whole ad account, or detach it from one. */
  async toggleRuleOnAccount(ruleId: string, accountId: string) {
    const current = scopeStore.captureScope();
    if (!current() || !(this.ruleAccounts.some(item => item.account_id === accountId))) return;
    const rule = this.rules.find((item) => item.id === ruleId);
    if (!rule) return;
    this.set({ rulesMutationError: '' });
    try {
      if (rule.preset.attached_account_ids.includes(accountId)) {
        await detachRuleFromAccount(accountId, rule.presetId);
      } else {
        // Attaching from the rules list means the whole ad account; narrowing
        // to campaigns happens in Ads Manager.
        await assignRuleToAccount(accountId, rule.presetId, ACCOUNT_SCOPE);
      }
      if (!current()) return;
      await this.loadRules();
    } catch (error) {
      if (!current()) return;
      this.set({ rulesMutationError: requestErrorMessage(error) });
    }
  }

  /** A rule saved with where it runs changes the Rules column Ads Manager shows (#387). */
  private async refreshAttachments(payload: RulePresetWriteRequest) {
    const accountIds = this.attachedRulesAccountIds;
    if (payload.attachments !== undefined && accountIds.length > 0) await this.loadRuleAttachments(accountIds);
  }

  /** The pool's rules as the store shows them; false while the pool holds none yet. */
  private showPooledRules(): boolean {
    const presets = pool.result<RulePresetPayload[]>(presetsQuery.key).data;
    const labels = pool.result<RuleLabelPayload[]>(ruleLabelsQuery.key).data;
    if (!presets || !labels) return false;
    const accounts = pool.result<MetaAccount[]>(adAccountsQuery.key).data;
    const from = [presets, labels, accounts];
    if (this.rulesLoadState === 'ready' && from.every((value, index) => value === this.#shownFrom[index])) return true;
    this.#shownFrom = from;
    const ruleAccounts = eligibleMetaAccounts(accounts ?? []);
    this.set({
      rules: presets.map((preset) => presetToRuleItem(preset, ruleAccounts)),
      ruleLabels: labels.map(toRuleLabel),
      ruleAccounts,
      rulesLoadState: 'ready',
      rulesError: '',
    });
    return true;
  }

  /** What Ads Manager's rule attachments forget when it shows other ad accounts. */
  private emptyAccountState(): Partial<RulesStore> {
    return {
      campaigns: [], adSets: [], ads: [],
      attachedRulesAccountIds: [], attachedRuleScopes: {}, attachedRuleOrder: {}, campaignAttachedRules: {},
      adSetAttachedRules: {}, attachmentError: '', attachmentsLoadState: 'idle',
    };
  }

  private set(patch: Partial<RulesStore>) {
    Object.assign(this, patch);
  }
}

export const rulesStore = new RulesStore();

export const useRulesStore = <T,>(select: (store: RulesStore) => T): T => useStore(rulesStore, select);

/**
 * Switches rules on or off for undo and redo, and throws unless every one of
 * them is confirmed in the requested state — a rule deleted since, or held for
 * review, is a failure here rather than a silent skip.
 */
export async function applyRulesEnabled(ids: string[], enabled: boolean): Promise<void> {
  const outcome = await rulesStore.setRulesEnabled(ids, enabled);
  if (outcome.failed.length > 0) throw new Error(outcome.failed[0].error);
  if (outcome.skipped.length > 0) {
    throw new Error('A rule held for review must be re-saved before it can be switched on.');
  }
  if (outcome.changed.length + outcome.unchanged.length < ids.length) {
    throw new Error('Some of these rules no longer exist.');
  }
}
