import React, { useEffect, useRef, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { colors } from '@/styles/tokens.stylex';
import { graphql } from '@/lib/graphql';
import { uploadFile } from '@/lib/uploads';
import { fetchWorkspaceMembers } from '@/models/queries';
import type { SessionUser, Workspace } from '@/lib/types';
import { Input } from '@/ui/Input';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/ui/DropdownMenu';
import { Tooltip } from '@/ui/Tooltip';
import { toast } from '@/ui/toast';
import { BuyerlyIcon } from '@/icons/BuyerlyIcon';
import { withClassName } from '@/ui/withClassName';
import { ChangeEmailDialog } from './ChangeEmailDialog';
import { LeaveWorkspaceDialog } from './MemberDialogs';
import { preferencesStyles } from './preferencesStyles';
import css from './Preferences.module.css';

interface ProfileSectionProps {
  user: SessionUser;
  workspace: Workspace;
  onUserChanged: () => void | Promise<unknown>;
}

const styles = stylex.create({
  srOnly: {
    position: 'absolute',
    width: 1,
    height: 1,
    padding: 0,
    margin: -1,
    overflow: 'hidden',
    clip: 'rect(0, 0, 0, 0)',
    whiteSpace: 'nowrap',
    borderWidth: 0,
  },
  menuItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  menuIcon: {
    color: colors['--text-tertiary'],
  },
  tooltipTarget: {
    display: 'inline-flex',
  },
});

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
    <div {...withClassName(stylex.props(preferencesStyles.rowItem, preferencesStyles.rowItemColumnOnMobile), css.rowItem)}>
      <div {...stylex.props(preferencesStyles.rowCopy, preferencesStyles.rowCopyColumnOnMobile)}>
        <span {...withClassName(stylex.props(preferencesStyles.rowTitle), 'preferences-row-title')}>{label}</span>
        {description && <span {...stylex.props(preferencesStyles.rowDesc)}>{description}</span>}
      </div>
      <Input
        xstyle={[preferencesStyles.rowInput, preferencesStyles.profileInput, preferencesStyles.profileInputMobileFull]}
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

  const setAvatar = (avatarUrl: string) =>
    graphql('mutation UserUpdate($input: JSON!) { userUpdate(input: $input) { success lastSyncId } }', {
      input: { avatar_url: avatarUrl },
    });

  const upload = async (file: File) => {
    setBusy(true);
    try {
      await setAvatar(await uploadFile(file, 'avatar'));
      await onUserChanged();
    } catch (error) {
      showSaveError(error);
    }
    setBusy(false);
  };

  const remove = async () => {
    setBusy(true);
    try {
      await setAvatar('');
      await onUserChanged();
    } catch (error) {
      showSaveError(error);
    }
    setBusy(false);
  };

  const face = (
    <>
      {hasPhoto ? (
        <img src={user.avatar_url} alt={`Avatar of ${user.full_name || user.username}`} {...stylex.props(preferencesStyles.avatarImage)} />
      ) : (
        <span {...stylex.props(preferencesStyles.avatarInitials)}>{initials(user)}</span>
      )}
      <span {...withClassName(stylex.props(preferencesStyles.avatarOverlay), css.avatarOverlay)} aria-hidden="true">
        {hasPhoto ? <BuyerlyIcon name="edit" size={16} /> : <BuyerlyIcon name="add" size={16} />}
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
        {...stylex.props(styles.srOnly)}
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
              {...withClassName(stylex.props(preferencesStyles.avatar, preferencesStyles.avatarButton), css.avatarButton)}
              aria-label="Change avatar"
              disabled={busy}
            >
              {face}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" style={{ width: '174px' }}>
            <DropdownMenuItem onSelect={() => fileRef.current?.click()}>
              <span {...stylex.props(styles.menuItem)}>
                <BuyerlyIcon name="edit" size={16} {...stylex.props(styles.menuIcon)} />
                Change avatar
              </span>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void remove()}>
              <span {...stylex.props(styles.menuItem)}>
                <BuyerlyIcon name="close" size={16} {...stylex.props(styles.menuIcon)} />
                Remove avatar
              </span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <Tooltip content="Upload an avatar">
          <button
            type="button"
            {...withClassName(stylex.props(preferencesStyles.avatar, preferencesStyles.avatarButton), css.avatarButton)}
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
    fetchWorkspaceMembers(workspace.id)
      .then((members) => {
        if (!cancelled) setCannotLeave(!members.some((member) => !member.is_current_user));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [workspace.id, workspace.role]);

  const saveField = (field: 'full_name' | 'title' | 'username') => async (next: string) => {
    await graphql('mutation UserUpdate($input: JSON!) { userUpdate(input: $input) { success lastSyncId } }', {
      input: { [field]: next },
    });
    await onUserChanged();
  };

  return (
    <>
      <div {...stylex.props(preferencesStyles.titleContainer)}>
        <h1 {...stylex.props(preferencesStyles.pageTitle)}>Profile</h1>
      </div>

      <div {...stylex.props(preferencesStyles.section)}>
        <section {...withClassName(stylex.props(preferencesStyles.cardContainer), `${css.cardDivided} preferences-card-container--divided`)}>
          <div {...withClassName(stylex.props(preferencesStyles.rowItem, preferencesStyles.rowItemColumnOnMobile), css.rowItem)}>
            <div {...stylex.props(preferencesStyles.rowCopy, preferencesStyles.rowCopyColumnOnMobile)}>
              <span {...withClassName(stylex.props(preferencesStyles.rowTitle), 'preferences-row-title')}>Profile picture</span>
            </div>
            <ProfileAvatar user={user} onUserChanged={onUserChanged} />
          </div>

          <div {...withClassName(stylex.props(preferencesStyles.rowItem, preferencesStyles.rowItemColumnOnMobile), css.rowItem)}>
            <div {...stylex.props(preferencesStyles.rowCopy, preferencesStyles.rowCopyColumnOnMobile)}>
              <span {...withClassName(stylex.props(preferencesStyles.rowTitle), 'preferences-row-title')}>Email</span>
              {user.unconfirmed_email && (
                <span {...stylex.props(preferencesStyles.rowDesc)}>
                  Pending confirmation: {user.unconfirmed_email}
                </span>
              )}
            </div>
            <div {...stylex.props(preferencesStyles.rowControl, preferencesStyles.rowControlColumnOnMobile)}>
              <span {...stylex.props(preferencesStyles.rowValue)}>{user.email || 'Not set'}</span>
              <button
                type="button"
                {...stylex.props(preferencesStyles.rowEditButton)}
                aria-label="Change email"
                onClick={() => setEmailDialogOpen(true)}
              >
                <BuyerlyIcon name="edit" size={13} />
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
      <div {...stylex.props(preferencesStyles.section)}>
        <div {...stylex.props(preferencesStyles.sectionHeader)}>
          <h3 {...stylex.props(preferencesStyles.sectionTitle)}>Workspace access</h3>
        </div>
        <section {...stylex.props(preferencesStyles.cardContainer)}>
          <div {...withClassName(stylex.props(preferencesStyles.rowItem), cannotLeave ? 'preferences-row-item--disabled' : undefined)}>
            <div {...stylex.props(preferencesStyles.rowCopy, cannotLeave && preferencesStyles.rowCopyDisabled)}>
              <span {...withClassName(stylex.props(preferencesStyles.rowTitle), 'preferences-row-title')}>Remove yourself from workspace</span>
            </div>
            <Tooltip content="Workspace requires at least one owner" disabled={!cannotLeave}>
              <span {...stylex.props(styles.tooltipTarget)}>
                <button
                  type="button"
                  {...stylex.props(preferencesStyles.rowGhostButton)}
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
