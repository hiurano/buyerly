import React, { useEffect, useState } from 'react';
import { apiRequest } from '@/lib/api';
import type { PublicMetaInviteInfo } from '@/lib/types';
import { AuthFrame, BuyerlyBrand } from './AuthFrame';

export const MetaConnectInviteView: React.FC<{ token: string }> = ({ token }) => {
  const [invite, setInvite] = useState<PublicMetaInviteInfo | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    apiRequest<PublicMetaInviteInfo>(`/api/meta/invites/public/${encodeURIComponent(token)}`)
      .then((result) => { if (active) setInvite(result); })
      .catch((requestError: unknown) => { if (active) setError(requestError instanceof Error ? requestError.message : 'Ссылка недоступна.'); });
    return () => { active = false; };
  }, [token]);

  return (
    <AuthFrame>
      <section className="buyerly-auth-card buyerly-invite-card">
        <BuyerlyBrand />
        {!invite && !error && <span className="buyerly-auth-spinner" aria-label="Проверяем ссылку" />}
        {(error || (invite && !invite.valid)) && <><h1>Ссылка недоступна</h1><p className="buyerly-auth-copy">{error || 'Эта ссылка уже использована, отозвана или истекла.'}</p></>}
        {invite?.valid && <>
          <h1>Подключить Facebook</h1>
          <p className="buyerly-auth-copy">Вы подключаете Facebook-профиль к workspace «{invite.workspace_name}».</p>
          <a className="buyerly-auth-button buyerly-auth-link-button" href={`/api/meta/oauth/invite/${encodeURIComponent(token)}`}>Продолжить с Facebook</a>
        </>}
      </section>
    </AuthFrame>
  );
};

export const MetaConnectSuccessView: React.FC = () => (
  <AuthFrame>
    <section className="buyerly-auth-card buyerly-invite-card">
      <BuyerlyBrand />
      <h1>Facebook подключён</h1>
      <p className="buyerly-auth-copy">Можно закрыть эту страницу. Владелец workspace сможет выбрать доступные рекламные кабинеты в Buyerly.</p>
    </section>
  </AuthFrame>
);
