import React, { FormEvent, useMemo, useState } from 'react';
import { apiRequest } from '@/lib/api';
import type { OnboardingStatus, SessionUser, Workspace } from '@/lib/types';
import { BuyerlyBrand } from '@/components/auth/AuthFrame';

interface WelcomeViewProps {
  user: SessionUser;
  workspace: Workspace;
  onUserChanged: (user: SessionUser) => void;
  onCompleted: () => void;
}

interface CreatedInvite {
  invite_url: string;
}

export const WelcomeView: React.FC<WelcomeViewProps> = ({
  user,
  workspace,
  onUserChanged,
  onCompleted,
}) => {
  const initialStep = user.onboarding_step === 'invites' ? 'invites' : 'profile';
  const [step, setStep] = useState<'profile' | 'invites'>(initialStep);
  const [name, setName] = useState(user.full_name || '');
  const [emails, setEmails] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const parsedEmails = useMemo(
    () => emails.split(/[\s,;]+/).map((email) => email.trim().toLowerCase()).filter(Boolean),
    [emails],
  );

  const submitProfile = async (event: FormEvent) => {
    event.preventDefault();
    const cleanName = name.trim().replace(/\s+/g, ' ');
    if (!cleanName) {
      setError('Enter your name');
      return;
    }
    const [firstName, ...rest] = cleanName.split(' ');
    setBusy(true);
    setError('');
    try {
      const result = await apiRequest<OnboardingStatus>('/api/onboarding/personal-details', {
        method: 'POST',
        body: JSON.stringify({ first_name: firstName, last_name: rest.join(' ') }),
      });
      onUserChanged(result.user);
      if (result.onboarding_step === 'invites') {
        setStep('invites');
      } else {
        onCompleted();
      }
    } catch (profileError) {
      setError(profileError instanceof Error ? profileError.message : 'Could not save your profile');
    } finally {
      setBusy(false);
    }
  };

  const finishInvites = async (skip: boolean) => {
    setBusy(true);
    setError('');
    try {
      if (skip) {
        await apiRequest('/api/onboarding/skip', { method: 'POST', body: JSON.stringify({}) });
      } else {
        await apiRequest('/api/onboarding/invites', {
          method: 'POST',
          body: JSON.stringify({
            invites: parsedEmails.map((email) => ({ email, role: 'buyer' })),
          }),
        });
      }
      onCompleted();
    } catch (inviteError) {
      setError(inviteError instanceof Error ? inviteError.message : 'Could not finish onboarding');
    } finally {
      setBusy(false);
    }
  };

  const copyInviteLink = async () => {
    setError('');
    try {
      const invite = await apiRequest<CreatedInvite>(`/api/workspaces/${workspace.id}/invites`, {
        method: 'POST',
        body: JSON.stringify({ role: 'buyer', max_uses: 0, expires_in_days: 7 }),
      });
      await navigator.clipboard.writeText(new URL(invite.invite_url, window.location.origin).toString());
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch (copyError) {
      setError(copyError instanceof Error ? copyError.message : 'Could not copy an invitation link');
    }
  };

  return (
    <main className="buyerly-welcome">
      <section className="buyerly-welcome__form-panel">
        <div className="buyerly-welcome__content">
          <BuyerlyBrand compact />
          {step === 'profile' ? (
            <form onSubmit={submitProfile}>
              <h1>Set up your profile</h1>
              <p>Choose how you’ll appear in Buyerly.</p>
              <label className="buyerly-welcome-field">
                <span>Name</span>
                <input
                  type="text"
                  autoComplete="name"
                  autoFocus
                  placeholder="Enter your name…"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </label>
              {error && <p className="buyerly-welcome-error" role="alert">{error}</p>}
              <div className="buyerly-welcome-actions">
                <button className="buyerly-welcome-primary" type="submit" disabled={busy}>
                  {busy ? 'Saving…' : 'Continue'}
                </button>
              </div>
            </form>
          ) : (
            <div>
              <h1>Invite teammates</h1>
              <p>Bring your team into {workspace.name}.</p>
              <div className="buyerly-welcome-invite-label">
                <span>Invitations</span>
                <button type="button" onClick={copyInviteLink}>{copied ? 'Copied' : 'Copy invite link'}</button>
              </div>
              <textarea
                autoFocus
                aria-label="Invitation email addresses"
                placeholder="email@company.com, teammate@company.com"
                value={emails}
                onChange={(event) => setEmails(event.target.value)}
              />
              {error && <p className="buyerly-welcome-error" role="alert">{error}</p>}
              <div className="buyerly-welcome-actions">
                <button type="button" className="buyerly-welcome-skip" onClick={() => finishInvites(true)} disabled={busy}>
                  Skip
                </button>
                <button
                  type="button"
                  className="buyerly-welcome-primary"
                  onClick={() => finishInvites(false)}
                  disabled={busy || parsedEmails.length === 0}
                >
                  {busy ? 'Sending…' : 'Send invitations'}
                </button>
              </div>
            </div>
          )}
        </div>
        <div className="buyerly-welcome-progress" aria-label={`Step ${step === 'profile' ? 1 : 2} of 2`}>
          <span data-active="true" />
          <span data-active={step === 'invites' ? 'true' : 'false'} />
        </div>
      </section>
      <aside className="buyerly-welcome__visual" aria-hidden="true">
        <div className="buyerly-welcome__glow" />
        <div className="buyerly-welcome__wordmark">
          <img src="/buyerly-logo.png" alt="" />
          <span>Buyerly</span>
        </div>
        <div className="buyerly-welcome__preview">
          <span>Campaign performance</span>
          <strong>+24.8%</strong>
          <i />
          <i />
          <i />
        </div>
      </aside>
    </main>
  );
};
