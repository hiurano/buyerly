import React, { useRef } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Button } from '@/ui/Button';

interface ConfirmDialogProps {
  open: boolean;
  /** A question naming what is affected, e.g. `Delete 3 rules?`. */
  title: string;
  /** The consequence, and the way back if there is one. */
  description: string;
  confirmLabel: string;
  tone?: 'danger' | 'primary';
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Linear's confirmation: a small modal with the question, its consequence, and
 * Cancel beside the confirming button. The confirming button takes focus, so
 * Enter confirms and Esc cancels without reaching for the pointer.
 */
export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title,
  description,
  confirmLabel,
  tone = 'danger',
  busy = false,
  onConfirm,
  onCancel,
}) => {
  const confirmRef = useRef<HTMLButtonElement>(null);

  return (
    <Dialog.Root open={open} onOpenChange={(next) => { if (!next && !busy) onCancel(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[500] bg-black/50 animate-fade-in" />
        <div className="pointer-events-none fixed inset-0 z-[501] flex items-center justify-center p-4">
          <Dialog.Content
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              confirmRef.current?.focus();
            }}
            className="ui-dialog pointer-events-auto w-full max-w-[480px] rounded-[var(--canvas-border-radius)] border border-[var(--color-border-secondary)] bg-[var(--card-bg)] p-6 text-left outline-none animate-scale-in shadow-[var(--dialog-elevation-shadow)]"
          >
            <Dialog.Title className="m-0 text-[15px] font-semibold text-[var(--text-primary)]">
              {title}
            </Dialog.Title>
            <Dialog.Description className="m-0 mt-2 text-[13px] leading-[20px] text-[var(--text-secondary)]">
              {description}
            </Dialog.Description>
            <div className="mt-5 flex justify-end gap-2">
              <Button onClick={onCancel} disabled={busy}>Cancel</Button>
              <Button ref={confirmRef} variant={tone} onClick={onConfirm} disabled={busy}>
                {confirmLabel}
              </Button>
            </div>
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
