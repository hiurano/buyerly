import { create } from 'zustand';
import type { FilterClause } from '@/components/filters/filterModel';
import { ApiError } from '@/lib/api';
import {
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
} from '@/lib/rules';

export interface NotificationItem {
  id: string;
  title: string;
  preview: string;
  timestamp: string;
  isRead: boolean;
  contentBody?: string;
}

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

export interface RuleFilters {
  status?: string[];
  action?: string[];
  group?: string[];
  scope?: string[];
  metric?: string[];
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
  return 'Не удалось связаться с сервером. Попробуйте ещё раз.';
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

  // Inbox State
  notifications: NotificationItem[];
  selectedNotificationId: string | null;
  setSelectedNotificationId: (id: string | null) => void;
  archiveNotification: (id: string) => void;
  markAllNotificationsAsRead: () => void;
  deleteAllNotifications: () => void;
  deleteAllReadNotifications: () => void;
  toggleNotificationReadStatus: (id: string) => void;

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
  campaignAttachedRules: Record<string, string[]>;
  toggleRuleForCampaign: (campaignId: string, ruleId: string) => void;
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
  openCreateRuleModal: (groupId?: string) => void;
  closeCreateRuleModal: () => void;

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
  isRulesFilterOpen: boolean;
  setIsRulesFilterOpen: (open: boolean) => void;
  toggleRulesFilter: () => void;
  rulesFilterInitialCategory?: 'status' | 'action' | 'group' | 'scope' | 'metric';
  openRulesFilterWithCategory: (category?: 'status' | 'action' | 'group' | 'scope' | 'metric') => void;
  rulesFilters: RuleFilters;
  toggleRulesFilterValue: (category: keyof RuleFilters, value: string, defaultOperator?: 'is' | 'is_not') => void;
  removeRulesFilter: (category: keyof RuleFilters, value?: string) => void;
  clearAllRulesFilters: () => void;
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

  notifications: [
    {
      id: 'welcome-1',
      title: 'Welcome to Buyerly',
      preview: 'Watch an introductory guide and access key media buying resources below.',
      timestamp: '1h',
      isRead: false,
      contentBody:
        'Welcome to your new workspace! Buyerly is built for high-performance media buying teams and solo affiliates. Automate rules, scale winning adsets, stop bleeding spend, and track real-time CPA & ROI with lightning speed and keyboard shortcuts.',
    },
  ],
  selectedNotificationId: 'welcome-1',
  setSelectedNotificationId: (id) =>
    set((state) => ({
      selectedNotificationId: id,
      notifications: id
        ? state.notifications.map((n) => (n.id === id ? { ...n, isRead: true } : n))
        : state.notifications,
    })),
  archiveNotification: (id) =>
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
      selectedNotificationId:
        state.selectedNotificationId === id ? null : state.selectedNotificationId,
    })),
  markAllNotificationsAsRead: () =>
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, isRead: true })),
    })),
  deleteAllNotifications: () =>
    set(() => ({
      notifications: [],
      selectedNotificationId: null,
    })),
  deleteAllReadNotifications: () =>
    set((state) => ({
      notifications: state.notifications.filter((n) => !n.isRead),
      selectedNotificationId: state.notifications.some((n) => n.id === state.selectedNotificationId && n.isRead)
        ? null
        : state.selectedNotificationId,
    })),
  toggleNotificationReadStatus: (id) =>
    set((state) => ({
      notifications: state.notifications.map((n) =>
        n.id === id ? { ...n, isRead: !n.isRead } : n
      ),
    })),

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
  campaignAttachedRules: {},
  toggleRuleForCampaign: (campaignId, ruleId) =>
    set((state) => {
      const attached = state.campaignAttachedRules[campaignId] || [];
      return {
        campaignAttachedRules: {
          ...state.campaignAttachedRules,
          [campaignId]: attached.includes(ruleId)
            ? attached.filter((r) => r !== ruleId)
            : [...attached, ruleId],
        },
      };
    }),
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
  rulesLoadState: 'idle',
  rulesError: '',
  rulesMutationError: '',
  clearRulesMutationError: () => set({ rulesMutationError: '' }),

  loadRules: async () => {
    set({ rulesLoadState: 'loading', rulesError: '' });
    try {
      const [presets, groups] = await Promise.all([
        fetchRulePresets(),
        fetchRuleGroups(),
      ]);
      const groupIndex = buildGroupIndex(groups);
      set({
        rules: presets.map((preset) => presetToRuleItem(preset, groupIndex)),
        ruleGroups: groups.map(groupToRuleGroup),
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
          rule.reviewReason || 'Правило требует пересохранения перед включением.',
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
  openCreateRuleModal: (groupId) =>
    set({
      isCreateRuleModalOpen: true,
      createRuleTargetGroupId: groupId === 'all' ? undefined : groupId,
    }),
  closeCreateRuleModal: () =>
    set({
      isCreateRuleModalOpen: false,
      createRuleTargetGroupId: undefined,
    }),

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
  isRulesFilterOpen: false,
  setIsRulesFilterOpen: (open) => set({ isRulesFilterOpen: open }),
  toggleRulesFilter: () =>
    set((state) => ({ isRulesFilterOpen: !state.isRulesFilterOpen })),
  rulesFilterInitialCategory: undefined,
  openRulesFilterWithCategory: (category) =>
    set({
      isRulesFilterOpen: true,
      rulesFilterInitialCategory: category,
    }),
  rulesFilters: {},
  toggleRulesFilterValue: (category, value) =>
    set((state) => {
      const currentList = state.rulesFilters[category] || [];
      const updatedList = currentList.includes(value)
        ? currentList.filter((v) => v !== value)
        : [...currentList, value];

      return {
        rulesFilters: {
          ...state.rulesFilters,
          [category]: updatedList.length > 0 ? updatedList : undefined,
        },
      };
    }),
  removeRulesFilter: (category, value) =>
    set((state) => {
      if (!value) {
        const nextFilters = { ...state.rulesFilters };
        delete nextFilters[category];
        return { rulesFilters: nextFilters };
      }
      const currentList = state.rulesFilters[category] || [];
      const updatedList = currentList.filter((v) => v !== value);
      return {
        rulesFilters: {
          ...state.rulesFilters,
          [category]: updatedList.length > 0 ? updatedList : undefined,
        },
      };
    }),
  clearAllRulesFilters: () => set({ rulesFilters: {} }),
  rulesFilterClauses: [],
  setRulesFilterClauses: (clauses) => set({ rulesFilterClauses: clauses }),
}));
