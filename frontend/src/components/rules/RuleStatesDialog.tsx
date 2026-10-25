import React, { useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import * as stylex from '@stylexjs/stylex';
import { colors, radii } from '@/styles/tokens.stylex';
import { withClassName } from '@/ui/withClassName';
import { Button } from '@/ui/Button';
import { fetchRuleStates, formatRelativeTime, RULE_LEVEL_LABELS } from '@/lib/rules';
import type { RuleEntityStatePayload, RuleEntityStateName } from '@/lib/rules';
import { RuleStateLine } from './RuleStateLine';
import { useRulesStore, type RuleItem } from '@/models/rulesStore';
import { useDialogStore } from '@/models/dialogStore';

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
  unchecked: 13,
};

/** In STATE_ORDER, then by name within a state. */
const byStateThenName = (a: { state: RuleEntityStateName; entity_name: string }, b: { state: RuleEntityStateName; entity_name: string }) =>
  (STATE_ORDER[a.state] ?? 99) - (STATE_ORDER[b.state] ?? 99) || a.entity_name.localeCompare(b.entity_name);

const PLURAL_LEVELS: Record<RuleItem['preset']['level'], string> = {
  campaign: 'campaigns',
  adset: 'ad sets',
  ad: 'ads',
};

export function ruleStatesTitle(rule: RuleItem): string {
  return `Status on ${PLURAL_LEVELS[rule.preset.level] ?? 'campaigns'}`;
}

const truncate = {
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
} as const;

const noMargin = {
  marginTop: 0,
  marginRight: 0,
  marginBottom: 0,
  marginLeft: 0,
} as const;

