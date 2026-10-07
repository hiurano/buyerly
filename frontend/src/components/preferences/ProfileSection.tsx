import React, { useEffect, useState } from 'react';
import { apiRequest } from '@/lib/api';
import type { SessionUser, Workspace } from '@/lib/types';
import { Input } from '@/ui/Input';
import { LinearPencilIcon } from '@/icons/LinearIcons';
import { ChangeEmailDialog } from './ChangeEmailDialog';
import { ChangePasswordDialog } from './ChangePasswordDialog';
import { LeaveWorkspaceDialog } from './MemberDialogs';

interface ProfileSectionProps {
  user: SessionUser;
  workspace: Workspace;
  onUserChanged: () => void | Promise<unknown>;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Could not save your changes. Please try again.';
}

function initials(user: SessionUser): string {
  const source = (user.full_name || user.username || '').trim();
  if (!source) return '?';
  const parts = source.split(/\s+/).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() || '').join('') || '?';
}

export const ProfileSection: React.FC<ProfileSectionProps> = ({ user, workspace, onUserChanged }) => {
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [cannotLeave, setCannotLeave] = useState(false);

  // An owner can leave only by handing the workspace to another member.
  useEffect(() => {
    setCannotLeave(false);
    if (workspace.role !== 'owner') return undefined;
    let cancelled = false;
    apiRequest<{ is_current_user: boolean }[]>(`/api/workspaces/${workspace.id}/members`)
      .then((members) => {
        if (!cancelled) setCannotLeave(!members.some((member) => !member.is_current_user));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [workspace.id, workspace.role]);
  const [fullName, setFullName] = useState(user.full_name || '');
  const [savingName, setSavingName] = useState(false);
  const [error, setError] = useState('');
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const hasPassword = Boolean(user.has_password);

  useEffect(() => {
    setFullName(user.full_name || '');
  }, [user.full_name]);

  const saveFullName = async () => {
    const nextName = fullName.trim();
    if (nextName === (user.full_name || '').trim()) return;
    if (!nextName) {
      setFullName(user.full_name || '');
      return;
    }
    setSavingName(true);
    setError('');
    try {
      await apiRequest('/api/auth/update-profile', {
        method: 'POST',
        body: JSON.stringify({ full_name: nextName }),
      });
      await onUserChanged();
    } catch (saveError) {
      setError(errorMessage(saveError));
      setFullName(user.full_name || '');
    } finally {
      setSavingName(false);
    }
  };

  return (
    <>
      <div className="preferences-title-container">
        <h1 className="preferences-page-title">Profile</h1>
      </div>

      <div className="preferences-section">
        <section className="preferences-card-container preferences-card-container--divided">
          <div className="preferences-row-item">
            <div className="preferences-row-copy">
              <span className="preferences-row-title">Profile picture</span>
            </div>
            <div className="preferences-avatar" aria-label="Profile picture">
              {user.avatar_url ? (
                <img src={user.avatar_url} alt="" className="preferences-avatar-image" />
              ) : (
                <span className="preferences-avatar-initials">{initials(user)}</span>
              )}
            </div>
          </div>

          <div className="preferences-row-item">
            <div className="preferences-row-copy">
              <span className="preferences-row-title">Email</span>
              {user.unconfirmed_email && (
                <span className="preferences-row-desc">
                  Pending confirmation: {user.unconfirmed_email}
                </span>
              )}
            </div>
            <div className="preferences-row-control">
              <span className="preferences-row-value">{user.email || 'Not set'}</span>
              <button
                type="button"
                className="preferences-row-edit-button"
                aria-label="Change email"
                onClick={() => setEmailDialogOpen(true)}
              >
                <LinearPencilIcon size={13} />
              </button>
            </div>
          </div>

          <div className="preferences-row-item preferences-row-item--column-on-mobile">
            <div className="preferences-row-copy">
              <span className="preferences-row-title">Full name</span>
            </div>
            <Input
              className="preferences-row-input"
              aria-label="Full name"
              value={fullName}
              disabled={savingName}
              maxLength={120}
              onChange={(event) => setFullName(event.target.value)}
              onBlur={saveFullName}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur();
                if (event.key === 'Escape') setFullName(user.full_name || '');
              }}
            />
          </div>

          <div className="preferences-row-item">
            <div className="preferences-row-copy">
              <span className="preferences-row-title">Password</span>
              <span className="preferences-row-desc">
                {hasPassword
                  ? `Log in with ${user.email || user.username} and your password, or with a code from your email.`
                  : 'You log in with a code from your email. Set a password to also log in with it.'}
              </span>
            </div>
            <div className="preferences-row-control">
              <button
                type="button"
                className="preferences-row-edit-button"
                aria-label={hasPassword ? 'Change password' : 'Set password'}
                onClick={() => setPasswordDialogOpen(true)}
              >
                <LinearPencilIcon size={13} />
              </button>
            </div>
          </div>

        </section>

        {error && (
          <p role="alert" className="preferences-row-error">
            {error}
          </p>
        )}
      </div>

      {/*
        Linear ends Profile with Workspace access: one 64px row, "Remove yourself
        from workspace" and a borderless 13px Leave workspace button. While you are
        the only one who could run the workspace, Linear dims the copy to 0.5 and
        the button to 0.6 and turns it off; here that is an owner with nobody to
        hand the workspace to.
      */}
      <div className="preferences-section">
        <div className="preferences-section-header">
          <h3 className="preferences-section-title">Workspace access</h3>
        </div>
        <section className="preferences-card-container">
          <div className={`preferences-row-item preferences-row-item--single${cannotLeave ? ' preferences-row-item--disabled' : ''}`}>
            <div className="preferences-row-copy">
              <span className="preferences-row-title">Remove yourself from workspace</span>
            </div>
            <button
              type="button"
              className="preferences-row-ghost-button"
              disabled={cannotLeave}
              onClick={() => setLeaveOpen(true)}
            >
              Leave workspace
            </button>
          </div>
        </section>
      </div>

      <ChangeEmailDialog
        open={emailDialogOpen}
        currentEmail={user.email}
        onOpenChange={setEmailDialogOpen}
        onChanged={onUserChanged}
      />

      <ChangePasswordDialog
        open={passwordDialogOpen}
        hasPassword={hasPassword}
        onOpenChange={setPasswordDialogOpen}
        onChanged={onUserChanged}
      />

      <LeaveWorkspaceDialog
        open={leaveOpen}
        workspace={workspace}
        onClose={() => setLeaveOpen(false)}
        onLeft={onUserChanged}
      />
    </>
  );
};
