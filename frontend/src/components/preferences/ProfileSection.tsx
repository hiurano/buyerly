import React, { useEffect, useRef, useState } from 'react';
import { apiRequest } from '@/lib/api';
import type { SessionUser, Workspace } from '@/lib/types';
import { Input } from '@/ui/Input';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/ui/DropdownMenu';
import { Tooltip } from '@/ui/Tooltip';
import { toast } from '@/ui/toast';
import { LinearCloseIcon, LinearPencilIcon, LinearPlusIcon } from '@/icons/LinearIcons';
import { ChangeEmailDialog } from './ChangeEmailDialog';
import { LeaveWorkspaceDialog } from './MemberDialogs';

interface ProfileSectionProps {
  user: SessionUser;
  workspace: Workspace;
  onUserChanged: () => void | Promise<unknown>;
}

// Linear takes SVG as well; our uploads accept raster images only.
const AVATAR_ACCEPT = 'image/png,.png,image/jpeg,.jpg,.jpeg,image/webp,.webp';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Could not save your changes. Please try again.';
}

/** Linear reports a refused profile change as "Unable to update profile" with the reason under it. */
function showSaveError(error: unknown) {
  toast.error('Unable to update profile', errorMessage(error));
}

function initials(user: SessionUser): string {
  const source = (user.full_name || user.username || '').trim();
  if (!source) return '?';
  const parts = source.split(/\s+/).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() || '').join('') || '?';
}

interface ProfileFieldRowProps {
  label: string;
  description?: string;
  placeholder: string;
  maxLength: number;
  value: string;
  /** Rejects to keep what was typed in the field, as Linear does. */
  onSave: (next: string) => Promise<void>;
  /** Checked before saving; returns the message for a toast, or null. */
  validate?: (next: string) => string | null;
}

/**
 * One text field of Linear's Profile: saved when it loses focus or on Enter,
 * with no confirmation on success. A refused value stays in the field next to
 * the error toast; Escape puts the saved value back.
 */
const ProfileFieldRow: React.FC<ProfileFieldRowProps> = ({
  label,
  description,
  placeholder,
  maxLength,
  value,
  onSave,
  validate,
}) => {
  const [draft, setDraft] = useState(value);
  const savedRef = useRef(value);
  // Escape blurs the field too; that blur must not save what was just dropped.
  const skipSaveRef = useRef(false);

  useEffect(() => {
    savedRef.current = value;
    setDraft(value);
  }, [value]);

  const save = async () => {
    if (skipSaveRef.current) {
      skipSaveRef.current = false;
      return;
    }
    const next = draft.trim();
    if (next === savedRef.current.trim()) return;
    const problem = validate?.(next);
    if (problem) {
      toast.error(problem);
      return;
    }
    try {
      await onSave(next);
      savedRef.current = next;
    } catch (error) {
      showSaveError(error);
    }
  };

  return (
    <div className="preferences-row-item preferences-row-item--column-on-mobile">
      <div className="preferences-row-copy">
        <span className="preferences-row-title">{label}</span>
        {description && <span className="preferences-row-desc">{description}</span>}
      </div>
      <Input
        className="preferences-row-input preferences-profile-input"
        aria-label={label}
        placeholder={placeholder}
        value={draft}
        maxLength={maxLength}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => void save()}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
          if (event.key === 'Escape') {
            skipSaveRef.current = true;
            setDraft(savedRef.current);
            event.currentTarget.blur();
          }
        }}
      />
    </div>
  );
};

/**
 * Linear's profile picture: a 32px circle that darkens under the pointer.
 * Without a photo a click picks a file ("Upload an avatar", a plus); with one
 * it opens a menu of Change avatar and Remove avatar. Removing takes effect at
 * once, without a confirmation or a toast.
 */
