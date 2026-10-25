import React, { useEffect, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import * as stylex from '@stylexjs/stylex';
import { colors, radii } from '@/styles/tokens.stylex';
import { Button } from '@/ui/Button';
import { withClassName } from '@/ui/withClassName';
import { ApiError } from '@/lib/api';
import { fetchRuleAccountPreview, formatRelativeTime } from '@/lib/rules';
import type { RuleAccountPreview, RuleExecutionLevel } from '@/lib/rules';

function requestErrorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return 'Could not reach the server. Please try again.';
}

const PLURAL: Record<RuleExecutionLevel, string> = {
  campaign: 'campaigns',
  adset: 'ad sets',
  ad: 'ads',
};

/** What the rule does to an entity that matches, in the buyer's words. */
const ACTION_RESULT: Record<string, string> = {
  turn_off: 'turned off',
  notify_only: 'reported in Inbox',
  turn_on: 'turned on',
  increase_budget: 'given a higher budget',
  decrease_budget: 'given a lower budget',
};

const SHOWN_ENTITIES = 8;

/** "Oct 3" from an ad account's YYYY-MM-DD, without shifting it into the viewer's zone. */
function formatDay(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  if (!year || !month || !day) return isoDate;
  return new Date(year, month - 1, day).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

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
    maxWidth: 520,
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
  body: {
    minHeight: 0,
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: '0%',
    overflowY: 'auto',
    paddingRight: 20,
    paddingBottom: 8,
    paddingLeft: 20,
    fontSize: 13,
    lineHeight: '19px',
    color: colors['--text-secondary'],
  },
  text: noMargin,
  status: {
    paddingTop: 12,
    paddingBottom: 12,
  },
  tertiary: {
    color: colors['--text-tertiary'],
  },
  list: {
    ...noMargin,
    marginTop: 8,
    display: 'flex',
    listStyleType: 'none',
    flexDirection: 'column',
    paddingTop: 0,
    paddingRight: 0,
    paddingBottom: 0,
    paddingLeft: 0,
  },
  entity: {
    display: 'flex',
    minWidth: 0,
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12,
    borderTopWidth: 1,
    borderTopStyle: 'solid',
    borderColor: colors['--color-border-secondary'],
    paddingTop: 6,
    paddingBottom: 6,
  },
  entityName: {
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    color: colors['--text-primary'],
  },
  outcome: {
    flexShrink: 0,
    fontSize: 12,
    color: colors['--text-tertiary'],
  },
  outcomeMatched: {
    fontWeight: 500,
    color: colors['--text-primary'],
  },
  small: {
    fontSize: 12,
    color: colors['--text-tertiary'],
  },
  gap1: {
    marginTop: 4,
  },
  gap3: {
    marginTop: 12,
  },
  footer: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 8,
    borderTopWidth: 1,
    borderTopStyle: 'solid',
    borderColor: colors['--color-border-secondary'],
    paddingTop: 12,
    paddingRight: 20,
    paddingBottom: 12,
    paddingLeft: 20,
  },
});

interface AttachRulePreviewDialogProps {
  open: boolean;
  presetId: number;
  ruleName: string;
  accountId: string;
  accountLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Attaching a rule from the rules list covers the whole ad account and turns
 * its automation on (#200). Before that the buyer sees which campaigns, ad
 * sets or ads it will check and which match its conditions right now.
 */
export const AttachRulePreviewDialog: React.FC<AttachRulePreviewDialogProps> = ({
  open,
  presetId,
  ruleName,
  accountId,
  accountLabel,
  onConfirm,
  onCancel,
}) => {
  const confirmRef = useRef<HTMLButtonElement>(null);
  const [preview, setPreview] = useState<RuleAccountPreview | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    setPreview(null);
    setError('');
    fetchRuleAccountPreview(accountId, presetId)
      .then((result) => { if (!cancelled) setPreview(result); })
      .catch((reason) => { if (!cancelled) setError(requestErrorMessage(reason)); });
    return () => { cancelled = true; };
  }, [open, accountId, presetId]);