const styles = stylex.create({
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
    paddingTop: '12vh',
    paddingRight: 16,
    paddingBottom: 16,
    paddingLeft: 16,
  },
  content: {
    pointerEvents: 'auto',
    display: 'flex',
    maxHeight: '76vh',
    width: '100%',
    maxWidth: 560,
    flexDirection: 'column',
    borderRadius: radii['--canvas-border-radius'],
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: colors['--color-border-secondary'],
    backgroundColor: colors['--card-bg'],
    textAlign: 'left',
    outline: '2px solid transparent',
    outlineOffset: 2,
    boxShadow: colors['--dialog-elevation-shadow'],
  },
  header: {
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    borderColor: colors['--color-border-secondary'],
    paddingTop: 16,
    paddingRight: 20,
    paddingBottom: 12,
    paddingLeft: 20,
  },
  title: {
    ...noMargin,
    fontSize: 15,
    fontWeight: 600,
    color: colors['--text-primary'],
  },
  description: {
    ...noMargin,
    marginTop: 4,
    fontSize: 13,
    lineHeight: '18px',
    color: colors['--text-secondary'],
  },
  name: {
    color: colors['--text-primary'],
  },
  body: {
    minHeight: 0,
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: '0%',
    overflowY: 'auto',
    paddingTop: 8,
    paddingRight: 8,
    paddingBottom: 8,
    paddingLeft: 8,
  },
  message: {
    ...noMargin,
    paddingTop: 24,
    paddingRight: 12,
    paddingBottom: 24,
    paddingLeft: 12,
    textAlign: 'center',
    fontSize: 13,
    color: colors['--text-tertiary'],
  },
  messageEmpty: {
    lineHeight: '20px',
  },
  error: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 12,
    paddingTop: 24,
    paddingRight: 12,
    paddingBottom: 24,
    paddingLeft: 12,
    textAlign: 'center',
  },
  errorText: {
    ...noMargin,
    fontSize: 13,
    color: colors['--text-secondary'],
  },
  list: {
    ...noMargin,
    display: 'flex',
    listStyleType: 'none',
    flexDirection: 'column',
    paddingTop: 0,
    paddingRight: 0,
    paddingBottom: 0,
    paddingLeft: 0,
  },
  row: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    borderRadius: 6,
    paddingTop: 10,
    paddingRight: 12,
    paddingBottom: 10,
    paddingLeft: 12,
    backgroundColor: {
      default: null,
      ':hover': colors['--item-hover-bg'],
    },
  },
  rowTop: {
    display: 'flex',
    minWidth: 0,
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12,
  },
  entity: {
    ...truncate,
    minWidth: 0,
    fontSize: 13,
    fontWeight: 500,
    color: colors['--text-primary'],
  },
  checked: {
    flexShrink: 0,
    fontSize: 12,
    color: colors['--text-tertiary'],
  },
  account: {
    ...truncate,
    fontSize: 12,
    color: colors['--text-tertiary'],
  },
  together: {
    marginTop: 8,
    marginRight: 12,
    marginBottom: 4,
    marginLeft: 12,
    borderTopWidth: 1,
    borderTopStyle: 'solid',
    borderColor: colors['--color-border-secondary'],
    paddingTop: 12,
    fontSize: 12,
    lineHeight: '17px',
    color: colors['--text-tertiary'],
  },
  togetherTitle: {
    ...noMargin,
    fontSize: 12,
    fontWeight: 500,
    color: colors['--text-secondary'],
  },
  togetherList: {
    ...noMargin,
    marginTop: 4,
    display: 'flex',
    listStyleType: 'disc',
    flexDirection: 'column',
    gap: 2,
    paddingLeft: 16,
  },
  footer: {
    display: 'flex',
    justifyContent: 'flex-end',
    borderTopWidth: 1,
    borderTopStyle: 'solid',
    borderColor: colors['--color-border-secondary'],
    paddingTop: 12,
    paddingRight: 20,
    paddingBottom: 12,
    paddingLeft: 20,
  },
});

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
      ? [...load.rows].sort(byStateThenName)
      : [];
  const accountCount = new Set(rows.map((row) => row.account_id)).size;
  const levelNoun = RULE_LEVEL_LABELS[rule.preset.level]?.toLowerCase() ?? 'campaign';

  return (
    <Dialog.Root open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay {...stylex.props(styles.overlay)} />
        <div {...stylex.props(styles.frame)}>
          <Dialog.Content
            data-rule-states-dialog="true"
            {...withClassName(stylex.props(styles.content), 'ui-dialog animate-scale-in')}
          >
            <div {...stylex.props(styles.header)}>
              <Dialog.Title {...stylex.props(styles.title)}>
                {ruleStatesTitle(rule)}
              </Dialog.Title>
              <Dialog.Description {...stylex.props(styles.description)}>
                <span {...stylex.props(styles.name)}>{rule.name}</span>
                {' · '}Last check {rule.lastCheck.toLowerCase()} · Last action{' '}
                {rule.lastRun.toLowerCase()}
              </Dialog.Description>
            </div>

            <div {...stylex.props(styles.body)}>
              {load.kind === 'loading' && (
                <p {...stylex.props(styles.message)}>
                  Loading…
                </p>
              )}
              {load.kind === 'error' && (
                <div {...stylex.props(styles.error)}>
                  <p {...stylex.props(styles.errorText)}>
                    Couldn't load the rule's status. {load.message}
                  </p>
                  <Button onClick={() => setAttempt((value) => value + 1)}>Retry</Button>
                </div>
              )}
              {load.kind === 'ready' && rows.length === 0 && (
                <p {...stylex.props(styles.message, styles.messageEmpty)}>
                  {rule.preset.attached_account_ids.length === 0
                    ? 'Attach this rule to an ad account to see where it stands.'
                    : `Not checked yet. Buyerly checks this rule every ${rule.preset.check_interval_minutes} min.`}
                </p>
              )}
              {rows.length > 0 && (
                <ul {...stylex.props(styles.list)}>
                  {rows.map((row) => (
                    <li
                      key={`${row.account_id}:${row.entity_level}:${row.entity_id}`}
                      {...stylex.props(styles.row)}
                    >
                      <div {...stylex.props(styles.rowTop)}>
                        <span
                          {...stylex.props(styles.entity)}
                          title={row.entity_name || row.entity_id}
                        >
                          {row.entity_name || `${levelNoun} ${row.entity_id}`}
                        </span>
                        <span
                          {...stylex.props(styles.checked)}
                          title={`Checked ${new Date(row.checked_at).toLocaleString()}`}
                        >
                          {formatRelativeTime(row.checked_at)}
                        </span>
                      </div>
                      {accountCount > 1 && (
                        <span {...stylex.props(styles.account)}>
                          {row.account_name || row.account_id}
                        </span>
                      )}
                      <RuleStateLine row={row} />
                    </li>
                  ))}
                </ul>
              )}
              {/* Why a rule that matches can still be quiet (#300): decisions #46 and #47 in the buyer's words. */}
              <section
                aria-label="How rules work together"
                data-rules-together="true"
                {...stylex.props(styles.together)}
              >
                <h3 {...stylex.props(styles.togetherTitle)}>
                  When several rules check one {levelNoun}
                </h3>
                <ul {...stylex.props(styles.togetherList)}>
                  <li>Alerts always fire, each rule on its own.</li>
                  <li>
                    Rules that change it act one per check: turn off, then budget −, budget +, turn on. Equal
                    ones go in list order; the rest show “Gave way”.
                  </li>
                  <li>While a stronger rule waits to repeat, weaker ones wait too.</li>
                  <li>An action you undo in Inbox isn't repeated until the ad account's day ends.</li>
                </ul>
              </section>
            </div>

            <div {...stylex.props(styles.footer)}>
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
  const rules = useRulesStore((state) => state.rules);
  const ruleStatesRuleId = useDialogStore((state) => state.ruleStatesRuleId);
  const openRuleStates = useDialogStore((state) => state.openRuleStates);
  const rule = rules.find((item) => item.id === ruleStatesRuleId);
  if (!rule) return null;
  return <RuleStatesDialog rule={rule} open onClose={() => openRuleStates(null)} />;
};
