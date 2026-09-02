import { create } from 'zustand';
import type { FilterClause } from '@/components/filters/filterModel';

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
  status: 'active' | 'paused';
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
  status: 'active' | 'paused';
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
  status: 'active' | 'paused';
  leadsCount: number;
  cpa: string;
  spend: string;
  ctr: string;
  cpc: string;
  date: string;
}

export interface RuleItem {
  id: string;
  identifier: string;
  name: string;
  condition: string;
  action: string;
  campaignName: string;
  scope?: string;
  status: 'active' | 'paused' | 'triggered';
  lastRun: string;
  groupId?: string;
}

export interface RuleGroup {
  id: string;
  name: string;
  icon: 'backlog' | 'shield' | 'rocket' | 'flask' | 'custom';
  ruleIds: string[];
}

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

  // Rules State
  rules: RuleItem[];
  ruleGroups: RuleGroup[];
  ruleFilterTab: 'active' | 'paused' | 'all';
  setRuleFilterTab: (tab: 'active' | 'paused' | 'all') => void;
  selectedRuleId: string | null;
  setSelectedRuleId: (id: string | null) => void;
  toggleRuleStatus: (id: string) => void;
  addRule: (rule: Omit<RuleItem, 'id' | 'identifier'>, groupId?: string) => void;
  addRuleGroup: (name: string, icon?: 'backlog' | 'shield' | 'rocket' | 'flask' | 'custom') => void;
  deleteRuleGroup: (id: string) => void;
  addRuleToGroup: (groupId: string, ruleId: string) => void;
  deleteRule: (id: string) => void;
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

