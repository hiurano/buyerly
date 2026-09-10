import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiError, apiRequest } from '@/lib/api';
import type {
  AnalyticsHierarchyResponse,
  MetaAccount,
  MetaConnection,
} from '@/lib/types';
import { useAppStore } from '@/store/useAppStore';
import { CampaignRow } from './CampaignRow';
import { MetaConnectionDialog } from './MetaConnectionDialog';
import { Button } from '@/ui/Button';
import { Tooltip } from '@/ui/Tooltip';
import { LinearTabs } from '@/ui/LinearTabs';
import {
  LinearDataListColumnHeader,
  LinearDataListStack,
  LinearDataListToolbar,
  LinearDataListViewport,
} from '@/ui/LinearDataList';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/ui/DropdownMenu';
import { getAdsManagerColumns, getAdsManagerTableMinWidth } from './tableColumns';
import {
  LinearPlusIcon,
  LinearSidebarLeftToggleIcon,
} from '@/icons/LinearIcons';
import {
  eligibleMetaAccounts,
  hierarchyCampaignToRow,
  metaAccountLabel,
} from './liveCampaigns';

type LoadState = 'idle' | 'loading' | 'ready' | 'error';

function requestErrorMessage(error: unknown): string {
  if (error instanceof ApiError || error instanceof Error) return error.message;
  return 'Something went wrong. Please try again.';
}

interface DataStateProps {
  title: string;
  detail: string;
  role?: 'status' | 'alert';
  actionLabel?: string;
  onAction?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
}

const DataState: React.FC<DataStateProps> = ({
  title,
  detail,
  role = 'status',
  actionLabel,
  onAction,
  secondaryLabel,
  onSecondary,
}) => (
  <section
    className="flex min-h-52 flex-1 items-center justify-center px-6 text-center"
    role={role}
  >
    <div className="max-w-md">
      <h3 className="text-[14px] font-medium text-[var(--text-primary)]">{title}</h3>
      <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--text-tertiary)]">{detail}</p>
      {(actionLabel || secondaryLabel) && (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          {actionLabel && onAction && (
            <Button variant="primary" onClick={onAction}>
              {actionLabel}
            </Button>
          )}
          {secondaryLabel && onSecondary && (
            <Button onClick={onSecondary}>
              {secondaryLabel}
            </Button>
          )}
        </div>
      )}
    </div>
  </section>
);

