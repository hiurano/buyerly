import React, { useEffect, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { graphql } from '@/lib/graphql';
import type { PublicMetaInviteInfo } from '@/lib/types';
import { withClassName } from '@/ui/withClassName';
import { AuthFrame, AuthLoading, BuyerlyBrand, authStyles } from './AuthFrame';

const styles = stylex.create({
  card: {
    width: 'min(100%, 460px)',
    paddingTop: 32,
    paddingRight: 0,
    paddingBottom: 32,
    paddingLeft: 0,
    borderRadius: 10,
  },
  brand: {
    marginBottom: 0,
  },
});

export const MetaConnectInviteView: React.FC<{ token: string }> = ({ token }) => {
  const [invite, setInvite] = useState<PublicMetaInviteInfo | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    graphql<PublicMetaInviteInfo>('query MetaInviteDetails($token: String!) { metaInviteDetails(token: $token) }', { token })
      .then((result) => { if (active) setInvite(result); })
      .catch((requestError: unknown) => { if (active) setError(requestError instanceof Error ? requestError.message : 'This link is unavailable.'); });
    return () => { active = false; };
  }, [token]);

  if (!invite && !error) return <AuthLoading plain label="Checking link" />;
  return (
    <AuthFrame>
      <section {...withClassName(stylex.props(authStyles.card, styles.card), 'buyerly-auth-card buyerly-invite-card')}>
        <BuyerlyBrand style={styles.brand} />
        {(error || (invite && !invite.valid)) && (
          <>
            <h1 {...stylex.props(authStyles.heading)}>Link unavailable</h1>
            <p {...stylex.props(authStyles.copy)}>{error || 'This link has already been used, revoked, or has expired.'}</p>
          </>
        )}
        {invite?.valid && (
          <>
            <h1 {...stylex.props(authStyles.heading)}>Connect Facebook</h1>
            <p {...stylex.props(authStyles.copy)}>You are connecting a Facebook profile to the “{invite.workspace_name}” workspace.</p>
            <a {...stylex.props(authStyles.button, authStyles.linkButton)} href={`/api/meta/oauth/invite/${encodeURIComponent(token)}`}>Continue with Facebook</a>
          </>
        )}
      </section>
    </AuthFrame>
  );
};

export const MetaConnectSuccessView: React.FC = () => (
  <AuthFrame>
    <section {...withClassName(stylex.props(authStyles.card, styles.card), 'buyerly-auth-card buyerly-invite-card')}>
      <BuyerlyBrand style={styles.brand} />
      <h1 {...stylex.props(authStyles.heading)}>Facebook connected</h1>
      <p {...stylex.props(authStyles.copy)}>You can close this page. The workspace owner can now choose the available ad accounts in Buyerly.</p>
    </section>
  </AuthFrame>
);