const ProfileAvatar: React.FC<{ user: SessionUser; onUserChanged: () => void | Promise<unknown> }> = ({
  user,
  onUserChanged,
}) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const hasPhoto = Boolean(user.avatar_url);

  const upload = async (file: File) => {
    const body = new FormData();
    body.append('file', file);
    setBusy(true);
    try {
      await apiRequest('/api/onboarding/avatar', { method: 'POST', body });
      await onUserChanged();
    } catch (error) {
      showSaveError(error);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await apiRequest('/api/onboarding/avatar', { method: 'DELETE' });
      await onUserChanged();
    } catch (error) {
      showSaveError(error);
    } finally {
      setBusy(false);
    }
  };

  const face = (
    <>
      {hasPhoto ? (
        <img src={user.avatar_url} alt={`Avatar of ${user.full_name || user.username}`} className="preferences-avatar-image" />
      ) : (
        <span className="preferences-avatar-initials">{initials(user)}</span>
      )}
      <span className="preferences-avatar-overlay" aria-hidden="true">
        {hasPhoto ? <LinearPencilIcon size={16} /> : <LinearPlusIcon size={16} />}
      </span>
    </>
  );

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept={AVATAR_ACCEPT}
        aria-label="Profile photo"
        tabIndex={-1}
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) void upload(file);
        }}
      />
      {hasPhoto ? (
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="preferences-avatar preferences-avatar--button"
              aria-label="Change avatar"
              disabled={busy}
            >
              {face}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" style={{ width: '174px' }}>
            <DropdownMenuItem onSelect={() => fileRef.current?.click()}>
              <span className="flex items-center gap-2.5">
                <LinearPencilIcon size={16} className="text-[var(--text-tertiary)]" />
                Change avatar
              </span>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void remove()}>
              <span className="flex items-center gap-2.5">
                <LinearCloseIcon size={16} className="text-[var(--text-tertiary)]" />
                Remove avatar
              </span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <Tooltip content="Upload an avatar">
          <button
            type="button"
            className="preferences-avatar preferences-avatar--button"
            aria-label="Upload profile photo"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
          >
            {face}
          </button>
        </Tooltip>
      )}
    </>
  );
};

export const ProfileSection: React.FC<ProfileSectionProps> = ({ user, workspace, onUserChanged }) => {
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [cannotLeave, setCannotLeave] = useState(false);
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);

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

  const saveField = (field: 'full_name' | 'title' | 'username') => async (next: string) => {
    await apiRequest('/api/auth/update-profile', {
      method: 'POST',
      body: JSON.stringify({ [field]: next }),
    });
    await onUserChanged();
  };

  return (
    <>
      <div className="preferences-title-container">
        <h1 className="preferences-page-title">Profile</h1>
      </div>

      <div className="preferences-section">
        <section className="preferences-card-container preferences-card-container--divided">
          <div className="preferences-row-item preferences-row-item--column-on-mobile">
            <div className="preferences-row-copy">
              <span className="preferences-row-title">Profile picture</span>
            </div>
            <ProfileAvatar user={user} onUserChanged={onUserChanged} />
          </div>

          <div className="preferences-row-item preferences-row-item--column-on-mobile">
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

          <ProfileFieldRow
            label="Full name"
            placeholder="Full name"
            maxLength={120}
            value={user.full_name || ''}
            validate={(next) => (next ? null : 'Your full name cannot be empty.')}
            onSave={saveField('full_name')}
          />

          <ProfileFieldRow
            label="Title"
            description="Your job title or role"
            placeholder="Software engineer"
            maxLength={128}
            value={user.title || ''}
            onSave={saveField('title')}
          />

          <ProfileFieldRow
            label="Username"
            description="One word, like a nickname or first name"
            placeholder="username"
            maxLength={40}
            value={user.username || ''}
            onSave={saveField('username')}
          />
        </section>
      </div>

      {/*
        Linear ends Profile with Workspace access: one 64px row, "Remove yourself
        from workspace" and a borderless 13px Leave workspace button. While you are
        the only one who could run the workspace, Linear dims the copy to 0.5 and
        the button to 0.6, turns it off and explains why in a tooltip; here that
        is an owner with nobody to hand the workspace to.
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
            <Tooltip content="Workspace requires at least one owner" disabled={!cannotLeave}>
              <span className="inline-flex">
                <button
                  type="button"
                  className="preferences-row-ghost-button"
                  disabled={cannotLeave}
                  onClick={() => setLeaveOpen(true)}
                >
                  Leave workspace
                </button>
              </span>
            </Tooltip>
          </div>
        </section>
      </div>

      <ChangeEmailDialog
        open={emailDialogOpen}
        currentEmail={user.email}
        onOpenChange={setEmailDialogOpen}
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
