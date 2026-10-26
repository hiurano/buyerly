import React, { useEffect, useMemo, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import * as stylex from '@stylexjs/stylex';
import { apiRequest } from '@/lib/api';
import type { MetaAssetsResponse, MetaConnectionAsset, MetaInviteCreated } from '@/lib/types';
import { BuyerlyCloseIcon, BuyerlyMetaIcon } from '@/icons/BuyerlyIcons';
import { BuyerlyCheckbox } from '@/ui/BuyerlyCheckbox';
import { withClassName } from '@/ui/withClassName';
import { colors } from '@/styles/tokens.stylex';

const WIDE = '@media (min-width: 640px)';

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
    maxWidth: 560,
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
    paddingTop: 24,
    paddingRight: 24,
    paddingBottom: 8,
    paddingLeft: 24,
  },
  heading: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  metaIcon: {
    color: colors['--text-secondary'],
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
    maxHeight: '60vh',
    overflowY: 'auto',
    paddingTop: 8,
    paddingRight: 24,
    paddingBottom: 8,
    paddingLeft: 24,
  },
  description: {
    fontSize: 13,
    lineHeight: 1.625,
    color: colors['--text-secondary'],
  },
  status: {
    fontSize: 13,
    color: colors['--text-secondary'],
  },
  invite: {
    marginTop: 12,
    width: '100%',
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: colors['--color-border-primary'],
    backgroundColor: colors['--item-hover-bg'],
    paddingTop: 8,
    paddingRight: 12,
    paddingBottom: 8,
    paddingLeft: 12,
    fontFamily: '"Berkeley Mono", "JetBrains Mono", monospace',
    fontSize: 12,
    color: colors['--text-primary'],
  },
  // Each block after the description, 16px apart.
  stacked: {
    marginTop: 16,
  },
  noAssets: {
    fontSize: 13,
    color: colors['--text-tertiary'],
  },
  business: {
    paddingLeft: 4,
    paddingRight: 4,
    fontSize: 12,
    fontWeight: 500,
    color: colors['--text-tertiary'],
  },
  assets: {
    marginTop: 6,
    overflow: 'hidden',
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: colors['--color-border-primary'],
  },
  asset: {
    display: 'flex',
    minHeight: 40,
    cursor: 'default',
    userSelect: 'none',
    alignItems: 'center',
    gap: 8,
    borderWidth: 0,
    borderBottomWidth: {
      default: 1,
      ':last-child': 0,
    },
    borderStyle: 'solid',
    borderColor: colors['--color-border-primary'],
    paddingLeft: 12,
    paddingRight: 12,
    transitionProperty: 'color, background-color, border-color, text-decoration-color, fill, stroke',
    transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
    transitionDuration: '150ms',
    outline: {
      default: null,
      ':focus-visible': '2px solid transparent',
    },
    outlineOffset: {
      default: null,
      ':focus-visible': 2,
    },
    backgroundColor: {
      default: null,
      ':hover': colors['--item-hover-bg'],
      ':focus-visible': colors['--item-hover-bg'],
    },
  },
  // An added account does not light up under the pointer.
  assetImported: {
    backgroundColor: {
      default: null,
      ':focus-visible': colors['--item-hover-bg'],
    },
  },
  assetName: {
    minWidth: 0,
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: '0%',
    fontSize: 13,
    color: colors['--text-primary'],
  },
  assetDetail: {
    fontSize: 12,
    color: colors['--text-tertiary'],
  },
  error: {
    marginTop: 12,
    fontSize: 13,
    color: colors['--rules-action-stop-text'],
  },
  footer: {
    display: 'flex',
    flexDirection: {
      default: 'column',
      [WIDE]: 'row',
    },
    alignItems: {
      default: 'stretch',
      [WIDE]: 'center',
    },
    justifyContent: {
      default: null,
      [WIDE]: 'flex-end',
    },
    gap: 8,
    paddingTop: 16,
    paddingRight: 24,
    paddingBottom: 24,
    paddingLeft: 24,
  },
  button: {
    display: 'inline-flex',
    height: 28,
    width: {
      default: '100%',
      [WIDE]: 'auto',
    },
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9999,
    fontSize: 12,
    fontWeight: 500,
    transitionProperty: 'color, background-color, border-color, text-decoration-color, fill, stroke',
    transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
    transitionDuration: {
      default: '150ms',
      ':active': '0s',
    },
    cursor: 'default',
    userSelect: 'none',
  },
  secondary: {
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: colors['--color-border-secondary'],
    backgroundColor: {
      default: 'transparent',
      ':hover': colors['--item-hover-bg'],
    },
    paddingLeft: 12,
    paddingRight: 12,
    color: {
      default: colors['--text-secondary'],
      ':hover': colors['--text-primary'],
    },
  },
  primary: {
    backgroundColor: {
      default: '#5e6ad2',
      ':hover': '#6875e5',
    },
    paddingLeft: 14,
    paddingRight: 14,
    color: '#fff',
    boxShadow: '0 1px 1px rgba(0,0,0,0.04), 0 3px 6px -2px rgba(0,0,0,0.02)',
    opacity: {
      default: null,
      ':disabled': 0.5,
    },
  },
  wait: {
    fontSize: 12,
    color: colors['--text-tertiary'],
  },
});

