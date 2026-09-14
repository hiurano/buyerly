import { create } from 'zustand';
import type { FilterClause } from '@/components/filters/filterModel';
import { ApiError, apiRequest } from '@/lib/api';
import type { MetaAccount } from '@/lib/types';
import { eligibleMetaAccounts } from '@/components/campaigns/liveCampaigns';
import {
  ACCOUNT_SCOPE,
  assignRuleToAccount,
  attachedRuleScope,
  detachRuleFromAccount,
  setAttachedRuleScope,
  createRuleGroup,
  createRulePreset,
  deleteRuleGroup as deleteRuleGroupRequest,
  deleteRulePreset,
  fetchRuleGroups,
  fetchRulePresets,
  formatAction,
  formatCondition,
  formatRelativeTime,
  formatScope,
  presetToWriteRequest,
  updateRuleGroup,
  updateRulePreset,
} from '@/lib/rules';
import type {
  RuleAction,
  RuleGroupIcon,
  RuleGroupPayload,
  RulePresetPayload,
  RulePresetWriteRequest,
  RuleScope,
} from '@/lib/rules';

export interface CampaignItem {
  id: string;
  identifier: string;
  name: string;
  platform: 'Meta' | 'TikTok' | 'Google';
  status: 'active' | 'paused' | 'unknown';
  statusLabel: string;
  budget: string;
  leadsCount: number;
  cpa: string;
  spend: string;
  roi: string;
  date: string;
  groupIds: string[];
}

export interface AdSetItem {
  id: string;
  identifier: string;
  name: string;
  campaignId: string;
  campaignName: string;
  platform: 'Meta' | 'TikTok' | 'Google';
  status: 'active' | 'paused' | 'unknown';
  statusLabel: string;
  budget: string;
  leadsCount: number;
  cpa: string;
  spend: string;
  roi: string;
  audience: string;
  date: string;
}

export interface AdItem {
  id: string;
  identifier: string;
  name: string;
  adSetId: string;
  adSetName: string;
  campaignName: string;
  platform: 'Meta' | 'TikTok' | 'Google';
  status: 'active' | 'paused' | 'unknown';
  statusLabel: string;
  leadsCount: number;
  cpa: string;
  spend: string;
  ctr: string;
  cpc: string;
  date: string;
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
  lastRun: string;
  groupId?: string;
  /** Set when the runtime holds the rule back until it is re-saved. */
  needsReview: boolean;
  reviewReason: string;
  preset: RulePresetPayload;
}

export interface RuleGroup {
  id: string;
  name: string;
  /** Kept so a membership edit round-trips it instead of clearing it. */
  description: string;
  icon: RuleGroupIcon;
  ruleIds: string[];
}

export type RulesLoadState = 'idle' | 'loading' | 'ready' | 'error';

/** A buyer-managed bucket used only to organize campaigns in the campaign view. */
export interface CampaignGroup {
  id: string;
  name: string;
  color: string;
  accentColor: string;
}

export type AdsManagerEntity = 'campaigns' | 'adsets' | 'ads';
export interface AdsManagerQuickFilter {
  entity: AdsManagerEntity;
  sidebarTab: 'groups' | 'rules';
  fieldId: 'group' | 'rule';
  value: string;
}
export type AppTab = 'inbox' | 'campaigns' | 'rules' | 'statistics';
export type ActiveTab = AppTab | 'preferences';
export type InterfaceTheme = 'system' | 'light' | 'dark';

/**
 * A preset belongs to at most one group in the UI. The API models membership
 * as an ordered many-to-many, so the first group that lists the preset wins.
 */
function buildGroupIndex(groups: RuleGroupPayload[]): Map<number, string> {
  const index = new Map<number, string>();
  for (const group of groups) {
    for (const presetId of group.preset_ids) {
      if (!index.has(presetId)) index.set(presetId, String(group.id));
    }
  }
  return index;
}

