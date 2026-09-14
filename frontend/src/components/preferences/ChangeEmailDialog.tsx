import React, { useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { apiRequest } from '@/lib/api';
import { Button } from '@/ui/Button';
import { Input } from '@/ui/Input';
import { LinearCloseIcon } from '@/icons/LinearIcons';

type Step = 'address' | 'code';

interface ChangeEmailDialogProps {
  open: boolean;
  currentEmail: string | null;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void | Promise<unknown>;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'The action could not be completed. Please try again.';
}

export const ChangeEmailDialog: React.FC<ChangeEmailDialogProps> = ({
  open,
  currentEmail,
  onOpenChange,
  onChanged,
}) => {
  const [step, setStep] = useState<Step>('address');
  const [newEmail, setNewEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setStep('address');
    setNewEmail('');
    setCode('');
    setError('');
    setBusy(false);
  }, [open]);

  const requestCode = async () => {
    const address = newEmail.trim().toLowerCase();
    if (!address) return;
    if (address === (currentEmail || '').trim().toLowerCase()) {
      setError('That is already your current address.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await apiRequest('/api/auth/request-email-change', {
        method: 'POST',
        body: JSON.stringify({ new_email: address }),
      });
      setStep('code');
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusy(false);
    }
  };

  const confirmCode = async () => {
    const cleanCode = code.trim();
    if (!cleanCode) return;
    setBusy(true);
    setError('');
    try {
      await apiRequest('/api/auth/verify-email-change', {
        method: 'POST',
        body: JSON.stringify({ code: cleanCode }),
      });
      await onChanged();
      onOpenChange(false);
    } catch (confirmError) {
      setError(errorMessage(confirmError));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[500] bg-black/50 backdrop-blur-[2px] animate-fade-in" />
        <div className="pointer-events-none fixed inset-0 z-[501] flex items-center justify-center p-4">
          <Dialog.Content className="ui-dialog pointer-events-auto w-full max-w-[480px] rounded-[20px] border border-[var(--color-border-secondary)] bg-[var(--card-bg)] text-left outline-none animate-scale-in shadow-[0_1px_2px_rgba(0,0,0,0.04),0_6px_24px_rgba(0,0,0,0.12),0_12px_48px_rgba(0,0,0,0.18)]">
            <header className="flex items-center justify-between px-6 pt-6 pb-2">
              <Dialog.Title className="text-[15px] font-semibold text-[var(--text-primary)]">
                Change email
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

            <div className="flex flex-col gap-4 px-6 pb-6 pt-2">
              {step === 'address' ? (
                <>
                  <p className="text-[13px] leading-[20px] text-[var(--text-secondary)]">
                    We will send a six-digit confirmation code to the new address. Until the code is
                    entered, you keep signing in with the current address.
                  </p>
                  <div className="flex flex-col gap-1.5">
                    <label
                      htmlFor="change-email-address"
                      className="text-[13px] font-medium text-[var(--text-primary)]"
                    >
                      New email address
                    </label>
                    <Input
                      id="change-email-address"
                      type="email"
                      autoFocus
                      autoComplete="email"
                      spellCheck={false}
                      placeholder="name@example.com"
                      value={newEmail}
                      disabled={busy}
                      onChange={(event) => setNewEmail(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') requestCode();
                      }}
                    />
                  </div>
                </>
              ) : (
                <>
                  <p className="text-[13px] leading-[20px] text-[var(--text-secondary)]">
                    A code was sent to <span className="text-[var(--text-primary)]">{newEmail.trim().toLowerCase()}</span>.
                    Enter it to finish changing your address.
                  </p>
                  <div className="flex flex-col gap-1.5">
                    <label
                      htmlFor="change-email-code"
                      className="text-[13px] font-medium text-[var(--text-primary)]"
                    >
                      Confirmation code
                    </label>
                    <Input
                      id="change-email-code"
                      inputMode="numeric"
                      autoFocus
                      autoComplete="one-time-code"
                      spellCheck={false}
                      placeholder="000000"
                      maxLength={10}
                      value={code}
                      disabled={busy}
                      onChange={(event) => setCode(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') confirmCode();
                      }}
                    />
                  </div>
                </>
              )}

              {error && (
                <p role="alert" className="text-[13px] leading-[18px] text-[var(--rules-action-stop-text)]">
                  {error}
                </p>
              )}

              <div className="flex items-center justify-end gap-2 pt-1">
                {step === 'code' && (
                  <Button
                    onClick={() => {
                      setStep('address');
                      setCode('');
                      setError('');
                    }}
                    disabled={busy}
                  >
                    Back
                  </Button>
                )}
                <Dialog.Close asChild>
                  <Button disabled={busy}>Cancel</Button>
                </Dialog.Close>
                {step === 'address' ? (
                  <Button variant="primary" onClick={requestCode} disabled={busy || !newEmail.trim()}>
                    {busy ? 'Sending…' : 'Send code'}
                  </Button>
                ) : (
                  <Button variant="primary" onClick={confirmCode} disabled={busy || !code.trim()}>
                    {busy ? 'Confirming…' : 'Confirm'}
                  </Button>
                )}
              </div>
            </div>
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
