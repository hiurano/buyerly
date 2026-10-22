import React, { useEffect, useRef, useState } from 'react';
import { ChevronRight, Copy } from 'lucide-react';
import type { MetaAccount } from '@/lib/types';
import { apiRequest } from '@/lib/api';
import { useWorkspaceSession } from '@/lib/workspaceSession';
import { auditEventSummary, auditEventTitle, formatAuditRelativeTime, formatAuditTimestamp, type AuditEventListResponse, type AuditEventItem } from '@/lib/audit';
import { attachedRuleScope, formatAccountScope, formatRelativeTime } from '@/lib/rules';
import { useAppStore } from '@/store/useAppStore';
import { SidebarCollapsedNavigation } from '@/components/sidebar/SidebarCollapsedNavigation';
import { AttachRulePreviewDialog } from '@/components/rules/AttachRulePreviewDialog';
import { metaAccountLabel } from '@/components/campaigns/liveCampaigns';
import { Button } from '@/ui/Button';
import { DataState } from '@/ui/DataState';
import { LinearToggle } from '@/ui/LinearToggle';
import { Tooltip } from '@/ui/Tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/ui/DropdownMenu';
import { LinearPlusIcon, LinearWalletIcon, LinearStatusCircleIcon } from '@/icons/LinearIcons';
import { useMediaQuery } from '@/lib/useMediaQuery';
import { AccountRowMenu, type AccountRowActions } from './AccountRow';
import { AccountStatusLabel, ConnectionProblemIcon, accountMoney } from './AccountParts';
import { copyAccountId, useWorkspaceAccounts, type AccountMember } from './accountsData';
import { AccountLeadPicker } from './AccountLeadPicker';
import { useAccountDialogs } from './AccountsView';
import {
  accountAdsManagerPath,
  accountName,
  connectionProblem,
  formatAddedDate,
  teamsOf,
} from './accountsModel';

/** Below this width the properties move under the title, in one column (#388). */
const ONE_COLUMN_QUERY = '(max-width: 1199px)';

interface AccountPageProps {
  accountId: string;
  navigate: (path: string) => void;
  /** Changes on every navigation, Back and Forward included. */
  navigationKey: number;
}

const SectionTitle: React.FC<React.PropsWithChildren<{ action?: React.ReactNode }>> = ({ children, action }) => (
  <div className="mb-2 flex h-7 items-center justify-between">
    <h3 className="m-0 text-[13px] font-medium text-[var(--text-tertiary)]">{children}</h3>
    {action}
  </div>
);

const PropertyRow: React.FC<React.PropsWithChildren<{ label: string }>> = ({ label, children }) => (
  <div className="flex min-h-9 items-center" role="group" aria-label={label}>
    <div className="w-[120px] shrink-0 text-[12px] font-[450] text-[var(--text-tertiary)]">{label}</div>
    <div className="flex min-w-0 flex-1 items-center gap-2 text-[12px] font-[450] text-[var(--text-primary)]">{children}</div>
  </div>
);

const Figure: React.FC<{ label: string; value: string; caption?: string }> = ({ label, value, caption }) => (
  <div className="min-w-0 rounded-[8px] border border-[var(--color-border-primary)] px-3 py-2.5 min-[480px]:px-3.5 min-[480px]:py-3">
    <div className="truncate text-[12px] font-[450] text-[var(--text-tertiary)]">{label}</div>
    <div className="mt-1 truncate text-[16px] min-[480px]:text-[18px] font-semibold tabular-nums text-[var(--text-primary)]">{value}</div>
    {caption && <div className="mt-0.5 truncate text-[12px] tabular-nums text-[var(--text-tertiary)]">{caption}</div>}
  </div>
);

