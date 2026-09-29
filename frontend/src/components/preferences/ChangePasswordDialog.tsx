import React, { useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { apiRequest } from '@/lib/api';
import { Button } from '@/ui/Button';
import { Input } from '@/ui/Input';
import { LinearCloseIcon } from '@/icons/LinearIcons';

interface ChangePasswordDialogProps {
  open: boolean;
  /** An account without a password sets one; otherwise the current password is required. */
  hasPassword: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void | Promise<unknown>;
}

const MIN_LENGTH = 8;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'The password could not be saved. Please try again.';
}

export const ChangePasswordDialog: React.FC<ChangePasswordDialogProps> = ({
  open,
  hasPassword,
  onOpenChange,
  onChanged,
}) => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setCurrentPassword('');
    setNewPassword('');
    setConfirmation('');
    setError('');
    setBusy(false);
  }, [open]);

  const save = async () => {
    if (hasPassword && !currentPassword) {
      setError('Enter your current password.');
      return;
    }
    if (newPassword.length < MIN_LENGTH) {
      setError(`The password must be at least ${MIN_LENGTH} characters.`);
      return;
    }
    if (newPassword !== confirmation) {
      setError('The passwords do not match.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await apiRequest('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ old_password: hasPassword ? currentPassword : '', new_password: newPassword }),
      });
      await onChanged();
      onOpenChange(false);
    } catch (saveError) {
      setError(errorMessage(saveError));
    } finally {
      setBusy(false);
    }
  };

  const title = hasPassword ? 'Change password' : 'Set password';
  const onEnter = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter') void save();
  };

  return (
    <Dialog.Root open={open} onOpenChange={(next) => { if (!busy) onOpenChange(next); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[500] bg-black/50 backdrop-blur-[2px] animate-fade-in" />
        <div className="pointer-events-none fixed inset-0 z-[501] flex items-center justify-center p-4">
          <Dialog.Content className="ui-dialog pointer-events-auto w-full max-w-[480px] rounded-[20px] border border-[var(--color-border-secondary)] bg-[var(--card-bg)] text-left outline-none animate-scale-in shadow-[0_1px_2px_rgba(0,0,0,0.04),0_6px_24px_rgba(0,0,0,0.12),0_12px_48px_rgba(0,0,0,0.18)]">
            <header className="flex items-center justify-between px-6 pt-6 pb-2">
              <Dialog.Title className="text-[15px] font-semibold text-[var(--text-primary)]">
                {title}
              </Dialog.Title>
              <Dialog.Close asChild>
                <button
                  className="ui-icon-button flex h-7 w-7 items-center justify-center rounded-full text-[var(--text-tertiary)] hover:bg-[var(--item-hover-bg)] hover:text-[var(--text-primary)] transition-colors duration-150 cursor-default"
                  type="button"
                  aria-label="Close"
                >
                  <LinearCloseIcon size={14} />
                </button>
              </Dialog.Close>
            </header>

            <form
              className="flex flex-col gap-4 px-6 pb-6 pt-2"
              onSubmit={(event) => {
                event.preventDefault();
                void save();
              }}
            >
              <Dialog.Description className="text-[13px] leading-[20px] text-[var(--text-secondary)]">
                With a password you can also log in with your username or email and this password,
                not only with a code from your email.
              </Dialog.Description>
              {hasPassword && (
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="current-password" className="text-[13px] font-medium text-[var(--text-primary)]">
                    Current password
                  </label>
                  <Input
                    id="current-password"
                    type="password"
                    autoFocus
                    autoComplete="current-password"
                    value={currentPassword}
                    disabled={busy}
                    onChange={(event) => setCurrentPassword(event.target.value)}
                    onKeyDown={onEnter}
                  />
                </div>
              )}
              <div className="flex flex-col gap-1.5">
                <label htmlFor="new-password" className="text-[13px] font-medium text-[var(--text-primary)]">
                  New password
                </label>
                <Input
                  id="new-password"
                  type="password"
                  autoFocus={!hasPassword}
                  autoComplete="new-password"
                  placeholder={`At least ${MIN_LENGTH} characters`}
                  value={newPassword}
                  disabled={busy}
                  onChange={(event) => setNewPassword(event.target.value)}
                  onKeyDown={onEnter}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="confirm-password" className="text-[13px] font-medium text-[var(--text-primary)]">
                  Confirm new password
                </label>
                <Input
                  id="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  value={confirmation}
                  disabled={busy}
                  onChange={(event) => setConfirmation(event.target.value)}
                  onKeyDown={onEnter}
                />
              </div>

              {error && (
                <p role="alert" className="text-[13px] leading-[18px] text-[var(--rules-action-stop-text)]">
                  {error}
                </p>
              )}

              <div className="flex items-center justify-end gap-2 pt-1">
                <Dialog.Close asChild>
                  <Button disabled={busy}>Cancel</Button>
                </Dialog.Close>
                <Button type="submit" variant="primary" disabled={busy}>
                  {busy ? 'Saving…' : title}
                </Button>
              </div>
            </form>
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