  const plural = preview ? PLURAL[preview.level] ?? 'ad sets' : 'ad sets';
  const result = preview ? ACTION_RESULT[preview.action] ?? 'acted on' : '';

  return (
    <Dialog.Root open={open} onOpenChange={(next) => { if (!next) onCancel(); }}>
      <Dialog.Portal>
        <Dialog.Overlay {...stylex.props(styles.overlay)} />
        <div {...stylex.props(styles.frame)}>
          <Dialog.Content
            data-testid="attach-rule-preview"
            // Rendered from inside a rule row: keep Enter and shortcuts from
            // reaching the row behind the portal.
            onKeyDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              confirmRef.current?.focus();
            }}
            {...withClassName(stylex.props(styles.content), 'ui-dialog animate-scale-in')}
          >
            <div {...stylex.props(styles.header)}>
              <Dialog.Title {...stylex.props(styles.title)}>
                Attach “{ruleName}” to the whole ad account?
              </Dialog.Title>
              <Dialog.Description {...stylex.props(styles.description)}>
                {accountLabel}
              </Dialog.Description>
            </div>

            <div {...stylex.props(styles.body)}>
              {!preview && !error && (
                <p {...stylex.props(styles.text, styles.status, styles.tertiary)}>Loading what it will check…</p>
              )}
              {error && (
                <p {...stylex.props(styles.text, styles.status)}>
                  Couldn't load the preview: {error}
                </p>
              )}
              {preview && (
                <>
                  <p {...stylex.props(styles.text)} data-testid="attach-rule-preview-summary">
                    {preview.total === 0
                      ? `It will check every one of the ${plural} in this ad account. No synced ${plural} yet, so nothing can be shown.`
                      : `It will check all ${preview.total} ${plural} in this ad account (${preview.running} running). `
                        + (preview.matching === 0
                          ? 'None match its conditions right now.'
                          : `${preview.matching} ${preview.matching === 1 ? 'matches' : 'match'} its conditions right now and would be ${result}.`)}
                  </p>
                  {preview.entities.length > 0 && (
                    <ul {...stylex.props(styles.list)}>
                      {preview.entities.slice(0, SHOWN_ENTITIES).map((entity) => (
                        <li
                          key={entity.entity_id}
                          {...stylex.props(styles.entity)}
                        >
                          <span {...stylex.props(styles.entityName)} title={entity.detail || undefined}>
                            {entity.entity_name}
                          </span>
                          <span {...stylex.props(styles.outcome, entity.outcome === 'matched' && styles.outcomeMatched)}>
                            {entity.outcome === 'matched'
                              ? 'Matches now'
                              : entity.outcome === 'inactive'
                                ? (entity.status === 'ACTIVE' ? 'Running' : 'Not running')
                                : 'Condition not met'}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {preview.total > SHOWN_ENTITIES && (
                    <p {...stylex.props(styles.text, styles.gap1, styles.small)}>
                      and {preview.total - SHOWN_ENTITIES} more
                    </p>
                  )}
                  {!preview.rules_enabled && (
                    <p {...stylex.props(styles.text, styles.gap3)}>
                      Rules are off for this ad account; attaching turns them on.
                    </p>
                  )}
                  <p {...stylex.props(styles.text, styles.gap3, styles.small)}>
                    {preview.data_as_of
                      ? `Numbers synced ${formatRelativeTime(preview.data_as_of).toLowerCase()}. `
                      : ''}
                    {preview.lifetime_since && (
                      <span data-testid="attach-rule-preview-lifetime">
                        {`Lifetime here counts the days Buyerly has synced, since ${formatDay(preview.lifetime_since)}; the rule itself reads lifetime from Meta. `}
                      </span>
                    )}
                    To run it on some campaigns or ad sets only, attach it from the Rules column in Campaigns.
                  </p>
                </>
              )}
            </div>

            <div {...stylex.props(styles.footer)}>
              <Button touchHeight onClick={onCancel}>Cancel</Button>
              <Button
                ref={confirmRef}
                touchHeight
                variant="primary"
                onClick={onConfirm}
              >
                Attach to whole account
              </Button>
            </div>
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