export const useAppStore = create<AppState>((set) => ({
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

  campaigns: [
    {
      id: 'cmp-101',
      identifier: 'CMP-101',
      name: 'LuckySpin Casino • Italy • Broad CBO',
      platform: 'Meta',
      status: 'active',
      budget: '$500/day',
      leadsCount: 142,
      cpa: '$8.70',
      spend: '$1,240 spend',
      roi: '+142% ROI',
      date: 'Aug 29',
      groupIds: ['campaign-group-testing'],
    },
    {
      id: 'cmp-102',
      identifier: 'CMP-102',
      name: 'RoyalBet Sportsbook • USA • UGC Scale',
      platform: 'TikTok',
      status: 'active',
      budget: '$1,200/day',
      leadsCount: 380,
      cpa: '$9.20',
      spend: '$3,500 spend',
      roi: '+189% ROI',
      date: 'Aug 29',
      groupIds: ['campaign-group-scale'],
    },
    {
      id: 'cmp-103',
      identifier: 'CMP-103',
      name: 'NeonSlots Casino • DACH • Target CPA',
      platform: 'Google',
      status: 'active',
      budget: '$300/day',
      leadsCount: 74,
      cpa: '$12.00',
      spend: '$890 spend',
      roi: '+118% ROI',
      date: 'Aug 28',
      groupIds: ['campaign-group-testing'],
    },
    {
      id: 'cmp-104',
      identifier: 'CMP-104',
      name: 'AcePlay Casino • Netherlands • Retargeting',
      platform: 'Meta',
      status: 'paused',
      budget: '$150/day',
      leadsCount: 18,
      cpa: '$25.00',
      spend: '$450 spend',
      roi: '-15% ROI',
      date: 'Aug 26',
      groupIds: ['campaign-group-watchlist'],
    },
  ],
  campaignGroups: [
    {
      id: 'campaign-group-testing',
      name: 'Testing',
      color: 'rgb(59, 130, 246)',
      accentColor: 'lch(10.756 5.912 273.56)',
    },
    {
      id: 'campaign-group-scale',
      name: 'Scale',
      color: 'rgb(34, 197, 94)',
      accentColor: 'lch(10.756 6.8 145)',
    },
    {
      id: 'campaign-group-watchlist',
      name: 'Watchlist',
      color: 'rgb(249, 115, 22)',
      accentColor: 'lch(10.756 4.2 50)',
    },
  ],
  adSets: [
    {
      id: 'adset-201',
      identifier: 'SET-201',
      name: 'Italy Broad 25-45 • Slots Interest • Reels',
      campaignId: 'cmp-101',
      campaignName: 'LuckySpin Casino • Italy • Broad CBO',
      platform: 'Meta',
      status: 'active',
      budget: '$250/day',
      leadsCount: 84,
      cpa: '$8.20',
      spend: '$688 spend',
      roi: '+155% ROI',
      audience: 'Casino Players 25-45 (IT)',
      date: 'Aug 29',
    },
    {
      id: 'adset-202',
      identifier: 'SET-202',
      name: 'High-Value Players • Casino Lookalike 3%',
      campaignId: 'cmp-101',
      campaignName: 'LuckySpin Casino • Italy • Broad CBO',
      platform: 'Meta',
      status: 'active',
      budget: '$250/day',
      leadsCount: 58,
      cpa: '$9.50',
      spend: '$552 spend',
      roi: '+124% ROI',
      audience: 'Depositors Lookalike 3%',
      date: 'Aug 29',
    },
    {
      id: 'adset-203',
      identifier: 'SET-203',
      name: 'US Sports Bettors • NFL & NBA Broad',
      campaignId: 'cmp-102',
      campaignName: 'RoyalBet Sportsbook • USA • UGC Scale',
      platform: 'Meta',
      status: 'active',
      budget: '$600/day',
      leadsCount: 210,
      cpa: '$8.90',
      spend: '$1,869 spend',
      roi: '+204% ROI',
      audience: 'Sports Betting Interests USA',
      date: 'Aug 28',
    },
    {
      id: 'adset-204',
      identifier: 'SET-204',
      name: 'DACH Casino Players • Slots & Live Dealer',
      campaignId: 'cmp-103',
      campaignName: 'NeonSlots Casino • DACH • Target CPA',
      platform: 'Meta',
      status: 'active',
      budget: '$300/day',
      leadsCount: 74,
      cpa: '$12.00',
      spend: '$880 spend',
      roi: '+118% ROI',
      audience: 'Slots & Live Casino Interests',
      date: 'Aug 28',
    },
    {
      id: 'adset-205',
      identifier: 'SET-205',
      name: 'NL Retargeting • Depositors 30D',
      campaignId: 'cmp-104',
      campaignName: 'AcePlay Casino • Netherlands • Retargeting',
      platform: 'Meta',
      status: 'paused',
      budget: '$150/day',
      leadsCount: 18,
      cpa: '$25.00',
      spend: '$450 spend',
      roi: '-15% ROI',
      audience: 'Casino Visitors 30D',
      date: 'Aug 26',
    },
  ],
  ads: [
    {
      id: 'ad-301',
      identifier: 'AD-301',
      name: 'LuckySpin Welcome Bonus • UGC Testimonial v2',
      adSetId: 'adset-201',
      adSetName: 'Italy Broad 25-45 • Slots Interest • Reels',
      campaignName: 'LuckySpin Casino • Italy • Broad CBO',
      platform: 'Meta',
      status: 'active',
      leadsCount: 52,
      cpa: '$7.80',
      spend: '$405 spend',
      ctr: '2.84%',
      cpc: '$0.42',
      date: 'Aug 29',
    },
    {
      id: 'ad-302',
      identifier: 'AD-302',
      name: 'Mega Jackpot Win • Split Screen Hook #3',
      adSetId: 'adset-201',
      adSetName: 'Italy Broad 25-45 • Slots Interest • Reels',
      campaignName: 'LuckySpin Casino • Italy • Broad CBO',
      platform: 'Meta',
      status: 'active',
      leadsCount: 32,
      cpa: '$8.85',
      spend: '$283 spend',
      ctr: '2.15%',
      cpc: '$0.51',
      date: 'Aug 29',
    },
    {
      id: 'ad-303',
      identifier: 'AD-303',
      name: 'RoyalBet Game-Day Odds • UGC Hook',
      adSetId: 'adset-203',
      adSetName: 'US Sports Bettors • NFL & NBA Broad',
      campaignName: 'RoyalBet Sportsbook • USA • UGC Scale',
      platform: 'Meta',
      status: 'active',
      leadsCount: 140,
      cpa: '$8.50',
      spend: '$1,190 spend',
      ctr: '3.42%',
      cpc: '$0.38',
      date: 'Aug 28',
    },
    {
      id: 'ad-304',
      identifier: 'AD-304',
      name: 'NeonSlots Free Spins • Animated Jackpot',
      adSetId: 'adset-204',
      adSetName: 'DACH Casino Players • Slots & Live Dealer',
      campaignName: 'NeonSlots Casino • DACH • Target CPA',
      platform: 'Meta',
      status: 'active',
      leadsCount: 74,
      cpa: '$12.00',
      spend: '$880 spend',
      ctr: '1.92%',
      cpc: '$0.65',
      date: 'Aug 28',
    },
    {
      id: 'ad-305',
      identifier: 'AD-305',
      name: 'AcePlay Cashback • Retargeting Offer',
      adSetId: 'adset-205',
      adSetName: 'NL Retargeting • Depositors 30D',
      campaignName: 'AcePlay Casino • Netherlands • Retargeting',
      platform: 'Meta',
      status: 'paused',
      leadsCount: 18,
      cpa: '$25.00',
      spend: '$450 spend',
      ctr: '1.10%',
      cpc: '$0.95',
      date: 'Aug 26',
    },
  ],
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
  focusedCampaignId: 'cmp-101',
  setFocusedCampaignId: (id) => set({ focusedCampaignId: id }),
  campaignAttachedRules: {
    'cmp-101': ['rul-01', 'rul-02'],
    'cmp-102': [],
    'cmp-103': ['rul-03'],
    'cmp-104': [],
  },
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

  rules: [
    {
      id: 'rul-01',
      identifier: 'RUL-01',
      name: 'Auto-Stop High CPA (> $25)',
      condition: 'IF CPA > $25 & Spend > $40',
      action: 'PAUSE ADSET',
      campaignName: 'LuckySpin Casino • Italy • Broad CBO',
      scope: 'Meta Ads • All Campaigns',
      status: 'active',
      lastRun: '15m ago',
      groupId: 'rule-group-safety',
    },
    {
      id: 'rul-02',
      identifier: 'RUL-02',
      name: 'Scale Winner Budget (+20% daily)',
      condition: 'IF ROI > 140% & Leads ≥ 5',
      action: 'BUDGET +20%',
      campaignName: 'RoyalBet Sportsbook • USA • UGC Scale',
      scope: 'TikTok Ads • Broad',
      status: 'active',
      lastRun: '1h ago',
      groupId: 'rule-group-scaling',
    },
    {
      id: 'rul-03',
      identifier: 'RUL-03',
      name: 'Kill Zero-Conversions ($50 spend)',
      condition: 'IF Spend > $50 & Leads == 0',
      action: 'PAUSE CAMPAIGN',
      campaignName: 'NeonSlots Casino • DACH • Target CPA',
      scope: 'Google Ads • Search',
      status: 'active',
      lastRun: '3h ago',
      groupId: 'rule-group-safety',
    },
    {
      id: 'rul-04',
      identifier: 'RUL-04',
      name: 'Duplicate Winner AdSet (Auto-Horiz Scale)',
      condition: 'IF Conversions > 10 & CPA < $12',
      action: 'DUPLICATE ADSET',
      campaignName: 'AcePlay Casino • Netherlands • Retargeting',
      scope: 'Meta Ads • CBO',
      status: 'paused',
      lastRun: '2d ago',
      groupId: 'rule-group-scaling',
    },
  ],
  ruleGroups: [
    {
      id: 'rule-group-safety',
      name: 'Safety',
      icon: 'shield',
      ruleIds: ['rul-01', 'rul-03'],
    },
    {
      id: 'rule-group-scaling',
      name: 'Scaling',
      icon: 'rocket',
      ruleIds: ['rul-02', 'rul-04'],
    },
  ],
  ruleFilterTab: 'all',
  setRuleFilterTab: (tab) => set({ ruleFilterTab: tab }),
  selectedRuleId: null,
  setSelectedRuleId: (id) => set({ selectedRuleId: id }),
  toggleRuleStatus: (id) =>
    set((state) => ({
      rules: state.rules.map((r) =>
        r.id === id
          ? {
              ...r,
              status: r.status === 'paused' ? 'active' : 'paused',
            }
          : r
      ),
    })),
  addRule: (newRule, groupId) =>
    set((state) => {
      const nextIndex = state.rules.length + 1;
      const id = `rul-${String(nextIndex).padStart(2, '0')}`;
      const identifier = `RUL-${String(nextIndex).padStart(2, '0')}`;
      const createdRule: RuleItem = {
        ...newRule,
        id,
        identifier,
        groupId: groupId || undefined,
      };

      return {
        rules: [...state.rules, createdRule],
        ruleGroups: groupId
          ? state.ruleGroups.map((g) =>
              g.id === groupId
                ? { ...g, ruleIds: [...g.ruleIds, id] }
                : g
            )
          : state.ruleGroups,
      };
    }),
  addRuleGroup: (name, icon = 'custom') =>
    set((state) => {
      const nextIndex = state.ruleGroups.length + 1;
      const id = `group-custom-${nextIndex}`;
      return {
        ruleGroups: [
          ...state.ruleGroups,
          {
            id,
            name,
            icon,
            ruleIds: [],
          },
        ],
      };
    }),
  deleteRuleGroup: (id) =>
    set((state) => ({
      ruleGroups: state.ruleGroups.filter((g) => g.id !== id),
      rules: state.rules.map((r) =>
        r.groupId === id ? { ...r, groupId: undefined } : r
      ),
    })),
  addRuleToGroup: (groupId, ruleId) =>
    set((state) => ({
      rules: state.rules.map((r) =>
        r.id === ruleId ? { ...r, groupId } : r
      ),
      ruleGroups: state.ruleGroups.map((g) => {
        if (g.id === groupId) {
          return g.ruleIds.includes(ruleId)
            ? g
            : { ...g, ruleIds: [...g.ruleIds, ruleId] };
        }
        return {
          ...g,
          ruleIds: g.ruleIds.filter((id) => id !== ruleId),
        };
      }),
    })),
  deleteRule: (id) =>
    set((state) => ({
      rules: state.rules.filter((r) => r.id !== id),
      ruleGroups: state.ruleGroups.map((g) => ({
        ...g,
        ruleIds: g.ruleIds.filter((ruleId) => ruleId !== id),
      })),
      selectedRuleId: state.selectedRuleId === id ? null : state.selectedRuleId,
    })),
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
