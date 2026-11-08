import React, { FormEvent, useEffect, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { ApiError } from '@/lib/api';
import { graphql } from '@/lib/graphql';
import type { SessionUser, Workspace } from '@/lib/types';
import { AuthFrame, BuyerlyBrand, authStyles } from '@/components/auth/AuthFrame';
import { withClassName } from '@/ui/withClassName';

const styles = stylex.create({
  root: {
    display: 'flex',
    width: 'min(100%, 360px)',
    minHeight: 'min(620px, calc(100dvh - 64px))',
    flexDirection: 'column',
    textAlign: 'center',
  },
  brand: {
    marginTop: 10,
  },
  heading: {
    marginBottom: 8,
    fontSize: 18,
  },
  form: {
    marginTop: 12,
    textAlign: 'left',
  },
  account: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    marginTop: 'auto',
    color: 'var(--auth-text-muted)',
    fontSize: 12,
  },
  accountButton: {
    borderWidth: 0,
    borderStyle: 'none',
    borderColor: 'currentColor',
    backgroundColor: 'transparent',
    backgroundPosition: '0px 0px',
    color: {
      default: 'var(--auth-text-muted)',
      ':hover': 'var(--auth-text)',
    },
    cursor: 'pointer',
  },
});

interface CreateWorkspaceViewProps {
  user: SessionUser;
  onCreated: (workspace: Workspace) => void;
  /** First workspace: offers another email instead. */
  onSignedOut?: () => void | Promise<void>;
  /** Another workspace for a member, opened from the workspace menu as in Linear. */
  onBack?: () => void;
}

export const CreateWorkspaceView: React.FC<CreateWorkspaceViewProps> = ({
  user,
  onCreated,
  onSignedOut,
  onBack,
}) => {
  const [name, setName] = useState('');
  const [availability, setAvailability] = useState<'idle' | 'checking' | 'available' | 'unavailable'>('idle');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const cleanName = name.trim();
    if (cleanName.length < 2) {
      setAvailability('idle');
      setMessage('');
      return;
    }
    setAvailability('checking');
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      graphql<{ available: boolean; message: string }>(
        'query WorkspaceSlugCheck($slug: String!) { workspaceSlugCheck(slug: $slug) }',
        { slug: cleanName },
        { signal: controller.signal },
      )
        .then((result) => {
          setAvailability(result.available ? 'available' : 'unavailable');
          setMessage(result.available ? '' : "This workspace name isn't available. Try another one.");
        })
        .catch((checkError) => {
          if (controller.signal.aborted) return;
          setAvailability('unavailable');
          setMessage(checkError instanceof Error ? checkError.message : 'Could not check this name');
        });
    }, 350);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [name]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (availability !== 'available') return;
    setBusy(true);
    setMessage('');
    // Another workspace, or the first one, which also moves onboarding on.
    const field = onBack ? 'workspaceCreate' : 'onboardingWorkspaceCreate';
    const entity = onBack ? 'workspace' : 'onboarding';
    try {
      const created = await graphql<Record<string, Workspace>>(
        `mutation ${field[0].toUpperCase()}${field.slice(1)}($input: JSON!) { ${field}(input: $input) { success lastSyncId ${entity} } }`,
        { input: { name: name.trim() } },
      );
      const workspace = created[entity];
      onCreated(workspace);
    } catch (createError) {
      setAvailability('unavailable');
      setMessage(
        createError instanceof ApiError && createError.status === 409
          ? "This workspace name is already taken. Try another one."
          : createError instanceof Error
            ? createError.message
            : 'Could not create this workspace',
      );
    }
    setBusy(false);
  };

  return (
    <AuthFrame>
      {onBack && (
        <>
          <button {...stylex.props(authStyles.back)} type="button" onClick={onBack}>
            ‹ Back to Buyerly
          </button>
          <p {...stylex.props(authStyles.corner)}>
            Logged in as
            <strong {...stylex.props(authStyles.cornerStrong)}>{user.email || user.username}</strong>
          </p>
        </>
      )}
      <section {...stylex.props(styles.root)}>
        <BuyerlyBrand style={styles.brand} />
        <h1 {...stylex.props(authStyles.heading, styles.heading)}>Create a workspace</h1>
        <p {...stylex.props(authStyles.copy)}>Move work forward across your media buying&nbsp;team.</p>
        <form {...stylex.props(styles.form)} onSubmit={submit} noValidate>
          <label {...withClassName(stylex.props(authStyles.field), 'buyerly-auth-field')}>
            <span {...stylex.props(authStyles.fieldLabel)}>Name</span>
            <input
              {...stylex.props(authStyles.input, availability === 'unavailable' && authStyles.inputInvalid)}
              type="text"
              autoComplete="organization"
              autoFocus
              maxLength={60}
              placeholder="Workspace name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              aria-invalid={availability === 'unavailable'}
            />
          </label>
          {availability === 'checking' && <p {...stylex.props(authStyles.hint)}>Checking availability…</p>}
          {availability === 'unavailable' && <p {...stylex.props(authStyles.error)} role="alert">{message}</p>}
          <button
            {...stylex.props(authStyles.button, availability !== 'checking' && authStyles.buttonAfterField)}
            type="submit"
            disabled={busy || availability !== 'available'}
          >
            {busy ? 'Creating…' : 'Create workspace'}
          </button>
        </form>
        {onSignedOut && (
          <footer {...stylex.props(styles.account)}>
            <span>Using {user.email}</span>
            <button {...stylex.props(styles.accountButton)} type="button" onClick={onSignedOut}>Use a different email</button>
          </footer>
        )}
      </section>
    </AuthFrame>
  );
};
