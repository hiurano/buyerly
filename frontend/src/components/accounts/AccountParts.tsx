import React, { useEffect, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { AlertTriangle } from 'lucide-react';
import type { MetaAccount } from '@/lib/types';
import { formatMetricMoney } from '@/components/campaigns/liveCampaigns';
import { Button } from '@/ui/Button';
import { Input } from '@/ui/Input';
import { Tooltip } from '@/ui/Tooltip';
import { TOUCH_HEIGHT_CLASS } from '@/lib/useMediaQuery';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/ui/DropdownMenu';
import { accountName, accountStatus, connectionProblem } from './accountsModel';

/** Meta's status: a dot and its word, as Linear's project status reads. */
export const AccountStatusLabel: React.FC<{ account: MetaAccount; className?: string }> = ({ account, className = '' }) => {
  const status = accountStatus(account);
  return (
    <span className={`inline-flex min-w-0 items-center gap-2 ${className}`} title={account.status_label || status.label}>
      <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: status.color }} />
      <span className="truncate">{status.label}</span>
    </span>
  );
};

/**
 * The connection-problem mark beside the name, shown only while Buyerly can't
 * read the account: the reason on hover, and Reconnect on click.
 */
export const ConnectionProblemIcon: React.FC<{ account: MetaAccount; onReconnect?: () => void }> = ({ account, onReconnect }) => {
  const reason = connectionProblem(account);
  const [open, setOpen] = useState(false);
  if (!reason) return null;
  const critical = account.health?.status === 'critical' || account.status_label === 'Meta connection required';
  const color = critical ? 'var(--rules-action-stop-text)' : '#f2994a';
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <Tooltip content={`Connection problem: ${reason}`} disabled={open}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`Connection problem: ${reason}`}
            data-connection-problem={critical ? 'critical' : 'degraded'}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') event.stopPropagation(); }}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full outline-none hover:bg-[var(--item-hover-bg)] focus-visible:ring-2 focus-visible:ring-[var(--focus-ring-color)] [@media(hover:none)_and_(pointer:coarse)]:h-8 [@media(hover:none)_and_(pointer:coarse)]:w-8"
            style={{ color }}
          >
            <AlertTriangle size={13} strokeWidth={2} aria-hidden="true" />
          </button>
        </DropdownMenuTrigger>
      </Tooltip>
      <DropdownMenuContent align="start" sideOffset={4} style={{ width: 'min(300px, calc(100vw - 32px))' }} onClick={(event) => event.stopPropagation()}>
        <div className="whitespace-normal px-3.5 py-2 text-[12px] leading-[18px] text-[var(--text-secondary)]">{reason}</div>
        {onReconnect && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onReconnect}>
              <span>Reconnect…</span>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

/** Money in the account's currency, "USD 12.40"; a dash before the first sync. */
export const accountMoney = (value: number | null | undefined, account: MetaAccount) =>
  formatMetricMoney(value ?? null, account.currency ?? '');

/** "3 · USD 4.10": leads and the cost of one, today. */
export function leadsText(account: MetaAccount): string {
  const metrics = account.today_metrics;
  if (!metrics) return '—';
  if (!metrics.leads) return '0';
  return `${metrics.leads} · ${accountMoney(metrics.cpl, account)}`;
}

/** "2 rules" with automation's state beside it, or "No rules". */
export const AccountRulesLabel: React.FC<{ account: MetaAccount }> = ({ account }) => {
  const count = account.active_rules?.length ?? 0;
  if (count === 0) return <span className="text-[var(--text-muted)]">No rules</span>;
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <span className="truncate">{count} {count === 1 ? 'rule' : 'rules'}</span>
      <span
        className={`shrink-0 text-[11px] ${account.rules_enabled ? 'text-[var(--text-secondary)]' : 'text-[var(--text-muted)]'}`}
        title={account.rules_enabled ? 'Automation is on: the rules act on this account' : 'Automation is off: the rules do not act'}
      >
        · {account.rules_enabled ? 'On' : 'Off'}
      </span>
    </span>
  );
};

interface RenameAccountDialogProps {
  account: MetaAccount | null;
  onCancel: () => void;
  onSave: (name: string) => void;
}

/** "Rename": the name Buyerly shows; Meta's own name stays as it is. Empty brings Meta's name back. */
export const RenameAccountDialog: React.FC<RenameAccountDialogProps> = ({ account, onCancel, onSave }) => {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (account) setValue(account.custom_name?.trim() || account.name || '');
  }, [account]);
  if (!account) return null;
  const submit = () => {
    const name = value.trim();
    // Meta's own name is no custom name.
    onSave(name === account.name.trim() ? '' : name);
  };
  return (
    <Dialog.Root open onOpenChange={(next) => { if (!next) onCancel(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[500] bg-black/50 animate-fade-in" />
        <div className="pointer-events-none fixed inset-0 z-[501] flex items-start justify-center p-4 pt-[27vh]">
          <Dialog.Content
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              inputRef.current?.focus();
              inputRef.current?.select();
            }}
            className="ui-dialog pointer-events-auto w-full max-w-[480px] rounded-[var(--canvas-border-radius)] border border-[var(--color-border-secondary)] bg-[var(--card-bg)] p-6 text-left outline-none animate-scale-in [box-shadow:var(--dialog-elevation-shadow)]"
          >
            <Dialog.Title className="m-0 text-[15px] font-semibold text-[var(--text-primary)]">Rename ad account</Dialog.Title>
            <Dialog.Description className="m-0 mt-2 text-[13px] leading-[20px] text-[var(--text-secondary)]">
              The name shown in Buyerly. In Meta it stays {account.name || account.account_id}.
            </Dialog.Description>
            <form
              className="mt-4"
              onSubmit={(event) => {
                event.preventDefault();
                submit();
              }}
            >
              <Input
                ref={inputRef}
                aria-label="Ad account name"
                value={value}
                maxLength={120}
                placeholder={account.name || accountName(account)}
                onChange={(event) => setValue(event.target.value)}
                className="w-full"
              />
              <div className="mt-5 flex justify-end gap-2">
                <Button className={TOUCH_HEIGHT_CLASS} onClick={onCancel}>Cancel</Button>
                <Button className={TOUCH_HEIGHT_CLASS} variant="primary" type="submit">Save</Button>
              </div>
            </form>
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
