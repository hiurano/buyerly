import React, { FormEvent, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { graphql } from '@/lib/graphql';
import type { OnboardingStatus, SessionUser, Workspace } from '@/lib/types';
import { AuthFrame, BuyerlyBrand, authStyles } from '@/components/auth/AuthFrame';
import { withClassName } from '@/ui/withClassName';
import { InviteTeamStep } from './InviteTeamStep';

const styles = stylex.create({
  cardInvites: {
    width: 'min(100%, 400px)',
  },
});

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
      <section {...withClassName(stylex.props(authStyles.card, step === 'invites' && styles.cardInvites), 'buyerly-auth-card')}>
        <BuyerlyBrand />
        {step === 'profile' ? (
          <form onSubmit={submitProfile} noValidate>
            <h1 {...stylex.props(authStyles.heading, authStyles.formHeading)}>Set up your profile</h1>
            <p {...stylex.props(authStyles.copy)}>Choose how you’ll appear in Buyerly.</p>
            <label {...withClassName(stylex.props(authStyles.field), 'buyerly-auth-field')}>
              <span {...stylex.props(authStyles.fieldLabel)}>Name</span>
              <input
                {...stylex.props(authStyles.input, Boolean(error) && authStyles.inputInvalid)}
                type="text"
                autoComplete="name"
                autoFocus
                placeholder="Enter your name…"
                value={name}
                onChange={(event) => setName(event.target.value)}
                aria-invalid={Boolean(error)}
              />
            </label>
            {error && <p {...stylex.props(authStyles.error)} role="alert">{error}</p>}
            <button {...stylex.props(authStyles.button, authStyles.buttonAfterField)} type="submit" disabled={busy} aria-busy={busy}>
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
