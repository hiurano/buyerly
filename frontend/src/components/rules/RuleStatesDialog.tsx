import React, { useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Button } from '@/ui/Button';
import { fetchRuleStates, formatRelativeTime, RULE_LEVEL_LABELS } from '@/lib/rules';
import type { RuleEntityStatePayload, RuleEntityStateName } from '@/lib/rules';
import { useAppStore } from '@/store/useAppStore';
import type { RuleItem } from '@/store/useAppStore';
import { RuleStateLine } from './RuleStateLine';

/** What needs the buyer's eye first: actions and holds, then quiet checks. */
const STATE_ORDER: Record<RuleEntityStateName, number> = {
  error: 0,
  fired: 1,
  confirming: 2,
  cooldown: 3,
  undone: 4,
  yielded: 5,
  pending: 6,
  skipped: 7,
  matched: 8,
  not_met: 9,
  inactive: 10,
  rule_paused: 11,
  rules_off: 12,
};

const PLURAL_LEVELS: Record<RuleItem['preset']['level'], string> = {
  campaign: 'campaigns',
  adset: 'ad sets',
  ad: 'ads',
};

export function ruleStatesTitle(rule: RuleItem): string {
  return `Status on ${PLURAL_LEVELS[rule.preset.level] ?? 'campaigns'}`;
}

interface RuleStatesDialogProps {
  rule: RuleItem;
  open: boolean;
  onClose: () => void;
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; rows: RuleEntityStatePayload[] };

/**
 * Where one rule stands on each campaign, ad set or ad it checks (#322): fired
 * and when, waiting until …, undone for today, gave way to another rule, or
 * the condition not met with the readings. Meta keeps the same answer in a
 * rule's "Rule results"; Linear in an issue's Activity.
 */
export const RuleStatesDialog: React.FC<RuleStatesDialogProps> = ({ rule, open, onClose }) => {
  const [load, setLoad] = useState<LoadState>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoad({ kind: 'loading' });
    fetchRuleStates(rule.presetId)
      .then((rows) => {
        if (!cancelled) setLoad({ kind: 'ready', rows });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoad({
            kind: 'error',
            message: error instanceof Error ? error.message : 'Something went wrong',
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open, rule.presetId, attempt]);

  const rows =
    load.kind === 'ready'
      ? [...load.rows].sort(
          (a, b) =>
            (STATE_ORDER[a.state] ?? 99) - (STATE_ORDER[b.state] ?? 99) ||
            a.entity_name.localeCompare(b.entity_name),
        )
      : [];
  const accountCount = new Set(rows.map((row) => row.account_id)).size;
  const levelNoun = RULE_LEVEL_LABELS[rule.preset.level]?.toLowerCase() ?? 'campaign';

  return (
    <Dialog.Root open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[500] bg-black/50 animate-fade-in" />
        <div className="pointer-events-none fixed inset-0 z-[501] flex items-start justify-center p-4 pt-[12vh]">
          <Dialog.Content
            data-rule-states-dialog="true"
            className="ui-dialog pointer-events-auto flex max-h-[76vh] w-full max-w-[560px] flex-col rounded-[var(--canvas-border-radius)] border border-[var(--color-border-secondary)] bg-[var(--card-bg)] text-left outline-none animate-scale-in shadow-[var(--dialog-elevation-shadow)]"
          >
            <div className="border-b border-[var(--color-border-secondary)] px-5 pb-3 pt-4">
              <Dialog.Title className="m-0 text-[15px] font-semibold text-[var(--text-primary)]">
                {ruleStatesTitle(rule)}
              </Dialog.Title>
              <Dialog.Description className="m-0 mt-1 text-[13px] leading-[18px] text-[var(--text-secondary)]">
                <span className="text-[var(--text-primary)]">{rule.name}</span>
                {' · '}Last check {rule.lastCheck.toLowerCase()} · Last action{' '}
                {rule.lastRun.toLowerCase()}
              </Dialog.Description>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
              {load.kind === 'loading' && (
                <p className="m-0 px-3 py-6 text-center text-[13px] text-[var(--text-tertiary)]">
                  Loading…
                </p>
              )}
              {load.kind === 'error' && (
                <div className="flex flex-col items-center gap-3 px-3 py-6 text-center">
                  <p className="m-0 text-[13px] text-[var(--text-secondary)]">
                    Couldn't load the rule's status. {load.message}
                  </p>
                  <Button onClick={() => setAttempt((value) => value + 1)}>Retry</Button>
                </div>
              )}
              {load.kind === 'ready' && rows.length === 0 && (
                <p className="m-0 px-3 py-6 text-center text-[13px] leading-5 text-[var(--text-tertiary)]">
                  {rule.preset.attached_account_ids.length === 0
                    ? 'Attach this rule to an ad account to see where it stands.'
                    : `Not checked yet. Buyerly checks this rule every ${rule.preset.check_interval_minutes} min.`}
                </p>
              )}
              {rows.length > 0 && (
                <ul className="m-0 flex list-none flex-col p-0">
                  {rows.map((row) => (
                    <li
                      key={`${row.account_id}:${row.entity_level}:${row.entity_id}`}
                      className="flex flex-col gap-1 rounded-md px-3 py-2.5 hover:bg-[var(--item-hover-bg)]"
                    >
                      <div className="flex min-w-0 items-baseline justify-between gap-3">
                        <span
                          className="min-w-0 truncate text-[13px] font-medium text-[var(--text-primary)]"
                          title={row.entity_name || row.entity_id}
                        >
                          {row.entity_name || `${levelNoun} ${row.entity_id}`}
                        </span>
                        <span
                          className="shrink-0 text-[12px] text-[var(--text-tertiary)]"
                          title={`Checked ${new Date(row.checked_at).toLocaleString()}`}
                        >
                          {formatRelativeTime(row.checked_at)}
                        </span>
                      </div>
                      {accountCount > 1 && (
                        <span className="truncate text-[12px] text-[var(--text-tertiary)]">
                          {row.account_name || row.account_id}
                        </span>
                      )}
                      <RuleStateLine row={row} />
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="flex justify-end border-t border-[var(--color-border-secondary)] px-5 py-3">
              <Button onClick={onClose}>Close</Button>
            </div>
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

/** The status dialog of whichever rule the store has open, if any. */
export const RuleStatesHost: React.FC = () => {
  const { rules, ruleStatesRuleId, openRuleStates } = useAppStore();
  const rule = rules.find((item) => item.id === ruleStatesRuleId);
  if (!rule) return null;
  return <RuleStatesDialog rule={rule} open onClose={() => openRuleStates(null)} />;
};
