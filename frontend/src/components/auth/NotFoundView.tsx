import React from 'react';
import { AuthFrame, BuyerlyBrand } from './AuthFrame';

interface NotFoundViewProps {
  homePath: string;
}

export const NotFoundView: React.FC<NotFoundViewProps> = ({ homePath }) => (
  <AuthFrame>
    <section className="buyerly-auth-card">
      <BuyerlyBrand />
      <h1>Page not found</h1>
      <p className="buyerly-auth-copy">This address doesn’t exist in Buyerly.</p>
      <a className="buyerly-auth-button buyerly-auth-link-button" href={homePath}>
        Go to Buyerly
      </a>
    </section>
  </AuthFrame>
);