type FlowStep = 'choice' | 'creating_invite' | 'invite_ready' | 'discovering' | 'selecting' | 'importing' | 'done';

interface MetaConnectionDialogProps {
  open: boolean;
  connectionId: number | null;
  returnPath: string;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'The action could not be completed. Please try again.';
}

function accountLabel(asset: MetaConnectionAsset): string {
  return `${asset.name} · ${asset.account_id}`;
}

export const MetaConnectionDialog: React.FC<MetaConnectionDialogProps> = ({
  open,
  connectionId,
  returnPath,
  onOpenChange,
  onImported,
}) => {
  const [step, setStep] = useState<FlowStep>('choice');
  const [assets, setAssets] = useState<MetaConnectionAsset[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [invite, setInvite] = useState<MetaInviteCreated | null>(null);
  const [error, setError] = useState('');

  const groupedAssets = useMemo(() => {
    const groups = new Map<string, MetaConnectionAsset[]>();
    for (const asset of assets) {
      const key = asset.business_name || 'No Business Manager';
      groups.set(key, [...(groups.get(key) || []), asset]);
    }
    return [...groups.entries()];
  }, [assets]);

  useEffect(() => {
    if (!open) return;
    setError('');
    setAssets([]);
    setSelectedIds(new Set());
    setInvite(null);
    setStep(connectionId ? 'discovering' : 'choice');
  }, [connectionId, open]);

  useEffect(() => {
    if (!open || !connectionId || step !== 'discovering') return;
    let active = true;
    const discover = async () => {
      try {
        const result = await apiRequest<MetaAssetsResponse>(`/api/meta/connections/${connectionId}/discover`, {
          method: 'POST',
          body: JSON.stringify({}),
        });
        if (!active) return;
        setAssets(result.accounts);
        setStep('selecting');
      } catch (discoverError) {
        if (active) setError(errorMessage(discoverError));
      }
    };
    void discover();
    return () => {
      active = false;
    };
  }, [connectionId, open, step]);

  useEffect(() => {
    if (!open || step !== 'creating_invite') return;
    let active = true;
    const createInvite = async () => {
      try {
        const result = await apiRequest<MetaInviteCreated>('/api/meta/invites', {
          method: 'POST',
          body: JSON.stringify({}),
        });
        if (!active) return;
        setInvite(result);
        setStep('invite_ready');
      } catch (inviteError) {
        if (active) setError(errorMessage(inviteError));
      }
    };
    void createInvite();
    return () => {
      active = false;
    };
  }, [open, step]);

  const continueWithFacebook = async () => {
    setError('');
    try {
      const result = await apiRequest<{ authorization_url: string }>('/api/meta/oauth/start?return_path=' + encodeURIComponent(returnPath), {
        method: 'POST',
        body: JSON.stringify({}),
      });
      window.location.assign(result.authorization_url);
    } catch (oauthError) {
      setError(errorMessage(oauthError));
    }
  };

  const toggleAsset = (asset: MetaConnectionAsset) => {
    if (asset.import_status === 'this_connection') return;
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(asset.account_id)) next.delete(asset.account_id);
      else next.add(asset.account_id);
      return next;
    });
  };

  const importSelected = async () => {
    if (!connectionId || selectedIds.size === 0) return;
    setStep('importing');
    setError('');
    try {
      await apiRequest(`/api/meta/connections/${connectionId}/import`, {
        method: 'POST',
        body: JSON.stringify({ account_ids: [...selectedIds] }),
      });
      onImported();
      setStep('done');
    } catch (importError) {
      setError(errorMessage(importError));
      setStep('selecting');
    }
  };

  const copyInvite = async () => {
    if (!invite) return;
    try {
      await navigator.clipboard.writeText(invite.invite_url);
    } catch {
      setError('Could not copy the link. Please copy it manually.');
    }
  };

  const title = 'Add ad accounts';
  const isBusy = step === 'discovering' || step === 'importing' || step === 'creating_invite';

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay {...stylex.props(styles.overlay)} />
        <div {...stylex.props(styles.frame)}>
          <Dialog.Content {...withClassName(stylex.props(styles.content), 'ui-dialog animate-scale-in')}>
            <header {...stylex.props(styles.header)}>
              <div {...stylex.props(styles.heading)}>
                <BuyerlyMetaIcon size={16} className={stylex.props(styles.metaIcon).className} />
                <Dialog.Title {...stylex.props(styles.title)}>{title}</Dialog.Title>
              </div>
              <Dialog.Close asChild>
                <button {...withClassName(stylex.props(styles.close), 'ui-icon-button')} type="button" aria-label="Close">
                  <BuyerlyCloseIcon size={14} />
                </button>
              </Dialog.Close>
            </header>

            <div {...stylex.props(styles.body)}>
              {step === 'choice' && (
                <div>
                  <Dialog.Description {...stylex.props(styles.description)}>
                    Choose how to connect your ad accounts.
                  </Dialog.Description>
                </div>
              )}

              {step === 'creating_invite' && <p {...stylex.props(styles.status)} role="status">Creating a one-time link…</p>}

              {step === 'invite_ready' && invite && (
                <div>
                  <Dialog.Description {...stylex.props(styles.description)}>
                    Open this link in a browser signed in to the right Facebook profile, or send it to the profile owner. The link is valid for 24 hours and can be used once.
                  </Dialog.Description>
                  <input {...withClassName(stylex.props(styles.invite), 'ui-input')} readOnly value={invite.invite_url} aria-label="One-time connection link" />
                </div>
              )}

              {step === 'discovering' && <p {...stylex.props(styles.status)} role="status">Looking for available ad accounts…</p>}

              {step === 'selecting' && (
                <div>
                  <Dialog.Description {...stylex.props(styles.description)}>
                    Choose the ad accounts to add to this workspace.
                  </Dialog.Description>
                  {groupedAssets.length === 0 ? (
                    <p {...stylex.props(styles.stacked, styles.noAssets)}>Facebook returned no available ad accounts for this profile.</p>
                  ) : groupedAssets.map(([businessName, businessAssets]) => (
                    <section key={businessName} {...stylex.props(styles.stacked)} aria-label={businessName}>
                      <h3 {...stylex.props(styles.business)}>{businessName}</h3>
                      <div {...stylex.props(styles.assets)}>
                        {businessAssets.map((asset) => {
                          const imported = asset.import_status === 'this_connection';
                          const checked = selectedIds.has(asset.account_id);
                          return (
                            <div
                              key={asset.account_id}
                              role="checkbox"
                              aria-checked={imported || checked}
                              aria-disabled={imported || undefined}
                              tabIndex={imported ? -1 : 0}
                              onClick={() => toggleAsset(asset)}
                              onKeyDown={(event) => {
                                if (event.key !== ' ' && event.key !== 'Enter') return;
                                event.preventDefault();
                                toggleAsset(asset);
                              }}
                              {...stylex.props(styles.asset, imported && styles.assetImported)}
                            >
                              {/* An added account keeps the slot, like a row that cannot be selected. */}
                              <BuyerlyCheckbox checked={checked} onChange={() => toggleAsset(asset)} hidden={imported} alwaysVisible decorative />
                              <span {...stylex.props(styles.assetName)}>{accountLabel(asset)}</span>
                              <span {...stylex.props(styles.assetDetail)}>{imported ? 'Added' : asset.currency}</span>
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  ))}
                </div>
              )}

              {step === 'importing' && <p {...stylex.props(styles.status)} role="status">Adding the selected ad accounts…</p>}

              {step === 'done' && (
                <Dialog.Description {...stylex.props(styles.description)}>
                  Ad accounts added. Automation rules are switched off for them.
                </Dialog.Description>
              )}

              {error && <p {...stylex.props(styles.error)} role="alert">{error}</p>}
            </div>

            <footer {...stylex.props(styles.footer)}>
              {step === 'choice' && (
                <>
                  <button
                    {...stylex.props(styles.button, styles.secondary)}
                    type="button"
                    onClick={() => setStep('creating_invite')}
                  >
                    Generate link
                  </button>
                  <button
                    {...stylex.props(styles.button, styles.primary)}
                    type="button"
                    onClick={continueWithFacebook}
                  >
                    Sign in with Facebook
                  </button>
                </>
              )}
              {step === 'invite_ready' && (
                <button
                  {...stylex.props(styles.button, styles.primary)}
                  type="button"
                  onClick={copyInvite}
                >
                  Copy link
                </button>
              )}
              {step === 'selecting' && (
                <button
                  {...stylex.props(styles.button, styles.primary)}
                  type="button"
                  disabled={selectedIds.size === 0}
                  onClick={importSelected}
                >
                  Add ad accounts
                </button>
              )}
              {step === 'done' && (
                <Dialog.Close asChild>
                  <button
                    {...stylex.props(styles.button, styles.primary)}
                    type="button"
                  >
                    Done
                  </button>
                </Dialog.Close>
              )}
              {isBusy && <span {...stylex.props(styles.wait)} aria-live="polite">Please wait…</span>}
            </footer>
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
