import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { observer } from 'mobx-react-lite';
import type { MetaAccount } from '@/lib/types';
import { SidebarCollapsedNavigation } from '@/components/sidebar/SidebarCollapsedNavigation';
import {
  ActiveFilterFormula,
  FilteredEmptyState,
  BuyerlyFilterButton,
  BuyerlyFilterMenu,
  type FilterMenuMode,
} from '@/components/filters/BuyerlyFilter';
import { applyFilterClauses, type FilterClause } from '@/components/filters/filterModel';
import { MetaConnectionDialog } from '@/components/campaigns/MetaConnectionDialog';
import { DisplayOptionsChangedDot } from '@/ui/BuyerlyDisplayOptions';
import { BuyerlyDataListGroup, BuyerlyDataListToolbar, BuyerlyDataTable } from '@/ui/BuyerlyDataList';
import { BuyerlyTabs } from '@/ui/BuyerlyTabs';
import { DataState } from '@/ui/DataState';
import { Tooltip } from '@/ui/Tooltip';
import { HeaderCreateButton } from '@/ui/HeaderCreateButton';
import { ConfirmDialog } from '@/ui/ConfirmDialog';
import { arrangeGroups, sortByColumn } from '@/ui/listView';
import { useFiltersInAddress, writeFilterParam } from '@/ui/useListView';
import { BuyerlySlidersIcon } from '@/icons/BuyerlyIcons';
import { useWorkspaceSession } from '@/lib/workspaceSession';
import { useActiveTeam } from '@/lib/teams';
import { favoritePath } from '@/lib/favorites';
import { pathForTab } from '@/lib/routing';
import { usePagePathname } from '@/lib/pageScope';
import { ViewTitle } from '@/components/teams/ViewTitle';
import { AccountDisplayOptionsPopover } from './AccountDisplayOptionsPopover';
import { AccountRow, getAccountColumns, usePhoneWidth, type AccountRowActions } from './AccountRow';
import { RenameAccountDialog } from './AccountParts';
import { copyAccountId, useAccountsView, useWorkspaceAccounts, type WorkspaceAccounts } from './accountsData';
import {
  accountAdsManagerPath,
  accountGroupsFor,
  accountName,
  accountPagePath,
  createAccountFilterFields,
  naturalAccountDirection,
  sortAccounts,
} from './accountsModel';

const styles = stylex.create({
  root: {
    display: 'flex',
    height: '100%',
    width: '100%',
    userSelect: 'none',
    flexDirection: 'column',
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
  header: {
    display: 'flex',
    flexShrink: 0,
    flexDirection: 'column',
  },
  // The 44px title bar over a hairline.
  titleBar: {
    display: 'flex',
    height: 44,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 18,
    paddingRight: 11,
  },
  title: {
    display: 'flex',
    alignItems: 'center',
  },
  toolbar: {
    gap: 8,
  },
  body: {
    display: 'flex',
    minHeight: 0,
    minWidth: 0,
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: '0%',
  },
  actions: {
    display: 'flex',
    flexShrink: 0,
    alignItems: 'center',
    gap: 6,
  },
  scroll: {
    minWidth: 0,
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: '0%',
    overflowY: 'auto',
  },
});

interface OpenFilterMenu {
  mode: FilterMenuMode;
  anchor: HTMLElement;
  fieldId?: string;
}

/** What the list and the account page share: the Add account dialog, Rename and Remove. */
export function useAccountDialogs(data: WorkspaceAccounts, onRemoved?: () => void) {
  const pathname = usePagePathname();
  const [addOpen, setAddOpen] = useState(false);
  const [returnedConnectionId, setReturnedConnectionId] = useState<number | null>(
    Number(new URLSearchParams(window.location.search).get('meta_connection')) || null,
  );
  const [renaming, setRenaming] = useState<MetaAccount | null>(null);
  const [removing, setRemoving] = useState<MetaAccount | null>(null);
  const [busy, setBusy] = useState(false);

  const clearMetaCallback = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete('meta_connection');
    window.history.replaceState(window.history.state, '', url);
    setReturnedConnectionId(null);
  };

  const element = (
    <>
      <MetaConnectionDialog
        open={addOpen || returnedConnectionId !== null}
        connectionId={returnedConnectionId}
        returnPath={pathname}
        onOpenChange={(open) => {
          if (!open) {
            setAddOpen(false);
            clearMetaCallback();
          }
        }}
        onImported={() => void data.refresh()}
      />
      <RenameAccountDialog
        account={renaming}
        onCancel={() => setRenaming(null)}
        onSave={(name) => {
          const account = renaming;
          setRenaming(null);
          if (account) void data.saveProfile(account, { custom_name: name });
        }}
      />
      <ConfirmDialog
        open={Boolean(removing)}
        title={removing ? `Remove ${accountName(removing)} from the workspace?` : ''}
        description="Buyerly stops reading it, its rules stop acting on it, and it leaves every team. The account itself stays in Meta; Add account brings it back."
        confirmLabel="Remove"
        busy={busy}
        onCancel={() => setRemoving(null)}
        onConfirm={async () => {
          if (!removing) return;
          setBusy(true);
          const removed = await data.remove(removing);
          setBusy(false);
          setRemoving(null);
          if (removed) onRemoved?.();
        }}
      />
    </>
  );

  return {
    element,
    openAdd: () => setAddOpen(true),
    rename: setRenaming,
    remove: setRemoving,
  };
}

