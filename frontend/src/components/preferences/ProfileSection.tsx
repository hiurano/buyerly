import React, { useEffect, useState } from 'react';
import { apiRequest } from '@/lib/api';
import type { SessionUser } from '@/lib/types';
import { Input } from '@/ui/Input';
import { LinearPencilIcon } from '@/icons/LinearIcons';
import { ChangeEmailDialog } from './ChangeEmailDialog';

interface ProfileSectionProps {
  user: SessionUser;
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

export const ProfileSection: React.FC<ProfileSectionProps> = ({ user, onUserChanged }) => {
  const [fullName, setFullName] = useState(user.full_name || '');
  const [savingName, setSavingName] = useState(false);
  const [error, setError] = useState('');
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);

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

          <div className="preferences-row-item">
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

        </section>

        {error && (
          <p role="alert" className="preferences-row-error">
            {error}
          </p>
        )}
      </div>

      <ChangeEmailDialog
        open={emailDialogOpen}
        currentEmail={user.email}
        onOpenChange={setEmailDialogOpen}
        onChanged={onUserChanged}
      />
    </>
  );
};
