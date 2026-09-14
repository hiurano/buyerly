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
      .catch((requestError: unknown) => { if (active) setError(requestError instanceof Error ? requestError.message : 'This link is unavailable.'); });
    return () => { active = false; };
  }, [token]);

  return (
    <AuthFrame>
      <section className="buyerly-auth-card buyerly-invite-card">
        <BuyerlyBrand />
        {!invite && !error && <span className="buyerly-auth-spinner" aria-label="Checking link" />}
        {(error || (invite && !invite.valid)) && <><h1>Link unavailable</h1><p className="buyerly-auth-copy">{error || 'This link has already been used, revoked, or has expired.'}</p></>}
        {invite?.valid && <>
          <h1>Connect Facebook</h1>
          <p className="buyerly-auth-copy">You are connecting a Facebook profile to the “{invite.workspace_name}” workspace.</p>
          <a className="buyerly-auth-button buyerly-auth-link-button" href={`/api/meta/oauth/invite/${encodeURIComponent(token)}`}>Continue with Facebook</a>
        </>}
      </section>
    </AuthFrame>
  );
};

export const MetaConnectSuccessView: React.FC = () => (
  <AuthFrame>
    <section className="buyerly-auth-card buyerly-invite-card">
      <BuyerlyBrand />
      <h1>Facebook connected</h1>
      <p className="buyerly-auth-copy">You can close this page. The workspace owner can now choose the available ad accounts in Buyerly.</p>
    </section>
  </AuthFrame>
);
