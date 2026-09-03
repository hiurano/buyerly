import React, { FormEvent, useMemo, useState } from 'react';
import { apiRequest } from '@/lib/api';
import type { OnboardingStatus, SessionUser, Workspace } from '@/lib/types';
import { AuthFrame, BuyerlyBrand } from '@/components/auth/AuthFrame';

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
    <AuthFrame>
      <section className="buyerly-auth-card">
        <BuyerlyBrand />
        {step === 'profile' ? (
          <form onSubmit={submitProfile} noValidate>
            <h1>Set up your profile</h1>
            <p className="buyerly-auth-copy">Choose how you’ll appear in Buyerly.</p>
            <label className="buyerly-auth-field buyerly-auth-field--labeled">
              <span>Name</span>
              <input
                className="ui-input"
                type="text"
                autoComplete="name"
                autoFocus
                placeholder="Enter your name…"
                value={name}
                onChange={(event) => setName(event.target.value)}
                aria-invalid={Boolean(error)}
              />
            </label>
            {error && <p className="buyerly-auth-error" role="alert">{error}</p>}
            <button className="buyerly-auth-button ui-button ui-button-primary" type="submit" disabled={busy} aria-busy={busy}>
              {busy ? 'Saving…' : 'Continue'}
            </button>
          </form>
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void finishInvites(false);
            }}
            noValidate
          >
            <h1>Invite teammates</h1>
            <p className="buyerly-auth-copy">Bring your team into {workspace.name}.</p>
            <label className="buyerly-auth-field buyerly-auth-field--labeled">
              <span>Invitation email addresses</span>
              <textarea
                className="ui-input w-full"
                autoFocus
                rows={4}
                placeholder="email@company.com, teammate@company.com"
                value={emails}
                onChange={(event) => setEmails(event.target.value)}
                aria-invalid={Boolean(error)}
              />
            </label>
            <button className="buyerly-auth-text-button" type="button" onClick={copyInviteLink}>
              {copied ? 'Copied invite link' : 'Copy invite link'}
            </button>
            {error && <p className="buyerly-auth-error" role="alert">{error}</p>}
            <button
              className="buyerly-auth-button ui-button ui-button-primary"
              type="submit"
              disabled={busy || parsedEmails.length === 0}
              aria-busy={busy}
            >
              {busy ? 'Sending…' : 'Send invitations'}
            </button>
            <button className="buyerly-auth-text-button" type="button" onClick={() => finishInvites(true)} disabled={busy}>
              Skip for now
            </button>
          </form>
        )}
      </section>
    </AuthFrame>
  );
};
