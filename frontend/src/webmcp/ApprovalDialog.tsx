import React, { useEffect, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Button } from '@/ui/Button';
import { useApprovalQueue } from './approval';

/**
 * A request can appear while the person is clicking or typing elsewhere. The
 * approving button waits this long, so input already on its way cannot
 * approve a change the person has not read.
 */
const APPROVE_DELAY_MS = 600;

/**
 * Buyerly's own confirmation for a change an AI agent asked for, built like
 * ConfirmDialog. Decline takes focus, so Enter and Esc both decline; only a
 * real click or key press on the approving button approves.
 */
export const ApprovalDialog: React.FC = () => {
  const request = useApprovalQueue((state) => state.queue[0]);
  const waiting = useApprovalQueue((state) => Math.max(0, state.queue.length - 1));
  const [armedId, setArmedId] = useState<number | null>(null);
  const declineRef = useRef<HTMLButtonElement>(null);
  const requestId = request?.id;

  useEffect(() => {
    if (requestId === undefined) return;
    const timer = window.setTimeout(() => setArmedId(requestId), APPROVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [requestId]);

  if (!request) return null;
  return (
    <Dialog.Root key={request.id} open onOpenChange={(open) => { if (!open) request.settle('declined'); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[500] bg-black/50 animate-fade-in" />
        <div className="pointer-events-none fixed inset-0 z-[501] flex items-center justify-center p-4">
          <Dialog.Content
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              declineRef.current?.focus();
            }}
            className="ui-dialog pointer-events-auto w-full max-w-[480px] rounded-[var(--canvas-border-radius)] border border-[var(--color-border-secondary)] bg-[var(--card-bg)] p-6 text-left outline-none animate-scale-in shadow-[var(--dialog-elevation-shadow)]"
          >
            <p className="m-0 text-[12px] font-medium text-[var(--text-tertiary)]">Your AI assistant asks</p>
            <Dialog.Title className="m-0 mt-1 text-[15px] font-semibold text-[var(--text-primary)] [overflow-wrap:anywhere]">
              {request.title}
            </Dialog.Title>
            <Dialog.Description asChild>
              <ul className="m-0 mt-2 flex list-none flex-col gap-1 p-0 text-[13px] leading-[20px] text-[var(--text-secondary)] [overflow-wrap:anywhere]">
                {request.details.map((line, index) => <li key={index}>{line}</li>)}
              </ul>
            </Dialog.Description>
            {request.warning && (
              <p className="m-0 mt-3 text-[13px] leading-[20px]" style={{ color: 'var(--rules-action-stop-text)' }}>
                {request.warning}
              </p>
            )}
            <div className="mt-5 flex items-center justify-end gap-2">
              {waiting > 0 && (
                <span className="mr-auto text-[12px] text-[var(--text-tertiary)]">{waiting} more waiting</span>
              )}
              <Button ref={declineRef} onClick={() => request.settle('declined')}>Decline</Button>
              <Button
                variant={request.tone}
                disabled={armedId !== request.id}
                onClick={(event) => {
                  // A script calling click() is not the person.
                  if (event.nativeEvent.isTrusted) request.settle('approved');
                }}
              >
                {request.approveLabel}
              </Button>
            </div>
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