/** One ad account's page, as Linear's project page: name, note, today's numbers, rules, recent events, properties. */
export const AccountPage: React.FC<AccountPageProps> = ({ accountId, navigate, navigationKey }) => {
  const { workspace } = useWorkspaceSession();
  const data = useWorkspaceAccounts();
  const { accounts, teams, members, state, error, canEdit } = data;
  const listPath = `/${workspace.slug}/accounts`;
  const dialogs = useAccountDialogs(data, () => navigate(listPath));
  const oneColumn = useMediaQuery(ONE_COLUMN_QUERY);
  const account = accounts.find((item) => item.account_id === accountId);

  const { rules, loadRules, toggleRuleOnAccount } = useAppStore();
  useEffect(() => {
    void loadRules();
  }, [loadRules]);

  // The last events of this account: rule actions, manual changes, sync errors.
  const [events, setEvents] = useState<AuditEventItem[] | null>(null);
  useEffect(() => {
    let active = true;
    setEvents(null);
    apiRequest<AuditEventListResponse>(`/api/audit-events?page=1&page_size=5&account_id=${encodeURIComponent(accountId)}`)
      .then((result) => { if (active) setEvents(result.items); })
      .catch(() => { if (active) setEvents([]); });
    return () => { active = false; };
  }, [accountId, navigationKey]);

  useEffect(() => {
    if (account) document.title = accountName(account);
  }, [account]);

  const actions: AccountRowActions = {
    canEdit,
    members,
    setLead: (item, leadUserId) => void data.saveLead(item, leadUserId),
    open: () => {},
    openInAdsManager: (item) => navigate(accountAdsManagerPath(workspace.slug, item.account_id)),
    rename: dialogs.rename,
    toggleAutomation: (item) => void data.toggleAutomation(item),
    copyId: (item) => void copyAccountId(item.account_id),
    remove: dialogs.remove,
    reconnect: dialogs.openAdd,
  };

  const header = (
    <div
      style={{ borderBottom: 'var(--canvas-border)', paddingLeft: '18px', paddingRight: '11px' }}
      className="flex h-[44px] shrink-0 items-center justify-between gap-2"
    >
      <div className="flex min-w-0 items-center">
        <SidebarCollapsedNavigation />
        <nav aria-label="Breadcrumb" className="flex min-w-0 items-center">
          <a
            href={listPath}
            onClick={(event) => {
              if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
              event.preventDefault();
              navigate(listPath);
            }}
            className="shrink-0 rounded-[4px] text-[13px] font-medium text-[var(--text-tertiary)] outline-none transition-colors hover:text-[var(--text-primary)] focus-visible:ring-2 focus-visible:ring-[var(--focus-ring-color)]"
          >
            Ad accounts
          </a>
          <ChevronRight size={14} aria-hidden="true" className="mx-[4px] shrink-0 text-[var(--text-tertiary)]" />
          <h2 aria-current="page" className="m-0 truncate p-0 text-[13px] font-medium text-[var(--text-primary)]">
            {account ? accountName(account) : accountId}
          </h2>
        </nav>
        {account && <span className="ml-1 flex shrink-0 items-center"><AccountRowMenu account={account} actions={actions} inHeader /></span>}
      </div>
      {account && account.is_active !== false && (
        <Button size="compact" className="shrink-0" aria-label="Open in Ads Manager" onClick={() => actions.openInAdsManager(account)}>
          <span className="max-[639px]:hidden">{'Open in '}</span>Ads Manager
        </Button>
      )}
    </div>
  );

  let body: React.ReactNode;
  if (state === 'loading') {
    body = <DataState title="Loading ad account…" detail="Reading the ad accounts of this workspace." />;
  } else if (state === 'error') {
    body = <DataState title="Couldn't load the ad account" detail={error} role="alert" actionLabel="Retry" onAction={() => void data.refresh()} />;
  } else if (!account) {
    body = (
      <DataState
        title="Ad account not found"
        detail={`This workspace has no ad account ${accountId}. It may have been removed.`}
        actionLabel="Go to ad accounts"
        onAction={() => navigate(listPath)}
      />
    );
  } else {
    body = (
      <AccountPageBody
        key={account.account_id}
        account={account}
        oneColumn={oneColumn}
        canEdit={canEdit}
        teamsText={teamsOf(account, teams).map((team) => team.name).join(', ')}
        connectedBy={members.find((member) => member.user_id === account.owner_user_id)}
        members={members}
        onSetLead={(leadUserId) => void data.saveLead(account, leadUserId)}
        rules={rules}
        events={events}
        onSaveProfile={(change) => void data.saveProfile(account, change)}
        onToggleAutomation={() => void data.toggleAutomation(account)}
        onReconnect={dialogs.openAdd}
        onOpenRule={(id) => navigate(`/${workspace.slug}/rules/${id}`)}
        onAttachRule={async (ruleId) => {
          await toggleRuleOnAccount(ruleId, account.account_id);
          await data.refresh(true);
        }}
      />
    );
  }

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-transparent">
      <header className="flex shrink-0 flex-col">{header}</header>
      {body}
      {dialogs.element}
    </div>
  );
};

interface AccountPageBodyProps {
  account: MetaAccount;
  oneColumn: boolean;
  canEdit: boolean;
  teamsText: string;
  connectedBy?: { full_name: string; username: string };
  members: AccountMember[];
  onSetLead: (leadUserId: number | null) => void;
  rules: ReturnType<typeof useAppStore.getState>['rules'];
  events: AuditEventItem[] | null;
  onSaveProfile: (change: { custom_name?: string; note?: string }) => void;
  onToggleAutomation: () => void;
  onReconnect: () => void;
  onOpenRule: (id: string) => void;
  onAttachRule: (ruleId: string) => Promise<void>;
}

