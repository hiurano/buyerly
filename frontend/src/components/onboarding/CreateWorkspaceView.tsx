import React, { FormEvent, useEffect, useState } from 'react';
import { ApiError, apiRequest } from '@/lib/api';
import type { SessionUser, Workspace } from '@/lib/types';
import { AuthFrame, BuyerlyBrand } from '@/components/auth/AuthFrame';

interface CreateWorkspaceViewProps {
  user: SessionUser;
  onCreated: (workspace: Workspace) => void;
  onSignedOut: () => void | Promise<void>;
}

export const CreateWorkspaceView: React.FC<CreateWorkspaceViewProps> = ({
  user,
  onCreated,
  onSignedOut,
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
      apiRequest<{ available: boolean; message: string }>(
        `/api/onboarding/check-slug?slug=${encodeURIComponent(cleanName)}`,
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
    try {
      const workspace = await apiRequest<Workspace>('/api/onboarding/workspace', {
        method: 'POST',
        body: JSON.stringify({ name: name.trim() }),
      });
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
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthFrame>
      <section className="buyerly-workspace-create">
        <BuyerlyBrand />
        <h1>Create a workspace</h1>
        <p className="buyerly-auth-copy">Move work forward across your media buying team.</p>
        <form onSubmit={submit} noValidate>
          <label className="buyerly-auth-field buyerly-auth-field--labeled">
            <span>Name</span>
            <input
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
          {availability === 'checking' && <p className="buyerly-auth-hint">Checking availability…</p>}
          {availability === 'unavailable' && <p className="buyerly-auth-error" role="alert">{message}</p>}
          <button
            className="buyerly-auth-button"
            type="submit"
            disabled={busy || availability !== 'available'}
          >
            {busy ? 'Creating…' : 'Create workspace'}
          </button>
        </form>
        <footer className="buyerly-workspace-create__account">
          <span>Using {user.email}</span>
          <button type="button" onClick={onSignedOut}>Use a different email</button>
        </footer>
      </section>
    </AuthFrame>
  );
};
