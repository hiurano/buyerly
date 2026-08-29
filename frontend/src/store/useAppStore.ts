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
}

export interface RuleItem {
  id: string;
  identifier: string;
  name: string;
  condition: string;
  action: string;
  scope: string;
  status: 'active' | 'triggered' | 'paused';
  lastRun: string;
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

  // Campaigns State
  campaigns: CampaignItem[];
  campaignFilterTab: 'active' | 'paused' | 'all';
  setCampaignFilterTab: (tab: 'active' | 'paused' | 'all') => void;
  selectedCampaignIds: string[];
  toggleCampaignSelection: (id: string) => void;
  clearCampaignSelection: () => void;
  toggleCampaignDelivery: (id: string) => void;
  focusedCampaignId: string;
  setFocusedCampaignId: (id: string) => void;
  campaignAttachedRules: Record<string, string[]>;
  toggleRuleForCampaign: (campaignId: string, ruleId: string) => void;
  isRightSidebarOpen: boolean;
  toggleRightSidebar: () => void;
  activeRightSidebarTab: 'rules' | 'overview';
  setActiveRightSidebarTab: (tab: 'rules' | 'overview') => void;
  selectedFilterRuleId: string | null;
  setSelectedFilterRuleId: (id: string | null) => void;
  selectedFilterPlatform: string | null;
  setSelectedFilterPlatform: (platform: string | null) => void;

  // Rules State
  rules: RuleItem[];
  ruleFilterTab: 'active' | 'triggered' | 'paused' | 'all';
  setRuleFilterTab: (tab: 'active' | 'triggered' | 'paused' | 'all') => void;
  selectedRuleId: string | null;
  setSelectedRuleId: (id: string | null) => void;
  toggleRuleStatus: (id: string) => void;
  addRule: (rule: Omit<RuleItem, 'id' | 'identifier'>) => void;
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
  setSelectedNotificationId: (id) => set({ selectedNotificationId: id }),
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
    },
    {
      id: 'cmp-103',
      identifier: 'CMP-103',
      name: 'Mobile Cleaner iOS (Tier-1) • Target CPA',
      platform: 'Google',
      status: 'active',
      budget: '$300/day',
      leadsCount: 74,
      cpa: '$12.00',
      spend: '$890 spend',
      roi: '+118% ROI',
      date: 'Aug 28',
    },
    {
      id: 'cmp-104',
      identifier: 'CMP-104',
      name: 'Crypto Info LeadGen (LATAM) • Retargeting',
      platform: 'Meta',
      status: 'paused',
      budget: '$150/day',
      leadsCount: 18,
      cpa: '$25.00',
      spend: '$450 spend',
      roi: '-15% ROI',
      date: 'Aug 26',
    },
  ],
  campaignFilterTab: 'all',
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
  activeRightSidebarTab: 'rules',
  setActiveRightSidebarTab: (tab) => set({ activeRightSidebarTab: tab }),
  selectedFilterRuleId: null,
  setSelectedFilterRuleId: (id) =>
    set((state) => ({ selectedFilterRuleId: state.selectedFilterRuleId === id ? null : id })),
  selectedFilterPlatform: null,
  setSelectedFilterPlatform: (platform) =>
    set((state) => ({ selectedFilterPlatform: state.selectedFilterPlatform === platform ? null : platform })),

  rules: [
    {
      id: 'rul-01',
      identifier: 'RUL-01',
      name: 'Auto-Stop High CPA (> $25)',
      condition: 'IF CPA > $25 & Spend > $40',
      action: 'PAUSE ADSET',
      scope: 'Meta Ads • All Campaigns',
      status: 'active',
      lastRun: '15m ago',
    },
    {
      id: 'rul-02',
      identifier: 'RUL-02',
      name: 'Scale Winner Budget (+20% daily)',
      condition: 'IF ROI > 140% & Leads ≥ 5',
      action: 'BUDGET +20%',
      scope: 'TikTok Ads • Broad',
      status: 'triggered',
      lastRun: '1h ago',
    },
    {
      id: 'rul-03',
      identifier: 'RUL-03',
      name: 'Kill Zero-Conversions ($50 spend)',
      condition: 'IF Spend > $50 & Leads == 0',
      action: 'PAUSE CAMPAIGN',
      scope: 'Google Ads • Search',
      status: 'active',
      lastRun: '3h ago',
    },
    {
      id: 'rul-04',
      identifier: 'RUL-04',
      name: 'Duplicate Winner AdSet (Auto-Horiz Scale)',
      condition: 'IF Conversions > 10 & CPA < $12',
      action: 'DUPLICATE ADSET',
      scope: 'Meta Ads • CBO',
      status: 'paused',
      lastRun: '2d ago',
    },
  ],
  ruleFilterTab: 'active',
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
  addRule: (newRule) =>
    set((state) => {
      const nextIndex = state.rules.length + 1;
      const id = `rul-${String(nextIndex).padStart(2, '0')}`;
      const identifier = `RUL-${String(nextIndex).padStart(2, '0')}`;
      return {
        rules: [
          ...state.rules,
          {
            ...newRule,
            id,
            identifier,
          },
        ],
      };
    }),
}));