interface AccountsViewProps {
  navigate: (path: string) => void;
  /** Changes on every navigation, Back and Forward included. */
  navigationKey: number;
}

/** Linear's Projects for ad accounts: every account of the workspace with today's numbers (#388). */
const AccountsViewContent: React.FC<AccountsViewProps> = ({ navigate, navigationKey }) => {
  const { workspace } = useWorkspaceSession();
  const data = useWorkspaceAccounts();
  const { teams, state, error, canEdit } = data;
  // A team's Ad accounts, as Linear's team Projects: only the accounts on that team.
  const activeTeam = useActiveTeam(workspace.id);
  const team = activeTeam.team;
  const accounts = useMemo(
    () => (team ? data.accounts.filter((account) => account.id !== undefined && team.account_ids.includes(account.id)) : data.accounts),
    [data.accounts, team],
  );
  const dialogs = useAccountDialogs(data);
  const { view, update, loaded, displayChanged } = useAccountsView();
  const phone = usePhoneWidth();
  const [isDisplayOpen, setIsDisplayOpen] = useState(false);
  const [openFilterMenu, setOpenFilterMenu] = useState<OpenFilterMenu | null>(null);
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const filterButtonRef = useRef<HTMLButtonElement>(null);
  const displayButtonRef = useRef<HTMLButtonElement>(null);

  const setFilters = (clauses: FilterClause[]) => {
    update({ filters: clauses });
    writeFilterParam(clauses.length ? clauses : null);
  };
  useFiltersInAddress(view.filters, (clauses) => update({ filters: clauses }), loaded, navigationKey);

  const leads = useMemo(
    () => data.members.map((member) => ({ user_id: member.user_id, name: member.full_name || member.username })),
    [data.members],
  );
  const filterFields = useMemo(() => createAccountFilterFields(accounts, teams, leads), [accounts, teams, leads]);
  const shown = useMemo(
    () => sortAccounts(applyFilterClauses(accounts, filterFields, view.filters), view.ordering, view.direction),
    [accounts, filterFields, view.filters, view.ordering, view.direction],
  );
  const columns = getAccountColumns(view.properties, phone);

  const actions: AccountRowActions = {
    canEdit,
    canAct: data.canAct,
    members: data.members,
    setLead: (account, leadUserId) => void data.saveLead(account, leadUserId),
    open: (account) => navigate(accountPagePath(workspace.slug, account.account_id)),
    openInAdsManager: (account) => navigate(accountAdsManagerPath(workspace.slug, account.account_id)),
    rename: dialogs.rename,
    toggleAutomation: (account) => void data.toggleAutomation(account),
    copyId: (account) => void copyAccountId(account.account_id),
    remove: dialogs.remove,
    reconnect: dialogs.openAdd,
  };

  // Shift V opens Display options and F the filter, as on every list.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if ((event.key === 'v' || event.key === 'V') && event.shiftKey) {
        event.preventDefault();
        setOpenFilterMenu(null);
        setIsDisplayOpen((open) => !open);
      } else if ((event.key === 'f' || event.key === 'F') && filterButtonRef.current) {
        event.preventDefault();
        setIsDisplayOpen(false);
        const anchor = filterButtonRef.current;
        setOpenFilterMenu((current) => (current ? null : { mode: 'root', anchor }));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const renderRows = () => {
    const row = (account: MetaAccount) => (
      <AccountRow key={account.account_id} account={account} columns={columns} properties={view.properties} phone={phone} actions={actions} />
    );
    if (view.grouping !== 'status' && view.grouping !== 'team' && view.grouping !== 'lead') return shown.map(row);
    return arrangeGroups(accountGroupsFor(view.grouping, shown, teams, leads), view).map((group) => (
      <BuyerlyDataListGroup
        key={group.id}
        title={group.label}
        count={group.rows.length}
        dotColor={group.dotColor}
        isCollapsed={collapsed.includes(group.id)}
        onToggleCollapse={() => setCollapsed((current) => (
          current.includes(group.id) ? current.filter((id) => id !== group.id) : [...current, group.id]
        ))}
      >
        {group.rows.map(row)}
      </BuyerlyDataListGroup>
    ));
  };

  const renderBody = () => {
    if (activeTeam.missing) {
      return <DataState title="Team not found" detail="This workspace has no team with that identifier." />;
    }
    if (state === 'loading' || activeTeam.loading) {
      return <DataState title="Loading ad accounts…" detail="Reading the ad accounts of this workspace." />;
    }
    if (state === 'error') {
      return (
        <DataState
          title="Couldn't load ad accounts"
          detail={error}
          role="alert"
          actionLabel="Retry"
          onAction={() => void data.refresh()}
        />
      );
    }
    // With none in the workspace yet, the team shows the workspace's own empty state and Add account.
    if (accounts.length === 0 && team && data.accounts.length > 0) {
      return (
        <DataState
          title="No ad accounts in this team"
          detail={`Ad accounts added to ${team.name} in its settings show here.`}
        />
      );
    }
    if (accounts.length === 0) {
      return (
        <DataState
          title="No ad accounts yet"
          detail="Add an ad account to see its spend and leads here and let rules act on it. Automation stays off after import."
          actionLabel={canEdit ? 'Add account' : undefined}
          onAction={canEdit ? dialogs.openAdd : undefined}
        />
      );
    }
    if (shown.length === 0) {
      return (
        <div {...stylex.props(styles.scroll)}>
          <FilteredEmptyState noun="ad accounts" hiddenCount={accounts.length} onClear={() => setFilters([])} />
        </div>
      );
    }
    return (
      <BuyerlyDataTable
        columns={columns}
        sortKey={view.ordering === 'added' ? undefined : view.ordering}
        sortDirection={view.direction}
        onSort={(columnId) => update(sortByColumn(view, columnId, naturalAccountDirection(columnId)))}
      >
        {renderRows()}
      </BuyerlyDataTable>
    );
  };

  return (
    <div {...stylex.props(styles.root)}>
      <header {...stylex.props(styles.header)}>
        {/* --canvas-border is a whole border; StyleX would split the shorthand and lose it. */}
        <div {...stylex.props(styles.titleBar)} style={{ borderBottom: 'var(--canvas-border)' }}>
          <div {...stylex.props(styles.title)}>
            <SidebarCollapsedNavigation />
            <ViewTitle
              title="Ad accounts"
              team={team}
              favorite={{
                kind: 'page',
                path: favoritePath(pathForTab(workspace.slug, 'accounts', 'campaigns', 'preferences', '', undefined, activeTeam.key), workspace.slug),
                title: team ? `${team.name} › Ad accounts` : 'Ad accounts',
              }}
            />
          </div>
          {canEdit && <HeaderCreateButton label="Add account" tooltip="Add ad account" onClick={dialogs.openAdd} />}
        </div>

        <BuyerlyDataListToolbar xstyle={styles.toolbar}>
          <BuyerlyTabs
            collapseOverflow
            tabs={[{ id: 'all', label: 'All ad accounts' }]}
            activeTabId="all"
            onChange={() => {}}
          />
          <div {...stylex.props(styles.actions)}>
            <Tooltip content="Add Filter" shortcut="F" disabled={Boolean(openFilterMenu)}>
              <BuyerlyFilterButton
                ref={filterButtonRef}
                active={view.filters.length > 0}
                open={Boolean(openFilterMenu)}
                onMouseDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  const anchor = event.currentTarget;
                  setIsDisplayOpen(false);
                  setOpenFilterMenu((current) => (current ? null : { mode: 'root', anchor }));
                }}
              />
            </Tooltip>
            <Tooltip content="Show display options" shortcut="Shift V" align="end" disabled={isDisplayOpen}>
              <button
                ref={displayButtonRef}
                type="button"
                aria-label="Display options"
                data-active={isDisplayOpen ? 'true' : undefined}
                onMouseDown={(event) => event.stopPropagation()}
                onClick={() => {
                  setOpenFilterMenu(null);
                  setIsDisplayOpen((open) => !open);
                }}
                className="buyerly-header-button buyerly-header-button--toolbar buyerly-header-target"
              >
                <BuyerlySlidersIcon size={14} />
                <DisplayOptionsChangedDot show={displayChanged} />
              </button>
            </Tooltip>
            <AccountDisplayOptionsPopover
              isOpen={isDisplayOpen}
              onClose={() => setIsDisplayOpen(false)}
              anchorRef={displayButtonRef}
              accounts={accounts}
              teams={teams}
              leads={leads}
            />
          </div>
        </BuyerlyDataListToolbar>

        <ActiveFilterFormula
          fields={filterFields}
          clauses={view.filters}
          onChange={setFilters}
          onOpenMenu={(mode, anchor, fieldId) => setOpenFilterMenu({ mode, anchor, fieldId })}
        />
      </header>

      <BuyerlyFilterMenu
        isOpen={Boolean(openFilterMenu)}
        mode={openFilterMenu?.mode ?? 'root'}
        anchorElement={openFilterMenu?.anchor ?? null}
        fieldId={openFilterMenu?.fieldId}
        fields={filterFields}
        clauses={view.filters}
        onChange={setFilters}
        onClose={() => setOpenFilterMenu(null)}
        items={accounts}
        countNoun={['account', 'accounts']}
      />

      <div {...stylex.props(styles.body)}>{renderBody()}</div>

      {dialogs.element}
    </div>
  );
};

/** Draws the pool's models as they change (#488). */
export const AccountsView = observer(AccountsViewContent);