const AccountPageBody: React.FC<AccountPageBodyProps> = ({
  account,
  oneColumn,
  canEdit,
  teamsText,
  connectedBy,
  members,
  onSetLead,
  rules,
  events,
  onSaveProfile,
  onToggleAutomation,
  onReconnect,
  onOpenRule,
  onAttachRule,
}) => {
  const [name, setName] = useState(accountName(account));
  const [note, setNote] = useState(account.note ?? '');
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const [previewRule, setPreviewRule] = useState<{ id: string; presetId: number; name: string } | null>(null);
  useEffect(() => setName(accountName(account)), [account]);
  useEffect(() => setNote(account.note ?? ''), [account.note]);
  useEffect(() => {
    const field = noteRef.current;
    if (!field) return;
    field.style.height = 'auto';
    field.style.height = `${field.scrollHeight}px`;
  }, [note]);

  const saveName = () => {
    const next = name.trim();
    // Meta's own name, or nothing, means no name of Buyerly's own.
    const custom = !next || next === account.name.trim() ? '' : next;
    if (!next) setName(account.name || account.account_id);
    onSaveProfile({ custom_name: custom });
  };

  const metrics = account.today_metrics;
  const attached = account.active_rules ?? [];
  const attachedIds = new Set(attached.map((rule) => String(rule.preset_id)));
  const attachable = rules.filter((rule) => !attachedIds.has(rule.id));
  const problem = connectionProblem(account);
  const automationBlocked = !account.rules_enabled && attached.length === 0;
  const health = account.health;
  const lastSync = health?.last_success_at || metrics?.saved_at || metrics?.generated_at || '';

  const properties = (
    <section aria-label="Properties" className={oneColumn ? 'mt-8' : ''}>
      <SectionTitle>Properties</SectionTitle>
      <PropertyRow label="Status">
        <AccountStatusLabel account={account} />
      </PropertyRow>
      <PropertyRow label="Health">
        {problem ? (
          <>
            <ConnectionProblemIcon account={account} onReconnect={canEdit ? onReconnect : undefined} />
            <span className="truncate" title={problem}>{health?.status === 'critical' || account.status_label === 'Meta connection required' ? 'Needs reconnect' : 'Sync problems'}</span>
            {canEdit && (
              <button type="button" onClick={onReconnect} className="shrink-0 rounded-full px-2 py-0.5 text-[12px] font-medium text-[var(--text-secondary)] hover:bg-[var(--item-hover-bg)] hover:text-[var(--text-primary)]">
                Reconnect
              </button>
            )}
          </>
        ) : (
          <span className={health?.status === 'healthy' ? '' : 'text-[var(--text-tertiary)]'}>
            {health?.status === 'healthy' ? 'Healthy' : 'Not checked yet'}
          </span>
        )}
      </PropertyRow>
      <PropertyRow label="Automation">
        <LinearToggle
          checked={Boolean(account.rules_enabled)}
          disabled={!canEdit || automationBlocked}
          label="Automation"
          tooltipContent={
            !canEdit ? 'Guests can’t change automation'
              : automationBlocked ? 'Attach a rule to the account first'
                : account.rules_enabled ? 'Turn automation off' : 'Turn automation on'
          }
          onChange={canEdit ? onToggleAutomation : undefined}
        />
        <span className="text-[var(--text-secondary)]">{account.rules_enabled ? 'On' : 'Off'}</span>
      </PropertyRow>
      <PropertyRow label="Lead">
        <AccountLeadPicker account={account} members={members} canEdit={canEdit} onChange={onSetLead} variant="property" />
      </PropertyRow>
      <PropertyRow label="Team">
        <span className={teamsText ? 'truncate' : 'text-[var(--text-tertiary)]'}>{teamsText || 'No team'}</span>
      </PropertyRow>
      <PropertyRow label="Connected by">
        <span className={connectedBy ? 'truncate' : 'text-[var(--text-tertiary)]'}>
          {connectedBy ? connectedBy.full_name || connectedBy.username : '—'}
        </span>
      </PropertyRow>
      <PropertyRow label="Time zone">
        <span className="truncate">{account.timezone_name || 'UTC'}</span>
      </PropertyRow>
      <PropertyRow label="Added">
        <span>{formatAddedDate(account.created_at)}</span>
      </PropertyRow>
      <PropertyRow label="Last sync">
        <span title={lastSync ? formatAuditTimestamp(lastSync) : undefined} className={lastSync ? '' : 'text-[var(--text-tertiary)]'}>
          {lastSync ? formatRelativeTime(lastSync) : 'Never'}
        </span>
      </PropertyRow>
    </section>
  );

  const main = (
    <div className="min-w-0">
      <span className="flex h-9 w-9 items-center justify-center rounded-[8px] text-[var(--text-secondary)]" aria-hidden="true">
        <LinearWalletIcon size={22} />
      </span>
      {canEdit ? (
        <input
          aria-label="Ad account name"
          value={name}
          maxLength={120}
          onChange={(event) => setName(event.target.value)}
          onBlur={saveName}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
            if (event.key === 'Escape') {
              setName(accountName(account));
              requestAnimationFrame(() => (event.target as HTMLInputElement).blur());
            }
          }}
          className="mt-3 w-full bg-transparent p-0 text-[24px] font-semibold leading-8 text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
        />
      ) : (
        <h1 className="m-0 mt-3 text-[24px] font-semibold leading-8 text-[var(--text-primary)]">{accountName(account)}</h1>
      )}
      <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-1.5 text-[13px] font-[450] text-[var(--text-tertiary)]">
        {/* Meta's own name, when the buyer gave the account another one. */}
        {account.custom_name?.trim() && account.name && account.custom_name.trim() !== account.name && (
          <>
            <span className="truncate">In Meta: {account.name}</span>
            <span aria-hidden="true">·</span>
          </>
        )}
        <span className="select-text tabular-nums">{account.account_id}</span>
        <Tooltip content="Copy account ID">
          <button
            type="button"
            aria-label="Copy account ID"
            onClick={() => void copyAccountId(account.account_id)}
            className="flex h-6 w-6 items-center justify-center rounded-full text-[var(--text-tertiary)] hover:bg-[var(--item-hover-bg)] hover:text-[var(--text-primary)] [@media(hover:none)_and_(pointer:coarse)]:h-9 [@media(hover:none)_and_(pointer:coarse)]:w-9"
          >
            <Copy size={13} strokeWidth={1.75} aria-hidden="true" />
          </button>
        </Tooltip>
      </div>

      {canEdit ? (
        <textarea
          ref={noteRef}
          aria-label="Note"
          value={note}
          rows={1}
          maxLength={500}
          placeholder="Add a note…"
          onChange={(event) => setNote(event.target.value)}
          onBlur={() => onSaveProfile({ note: note.trim() })}
          className="mt-4 w-full resize-none overflow-hidden bg-transparent p-0 text-[15px] font-[450] leading-6 text-[var(--text-secondary)] outline-none placeholder:text-[var(--text-muted)]"
        />
      ) : account.note ? (
        <p className="m-0 mt-4 whitespace-pre-wrap text-[15px] font-[450] leading-6 text-[var(--text-secondary)]">{account.note}</p>
      ) : null}

      {oneColumn && properties}

      <section aria-label="Today" className="mt-8">
        <SectionTitle>Today</SectionTitle>
        <div className="grid grid-cols-1 gap-2 min-[480px]:grid-cols-3">
          <Figure label="Spend" value={accountMoney(metrics?.spend, account)} />
          <Figure
            label="Leads"
            value={metrics ? String(metrics.leads) : '—'}
            caption={metrics?.leads ? `CPL ${accountMoney(metrics.cpl, account)}` : undefined}
          />
          <Figure
            label="Registrations"
            value={metrics ? String(metrics.registrations) : '—'}
            caption={metrics?.registrations ? `CPReg ${accountMoney(metrics.cpreg, account)}` : undefined}
          />
        </div>
        {!metrics && <p className="m-0 mt-2 text-[12px] text-[var(--text-tertiary)]">No figures yet: they appear after the first sync.</p>}
      </section>

      <section aria-label="Rules" className="mt-8">
        <SectionTitle
          action={canEdit && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[12px] font-medium text-[var(--text-secondary)] hover:bg-[var(--item-hover-bg)] hover:text-[var(--text-primary)] [@media(hover:none)_and_(pointer:coarse)]:h-9"
                >
                  <LinearPlusIcon size={14} aria-hidden="true" />
                  Attach rule
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" sideOffset={4} style={{ width: 'min(320px, calc(100vw - 32px))' }}>
                <DropdownMenuLabel>Run on this ad account</DropdownMenuLabel>
                {attachable.length === 0 ? (
                  <div className="px-3.5 py-2 text-[12px] text-[var(--text-muted)]">
                    {rules.length === 0 ? 'No rules in this workspace yet' : 'Every rule already runs here'}
                  </div>
                ) : attachable.map((rule) => (
                  <DropdownMenuItem key={rule.id} onSelect={() => setPreviewRule({ id: rule.id, presetId: rule.presetId, name: rule.name })}>
                    <span className="truncate">{rule.name}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        >
          Rules{attached.length > 0 && <span className="ml-1.5 tabular-nums">{attached.length}</span>}
        </SectionTitle>
        {attached.length === 0 ? (
          <p className="m-0 text-[13px] text-[var(--text-tertiary)]">No rules act on this account yet.</p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
            {attached.map((attachedRule) => {
              const rule = rules.find((item) => item.id === String(attachedRule.preset_id));
              const on = rule ? rule.status === 'active' : true;
              // The rule's own state, as on Rules: pausing it there pauses it on every account,
              // so the page shows it rather than offering a switch here.
              return (
                <li key={attachedRule.preset_id}>
                  <button
                    type="button"
                    data-rule-id={attachedRule.preset_id}
                    onClick={() => onOpenRule(String(attachedRule.preset_id))}
                    className="flex min-h-10 w-full items-center gap-3 rounded-[8px] px-2 text-left outline-none hover:bg-[var(--data-row-hover-bg)] focus-visible:ring-2 focus-visible:ring-[var(--focus-ring-color)]"
                  >
                    <span className={`min-w-0 flex-1 truncate text-[13px] font-medium ${on ? 'text-[var(--text-primary)]' : 'text-[var(--text-tertiary)]'}`}>
                      {rule?.name ?? attachedRule.name}
                    </span>
                    <span className="flex w-[76px] shrink-0 items-center gap-1.5 text-[12px] text-[var(--text-secondary)]">
                      <LinearStatusCircleIcon status={on ? 'active' : 'paused'} size={14} />
                      {on ? 'Active' : 'Paused'}
                    </span>
                    <span className="w-[104px] shrink-0 truncate text-right text-[12px] text-[var(--text-tertiary)]">
                      {formatAccountScope(attachedRuleScope(attachedRule))}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {attached.length > 0 && !account.rules_enabled && (
          <p className="m-0 mt-2 text-[12px] text-[var(--text-tertiary)]">Automation is off, so these rules don’t act on this account.</p>
        )}
      </section>

      <section aria-label="Recent events" className="mt-8 pb-10">
        <SectionTitle>Recent events</SectionTitle>
        {events === null ? (
          <p className="m-0 text-[13px] text-[var(--text-tertiary)]">Loading…</p>
        ) : events.length === 0 ? (
          <p className="m-0 text-[13px] text-[var(--text-tertiary)]">Nothing has happened on this account yet.</p>
        ) : (
          <ul className="m-0 flex list-none flex-col p-0">
            {events.map((event) => (
              <li key={event.id} className="flex min-h-10 items-start gap-3 py-1.5">
                <span aria-hidden="true" className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--text-muted)]" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-medium text-[var(--text-primary)]">{auditEventTitle(event)}</div>
                  <div className="truncate text-[12px] text-[var(--text-tertiary)]">{auditEventSummary(event)}</div>
                </div>
                <span className="shrink-0 pt-[2px] text-[12px] tabular-nums text-[var(--text-tertiary)]" title={formatAuditTimestamp(event.created_at)}>
                  {formatAuditRelativeTime(event.created_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {previewRule && (
        <AttachRulePreviewDialog
          open
          presetId={previewRule.presetId}
          ruleName={previewRule.name}
          accountId={account.account_id}
          accountLabel={metaAccountLabel(account)}
          onCancel={() => setPreviewRule(null)}
          onConfirm={() => {
            const ruleId = previewRule.id;
            setPreviewRule(null);
            void onAttachRule(ruleId);
          }}
        />
      )}
    </div>
  );

  if (oneColumn) {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-6 min-[640px]:px-8">
        <div className="mx-auto max-w-[670px]">{main}</div>
      </div>
    );
  }
  return (
    <div className="flex min-h-0 flex-1">
      {/* Linear's project page: a 670px column, and a 400px properties panel on the right. */}
      <div className="min-w-0 flex-1 overflow-y-auto px-14 pt-16">
        <div className="mx-auto max-w-[670px]">{main}</div>
      </div>
      <aside className="w-[400px] shrink-0 overflow-y-auto border-l border-[var(--color-border-primary)] px-[17px] pt-3">
        {properties}
      </aside>
    </div>
  );
};
