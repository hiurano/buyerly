import React, { useEffect, useMemo, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { apiRequest } from '@/lib/api';
import type { MetaAssetsResponse, MetaConnectionAsset, MetaInviteCreated } from '@/lib/types';
import { LinearCloseIcon, LinearMetaIcon } from '@/icons/LinearIcons';

type FlowStep = 'choice' | 'creating_invite' | 'invite_ready' | 'discovering' | 'selecting' | 'importing' | 'done';

interface MetaConnectionDialogProps {
  open: boolean;
  connectionId: number | null;
  returnPath: string;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Не удалось выполнить действие. Попробуйте ещё раз.';
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
      const key = asset.business_name || 'Без Business Manager';
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
      setError('Не удалось скопировать ссылку. Скопируйте её вручную.');
    }
  };

  const title = 'Connect Facebook';
  const isBusy = step === 'discovering' || step === 'importing' || step === 'creating_invite';

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[500] bg-black/50 backdrop-blur-[2px] animate-fade-in" />
        <div className="pointer-events-none fixed inset-0 z-[501] flex items-center justify-center p-4">
          <Dialog.Content className="ui-dialog pointer-events-auto w-full max-w-[560px] rounded-[20px] border border-[var(--color-border-secondary)] bg-[var(--card-bg)] text-left outline-none animate-scale-in shadow-[0_1px_2px_rgba(0,0,0,0.04),0_6px_24px_rgba(0,0,0,0.12),0_12px_48px_rgba(0,0,0,0.18)]">
            <header className="flex items-center justify-between px-6 pt-6 pb-2">
              <div className="flex items-center gap-2.5">
                <LinearMetaIcon size={16} className="text-[var(--text-secondary)]" />
                <Dialog.Title className="text-[15px] font-semibold text-[var(--text-primary)]">{title}</Dialog.Title>
              </div>
              <Dialog.Close asChild>
                <button className="ui-icon-button flex h-7 w-7 items-center justify-center rounded-full text-[var(--text-tertiary)] hover:bg-[var(--item-hover-bg)] hover:text-[var(--text-primary)] transition-colors duration-150 cursor-default" type="button" aria-label="Закрыть">
                  <LinearCloseIcon size={14} />
                </button>
              </Dialog.Close>
            </header>

            <div className="max-h-[60vh] overflow-y-auto px-6 py-2">
              {step === 'choice' && (
                <div className="space-y-2">
                  <Dialog.Description className="text-[13px] leading-relaxed text-[var(--text-secondary)]">
                    Выберите способ подключения рекламных кабинетов.
                  </Dialog.Description>
                </div>
              )}

              {step === 'creating_invite' && <p className="text-[13px] text-[var(--text-secondary)]" role="status">Создаём одноразовую ссылку…</p>}

              {step === 'invite_ready' && invite && (
                <div className="space-y-3">
                  <Dialog.Description className="text-[13px] leading-relaxed text-[var(--text-secondary)]">
                    Откройте эту ссылку в браузере с нужным Facebook-профилем или отправьте владельцу профиля. Ссылка действует 24 часа и используется один раз.
                  </Dialog.Description>
                  <input className="ui-input w-full rounded-lg border border-[var(--color-border-primary)] bg-[var(--item-hover-bg)] px-3 py-2 font-mono text-[12px] text-[var(--text-primary)]" readOnly value={invite.invite_url} aria-label="Одноразовая ссылка для подключения" />
                </div>
              )}

              {step === 'discovering' && <p className="text-[13px] text-[var(--text-secondary)]" role="status">Ищем доступные рекламные кабинеты…</p>}

              {step === 'selecting' && (
                <div className="space-y-4">
                  <Dialog.Description className="text-[13px] leading-relaxed text-[var(--text-secondary)]">
                    Выберите кабинеты, которые нужно добавить в этот workspace.
                  </Dialog.Description>
                  {groupedAssets.length === 0 ? (
                    <p className="text-[13px] text-[var(--text-tertiary)]">Facebook не вернул доступных рекламных кабинетов для этого профиля.</p>
                  ) : groupedAssets.map(([businessName, businessAssets]) => (
                    <section key={businessName} className="space-y-1.5" aria-label={businessName}>
                      <h3 className="px-1 text-[12px] font-medium text-[var(--text-tertiary)]">{businessName}</h3>
                      <div className="overflow-hidden rounded-xl border border-[var(--color-border-primary)]">
                        {businessAssets.map((asset) => {
                          const imported = asset.import_status === 'this_connection';
                          const checked = selectedIds.has(asset.account_id);
                          return (
                            <label key={asset.account_id} className="flex min-h-10 cursor-default items-center gap-3 border-b border-[var(--color-border-primary)] px-3.5 last:border-b-0 transition-colors hover:bg-[var(--item-hover-bg)]">
                              <input type="checkbox" checked={imported || checked} disabled={imported} onChange={() => toggleAsset(asset)} className="h-4 w-4 rounded" />
                              <span className="min-w-0 flex-1 text-[13px] text-[var(--text-primary)]">{accountLabel(asset)}</span>
                              <span className="text-[12px] text-[var(--text-tertiary)]">{imported ? 'Добавлен' : asset.currency}</span>
                            </label>
                          );
                        })}
                      </div>
                    </section>
                  ))}
                </div>
              )}

              {step === 'importing' && <p className="text-[13px] text-[var(--text-secondary)]" role="status">Добавляем выбранные кабинеты…</p>}

              {step === 'done' && (
                <Dialog.Description className="text-[13px] leading-relaxed text-[var(--text-secondary)]">
                  Кабинеты добавлены. Автоправила для них выключены.
                </Dialog.Description>
              )}

              {error && <p className="mt-3 text-[13px] text-[var(--rules-action-stop-text)]" role="alert">{error}</p>}
            </div>

            <footer className="flex flex-col items-stretch gap-2 px-6 pb-6 pt-4 sm:flex-row sm:items-center sm:justify-end">
              {step === 'choice' && (
                <>
                  <button
                    className="inline-flex h-7 items-center justify-center rounded-full border border-[var(--color-border-secondary)] bg-transparent px-3 text-[12px] font-medium text-[var(--text-secondary)] transition-colors duration-150 hover:bg-[var(--item-hover-bg)] hover:text-[var(--text-primary)] active:duration-0 cursor-default select-none w-full sm:w-auto"
                    type="button"
                    onClick={() => setStep('creating_invite')}
                  >
                    Сгенерировать ссылку
                  </button>
                  <button
                    className="inline-flex h-7 items-center justify-center rounded-full bg-[#5e6ad2] px-3.5 text-[12px] font-medium text-white shadow-[0_1px_1px_rgba(0,0,0,0.04),0_3px_6px_-2px_rgba(0,0,0,0.02)] transition-colors duration-150 hover:bg-[#6875e5] active:duration-0 cursor-default select-none w-full sm:w-auto"
                    type="button"
                    onClick={continueWithFacebook}
                  >
                    Войти через Facebook
                  </button>
                </>
              )}
              {step === 'invite_ready' && (
                <button
                  className="inline-flex h-7 items-center justify-center rounded-full bg-[#5e6ad2] px-3.5 text-[12px] font-medium text-white shadow-[0_1px_1px_rgba(0,0,0,0.04),0_3px_6px_-2px_rgba(0,0,0,0.02)] transition-colors duration-150 hover:bg-[#6875e5] active:duration-0 cursor-default select-none w-full sm:w-auto"
                  type="button"
                  onClick={copyInvite}
                >
                  Скопировать ссылку
                </button>
              )}
              {step === 'selecting' && (
                <button
                  className="inline-flex h-7 items-center justify-center rounded-full bg-[#5e6ad2] px-3.5 text-[12px] font-medium text-white shadow-[0_1px_1px_rgba(0,0,0,0.04),0_3px_6px_-2px_rgba(0,0,0,0.02)] transition-colors duration-150 hover:bg-[#6875e5] active:duration-0 disabled:opacity-50 cursor-default select-none w-full sm:w-auto"
                  type="button"
                  disabled={selectedIds.size === 0}
                  onClick={importSelected}
                >
                  Добавить кабинеты
                </button>
              )}
              {step === 'done' && (
                <Dialog.Close asChild>
                  <button
                    className="inline-flex h-7 items-center justify-center rounded-full bg-[#5e6ad2] px-3.5 text-[12px] font-medium text-white shadow-[0_1px_1px_rgba(0,0,0,0.04),0_3px_6px_-2px_rgba(0,0,0,0.02)] transition-colors duration-150 hover:bg-[#6875e5] active:duration-0 cursor-default select-none w-full sm:w-auto"
                    type="button"
                  >
                    Готово
                  </button>
                </Dialog.Close>
              )}
              {isBusy && <span className="text-[12px] text-[var(--text-tertiary)]" aria-live="polite">Подождите…</span>}
            </footer>
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
