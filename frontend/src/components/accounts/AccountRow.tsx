import React from 'react';
import * as stylex from '@stylexjs/stylex';
import type { MetaAccount } from '@/lib/types';
import {
  BuyerlyDataListRow,
  BuyerlyDataMetricCell,
  type BuyerlyDataListColumn,
} from '@/ui/BuyerlyDataList';
import { BuyerlyProjectIcon, BuyerlyDotsIcon, BuyerlyCopyIdIcon } from '@/icons/BuyerlyIcons';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/ui/DropdownMenu';
import { BuyerlyRowContextMenu, DropdownEntries, type RowMenuEntry } from '@/ui/BuyerlyRowMenu';
import { useMediaQuery } from '@/lib/useMediaQuery';
import { accountName } from './accountsModel';
import { AccountLeadPicker } from './AccountLeadPicker';
import type { AccountMember } from './accountsData';
import { AccountRulesLabel, AccountStatusLabel, ConnectionProblemIcon, accountMoney, leadsText } from './AccountParts';
import { colors } from '@/styles/tokens.stylex';
import { rowMarker } from '@/ui/markers.stylex';

const TOUCH = '@media (hover: none) and (pointer: coarse)';

const styles = stylex.create({
  // Shows while its row is hovered, its menu open or it has focus; always on a touch screen.
  menuTrigger: {
    display: 'flex',
    height: {
      default: 24,
      [TOUCH]: 40,
    },
    width: {
      default: 24,
      [TOUCH]: 32,
    },
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 4,
    color: {
      default: colors['--text-tertiary'],
      ':hover': colors['--text-primary'],
    },
    backgroundColor: {
      default: null,
      ':hover': colors['--item-hover-bg'],
    },
    opacity: {
      default: 0,
      [stylex.when.ancestor(':hover', rowMarker)]: 1,
      ':is([data-state="open"])': 1,
      ':focus-visible': 1,
      '@media (hover: none)': 1,
    },
    transitionProperty: 'all',
    transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
    transitionDuration: '150ms',
    outline: {
      default: null,
      ':focus-visible': '2px solid transparent',
    },
    outlineOffset: {
      default: null,
      ':focus-visible': 2,
    },
    boxShadow: {
      default: null,
      ':focus-visible': `0 0 0 2px ${colors['--focus-ring-color']}`,
    },
  },
  // On the account's own page: a round 28px button, always shown.
  menuTriggerHeader: {
    height: {
      default: 28,
      [TOUCH]: 40,
    },
    width: {
      default: 28,
      [TOUCH]: 32,
    },
    borderRadius: 9999,
    opacity: null,
  },
  row: {
    cursor: 'pointer',
  },
  name: {
    display: 'flex',
    minWidth: 0,
    alignItems: 'center',
    gap: 12,
  },
  icon: {
    display: 'flex',
    height: 16,
    width: 16,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    color: colors['--text-tertiary'],
  },
  nameLine: {
    display: 'flex',
    minWidth: 0,
    alignItems: 'center',
    gap: 6,
  },
  nameText: {
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: 13,
    fontWeight: 500,
    color: colors['--text-primary'],
  },
  nameInactive: {
    color: colors['--text-tertiary'],
  },
  status: {
    display: 'flex',
    minWidth: 0,
    alignItems: 'center',
    fontSize: 12,
    fontWeight: 450,
    color: colors['--text-secondary'],
  },
  lead: {
    display: 'flex',
    alignItems: 'center',
  },
  rules: {
    display: 'flex',
    minWidth: 0,
    alignItems: 'center',
    paddingLeft: 24,
    fontSize: 12,
    fontWeight: 450,
    color: colors['--text-secondary'],
  },
  actions: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
});

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
export function accountMenuEntries(account: MetaAccount, actions: AccountRowActions, inHeader = false): RowMenuEntry[] {
  const automationBlocked = !account.rules_enabled && (account.active_rules?.length ?? 0) === 0;
  return [
    // The page itself has "Campaigns" beside this menu.
    ...(!inHeader ? [{ label: 'Open', onSelect: () => actions.open(account) }] : []),
    ...(!inHeader && account.is_active !== false ? [{ label: 'Open campaigns', onSelect: () => actions.openInAdsManager(account) }] : []),
    'separator',
    ...(actions.canAct
      ? [
        { label: 'Rename…', onSelect: () => actions.rename(account) },
        {
          label: account.rules_enabled ? 'Turn automation off' : 'Turn automation on',
          disabled: automationBlocked,
          onSelect: () => actions.toggleAutomation(account),
        },
      ]
      : []),
    'separator',
    { label: 'Copy account ID', icon: <BuyerlyCopyIdIcon size={16} />, onSelect: () => actions.copyId(account) },
    ...(actions.canEdit ? ['separator' as const, { label: 'Remove from workspace…', onSelect: () => actions.remove(account) }] : []),
  ];
}

export const AccountRowMenu: React.FC<{
  account: MetaAccount;
  actions: AccountRowActions;
  /** On the account's own page: always shown, and without "Open". */
  inHeader?: boolean;
}> = ({ account, actions, inHeader = false }) => (
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <button
        type="button"
        aria-label={`Actions for ${accountName(account)}`}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') event.stopPropagation(); }}
        {...stylex.props(styles.menuTrigger, inHeader && styles.menuTriggerHeader)}
      >
        <BuyerlyDotsIcon size={14} />
      </button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" sideOffset={4} onClick={(event) => event.stopPropagation()}>
      <DropdownEntries entries={accountMenuEntries(account, actions, inHeader)} />
    </DropdownMenuContent>
  </DropdownMenu>
);

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
    <BuyerlyRowContextMenu entries={accountMenuEntries(account, actions)}>
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
      xstyle={styles.row}
    >
      <div {...stylex.props(styles.name)} title={`${name} · ${account.account_id}`}>
        {/* A phone keeps the width for the name. */}
        {!phone && (
          <span {...stylex.props(styles.icon)} aria-hidden="true">
            <BuyerlyProjectIcon size={14} />
          </span>
        )}
        <span {...stylex.props(styles.nameLine)}>
          <span {...stylex.props(styles.nameText, account.is_active === false && styles.nameInactive)}>
            {name}
          </span>
          <ConnectionProblemIcon account={account} onReconnect={actions.canEdit ? actions.reconnect : undefined} />
        </span>
      </div>

      {properties.status !== false && (
        <div {...stylex.props(styles.status)}>
          <AccountStatusLabel account={account} />
        </div>
      )}

      {!phone && properties.lead !== false && (
        <div {...stylex.props(styles.lead)} onClick={(event) => event.stopPropagation()}>
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
        <div {...stylex.props(styles.rules)}>
          <AccountRulesLabel account={account} />
        </div>
      )}

      <div {...stylex.props(styles.actions)} onClick={(event) => event.stopPropagation()}>
        <AccountRowMenu account={account} actions={actions} />
      </div>
    </BuyerlyDataListRow>
    </BuyerlyRowContextMenu>
  );
};

export const usePhoneWidth = () => useMediaQuery(PHONE_QUERY);
