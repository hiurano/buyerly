import React, { useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import * as stylex from '@stylexjs/stylex';
import { apiRequest } from '@/lib/api';
import { Button } from '@/ui/Button';
import { Input } from '@/ui/Input';
import { withClassName } from '@/ui/withClassName';
import { BuyerlyIcon } from '@/icons/BuyerlyIcon';
import { colors } from '@/styles/tokens.stylex';

const styles = stylex.create({
  overlay: {
    position: 'fixed',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 500,
    backgroundColor: 'rgb(0 0 0 / 0.5)',
    backdropFilter: 'blur(2px)',
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
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 16,
    paddingRight: 16,
    paddingBottom: 16,
    paddingLeft: 16,
  },
  content: {
    pointerEvents: 'auto',
    width: '100%',
    maxWidth: 480,
    borderRadius: 20,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: colors['--color-border-secondary'],
    backgroundColor: colors['--card-bg'],
    textAlign: 'left',
    outline: '2px solid transparent',
    outlineOffset: 2,
    boxShadow: '0 1px 2px rgba(0,0,0,0.04), 0 6px 24px rgba(0,0,0,0.12), 0 12px 48px rgba(0,0,0,0.18)',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 24,
    paddingRight: 24,
    paddingTop: 24,
    paddingBottom: 8,
  },
  title: {
    fontSize: 15,
    fontWeight: 600,
    color: colors['--text-primary'],
  },
  close: {
    display: 'flex',
    height: 28,
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9999,
    color: {
      default: colors['--text-tertiary'],
      ':hover': colors['--text-primary'],
    },
    backgroundColor: {
      default: null,
      ':hover': colors['--item-hover-bg'],
    },
    transitionProperty: 'color, background-color, border-color, text-decoration-color, fill, stroke',
    transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
    transitionDuration: '150ms',
    cursor: 'default',
  },
  body: {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
    paddingLeft: 24,
    paddingRight: 24,
    paddingBottom: 24,
    paddingTop: 8,
  },
  text: {
    fontSize: 13,
    lineHeight: '20px',
    color: colors['--text-secondary'],
  },
  address: {
    color: colors['--text-primary'],
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: 500,
    color: colors['--text-primary'],
  },
  error: {
    fontSize: 13,
    lineHeight: '18px',
    color: colors['--rules-action-stop-text'],
  },
  actions: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
    paddingTop: 4,
  },
});

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
    }
    setBusy(false);
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
    }
    setBusy(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay {...stylex.props(styles.overlay)} />
        <div {...stylex.props(styles.frame)}>
          <Dialog.Content {...withClassName(stylex.props(styles.content), 'ui-dialog animate-scale-in')}>
            <header {...stylex.props(styles.header)}>
              <Dialog.Title {...stylex.props(styles.title)}>
                Change email
              </Dialog.Title>
              <Dialog.Close asChild>
                <button
                  {...withClassName(stylex.props(styles.close), 'ui-icon-button')}
                  type="button"
                  aria-label="Close"
                >
                  <BuyerlyIcon name="close" size={14} />
                </button>
              </Dialog.Close>
            </header>

            <div {...stylex.props(styles.body)}>
              {step === 'address' ? (
                <>
                  <p {...stylex.props(styles.text)}>
                    We will send a confirmation code to the new address. Until the code is
                    entered, you keep signing in with the current address.
                  </p>
                  <div {...stylex.props(styles.field)}>
                    <label
                      htmlFor="change-email-address"
                      {...stylex.props(styles.label)}
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
                  <p {...stylex.props(styles.text)}>
                    A code was sent to <span {...stylex.props(styles.address)}>{newEmail.trim().toLowerCase()}</span>.
                    Enter it to finish changing your address.
                  </p>
                  <div {...stylex.props(styles.field)}>
                    <label
                      htmlFor="change-email-code"
                      {...stylex.props(styles.label)}
                    >
                      Confirmation code
                    </label>
                    <Input
                      id="change-email-code"
                      autoFocus
                      autoCapitalize="characters"
                      autoComplete="one-time-code"
                      spellCheck={false}
                      placeholder="Enter code"
                      value={code}
                      disabled={busy}
                      onChange={(event) => setCode(event.target.value.replace(/[^a-z]/gi, '').toUpperCase().slice(0, 10))}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') confirmCode();
                      }}
                    />
                  </div>
                </>
              )}

              {error && (
                <p role="alert" {...stylex.props(styles.error)}>
                  {error}
                </p>
              )}

              <div {...stylex.props(styles.actions)}>
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
