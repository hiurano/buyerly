import React, { useEffect, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Button } from '@/ui/Button';
import { TOUCH_HEIGHT_CLASS } from '@/lib/useMediaQuery';
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
        <Dialog.Overlay className="fixed inset-0 z-[500] bg-black/50 animate-fade-in" />
        <div className="pointer-events-none fixed inset-0 z-[501] flex items-start justify-center p-4 pt-[12vh]">
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
            className="ui-dialog pointer-events-auto flex max-h-[76vh] w-full max-w-[520px] flex-col rounded-[var(--canvas-border-radius)] border border-[var(--color-border-secondary)] bg-[var(--card-bg)] text-left outline-none animate-scale-in shadow-[var(--dialog-elevation-shadow)]"
          >
            <div className="px-5 pb-3 pt-4">
              <Dialog.Title className="m-0 text-[15px] font-semibold text-[var(--text-primary)]">
                Attach “{ruleName}” to the whole ad account?
              </Dialog.Title>
              <Dialog.Description className="m-0 mt-1 text-[13px] leading-[18px] text-[var(--text-secondary)]">
                {accountLabel}
              </Dialog.Description>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-2 text-[13px] leading-[19px] text-[var(--text-secondary)]">
              {!preview && !error && (
                <p className="m-0 py-3 text-[var(--text-tertiary)]">Loading what it will check…</p>
              )}
              {error && (
                <p className="m-0 py-3">
                  Couldn't load the preview: {error}
                </p>
              )}
              {preview && (
                <>
                  <p className="m-0" data-testid="attach-rule-preview-summary">
                    {preview.total === 0
                      ? `It will check every one of the ${plural} in this ad account. No synced ${plural} yet, so nothing can be shown.`
                      : `It will check all ${preview.total} ${plural} in this ad account (${preview.running} running). `
                        + (preview.matching === 0
                          ? 'None match its conditions right now.'
                          : `${preview.matching} ${preview.matching === 1 ? 'matches' : 'match'} its conditions right now and would be ${result}.`)}
                  </p>
                  {preview.entities.length > 0 && (
                    <ul className="m-0 mt-2 flex list-none flex-col p-0">
                      {preview.entities.slice(0, SHOWN_ENTITIES).map((entity) => (
                        <li
                          key={entity.entity_id}
                          className="flex min-w-0 items-baseline justify-between gap-3 border-t border-[var(--color-border-secondary)] py-1.5"
                        >
                          <span className="min-w-0 truncate text-[var(--text-primary)]" title={entity.detail || undefined}>
                            {entity.entity_name}
                          </span>
                          <span
                            className={`shrink-0 text-[12px] ${
                              entity.outcome === 'matched'
                                ? 'font-medium text-[var(--text-primary)]'
                                : 'text-[var(--text-tertiary)]'
                            }`}
                          >
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
                    <p className="m-0 mt-1 text-[12px] text-[var(--text-tertiary)]">
                      and {preview.total - SHOWN_ENTITIES} more
                    </p>
                  )}
                  {!preview.rules_enabled && (
                    <p className="m-0 mt-3">
                      Rules are off for this ad account; attaching turns them on.
                    </p>
                  )}
                  <p className="m-0 mt-3 text-[12px] text-[var(--text-tertiary)]">
                    {preview.data_as_of
                      ? `Numbers synced ${formatRelativeTime(preview.data_as_of).toLowerCase()}. `
                      : ''}
                    To run it on some campaigns or ad sets only, attach it from the Rules column in Ads Manager.
                  </p>
                </>
              )}
            </div>

            <div className="flex justify-end gap-2 border-t border-[var(--color-border-secondary)] px-5 py-3">
              <Button className={TOUCH_HEIGHT_CLASS} onClick={onCancel}>Cancel</Button>
              <Button
                ref={confirmRef}
                className={TOUCH_HEIGHT_CLASS}
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
