import React from 'react';
import type { MetaAccount } from '@/lib/types';
import {
  BuyerlyDataListRow,
  BuyerlyDataMetricCell,
  type BuyerlyDataListColumn,
} from '@/ui/BuyerlyDataList';
import { BuyerlyProjectIcon, BuyerlyDotsIcon } from '@/icons/BuyerlyIcons';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/ui/DropdownMenu';
import { useMediaQuery } from '@/lib/useMediaQuery';
import { accountName } from './accountsModel';
import { AccountLeadPicker } from './AccountLeadPicker';
import type { AccountMember } from './accountsData';
import { AccountRulesLabel, AccountStatusLabel, ConnectionProblemIcon, accountMoney, leadsText } from './AccountParts';

/** At phone width the list keeps Name, Status and Spend today (#388). */
export const PHONE_QUERY = '(max-width: 640px)';

export function getAccountColumns(properties: Record<string, boolean>, phone: boolean): BuyerlyDataListColumn[] {
  // The header's label starts over the title, past the 16px icon and its 12px gap (the pill adds 6px).
  const columns: BuyerlyDataListColumn[] = [
    { id: 'name', label: 'Name', width: phone ? 'minmax(120px, 1fr)' : 'minmax(260px, 1fr)', sortable: true, headerInset: phone ? undefined : 22 },
  ];
  if (properties.status !== false) columns.push({ id: 'status', label: 'Status', width: phone ? '84px' : '150px', sortable: true });
  // Linear's Lead column on Projects: a 48px column of 28px avatar buttons.
  if (!phone && properties.lead !== false) columns.push({ id: 'lead', label: 'Lead', width: '48px' });
  if (properties.spend !== false) columns.push({ id: 'spend', label: 'Spend today', width: phone ? '94px' : '130px', align: 'right', sortable: true });
  if (!phone && properties.leads !== false) columns.push({ id: 'leads', label: 'Leads/CPL today', width: '150px', align: 'right' });
  // Text after right-aligned numbers: 24px of air so "Rules" does not read as part of the figure.
  if (!phone && properties.rules !== false) columns.push({ id: 'rules', label: 'Rules', width: '150px', headerInset: 24 });
  columns.push({ id: 'actions', label: '', width: '32px' });
  return columns;
}

export interface AccountRowActions {
  /** Adding, reconnecting and removing accounts: not for guests. */
  canEdit: boolean;
  /** Renaming, automation and Lead on an account you see: guests too. */
  canAct: boolean;
  /** The workspace's members, who may lead an account. */
  members: AccountMember[];
  setLead: (account: MetaAccount, leadUserId: number | null) => void;
  open: (account: MetaAccount) => void;
  openInAdsManager: (account: MetaAccount) => void;
  rename: (account: MetaAccount) => void;
  toggleAutomation: (account: MetaAccount) => void;
  copyId: (account: MetaAccount) => void;
  remove: (account: MetaAccount) => void;
  reconnect: () => void;
}

