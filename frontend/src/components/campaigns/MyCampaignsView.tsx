import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { apiRequest } from '@/lib/api';
import type { AnalyticsHierarchyResponse, MetaAccount } from '@/lib/types';
import { useWorkspaceSession } from '@/lib/workspaceSession';
import { useAppStore, type AdsManagerEntity } from '@/store/useAppStore';
import { SidebarCollapsedNavigation } from '@/components/sidebar/SidebarCollapsedNavigation';
import { DataState } from '@/ui/DataState';
import { LinearTabs } from '@/ui/LinearTabs';
import { LinearDataListGroup, LinearDataListToolbar, LinearDataTable } from '@/ui/LinearDataList';
import { CampaignRow } from './CampaignRow';
import { AdSetRow } from './AdSetRow';
import { AdRow } from './AdRow';
import { getAdsManagerColumns } from './tableColumns';
import { useAdsManagerView } from './adsManagerViewModel';
import {
  eligibleMetaAccounts,
  hierarchyAdSetToRow,
  hierarchyAdToRow,
  hierarchyCampaignToRow,
  metaAccountLabel,
} from './liveCampaigns';

type CampaignRowItem = ReturnType<typeof hierarchyCampaignToRow>;
type AdSetRowItem = ReturnType<typeof hierarchyAdSetToRow>;
type AdRowItem = ReturnType<typeof hierarchyAdToRow>;

/** One account's three levels, as Ads Manager reads them for today. */
interface AccountHierarchy {
  account: MetaAccount;
  campaigns: CampaignRowItem[];
  adSets: AdSetRowItem[];
  ads: AdRowItem[];
  error?: string;
}

const LEVELS: { id: AdsManagerEntity; label: string }[] = [
  { id: 'campaigns', label: 'Campaigns' },
  { id: 'adsets', label: 'Ad sets' },
  { id: 'ads', label: 'Ads' },
];

const errorText = (error: unknown) => (error instanceof Error ? error.message : 'Please try again.');

async function loadHierarchy(account: MetaAccount): Promise<AccountHierarchy> {
  const request = (level: 'campaign' | 'adset' | 'ad') =>
    apiRequest<AnalyticsHierarchyResponse>(
      `/api/analytics/hierarchy?parent_id=${encodeURIComponent(account.account_id)}&level=${level}&period=today`,
    );
  try {
    const [campaignResponse, adSetResponse, adResponse] = await Promise.all([
      request('campaign'),
      request('adset'),
      request('ad'),
    ]);
    const campaigns = campaignResponse.items.map(hierarchyCampaignToRow);
    const campaignNames = new Map(campaigns.map((campaign) => [campaign.id, campaign.name]));
    const adSets = adSetResponse.items.map((item) => hierarchyAdSetToRow(item, campaignNames));
    const adSetsById = new Map(adSets.map((adSet) => [adSet.id, adSet]));
    return { account, campaigns, adSets, ads: adResponse.items.map((item) => hierarchyAdToRow(item, adSetsById)) };
  } catch (error) {
    return { account, campaigns: [], adSets: [], ads: [], error: errorText(error) };
  }
}

/**
 * Linear's My issues for Buyerly: the campaigns, ad sets and ads of every ad
 * account you lead, in one list grouped by account. A row opens in Ads Manager.
 */
