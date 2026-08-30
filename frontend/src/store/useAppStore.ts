import { create } from 'zustand';

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
  groupId?: string;
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

interface AppState {
  isSearchOpen: boolean;
  setSearchOpen: (open: boolean) => void;
  workspaceName: string;
  sidebarWidth: number;
  setSidebarWidth: (width: number) => void;
  activeTab: 'inbox' | 'campaigns' | 'rules' | 'insights';
  setActiveTab: (tab: 'inbox' | 'campaigns' | 'rules' | 'insights') => void;
  
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
  adSets: AdSetItem[];
  ads: AdItem[];
  campaignFilterTab: 'campaigns' | 'adsets' | 'ads' | 'active' | 'paused' | 'all';
  setCampaignFilterTab: (tab: 'campaigns' | 'adsets' | 'ads' | 'active' | 'paused' | 'all') => void;
  selectedCampaignIds: string[];
  toggleCampaignSelection: (id: string) => void;
  clearCampaignSelection: () => void;
  toggleCampaignDelivery: (id: string) => void;
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
  isDisplayOptionsOpen: boolean;
  setIsDisplayOptionsOpen: (open: boolean) => void;
  toggleDisplayOptions: () => void;
  displayGrouping: 'none' | 'groups';
  setDisplayGrouping: (grouping: 'none' | 'groups') => void;
  displayOrdering: 'manual' | 'spend' | 'roi' | 'results';
  setDisplayOrdering: (ordering: 'manual' | 'spend' | 'roi' | 'results') => void;
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
}