export const CampaignsView: React.FC = () => {
  const {
    clearAdsManagerQuickFilter,
    displayOrdering,
    setDisplayOrdering,
    displayProperties,
    clearCampaignSelection,
    isSidebarCollapsed,
    toggleSidebarCollapsed,
  } = useAppStore();

  const requestGenerationRef = useRef(0);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [metaAccounts, setMetaAccounts] = useState<MetaAccount[]>([]);
  const [metaConnections, setMetaConnections] = useState<MetaConnection[]>([]);
  const [accountsState, setAccountsState] = useState<LoadState>('loading');
  const [accountsError, setAccountsError] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [campaigns, setCampaigns] = useState<ReturnType<typeof hierarchyCampaignToRow>[]>([]);
  const [campaignsState, setCampaignsState] = useState<LoadState>('idle');
  const [campaignsError, setCampaignsError] = useState('');
  const [campaignReloadKey, setCampaignReloadKey] = useState(0);
  const [isMetaDialogOpen, setIsMetaDialogOpen] = useState(false);
  const [returnedConnectionId, setReturnedConnectionId] = useState<number | null>(
    Number(new URLSearchParams(window.location.search).get('meta_connection')) || null,
  );

  const refreshMetaAccounts = useCallback(async () => {
    setAccountsState('loading');
    setAccountsError('');
    try {
      const [accounts, connections] = await Promise.all([
        apiRequest<MetaAccount[]>('/api/accounts'),
        apiRequest<MetaConnection[]>('/api/meta/connections').catch(() => []),
      ]);
      const eligibleAccounts = eligibleMetaAccounts(accounts);
      setMetaAccounts(eligibleAccounts);
      setMetaConnections(connections);
      setCampaignsState(eligibleAccounts.length > 0 ? 'loading' : 'idle');
      setSelectedAccountId((current) => {
        if (current && eligibleAccounts.some((account) => account.account_id === current)) {
          return current;
        }
        return eligibleAccounts[0]?.account_id ?? null;
      });
      setAccountsState('ready');
    } catch (error) {
      setAccountsError(requestErrorMessage(error));
      setAccountsState('error');
    }
  }, []);

  useEffect(() => {
    void refreshMetaAccounts();
  }, [refreshMetaAccounts]);

  useEffect(() => {
    clearAdsManagerQuickFilter();
  }, [clearAdsManagerQuickFilter]);

  useEffect(() => {
    const generation = ++requestGenerationRef.current;
    clearCampaignSelection();
    setCampaigns([]);
    setCampaignsError('');
    if (!selectedAccountId) {
      setCampaignsState('idle');
      return undefined;
    }

    setCampaignsState('loading');
    const path =
      `/api/analytics/hierarchy?parent_id=${encodeURIComponent(selectedAccountId)}` +
      '&level=campaign&period=today';
    void apiRequest<AnalyticsHierarchyResponse>(path)
      .then((response) => {
        if (generation !== requestGenerationRef.current) return;
        setCampaigns(response.items.map(hierarchyCampaignToRow));
        setCampaignsState('ready');
      })
      .catch((error) => {
        if (generation !== requestGenerationRef.current) return;
        setCampaignsError(requestErrorMessage(error));
        setCampaignsState('error');
      });

    return () => {
      requestGenerationRef.current += 1;
    };
  }, [campaignReloadKey, clearCampaignSelection, selectedAccountId]);

  const clearMetaCallback = () => {
    window.history.replaceState({}, '', window.location.pathname);
    setReturnedConnectionId(null);
  };

  const openMetaDialog = () => setIsMetaDialogOpen(true);
  const openAccountSelection = () => {
    const activeConnections = metaConnections.filter((connection) => connection.status === 'active');
    if (activeConnections.length === 1) {
      setReturnedConnectionId(activeConnections[0].id);
      return;
    }
    openMetaDialog();
  };

  const selectedAccount = metaAccounts.find(
    (account) => account.account_id === selectedAccountId,
  );
  const selectAccount = (accountId: string) => {
    requestGenerationRef.current += 1;
    clearCampaignSelection();
    setCampaigns([]);
    setCampaignsError('');
    setCampaignsState('loading');
    setSelectedAccountId(accountId);
  };
  const supportedProperties = useMemo(
    () => ({
      ...displayProperties,
      status: true,
      budget: true,
      roi: false,
      rules: false,
      group: false,
      created: false,
    }),
    [displayProperties],
  );
  const parseMetric = (value: string) =>
    Number.parseFloat(value.replace(/[^0-9.-]/g, '')) || 0;
  const directionFactor = sortDirection === 'asc' ? 1 : -1;
  let filteredCampaigns = campaigns;
  if (displayOrdering === 'name') {
    filteredCampaigns = [...filteredCampaigns].sort(
      (a, b) => a.name.localeCompare(b.name) * directionFactor,
    );
  } else if (displayOrdering === 'spend') {
    filteredCampaigns = [...filteredCampaigns].sort(
      (a, b) => (parseMetric(a.spend) - parseMetric(b.spend)) * directionFactor,
    );
  } else if (displayOrdering === 'results') {
    filteredCampaigns = [...filteredCampaigns].sort(
      (a, b) => (a.leadsCount - b.leadsCount) * directionFactor,
    );
  } else if (displayOrdering === 'cpa') {
    filteredCampaigns = [...filteredCampaigns].sort(
      (a, b) => (parseMetric(a.cpa) - parseMetric(b.cpa)) * directionFactor,
    );
  }

  const tableColumns = getAdsManagerColumns('campaigns', supportedProperties);
  const tableMinWidth = getAdsManagerTableMinWidth(tableColumns);

  const renderData = () => {
    if (accountsState === 'loading') {
      return <DataState title="Loading ad accounts…" detail="Reading imported accounts from this workspace." />;
    }
    if (accountsState === 'error') {
      return (
        <DataState
          title="Couldn't load ad accounts"
          detail={accountsError}
          role="alert"
          actionLabel="Retry"
          onAction={() => void refreshMetaAccounts()}
          secondaryLabel="Connect Facebook"
          onSecondary={openMetaDialog}
        />
      );
    }
    if (metaAccounts.length === 0) {
      return (
        <DataState
          title="Connect an ad account"
          detail="Connect Facebook and import at least one account to see real campaign data. Automation stays off after import."
          actionLabel="Connect Facebook"
          onAction={openAccountSelection}
        />
      );
    }
    if (campaignsState === 'loading') {
      return <DataState title="Loading campaigns…" detail="Reading saved Meta campaign inventory and today's metrics." />;
    }
    if (campaignsState === 'error') {
      return (
        <DataState
          title="Couldn't load campaigns"
          detail={campaignsError}
          role="alert"
          actionLabel="Retry"
          onAction={() => setCampaignReloadKey((value) => value + 1)}
          secondaryLabel="Connect Facebook"
          onSecondary={openMetaDialog}
        />
      );
    }
    if (campaigns.length === 0) {
      return (
        <DataState
          title="No campaigns in this ad account"
          detail="Meta returned no campaign inventory for this imported account. Campaigns with zero activity today are included when they exist."
          actionLabel="Retry"
          onAction={() => setCampaignReloadKey((value) => value + 1)}
        />
      );
    }

    return (
      <LinearDataListViewport className="campaign-list-container" horizontal>
        <div style={{ minWidth: `${tableMinWidth}px` }}>
          <LinearDataListColumnHeader
            columns={tableColumns}
            minWidth={tableMinWidth}
            sortKey={displayOrdering === 'manual' ? undefined : displayOrdering}
            sortDirection={sortDirection}
            onSort={(columnId) => {
              if (displayOrdering === columnId) {
                setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'));
              } else {
                setDisplayOrdering(columnId as typeof displayOrdering);
                setSortDirection(columnId === 'name' ? 'asc' : 'desc');
              }
            }}
          />
          <LinearDataListStack>
            {filteredCampaigns.map((campaign) => (
              <CampaignRow
                key={campaign.id}
                campaign={campaign}
                properties={supportedProperties}
                readOnly
                showIdentifier
              />
            ))}
          </LinearDataListStack>
        </div>
      </LinearDataListViewport>
    );
  };

  return (
    <div className="flex h-full w-full select-none flex-col overflow-hidden bg-transparent">
      <header className="flex shrink-0 flex-col">
        <div
          style={{ borderBottom: '1px solid var(--color-border-primary)', paddingLeft: '14px' }}
          className="flex h-[44px] items-center justify-between pr-2.5"
        >
          <div className="flex items-center">
            <div
              style={{
                width: isSidebarCollapsed ? '28px' : '0px',
                opacity: isSidebarCollapsed ? 1 : 0,
                transform: isSidebarCollapsed ? 'scale(1)' : 'scale(0.85)',
                marginRight: isSidebarCollapsed ? '6px' : '0px',
                pointerEvents: isSidebarCollapsed ? 'auto' : 'none',
                overflow: 'hidden',
                transition:
                  'width 0.32s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.22s cubic-bezier(0.16, 1, 0.3, 1), transform 0.22s cubic-bezier(0.16, 1, 0.3, 1), margin-right 0.32s cubic-bezier(0.16, 1, 0.3, 1)',
              }}
              className="flex shrink-0 items-center justify-center"
            >
              <Tooltip content="Open sidebar" shortcut="[" side="bottom" sideOffset={6}>
                <button
                  type="button"
                  onClick={toggleSidebarCollapsed}
                  className="linear-icon-btn"
                  aria-label="Open sidebar"
                >
                  <LinearSidebarLeftToggleIcon size={14} isOpen={false} aria-hidden="true" />
                </button>
              </Tooltip>
            </div>
            <h2 className="text-[13px] font-medium tracking-[-0.01em] text-[var(--text-secondary)]">
              Ads Manager
            </h2>
          </div>
          <button
            className="inline-flex h-7 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-[12px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--item-hover-bg)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--focus-ring-color)]"
            type="button"
            onClick={openMetaDialog}
          >
            <LinearPlusIcon size={14} />
            <span>Connect Facebook</span>
          </button>
        </div>

        <LinearDataListToolbar>
          <div className="flex min-w-0 items-center gap-3">
            <LinearTabs
              tabs={[
                { id: 'campaigns', label: 'Campaigns', count: campaignsState === 'ready' ? campaigns.length : undefined },
                { id: 'adsets', label: 'Ad sets', disabled: true },
                { id: 'ads', label: 'Ads', disabled: true },
              ]}
              activeTabId="campaigns"
              onChange={() => undefined}
              aria-label="Ads Manager level"
            />
            <span className="hidden text-[11px] text-[var(--text-muted)] md:inline">Today · read-only</span>
          </div>

          <div className="flex min-w-0 items-center gap-1.5">
            {selectedAccount && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="max-w-[120px] truncate rounded-full border border-[var(--color-border-secondary)] px-2.5 py-1 text-[12px] font-medium text-[var(--text-secondary)] hover:bg-[var(--item-hover-bg)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--focus-ring-color)] sm:max-w-[220px] lg:max-w-[280px]"
                    aria-label="Select ad account"
                    title={metaAccountLabel(selectedAccount)}
                  >
                    {metaAccountLabel(selectedAccount)} ▾
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  style={{ width: 'min(360px, calc(100vw - 32px))' }}
                >
                  <DropdownMenuLabel>Ad account</DropdownMenuLabel>
                  {metaAccounts.map((account) => (
                    <DropdownMenuItem
                      key={account.account_id}
                      onSelect={() => selectAccount(account.account_id)}
                    >
                      <span className="truncate">{metaAccountLabel(account)}</span>
                      {account.account_id === selectedAccountId && <span aria-hidden="true">✓</span>}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </LinearDataListToolbar>
      </header>

      <div className="flex min-h-0 flex-1 overflow-hidden">{renderData()}</div>

      <MetaConnectionDialog
        open={isMetaDialogOpen || returnedConnectionId !== null}
        connectionId={returnedConnectionId}
        returnPath={window.location.pathname}
        onOpenChange={(open) => {
          if (!open) {
            setIsMetaDialogOpen(false);
            clearMetaCallback();
          }
        }}
        onImported={() => {
          void refreshMetaAccounts().then(() => setCampaignReloadKey((value) => value + 1));
        }}
      />
    </div>
  );
};