function presetToRuleItem(
  preset: RulePresetPayload,
  groupIndex: Map<number, string>,
): RuleItem {
  return {
    id: String(preset.id),
    presetId: preset.id,
    identifier: `RUL-${String(preset.id).padStart(2, '0')}`,
    name: preset.name,
    condition: formatCondition(preset),
    action: formatAction(preset),
    actionKind: preset.action,
    scope: formatScope(preset),
    status: preset.enabled ? 'active' : 'paused',
    lastRun: formatRelativeTime(preset.last_run_at),
    groupId: groupIndex.get(preset.id),
    needsReview: preset.needs_review,
    reviewReason: preset.review_reason,
    preset,
  };
}

function groupToRuleGroup(group: RuleGroupPayload): RuleGroup {
  return {
    id: String(group.id),
    name: group.name,
    description: group.description,
    icon: group.icon,
    ruleIds: group.preset_ids.map(String),
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

interface AppState {
  isSearchOpen: boolean;
  setSearchOpen: (open: boolean) => void;
  workspaceName: string;
  setWorkspaceName: (name: string) => void;
  sidebarWidth: number;
  setSidebarWidth: (width: number) => void;
  isSidebarCollapsed: boolean;
  toggleSidebarCollapsed: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  resetSidebarWidth: () => void;
  activeTab: ActiveTab;
  lastAppTab: AppTab;
  setActiveTab: (tab: ActiveTab) => void;
  interfaceTheme: InterfaceTheme;
  setInterfaceTheme: (theme: InterfaceTheme) => void;

  // Campaigns / Ads Manager State
  campaigns: CampaignItem[];
  campaignGroups: CampaignGroup[];
  adSets: AdSetItem[];
  ads: AdItem[];
  campaignFilterTab: AdsManagerEntity;
  setCampaignFilterTab: (tab: AdsManagerEntity) => void;
  adsManagerFilters: Record<AdsManagerEntity, FilterClause[]>;
  setAdsManagerFilters: (entity: AdsManagerEntity, clauses: FilterClause[]) => void;
  clearAdsManagerFilters: (entity: AdsManagerEntity) => void;
  adsManagerQuickFilter: AdsManagerQuickFilter | null;
  setAdsManagerQuickFilter: (filter: AdsManagerQuickFilter | null) => void;
  clearAdsManagerQuickFilter: () => void;
  selectedCampaignIds: string[];
  toggleCampaignSelection: (id: string) => void;
  clearCampaignSelection: () => void;
  toggleCampaignDelivery: (id: string) => void;
  toggleCampaignGroup: (id: string, groupId: string) => void;
  toggleAdSetDelivery: (id: string) => void;
  toggleAdDelivery: (id: string) => void;
  focusedCampaignId: string;
  setFocusedCampaignId: (id: string) => void;
  /** Ad account whose rule attachments are currently loaded. */
  attachedRulesAccountId: string | null;
  /** Rule id → the scope it is attached with on that account. */
  attachedRuleScopes: Record<string, RuleScope>;
  /** Campaign id → rules aimed at that campaign, derived from the scopes. */
  campaignAttachedRules: Record<string, string[]>;
  /** Ad set id → rules aimed at that ad set. */
  adSetAttachedRules: Record<string, string[]>;
  attachmentError: string;
  clearAttachmentError: () => void;
  loadAccountRuleAttachments: (accountId: string | null) => Promise<void>;
  toggleRuleForEntity: (
    level: 'campaign' | 'adset',
    entityId: string,
    ruleId: string,
  ) => Promise<void>;
  isRightSidebarOpen: boolean;
  toggleRightSidebar: () => void;
  activeRightSidebarTab: 'groups' | 'rules' | 'overview';
  setActiveRightSidebarTab: (tab: 'groups' | 'rules' | 'overview') => void;
  selectedFilterGroupId: string | null;
  setSelectedFilterGroupId: (groupId: string | null) => void;
  selectedFilterRuleId: string | null;
  setSelectedFilterRuleId: (id: string | null) => void;
  selectedFilterPlatform: string | null;
  setSelectedFilterPlatform: (platform: string | null) => void;

  // Display Options State
  campaignsViewMode: 'list' | 'board';
  setCampaignsViewMode: (mode: 'list' | 'board') => void;
  isDisplayOptionsOpen: boolean;
  setIsDisplayOptionsOpen: (open: boolean) => void;
  toggleDisplayOptions: () => void;
  displayGrouping: 'none' | 'groups' | 'status' | 'rules';
  setDisplayGrouping: (grouping: 'none' | 'groups' | 'status' | 'rules') => void;
  displaySubGrouping: 'none' | 'status' | 'rules';
  setDisplaySubGrouping: (subGrouping: 'none' | 'status' | 'rules') => void;
  displayOrdering: 'manual' | 'name' | 'spend' | 'roi' | 'results' | 'budget' | 'cpa' | 'created';
  setDisplayOrdering: (ordering: 'manual' | 'name' | 'spend' | 'roi' | 'results' | 'budget' | 'cpa' | 'created') => void;
  showEmptyGroups: boolean;
  setShowEmptyGroups: (show: boolean) => void;
  orderCompletedByRecency: boolean;
  setOrderCompletedByRecency: (val: boolean) => void;
  showSubIssues: boolean;
  setShowSubIssues: (show: boolean) => void;
  completedIssuesFilter: 'all' | 'day' | 'week' | 'month' | 'none';
  setCompletedIssuesFilter: (filter: 'all' | 'day' | 'week' | 'month' | 'none') => void;
  displayProperties: Record<string, boolean>;
  toggleDisplayProperty: (property: string) => void;
  collapsedGroups: string[];
  toggleGroupCollapse: (groupId: string) => void;

  // Rules State (served by /api/presets and /api/rule-groups)
  rules: RuleItem[];
  ruleGroups: RuleGroup[];
  rulesLoadState: RulesLoadState;
  rulesError: string;
  /** Ad accounts a rule can be attached to, loaded with the rules. */
  ruleAccounts: MetaAccount[];
  /** Last failed write, surfaced next to the list without discarding it. */
  rulesMutationError: string;
  clearRulesMutationError: () => void;
  loadRules: () => Promise<void>;
  ruleFilterTab: 'active' | 'paused' | 'all';
  setRuleFilterTab: (tab: 'active' | 'paused' | 'all') => void;
  selectedRuleId: string | null;
  setSelectedRuleId: (id: string | null) => void;
  toggleRuleStatus: (id: string) => Promise<void>;
  addRule: (payload: RulePresetWriteRequest, groupId?: string) => Promise<void>;
  addRuleGroup: (name: string, icon?: RuleGroupIcon) => Promise<void>;
  deleteRuleGroup: (id: string) => Promise<void>;
  addRuleToGroup: (groupId: string, ruleId: string) => Promise<void>;
  deleteRule: (id: string) => Promise<void>;
  isCreateRuleModalOpen: boolean;
  createRuleTargetGroupId?: string;
  /** Rule being edited in the shared modal; null while creating a new one. */
  editingRuleId: string | null;
  openCreateRuleModal: (groupId?: string) => void;
  openEditRuleModal: (ruleId: string) => void;
  closeCreateRuleModal: () => void;
  updateRule: (ruleId: string, payload: RulePresetWriteRequest) => Promise<void>;
  /** Attach the rule to a whole ad account, or detach it from one. */
  toggleRuleOnAccount: (ruleId: string, accountId: string) => Promise<void>;

  // Rules Display Options & Sidebar State
  rulesViewMode: 'board' | 'list';
  setRulesViewMode: (mode: 'board' | 'list') => void;
  isRulesDisplayOptionsOpen: boolean;
  setIsRulesDisplayOptionsOpen: (open: boolean) => void;
  toggleRulesDisplayOptions: () => void;
  rulesDisplayGrouping: 'none' | 'groups' | 'status';
  setRulesDisplayGrouping: (grouping: 'none' | 'groups' | 'status') => void;
  rulesDisplayOrdering: 'manual' | 'name' | 'lastRun' | 'status';
  setRulesDisplayOrdering: (ordering: 'manual' | 'name' | 'lastRun' | 'status') => void;
  rulesDisplayProperties: Record<string, boolean>;
  toggleRulesDisplayProperty: (property: string) => void;
  isRulesRightSidebarOpen: boolean;
  setIsRulesRightSidebarOpen: (open: boolean) => void;
  toggleRulesRightSidebar: () => void;
  activeRulesRightSidebarTab: 'groups' | 'rules';
  setActiveRulesRightSidebarTab: (tab: 'groups' | 'rules') => void;
  selectedFilterRuleGroupId: string | null;
  setSelectedFilterRuleGroupId: (groupId: string | null) => void;
  rulesCollapsedGroups: string[];
  toggleRulesGroupCollapse: (groupId: string) => void;
  selectedRuleIds: string[];
  toggleRuleSelection: (id: string) => void;
  clearRuleSelection: () => void;
  focusedRuleId: string | null;
  setFocusedRuleId: (id: string | null) => void;

  // Rules Filter State
  rulesFilterClauses: FilterClause[];
  setRulesFilterClauses: (clauses: FilterClause[]) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  isSearchOpen: false,
  setSearchOpen: (open) => set({ isSearchOpen: open }),
  workspaceName: 'buyerly',
  setWorkspaceName: (name) => set({ workspaceName: name }),
  sidebarWidth: 244,
  setSidebarWidth: (width) =>
    set({ sidebarWidth: Math.min(Math.max(width, 200), 400) }),
  isSidebarCollapsed: false,
  toggleSidebarCollapsed: () =>
    set((state) => ({ isSidebarCollapsed: !state.isSidebarCollapsed })),
  setSidebarCollapsed: (collapsed) => set({ isSidebarCollapsed: collapsed }),
  resetSidebarWidth: () => set({ sidebarWidth: 244, isSidebarCollapsed: false }),
  activeTab: 'campaigns',
  lastAppTab: 'campaigns',
  setActiveTab: (tab) =>
    set((state) => ({
      activeTab: tab,
      lastAppTab: tab === 'preferences' ? state.lastAppTab : tab,
    })),
  interfaceTheme:
    typeof window !== 'undefined' &&
    (window.localStorage.getItem('buyerly-interface-theme') === 'light' ||
      window.localStorage.getItem('buyerly-interface-theme') === 'dark')
      ? (window.localStorage.getItem('buyerly-interface-theme') as InterfaceTheme)
      : 'system',
  setInterfaceTheme: (theme) => set({ interfaceTheme: theme }),

  campaigns: [],
  campaignGroups: [],
  adSets: [],
  ads: [],
  campaignFilterTab: 'campaigns',
  setCampaignFilterTab: (tab) =>
    set({ campaignFilterTab: tab, adsManagerQuickFilter: null }),
  adsManagerFilters: {
    campaigns: [],
    adsets: [],
    ads: [],
  },
  setAdsManagerFilters: (entity, clauses) =>
    set((state) => ({
      adsManagerFilters: {
        ...state.adsManagerFilters,
        [entity]: clauses,
      },
    })),
  clearAdsManagerFilters: (entity) =>
    set((state) => ({
      adsManagerFilters: {
        ...state.adsManagerFilters,
        [entity]: [],
      },
    })),
  adsManagerQuickFilter: null,
  setAdsManagerQuickFilter: (filter) => set({ adsManagerQuickFilter: filter }),
  clearAdsManagerQuickFilter: () => set({ adsManagerQuickFilter: null }),
  selectedCampaignIds: [],
  toggleCampaignSelection: (id) =>
    set((state) => ({
      selectedCampaignIds: state.selectedCampaignIds.includes(id)
        ? state.selectedCampaignIds.filter((item) => item !== id)
        : [...state.selectedCampaignIds, id],
    })),
  clearCampaignSelection: () => set({ selectedCampaignIds: [] }),
  toggleCampaignDelivery: (id) =>
    set((state) => ({
      campaigns: state.campaigns.map((c) =>
        c.id === id
          ? {
              ...c,
              status: c.status === 'paused' ? 'active' : 'paused',
            }
          : c
      ),
    })),
  toggleCampaignGroup: (id, groupId) =>
    set((state) => ({
      campaigns: state.campaigns.map((c) =>
        c.id === id
          ? {
              ...c,
              groupIds: c.groupIds.includes(groupId)
                ? c.groupIds.filter((item) => item !== groupId)
                : [...c.groupIds, groupId],
            }
          : c
      ),
    })),
  toggleAdSetDelivery: (id) =>
    set((state) => ({
      adSets: state.adSets.map((s) =>
        s.id === id
          ? {
              ...s,
              status: s.status === 'paused' ? 'active' : 'paused',
            }
          : s
      ),
    })),
  toggleAdDelivery: (id) =>
    set((state) => ({
      ads: state.ads.map((a) =>
        a.id === id
          ? {
              ...a,
              status: a.status === 'paused' ? 'active' : 'paused',
            }
          : a
      ),
    })),
  focusedCampaignId: '',
  setFocusedCampaignId: (id) => set({ focusedCampaignId: id }),
  attachedRulesAccountId: null,
  attachedRuleScopes: {},
  campaignAttachedRules: {},
  adSetAttachedRules: {},
  attachmentError: '',
  clearAttachmentError: () => set({ attachmentError: '' }),

  loadAccountRuleAttachments: async (accountId) => {
    if (!accountId) {
      set({
        attachedRulesAccountId: null,
        attachedRuleScopes: {},
        campaignAttachedRules: {},
        adSetAttachedRules: {},
      });
      return;
    }
    try {
      const accounts = await apiRequest<MetaAccount[]>('/api/accounts');
      const account = accounts.find((item) => item.account_id === accountId);
      const scopes: Record<string, RuleScope> = {};
      for (const rule of account?.active_rules ?? []) {
        scopes[String(rule.preset_id)] = attachedRuleScope(rule);
      }
      set({
        attachedRulesAccountId: accountId,
        attachedRuleScopes: scopes,
        campaignAttachedRules: entityRuleIndex(scopes, 'campaign'),
        adSetAttachedRules: entityRuleIndex(scopes, 'adset'),
      });
    } catch (error) {
      set({ attachmentError: requestErrorMessage(error) });
    }
  },

  toggleRuleForEntity: async (level, entityId, ruleId) => {
    const { attachedRulesAccountId, attachedRuleScopes } = get();
    if (!attachedRulesAccountId) return;

    const presetId = Number(ruleId);
    const scope = attachedRuleScopes[ruleId];

    // A rule already aimed somewhere else has a target this control cannot
    // express. Silently rewriting it would widen or destroy what the buyer set.
    if (scope && scope.level !== level) {
      set({
        attachmentError:
          scope.level === 'account'
            ? 'This rule runs on the whole ad account. Change its scope on the Rules screen.'
            : scope.level === 'campaign'
            ? 'This rule targets individual campaigns. Detach it there, or change its scope on the Rules screen.'
            : 'This rule targets individual ad sets. Detach it there, or change its scope on the Rules screen.',
      });
      return;
    }

    set({ attachmentError: '' });
    try {
      if (!scope) {
        await assignRuleToAccount(attachedRulesAccountId, presetId, {
          level,
          ids: [entityId],
        });
      } else {
        const nextIds = scope.ids.includes(entityId)
          ? scope.ids.filter((id) => id !== entityId)
          : [...scope.ids, entityId];
        if (nextIds.length === 0) {
          // A targeted rule with nothing left to target has no work to do.
          await detachRuleFromAccount(attachedRulesAccountId, presetId);
        } else {
          await setAttachedRuleScope(attachedRulesAccountId, presetId, {
            level,
            ids: nextIds,
          });
        }
      }
      await get().loadAccountRuleAttachments(attachedRulesAccountId);
    } catch (error) {
      set({ attachmentError: requestErrorMessage(error) });
    }
  },
  isRightSidebarOpen: true,
  toggleRightSidebar: () =>
    set((state) => ({
      isRightSidebarOpen: !state.isRightSidebarOpen,
      adsManagerQuickFilter: state.isRightSidebarOpen ? null : state.adsManagerQuickFilter,
    })),
  activeRightSidebarTab: 'groups',
  setActiveRightSidebarTab: (tab) =>
    set((state) => ({
      activeRightSidebarTab: tab,
      adsManagerQuickFilter:
        state.activeRightSidebarTab === tab ? state.adsManagerQuickFilter : null,
    })),
  selectedFilterGroupId: null,
  setSelectedFilterGroupId: (groupId) =>
    set((state) => ({ selectedFilterGroupId: state.selectedFilterGroupId === groupId ? null : groupId })),
  selectedFilterRuleId: null,
  setSelectedFilterRuleId: (id) =>
    set((state) => ({ selectedFilterRuleId: state.selectedFilterRuleId === id ? null : id })),
  selectedFilterPlatform: null,
  setSelectedFilterPlatform: (platform) =>
    set((state) => ({ selectedFilterPlatform: state.selectedFilterPlatform === platform ? null : platform })),

  // Display Options implementation
  campaignsViewMode: 'list',
  setCampaignsViewMode: (mode) => set({ campaignsViewMode: mode }),
  isDisplayOptionsOpen: false,
  setIsDisplayOptionsOpen: (open) => set({ isDisplayOptionsOpen: open }),
  toggleDisplayOptions: () => set((state) => ({ isDisplayOptionsOpen: !state.isDisplayOptionsOpen })),
  displayGrouping: 'none',
  setDisplayGrouping: (grouping) => set({ displayGrouping: grouping }),
  displaySubGrouping: 'none',
  setDisplaySubGrouping: (subGrouping) => set({ displaySubGrouping: subGrouping }),
  displayOrdering: 'manual',
  setDisplayOrdering: (ordering) => set({ displayOrdering: ordering }),
  showEmptyGroups: true,
  setShowEmptyGroups: (show) => set({ showEmptyGroups: show }),
  orderCompletedByRecency: false,
  setOrderCompletedByRecency: (val) => set({ orderCompletedByRecency: val }),
  showSubIssues: false,
  setShowSubIssues: (show) => set({ showSubIssues: show }),
  completedIssuesFilter: 'all',
  setCompletedIssuesFilter: (filter) => set({ completedIssuesFilter: filter }),
  displayProperties: {
    status: true,
    budget: true,
    results: true,
    cpa: true,
    spend: true,
    roi: true,
    rules: true,
    group: false,
    created: false,
  },
  toggleDisplayProperty: (property) =>
    set((state) => ({
      displayProperties: {
        ...state.displayProperties,
        [property]: !state.displayProperties[property],
      },
    })),
  collapsedGroups: [],
  toggleGroupCollapse: (groupId) =>
    set((state) => ({
      collapsedGroups: state.collapsedGroups.includes(groupId)
        ? state.collapsedGroups.filter((id) => id !== groupId)
        : [...state.collapsedGroups, groupId],
    })),

  rules: [],
  ruleGroups: [],
  ruleAccounts: [],
  rulesLoadState: 'idle',
  rulesError: '',
  rulesMutationError: '',
  clearRulesMutationError: () => set({ rulesMutationError: '' }),

  loadRules: async () => {
    set({ rulesLoadState: 'loading', rulesError: '' });
    try {
      const [presets, groups, accounts] = await Promise.all([
        fetchRulePresets(),
        fetchRuleGroups(),
        // Needed to offer "run on this ad account"; a failure here must not
        // hide the rules themselves.
        apiRequest<MetaAccount[]>('/api/accounts').catch(() => []),
      ]);
      const groupIndex = buildGroupIndex(groups);
      set({
        rules: presets.map((preset) => presetToRuleItem(preset, groupIndex)),
        ruleGroups: groups.map(groupToRuleGroup),
        ruleAccounts: eligibleMetaAccounts(accounts),
        rulesLoadState: 'ready',
      });
    } catch (error) {
      set({ rulesError: requestErrorMessage(error), rulesLoadState: 'error' });
    }
  },

  ruleFilterTab: 'all',
  setRuleFilterTab: (tab) => set({ ruleFilterTab: tab }),
  selectedRuleId: null,
  setSelectedRuleId: (id) => set({ selectedRuleId: id }),

  toggleRuleStatus: async (id) => {
    const rule = get().rules.find((item) => item.id === id);
    if (!rule) return;
    // A rule the runtime holds back cannot be switched on from the list; the
    // conditions have to be re-saved first.
    if (rule.needsReview && rule.status === 'paused') {
      set({
        rulesMutationError:
          rule.reviewReason || 'This rule must be re-saved before it can be enabled.',
      });
      return;
    }
    const enabled = rule.status === 'paused';
    set({ rulesMutationError: '' });
    try {
      await updateRulePreset(
        rule.presetId,
        presetToWriteRequest(rule.preset, { enabled }),
      );
      await get().loadRules();
    } catch (error) {
      set({ rulesMutationError: requestErrorMessage(error) });
    }
  },

  addRule: async (payload, groupId) => {
    set({ rulesMutationError: '' });
    try {
      const preset = await createRulePreset(payload);
      if (groupId) {
        const group = get().ruleGroups.find((item) => item.id === groupId);
        if (group) {
          await updateRuleGroup(Number(groupId), {
            name: group.name,
            description: group.description,
            icon: group.icon,
            preset_ids: [...group.ruleIds.map(Number), preset.id],
          });
        }
      }
      await get().loadRules();
    } catch (error) {
      set({ rulesMutationError: requestErrorMessage(error) });
      throw error;
    }
  },

  addRuleGroup: async (name, icon = 'custom') => {
    set({ rulesMutationError: '' });
    try {
      await createRuleGroup({ name, description: '', icon, preset_ids: [] });
      await get().loadRules();
    } catch (error) {
      set({ rulesMutationError: requestErrorMessage(error) });
    }
  },

  deleteRuleGroup: async (id) => {
    set({ rulesMutationError: '' });
    try {
      await deleteRuleGroupRequest(Number(id));
      await get().loadRules();
    } catch (error) {
      set({ rulesMutationError: requestErrorMessage(error) });
    }
  },

  addRuleToGroup: async (groupId, ruleId) => {
    const { ruleGroups } = get();
    const presetId = Number(ruleId);
    // Group membership is stored as the group's full preset list, so moving a
    // rule means rewriting both the group that loses it and the one that gains it.
    const affected = ruleGroups.filter(
      (group) => group.id === groupId || group.ruleIds.includes(ruleId),
    );
    if (affected.length === 0) return;
    set({ rulesMutationError: '' });
    try {
      for (const group of affected) {
        const currentIds = group.ruleIds.map(Number);
        const nextIds =
          group.id === groupId
            ? currentIds.includes(presetId)
              ? currentIds
              : [...currentIds, presetId]
            : currentIds.filter((id) => id !== presetId);
        if (nextIds.length === currentIds.length && group.id !== groupId) continue;
        await updateRuleGroup(Number(group.id), {
          name: group.name,
          description: group.description,
          icon: group.icon,
          preset_ids: nextIds,
        });
      }
      await get().loadRules();
    } catch (error) {
      set({ rulesMutationError: requestErrorMessage(error) });
    }
  },

  deleteRule: async (id) => {
    set({ rulesMutationError: '' });
    try {
      await deleteRulePreset(Number(id));
      set((state) => ({
        selectedRuleId: state.selectedRuleId === id ? null : state.selectedRuleId,
      }));
      await get().loadRules();
    } catch (error) {
      set({ rulesMutationError: requestErrorMessage(error) });
    }
  },
  isCreateRuleModalOpen: false,
  createRuleTargetGroupId: undefined,
  editingRuleId: null,
  openCreateRuleModal: (groupId) =>
    set({
      isCreateRuleModalOpen: true,
      createRuleTargetGroupId: groupId === 'all' ? undefined : groupId,
      editingRuleId: null,
    }),
  openEditRuleModal: (ruleId) =>
    set({
      isCreateRuleModalOpen: true,
      createRuleTargetGroupId: undefined,
      editingRuleId: ruleId,
    }),
  closeCreateRuleModal: () =>
    set({
      isCreateRuleModalOpen: false,
      createRuleTargetGroupId: undefined,
      editingRuleId: null,
    }),

  updateRule: async (ruleId, payload) => {
    set({ rulesMutationError: '' });
    try {
      await updateRulePreset(Number(ruleId), payload);
      await get().loadRules();
    } catch (error) {
      set({ rulesMutationError: requestErrorMessage(error) });
      throw error;
    }
  },

  toggleRuleOnAccount: async (ruleId, accountId) => {
    const rule = get().rules.find((item) => item.id === ruleId);
    if (!rule) return;
    set({ rulesMutationError: '' });
    try {
      if (rule.preset.attached_account_ids.includes(accountId)) {
        await detachRuleFromAccount(accountId, rule.presetId);
      } else {
        // Attaching from the rules list means the whole ad account; narrowing
        // to campaigns happens in Ads Manager.
        await assignRuleToAccount(accountId, rule.presetId, ACCOUNT_SCOPE);
      }
      await get().loadRules();
    } catch (error) {
      set({ rulesMutationError: requestErrorMessage(error) });
    }
  },

  // Rules Display Options & Sidebar State
  rulesViewMode: 'list',
  setRulesViewMode: (mode) => set({ rulesViewMode: mode }),
  isRulesDisplayOptionsOpen: false,
  setIsRulesDisplayOptionsOpen: (open) => set({ isRulesDisplayOptionsOpen: open }),
  toggleRulesDisplayOptions: () =>
    set((state) => ({ isRulesDisplayOptionsOpen: !state.isRulesDisplayOptionsOpen })),
  rulesDisplayGrouping: 'groups',
  setRulesDisplayGrouping: (grouping) => set({ rulesDisplayGrouping: grouping }),
  rulesDisplayOrdering: 'manual',
  setRulesDisplayOrdering: (ordering) => set({ rulesDisplayOrdering: ordering }),
  rulesDisplayProperties: {
    status: true,
    condition: true,
    action: true,
    scope: true,
    lastRun: true,
  },
  toggleRulesDisplayProperty: (property) =>
    set((state) => ({
      rulesDisplayProperties: {
        ...state.rulesDisplayProperties,
        [property]: !state.rulesDisplayProperties[property],
      },
    })),
  isRulesRightSidebarOpen: false,
  setIsRulesRightSidebarOpen: (open) => set({ isRulesRightSidebarOpen: open }),
  toggleRulesRightSidebar: () =>
    set((state) => ({ isRulesRightSidebarOpen: !state.isRulesRightSidebarOpen })),
  activeRulesRightSidebarTab: 'groups',
  setActiveRulesRightSidebarTab: (tab) => set({ activeRulesRightSidebarTab: tab }),
  selectedFilterRuleGroupId: null,
  setSelectedFilterRuleGroupId: (groupId) => set({ selectedFilterRuleGroupId: groupId }),
  rulesCollapsedGroups: [],
  toggleRulesGroupCollapse: (groupId) =>
    set((state) => ({
      rulesCollapsedGroups: state.rulesCollapsedGroups.includes(groupId)
        ? state.rulesCollapsedGroups.filter((id) => id !== groupId)
        : [...state.rulesCollapsedGroups, groupId],
    })),
  selectedRuleIds: [],
  toggleRuleSelection: (id) =>
    set((state) => ({
      selectedRuleIds: state.selectedRuleIds.includes(id)
        ? state.selectedRuleIds.filter((item) => item !== id)
        : [...state.selectedRuleIds, id],
    })),
  clearRuleSelection: () => set({ selectedRuleIds: [] }),
  focusedRuleId: null,
  setFocusedRuleId: (id) => set({ focusedRuleId: id }),

  // Rules Filter State
  rulesFilterClauses: [],
  setRulesFilterClauses: (clauses) => set({ rulesFilterClauses: clauses }),
}));
