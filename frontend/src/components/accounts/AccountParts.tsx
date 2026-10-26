import React, { useEffect, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import * as stylex from '@stylexjs/stylex';
import { AlertTriangle } from 'lucide-react';
import type { MetaAccount } from '@/lib/types';
import { formatMetricMoney } from '@/components/campaigns/liveCampaigns';
import { Button } from '@/ui/Button';
import { Input } from '@/ui/Input';
import { Tooltip } from '@/ui/Tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/ui/DropdownMenu';
import { withClassName } from '@/ui/withClassName';
import { colors, radii } from '@/styles/tokens.stylex';
import { accountName, accountStatus, connectionProblem } from './accountsModel';

const TOUCH = '@media (hover: none) and (pointer: coarse)';

const styles = stylex.create({
  status: {
    display: 'inline-flex',
    minWidth: 0,
    alignItems: 'center',
    gap: 8,
  },
  statusDot: {
    height: 8,
    width: 8,
    flexShrink: 0,
    borderRadius: 9999,
  },
  truncate: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  problem: {
    display: 'flex',
    height: {
      default: 20,
      [TOUCH]: 32,
    },
    width: {
      default: 20,
      [TOUCH]: 32,
    },
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9999,
    outline: '2px solid transparent',
    outlineOffset: 2,
    backgroundColor: {
      default: null,
      ':hover': colors['--item-hover-bg'],
    },
    boxShadow: {
      default: null,
      ':focus-visible': `0 0 0 2px ${colors['--focus-ring-color']}`,
    },
  },
  problemCritical: {
    color: colors['--rules-action-stop-text'],
  },
  problemDegraded: {
    color: '#f2994a',
  },
  reason: {
    whiteSpace: 'normal',
    paddingLeft: 14,
    paddingRight: 14,
    paddingTop: 8,
    paddingBottom: 8,
    fontSize: 12,
    lineHeight: '18px',
    color: colors['--text-secondary'],
  },
  noRules: {
    color: colors['--text-muted'],
  },
  rules: {
    display: 'inline-flex',
    minWidth: 0,
    alignItems: 'center',
    gap: 6,
  },
  automation: {
    flexShrink: 0,
    fontSize: 11,
    color: colors['--text-muted'],
  },
  automationOn: {
    color: colors['--text-secondary'],
  },
  overlay: {
    position: 'fixed',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 500,
    backgroundColor: 'rgb(0 0 0 / 0.5)',
  },
  frame: {
    pointerEvents: 'none',
    position: 'fixed',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 501,
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
    paddingTop: '27vh',
    paddingRight: 16,
    paddingBottom: 16,
    paddingLeft: 16,
  },
  dialog: {
    pointerEvents: 'auto',
    width: '100%',
    maxWidth: 480,
    borderRadius: radii['--canvas-border-radius'],
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: colors['--color-border-secondary'],
    backgroundColor: colors['--card-bg'],
    paddingTop: 24,
    paddingRight: 24,
    paddingBottom: 24,
    paddingLeft: 24,
    textAlign: 'left',
    outline: '2px solid transparent',
    outlineOffset: 2,
    boxShadow: colors['--dialog-elevation-shadow'],
  },
  dialogTitle: {
    marginTop: 0,
    marginRight: 0,
    marginBottom: 0,
    marginLeft: 0,
    fontSize: 15,
    fontWeight: 600,
    color: colors['--text-primary'],
  },
  dialogDescription: {
    marginTop: 8,
    marginRight: 0,
    marginBottom: 0,
    marginLeft: 0,
    fontSize: 13,
    lineHeight: '20px',
    color: colors['--text-secondary'],
  },
  form: {
    marginTop: 16,
  },
  input: {
    width: '100%',
  },
  dialogActions: {
    marginTop: 20,
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 8,
  },
});

/** Meta's status: a dot and its word, as Linear's project status reads. */
export const AccountStatusLabel: React.FC<{ account: MetaAccount }> = ({ account }) => {
  const status = accountStatus(account);
  return (
    <span {...stylex.props(styles.status)} title={account.status_label || status.label}>
      <span aria-hidden="true" {...stylex.props(styles.statusDot)} style={{ backgroundColor: status.color }} />
      <span {...stylex.props(styles.truncate)}>{status.label}</span>
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
            {...stylex.props(styles.problem, critical ? styles.problemCritical : styles.problemDegraded)}
          >
            <AlertTriangle size={13} strokeWidth={2} aria-hidden="true" />
          </button>
        </DropdownMenuTrigger>
      </Tooltip>
      <DropdownMenuContent align="start" sideOffset={4} style={{ width: 'min(300px, calc(100vw - 32px))' }} onClick={(event) => event.stopPropagation()}>
        <div {...stylex.props(styles.reason)}>{reason}</div>
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
  if (count === 0) return <span {...stylex.props(styles.noRules)}>No rules</span>;
  return (
    <span {...stylex.props(styles.rules)}>
      <span {...stylex.props(styles.truncate)}>{count} {count === 1 ? 'rule' : 'rules'}</span>
      <span
        {...stylex.props(styles.automation, account.rules_enabled && styles.automationOn)}
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
        <Dialog.Overlay {...stylex.props(styles.overlay)} />
        <div {...stylex.props(styles.frame)}>
          <Dialog.Content
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              inputRef.current?.focus();
              inputRef.current?.select();
            }}
            {...withClassName(stylex.props(styles.dialog), 'ui-dialog animate-scale-in')}
          >
            <Dialog.Title {...stylex.props(styles.dialogTitle)}>Rename ad account</Dialog.Title>
            <Dialog.Description {...stylex.props(styles.dialogDescription)}>
              The name shown in Buyerly. In Meta it stays {account.name || account.account_id}.
            </Dialog.Description>
            <form
              {...stylex.props(styles.form)}
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
                {...stylex.props(styles.input)}
              />
              <div {...stylex.props(styles.dialogActions)}>
                <Button touchHeight onClick={onCancel}>Cancel</Button>
                <Button touchHeight variant="primary" type="submit">Save</Button>
              </div>
            </form>
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