export const useAppStore = create<AppState>((set) => ({
  isSearchOpen: false,
  setSearchOpen: (open) => set({ isSearchOpen: open }),
  workspaceName: 'buyerly',
  sidebarWidth: 220,
  setSidebarWidth: (width) =>
    set({ sidebarWidth: Math.min(Math.max(width, 220), 360) }),
  activeTab: 'campaigns',
  setActiveTab: (tab) => set({ activeTab: tab }),

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
      name: 'Nutra WeightLoss (Italy) • Broad CBO',
      platform: 'Meta',
      status: 'active',
      budget: '$500/day',
      leadsCount: 142,
      cpa: '$8.70',
      spend: '$1,240 spend',
      roi: '+142% ROI',
      date: 'Aug 29',
      groupId: 'group-italy',
    },
    {
      id: 'cmp-102',
      identifier: 'CMP-102',
      name: 'E-com Gadgets (USA) • UGC Hook #4',
      platform: 'TikTok',
      status: 'active',
      budget: '$1,200/day',
      leadsCount: 380,
      cpa: '$9.20',
      spend: '$3,500 spend',
      roi: '+189% ROI',
      date: 'Aug 29',
      groupId: 'group-usa',
    },
    {
      id: 'cmp-103',
      identifier: 'CMP-103',
      name: 'Mobile Cleaner iOS (Tier-1: DE) • Target CPA',
      platform: 'Google',
      status: 'active',
      budget: '$300/day',
      leadsCount: 74,
      cpa: '$12.00',
      spend: '$890 spend',
      roi: '+118% ROI',
      date: 'Aug 28',
      groupId: 'group-germany',
    },
    {
      id: 'cmp-104',
      identifier: 'CMP-104',
      name: 'Crypto Info LeadGen (NL) • Retargeting',
      platform: 'Meta',
      status: 'paused',
      budget: '$150/day',
      leadsCount: 18,
      cpa: '$25.00',
      spend: '$450 spend',
      roi: '-15% ROI',
      date: 'Aug 26',
      groupId: 'group-netherlands',
    },
  ],
  adSets: [
    {
      id: 'adset-201',
      identifier: 'SET-201',
      name: 'Rome & Milan • Broad 25-45 • IG Stories',
      campaignId: 'cmp-101',
      campaignName: 'Nutra WeightLoss (Italy) • Broad CBO',
      platform: 'Meta',
      status: 'active',
      budget: '$250/day',
      leadsCount: 84,
      cpa: '$8.20',
      spend: '$688 spend',
      roi: '+155% ROI',
      audience: 'Broad 25-45 (IT)',
      date: 'Aug 29',
    },
    {
      id: 'adset-202',
      identifier: 'SET-202',
      name: 'Naples & South • Interest: Fitness • Reels',
      campaignId: 'cmp-101',
      campaignName: 'Nutra WeightLoss (Italy) • Broad CBO',
      platform: 'Meta',
      status: 'active',
      budget: '$250/day',
      leadsCount: 58,
      cpa: '$9.50',
      spend: '$552 spend',
      roi: '+124% ROI',
      audience: 'Fitness / Diet Interests',
      date: 'Aug 29',
    },
    {
      id: 'adset-203',
      identifier: 'SET-203',
      name: 'Tier-1 States (CA, TX, FL) • UGC Cleaners',
      campaignId: 'cmp-102',
      campaignName: 'E-com Gadgets (USA) • UGC Hook #4',
      platform: 'Meta',
      status: 'active',
      budget: '$600/day',
      leadsCount: 210,
      cpa: '$8.90',
      spend: '$1,869 spend',
      roi: '+204% ROI',
      audience: 'Online Shoppers USA',
      date: 'Aug 28',
    },
    {
      id: 'adset-204',
      identifier: 'SET-204',
      name: 'iOS 16+ • Memory Optimizer • Broad Tier-1',
      campaignId: 'cmp-103',
      campaignName: 'Mobile Cleaner iOS (Tier-1) • Target CPA',
      platform: 'Meta',
      status: 'active',
      budget: '$300/day',
      leadsCount: 74,
      cpa: '$12.00',
      spend: '$880 spend',
      roi: '+118% ROI',
      audience: 'iPhone 13-15 Users',
      date: 'Aug 28',
    },
    {
      id: 'adset-205',
      identifier: 'SET-205',
      name: 'LATAM Retargeting • 30D Engagers',
      campaignId: 'cmp-104',
      campaignName: 'Crypto Info LeadGen (LATAM) • Retargeting',
      platform: 'Meta',
      status: 'paused',
      budget: '$150/day',
      leadsCount: 18,
      cpa: '$25.00',
      spend: '$450 spend',
      roi: '-15% ROI',
      audience: 'Page Engagers 30D',
      date: 'Aug 26',
    },
  ],
  ads: [
    {
      id: 'ad-301',
      identifier: 'AD-301',
      name: 'UGC Doctor Review (Italian Subtitles) v2',
      adSetId: 'adset-201',
      adSetName: 'Rome & Milan • Broad 25-45 • IG Stories',
      campaignName: 'Nutra WeightLoss (Italy) • Broad CBO',
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
      name: 'Before/After Split Screen Hook #3',
      adSetId: 'adset-201',
      adSetName: 'Rome & Milan • Broad 25-45 • IG Stories',
      campaignName: 'Nutra WeightLoss (Italy) • Broad CBO',
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
      name: 'Cleaning Gadget 3-in-1 Viral TikTok Cut',
      adSetId: 'adset-203',
      adSetName: 'Tier-1 States (CA, TX, FL) • UGC Cleaners',
      campaignName: 'E-com Gadgets (USA) • UGC Hook #4',
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
      name: 'iPhone Storage Full Warning Red Alert animation',
      adSetId: 'adset-204',
      adSetName: 'iOS 16+ • Memory Optimizer • Broad Tier-1',
      campaignName: 'Mobile Cleaner iOS (Tier-1) • Target CPA',
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
      name: 'Crypto Masterclass Free PDF Lead Magnet',
      adSetId: 'adset-205',
      adSetName: 'LATAM Retargeting • 30D Engagers',
      campaignName: 'Crypto Info LeadGen (LATAM) • Retargeting',
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
  setCampaignFilterTab: (tab) => set({ campaignFilterTab: tab }),
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
  toggleRightSidebar: () => set((state) => ({ isRightSidebarOpen: !state.isRightSidebarOpen })),
  activeRightSidebarTab: 'groups',
  setActiveRightSidebarTab: (tab) => set({ activeRightSidebarTab: tab }),
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
  isDisplayOptionsOpen: false,
  setIsDisplayOptionsOpen: (open) => set({ isDisplayOptionsOpen: open }),
  toggleDisplayOptions: () => set((state) => ({ isDisplayOptionsOpen: !state.isDisplayOptionsOpen })),
  displayGrouping: 'none',
  setDisplayGrouping: (grouping) => set({ displayGrouping: grouping }),
  displayOrdering: 'manual',
  setDisplayOrdering: (ordering) => set({ displayOrdering: ordering }),
  displayProperties: {
    status: true,
    budget: true,
    results: true,
    cpa: true,
    spend: true,
    roi: true,
    rules: true,
    group: false,
    account: false,
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
      campaignName: 'Nutra WeightLoss (Italy) • Broad CBO',
      scope: 'Meta Ads • All Campaigns',
      status: 'active',
      lastRun: '15m ago',
      groupId: 'group-budget',
    },
    {
      id: 'rul-02',
      identifier: 'RUL-02',
      name: 'Scale Winner Budget (+20% daily)',
      condition: 'IF ROI > 140% & Leads ≥ 5',
      action: 'BUDGET +20%',
      campaignName: 'E-com Gadgets (USA) • UGC Hook #4',
      scope: 'TikTok Ads • Broad',
      status: 'active',
      lastRun: '1h ago',
      groupId: 'group-scale',
    },
    {
      id: 'rul-03',
      identifier: 'RUL-03',
      name: 'Kill Zero-Conversions ($50 spend)',
      condition: 'IF Spend > $50 & Leads == 0',
      action: 'PAUSE CAMPAIGN',
      campaignName: 'Mobile Cleaner iOS (Tier-1) • Target CPA',
      scope: 'Google Ads • Search',
      status: 'active',
      lastRun: '3h ago',
      groupId: 'group-budget',
    },
    {
      id: 'rul-04',
      identifier: 'RUL-04',
      name: 'Duplicate Winner AdSet (Auto-Horiz Scale)',
      condition: 'IF Conversions > 10 & CPA < $12',
      action: 'DUPLICATE ADSET',
      campaignName: 'Crypto Info LeadGen (LATAM) • Retargeting',
      scope: 'Meta Ads • CBO',
      status: 'paused',
      lastRun: '2d ago',
      groupId: 'group-scale',
    },
  ],
  ruleGroups: [
    {
      id: 'group-germany',
      name: 'Germany',
      icon: 'custom',
      ruleIds: ['rul-03'],
    },
    {
      id: 'group-netherlands',
      name: 'Netherlands',
      icon: 'custom',
      ruleIds: ['rul-04'],
    },
    {
      id: 'group-italy',
      name: 'Italy',
      icon: 'custom',
      ruleIds: ['rul-01'],
    },
    {
      id: 'group-usa',
      name: 'USA',
      icon: 'custom',
      ruleIds: ['rul-02'],
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
}));