/** The row's menu, as Linear's project menu: open, rename, automation, copy ID, remove. */
export const AccountRowMenu: React.FC<{
  account: MetaAccount;
  actions: AccountRowActions;
  /** On the account's own page: always shown, and without "Open". */
  inHeader?: boolean;
}> = ({ account, actions, inHeader = false }) => {
  const automationBlocked = !account.rules_enabled && (account.active_rules?.length ?? 0) === 0;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Actions for ${accountName(account)}`}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') event.stopPropagation(); }}
          className={`flex items-center justify-center text-[var(--text-tertiary)] transition-all ${inHeader ? 'h-7 w-7 rounded-full' : 'h-6 w-6 rounded opacity-0'} hover:bg-[var(--item-hover-bg)] hover:text-[var(--text-primary)] group-hover/row:opacity-100 data-[state=open]:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring-color)] [@media(hover:none)]:opacity-100 [@media(hover:none)_and_(pointer:coarse)]:h-10 [@media(hover:none)_and_(pointer:coarse)]:w-8`}
        >
          <BuyerlyDotsIcon size={14} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={4} onClick={(event) => event.stopPropagation()}>
        {/* The page itself has "Campaigns" beside this menu. */}
        {!inHeader && <DropdownMenuItem onSelect={() => actions.open(account)}><span>Open</span></DropdownMenuItem>}
        {!inHeader && account.is_active !== false && (
          <DropdownMenuItem onSelect={() => actions.openInAdsManager(account)}><span>Open campaigns</span></DropdownMenuItem>
        )}
        {actions.canAct && (
          <>
            {!inHeader && <DropdownMenuSeparator />}
            <DropdownMenuItem onSelect={() => actions.rename(account)}><span>Rename…</span></DropdownMenuItem>
            <DropdownMenuItem
              disabled={automationBlocked}
              onSelect={() => actions.toggleAutomation(account)}
              title={automationBlocked ? 'Attach a rule to the account first' : undefined}
              className={automationBlocked ? 'opacity-50' : ''}
            >
              <span>{account.rules_enabled ? 'Turn automation off' : 'Turn automation on'}</span>
            </DropdownMenuItem>
          </>
        )}
        {(!inHeader || actions.canAct) && <DropdownMenuSeparator />}
        <DropdownMenuItem onSelect={() => actions.copyId(account)}><span>Copy account ID</span></DropdownMenuItem>
        {actions.canEdit && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => actions.remove(account)}>
              <span style={{ color: 'var(--rules-action-stop-text)' }}>Remove from workspace…</span>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

interface AccountRowProps {
  account: MetaAccount;
  columns: BuyerlyDataListColumn[];
  properties: Record<string, boolean>;
  phone: boolean;
  actions: AccountRowActions;
}

export const AccountRow: React.FC<AccountRowProps> = ({ account, columns, properties, phone, actions }) => {
  const name = accountName(account);
  const metrics = account.today_metrics;
  return (
    <BuyerlyDataListRow
      data-row-id={account.account_id}
      layout="grid"
      columns={columns}
      tabIndex={0}
      onClick={() => actions.open(account)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && event.target === event.currentTarget) {
          event.preventDefault();
          actions.open(account);
        }
      }}
      className="cursor-pointer"
    >
      <div className="flex min-w-0 items-center gap-3" title={`${name} · ${account.account_id}`}>
        {/* A phone keeps the width for the name. */}
        {!phone && (
          <span className="flex h-4 w-4 shrink-0 items-center justify-center text-[var(--text-tertiary)]" aria-hidden="true">
            <BuyerlyProjectIcon size={14} />
          </span>
        )}
        <span className="flex min-w-0 items-center gap-1.5">
          <span className={`min-w-0 truncate text-[13px] font-medium ${account.is_active === false ? 'text-[var(--text-tertiary)]' : 'text-[var(--text-primary)]'}`}>
            {name}
          </span>
          <ConnectionProblemIcon account={account} onReconnect={actions.canEdit ? actions.reconnect : undefined} />
        </span>
      </div>

      {properties.status !== false && (
        <div className="flex min-w-0 items-center text-[12px] font-[450] text-[var(--text-secondary)]">
          <AccountStatusLabel account={account} />
        </div>
      )}

      {!phone && properties.lead !== false && (
        <div className="flex items-center" onClick={(event) => event.stopPropagation()}>
          <AccountLeadPicker
            account={account}
            members={actions.members}
            canEdit={actions.canAct}
            onChange={(leadUserId) => actions.setLead(account, leadUserId)}
            variant="cell"
          />
        </div>
      )}

      {properties.spend !== false && (
        <BuyerlyDataMetricCell value={accountMoney(metrics?.spend, account)} emphasis={Boolean(metrics?.spend)} />
      )}

      {!phone && properties.leads !== false && <BuyerlyDataMetricCell value={leadsText(account)} />}

      {!phone && properties.rules !== false && (
        <div className="flex min-w-0 items-center pl-6 text-[12px] font-[450] text-[var(--text-secondary)]">
          <AccountRulesLabel account={account} />
        </div>
      )}

      <div className="flex items-center justify-end" onClick={(event) => event.stopPropagation()}>
        <AccountRowMenu account={account} actions={actions} />
      </div>
    </BuyerlyDataListRow>
  );
};

export const usePhoneWidth = () => useMediaQuery(PHONE_QUERY);