export const MyCampaignsView: React.FC<{ navigate: (path: string) => void }> = ({ navigate }) => {
  const { workspace, user } = useWorkspaceSession();
  const level = useAppStore((state) => state.campaignFilterTab);
  const setLevel = useAppStore((state) => state.setCampaignFilterTab);
  const { view } = useAdsManagerView(level);
  const [accounts, setAccounts] = useState<MetaAccount[] | null>(null);
  const [hierarchies, setHierarchies] = useState<AccountHierarchy[] | null>(null);
  const [error, setError] = useState('');
  const [collapsed, setCollapsed] = useState<string[]>([]);

  const load = useCallback(async () => {
    setError('');
    setHierarchies(null);
    try {
      const all = eligibleMetaAccounts(await apiRequest<MetaAccount[]>('/api/accounts'));
      const mine = all.filter((account) => account.lead_user_id != null && account.lead_user_id === user.id);
      setAccounts(mine);
      setHierarchies(await Promise.all(mine.map(loadHierarchy)));
    } catch (loadError) {
      setError(errorText(loadError));
    }
  }, [user.id]);

  useEffect(() => {
    void load();
  }, [load, workspace.id]);

  // The rules on a row belong to Ads Manager's account at a time; here each row only opens.
  const properties = useMemo(() => ({ ...view.properties, rules: false }), [view.properties]);
  const columns = useMemo(() => getAdsManagerColumns(level, properties), [level, properties]);

  const open = (account: MetaAccount, id: string) => {
    navigate(`/${workspace.slug}/ads-manager/${level}/${encodeURIComponent(id)}?account=${encodeURIComponent(account.account_id)}`);
  };

  const rowsOf = (item: AccountHierarchy) => {
    if (level === 'adsets') {
      return item.adSets.map((adSet) => (
        <div key={adSet.id} className="cursor-pointer" onClick={() => open(item.account, adSet.id)}>
          <AdSetRow adSet={adSet} readOnly properties={properties} columns={columns} />
        </div>
      ));
    }
    if (level === 'ads') {
      return item.ads.map((ad) => (
        <div key={ad.id} className="cursor-pointer" onClick={() => open(item.account, ad.id)}>
          <AdRow ad={ad} readOnly properties={properties} columns={columns} />
        </div>
      ));
    }
    return item.campaigns.map((campaign) => (
      <div key={campaign.id} className="cursor-pointer" onClick={() => open(item.account, campaign.id)}>
        <CampaignRow campaign={campaign} readOnly properties={properties} columns={columns} />
      </div>
    ));
  };

  const countOf = (item: AccountHierarchy) =>
    level === 'adsets' ? item.adSets.length : level === 'ads' ? item.ads.length : item.campaigns.length;

  const renderBody = () => {
    if (error) return <DataState title="Couldn't load your campaigns" detail={error} role="alert" actionLabel="Retry" onAction={() => void load()} />;
    if (accounts === null || hierarchies === null) {
      return <DataState title="Loading your campaigns…" detail="Reading the ad accounts you lead." />;
    }
    if (accounts.length === 0) {
      return (
        <DataState
          title="No ad accounts you lead"
          detail="Campaigns of the ad accounts you lead show here. Set yourself as Lead on an ad account's page or in the Ad accounts list."
        />
      );
    }
    return (
      <LinearDataTable columns={columns}>
        {hierarchies.map((item) => (
          <LinearDataListGroup
            key={item.account.account_id}
            title={metaAccountLabel(item.account)}
            count={countOf(item)}
            description={item.error ? `Couldn't load: ${item.error}` : undefined}
            isCollapsed={collapsed.includes(item.account.account_id)}
            onToggleCollapse={() => setCollapsed((current) => (
              current.includes(item.account.account_id)
                ? current.filter((id) => id !== item.account.account_id)
                : [...current, item.account.account_id]
            ))}
          >
            {rowsOf(item)}
          </LinearDataListGroup>
        ))}
      </LinearDataTable>
    );
  };

  return (
    <div className="flex h-full w-full select-none flex-col overflow-hidden bg-transparent">
      <header className="flex shrink-0 flex-col">
        <div
          style={{ borderBottom: 'var(--canvas-border)', paddingLeft: '18px', paddingRight: '11px' }}
          className="flex h-[44px] items-center justify-between"
        >
          <div className="flex items-center">
            <SidebarCollapsedNavigation />
            <h2 className="overflow-hidden whitespace-nowrap text-[13px] font-medium text-[var(--text-secondary)]">My campaigns</h2>
          </div>
          <span className="text-[12px] font-medium text-[var(--text-tertiary)]">Today</span>
        </div>
        <LinearDataListToolbar className="gap-2">
          <LinearTabs
            collapseOverflow
            tabs={LEVELS.map((item) => ({
              id: item.id,
              label: item.label,
              count: hierarchies ? hierarchies.reduce((sum, hierarchy) => sum + (
                item.id === 'adsets' ? hierarchy.adSets.length : item.id === 'ads' ? hierarchy.ads.length : hierarchy.campaigns.length
              ), 0) : undefined,
            }))}
            activeTabId={level}
            onChange={(id) => setLevel(id as AdsManagerEntity)}
          />
        </LinearDataListToolbar>
      </header>
      <div className="flex min-h-0 min-w-0 flex-1">{renderBody()}</div>
    </div>
  );
};
