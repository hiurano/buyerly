import React from 'react';
import * as stylex from '@stylexjs/stylex';
import { withClassName } from '@/ui/withClassName';
import { AuthFrame, BuyerlyBrand, authStyles } from './AuthFrame';

interface NotFoundViewProps {
  homePath: string;
}

export const NotFoundView: React.FC<NotFoundViewProps> = ({ homePath }) => (
  <AuthFrame>
    <section {...withClassName(stylex.props(authStyles.card), 'buyerly-auth-card')}>
      <BuyerlyBrand />
      <h1 {...stylex.props(authStyles.heading)}>Page not found</h1>
      <p {...stylex.props(authStyles.copy)}>This address doesn’t exist in Buyerly.</p>
      <a {...stylex.props(authStyles.button, authStyles.linkButton)} href={homePath}>
        Go to Buyerly
      </a>
    </section>
  </AuthFrame>
);
