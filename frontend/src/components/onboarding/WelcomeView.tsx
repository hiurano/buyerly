import React, { FormEvent, useState } from 'react';
import { graphql } from '@/lib/graphql';
import type { OnboardingStatus, SessionUser, Workspace } from '@/lib/types';
import { AuthFrame, BuyerlyBrand } from '@/components/auth/AuthFrame';
import { InviteTeamStep } from './InviteTeamStep';

interface WelcomeViewProps {
  user: SessionUser;
  workspace: Workspace;
  onUserChanged: (user: SessionUser) => void;
  onCompleted: () => void;
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

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
      const { onboarding: result } = await graphql<{ onboarding: OnboardingStatus }>(
        `mutation OnboardingPersonalDetailsUpdate($input: JSON!) {
          onboardingPersonalDetailsUpdate(input: $input) { success lastSyncId onboarding }
        }`,
        { input: { first_name: firstName, last_name: rest.join(' ') } },
      );
      onUserChanged(result.user);
      if (result.onboarding_step === 'invites') {
        setStep('invites');
      } else {
        onCompleted();
      }
    } catch (profileError) {
      setError(profileError instanceof Error ? profileError.message : 'Could not save your profile');
    }
    setBusy(false);
  };

  /** Sends the invites, or with null skips the step ("I'll do this later"). */
  const finishInvites = async (invites: Array<{ email: string; role: string }> | null) => {
    setBusy(true);
    setError('');
    try {
      if (invites === null) {
        await graphql('mutation OnboardingSkip { onboardingSkip { success lastSyncId } }');
      } else {
        await graphql(
          'mutation OnboardingInvitesSend($input: JSON!) { onboardingInvitesSend(input: $input) { success lastSyncId } }',
          { input: { invites } },
        );
      }
      onCompleted();
    } catch (inviteError) {
      setError(inviteError instanceof Error ? inviteError.message : 'Could not finish onboarding');
    }
    setBusy(false);
  };

  return (
    <AuthFrame>
      <section className={`buyerly-auth-card${step === 'invites' ? ' buyerly-auth-card--invites' : ''}`}>
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
          <InviteTeamStep
            workspace={workspace}
            busy={busy}
            error={error}
            onSend={(invites) => void finishInvites(invites)}
            onSkip={() => void finishInvites(null)}
          />
        )}
      </section>
    </AuthFrame>
  );
};
