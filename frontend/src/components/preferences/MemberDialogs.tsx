import React, { useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import * as stylex from '@stylexjs/stylex';
import { ApiError, apiRequest } from '@/lib/api';
import type { Workspace } from '@/lib/types';
import { BuyerlyCloseIcon } from '@/icons/BuyerlyIcons';
import { Button } from '@/ui/Button';
import { ConfirmDialog } from '@/ui/ConfirmDialog';
import { toast } from '@/ui/toast';
import { useLastPresent } from '@/ui/useLastPresent';
import { withClassName } from '@/ui/withClassName';
import { colors, radii } from '@/styles/tokens.stylex';

const styles = stylex.create({
  overlay: {
    position: 'fixed',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 500,
    backgroundColor: 'rgb(0 0 0 / 0.5)',
  },
  frame: {
    pointerEvents: 'none',
    position: 'fixed',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 501,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 16,
    paddingRight: 16,
    paddingBottom: 16,
    paddingLeft: 16,
  },
  content: {
    pointerEvents: 'auto',
    width: '100%',
    maxWidth: 480,
    borderRadius: radii['--canvas-border-radius'],
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: colors['--color-border-secondary'],
    backgroundColor: colors['--card-bg'],
    paddingTop: 24,
    paddingRight: 24,
    paddingBottom: 24,
    paddingLeft: 24,
    textAlign: 'left',
    outline: '2px solid transparent',
    outlineOffset: 2,
    boxShadow: colors['--dialog-elevation-shadow'],
  },
  contentWide: {
    maxWidth: 540,
  },
  header: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 8,
  },
  title: {
    margin: 0,
    minWidth: 0,
    flex: '1 1 0%',
    fontSize: 15,
    fontWeight: 600,
    color: colors['--text-primary'],
  },
  close: {
    marginRight: -4,
    display: 'flex',
    height: 24,
    width: 24,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 4,
    color: {
      default: colors['--text-tertiary'],
      ':hover': colors['--text-primary'],
    },
    backgroundColor: {
      default: null,
      ':hover': colors['--item-hover-bg'],
    },
    outline: '2px solid transparent',
    outlineOffset: 2,
    boxShadow: {
      default: null,
      ':focus-visible': `0 0 0 2px ${colors['--focus-ring-color']}`,
    },
  },
  description: {
    margin: 0,
    marginTop: 8,
    fontSize: 13,
    lineHeight: '20px',
    color: colors['--text-secondary'],
  },
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
  footer: {
    marginTop: 20,
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 8,
  },
  choices: {
    marginTop: 16,
    display: 'flex',
    maxHeight: 240,
    flexDirection: 'column',
    gap: 4,
    overflowY: 'auto',
  },
  choice: {
    display: 'flex',
    minWidth: 0,
    cursor: 'pointer',
    alignItems: 'center',
    gap: 10,
    borderRadius: 6,
    paddingLeft: 8,
    paddingRight: 8,
    paddingTop: 6,
    paddingBottom: 6,
    backgroundColor: {
      default: null,
      ':hover': colors['--item-hover-bg'],
    },
  },
  radio: {
    accentColor: colors['--action-primary'],
  },
  choiceText: {
    minWidth: 0,
  },
  choiceLabel: {
    display: 'block',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: 13,
    color: colors['--text-primary'],
  },
  choiceDetail: {
    display: 'block',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: 12,
    color: colors['--text-tertiary'],
  },
  loading: {
    margin: 0,
    marginTop: 16,
    fontSize: 13,
    color: colors['--text-tertiary'],
  },
  error: {
    margin: 0,
    marginTop: 12,
    fontSize: 12,
    color: colors['--toast-error-icon'],
  },
});

export interface MemberItem {
  id: number;
  user_id: number;
  username: string;
  full_name: string;
  email: string | null;
  avatar_url: string;
  role: string;
  joined_at: string;
  is_current_user: boolean;
}

export const ROLE_LABELS: Record<string, string> = {
  owner: 'Owner',
  admin: 'Admin',
  member: 'Member',
  guest: 'Guest',
  /** A role on one team, beside the workspace roles. */
  'team-owner': 'Team owner',
};

export const roleLabel = (role: string) => ROLE_LABELS[role] || role;

export const memberName = (member: MemberItem) => member.full_name || member.username;

export function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError || error instanceof Error) return error.message;
  return fallback;
}

/**
 * Roles a member can be given here; ownership moves only by transfer. Like
 * Linear's Change role… dialog, the admin option reads "Workspace admin".
 */
export const ASSIGNABLE_ROLES: Array<{ value: string; label: string; description: string }> = [
  { value: 'admin', label: 'Workspace admin', description: 'Manages members, invites and workspace settings' },
  { value: 'member', label: 'Member', description: 'Works with ad accounts, campaigns and rules, and creates teams' },
  { value: 'guest', label: 'Guest', description: 'Works only in the teams they are added to' },
];

/** "an admin", "a member": the wording of Linear's "Role has been changed to a member". */
const withArticle = (role: string) => `${/^[aeiou]/i.test(role) ? 'an' : 'a'} ${role}`;

interface ChoiceDialogProps {
  open: boolean;
  title: string;
  /** Linear's Change role… dialog has none: the options explain themselves. */
  description?: string;
  /** Linear's Change role… dialog is 540px wide and closes from a cross in its header. */
  wide?: boolean;
  busy: boolean;
  onClose: () => void;
  children: React.ReactNode;
  footer: React.ReactNode;
}

/** The ConfirmDialog frame with room for a choice between the question and its buttons. */
export const ChoiceDialog: React.FC<ChoiceDialogProps> = ({ open, title, description, wide = false, busy, onClose, children, footer }) => (
  <Dialog.Root open={open} onOpenChange={(next) => { if (!next && !busy) onClose(); }}>
    <Dialog.Portal>
      <Dialog.Overlay {...stylex.props(styles.overlay)} />
      <div {...stylex.props(styles.frame)}>
        <Dialog.Content
          {...withClassName(stylex.props(styles.content, wide && styles.contentWide), 'ui-dialog animate-scale-in')}
        >
          <div {...stylex.props(styles.header)}>
            <Dialog.Title {...stylex.props(styles.title)}>{title}</Dialog.Title>
            {wide && (
              <Dialog.Close
                aria-label="Close"
                disabled={busy}
                {...stylex.props(styles.close)}
              >
                <BuyerlyCloseIcon size={12} />
              </Dialog.Close>
            )}
          </div>
          {description ? (
            <Dialog.Description {...stylex.props(styles.description)}>
              {description}
            </Dialog.Description>
          ) : (
            <Dialog.Description {...stylex.props(styles.srOnly)}>{title}</Dialog.Description>
          )}
          {children}
          <div {...stylex.props(styles.footer)}>{footer}</div>
        </Dialog.Content>
      </div>
    </Dialog.Portal>
  </Dialog.Root>
);

interface ChoiceOption {
  value: string;
  label: string;
  detail: string;
}

const ChoiceList: React.FC<{
  label: string;
  options: ChoiceOption[];
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}> = ({ label, options, value, disabled, onChange }) => (
  <div role="radiogroup" aria-label={label} {...stylex.props(styles.choices)}>
    {options.map((option) => (
      <label
        key={option.value}
        {...stylex.props(styles.choice)}
      >
        <input
          type="radio"
          name={label}
          value={option.value}
          checked={value === option.value}
          disabled={disabled}
          onChange={() => onChange(option.value)}
          {...stylex.props(styles.radio)}
        />
        <span {...stylex.props(styles.choiceText)}>
          <span {...stylex.props(styles.choiceLabel)}>{option.label}</span>
          <span {...stylex.props(styles.choiceDetail)}>{option.detail}</span>
        </span>
      </label>
    ))}
  </div>
);

interface LeaveWorkspaceDialogProps {
  open: boolean;
  workspace: Workspace;
  onClose: () => void;
  /** Called once the account is out of the workspace; the app then opens another one. */
  onLeft: () => void | Promise<unknown>;
}

/**
 * Linear's "Leave workspace…". A member just confirms; the owner first picks
 * who becomes the new owner, because a workspace never stays without one.
 */
export const LeaveWorkspaceDialog: React.FC<LeaveWorkspaceDialogProps> = ({ open, workspace, onClose, onLeft }) => {
  const isOwner = workspace.role === 'owner';
  const [busy, setBusy] = useState(false);
  const [candidates, setCandidates] = useState<MemberItem[] | null>(null);
  const [newOwner, setNewOwner] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
    setNewOwner('');
  }, [open]);

  useEffect(() => {
    if (!open || !isOwner) return;
    let cancelled = false;
    setCandidates(null);
    apiRequest<MemberItem[]>(`/api/workspaces/${workspace.id}/members`)
      .then((members) => {
        if (!cancelled) setCandidates(members.filter((member) => !member.is_current_user));
      })
      .catch((loadError) => {
        if (!cancelled) {
          setCandidates([]);
          setError(errorMessage(loadError, "Couldn't load members. Please try again."));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [isOwner, open, workspace.id]);

  const leave = async () => {
    setBusy(true);
    setError('');
    try {
      if (isOwner) {
        await apiRequest(`/api/workspaces/${workspace.id}/transfer-ownership`, {
          method: 'POST',
          body: JSON.stringify({ new_owner_user_id: Number(newOwner) }),
        });
      }
      await apiRequest(`/api/workspaces/${workspace.id}/leave`, { method: 'POST', body: JSON.stringify({}) });
      toast.show({ tone: 'info', title: `You left ${workspace.name}` });
      onClose();
      await onLeft();
    } catch (leaveError) {
      setError(errorMessage(leaveError, 'Please try again.'));
      // A transfer that went through already made someone else the owner.
      if (isOwner) await onLeft();
    }
    setBusy(false);
  };

  // Linear: `Leave "<workspace>"?`, "You can always rejoin the workspace from the
  // workspace picker.", primary Leave workspace. Buyerly has no picker to rejoin
  // from, so the line says how to come back here instead.
  const title = `Leave "${workspace.name}"?`;
  const consequence = 'You can come back only if someone invites you again.';

  if (!isOwner) {
    return (
      <ConfirmDialog
        open={open}
        title={title}
        description={error ? `${consequence} ${error}` : consequence}
        confirmLabel="Leave workspace"
        tone="primary"
        busy={busy}
        onConfirm={() => void leave()}
        onCancel={onClose}
      />
    );
  }

  const options = (candidates || []).map((member) => ({
    value: String(member.user_id),
    label: memberName(member),
    detail: member.email || member.username,
  }));
  const alone = candidates !== null && candidates.length === 0 && !error;

  return (
    <ChoiceDialog
      open={open}
      title={title}
      description={alone
        ? 'You are the only member and own this workspace. Invite someone and make them the owner before you leave.'
        : `You own this workspace. Choose who becomes the new owner before you leave. ${consequence}`}
      busy={busy}
      onClose={onClose}
      footer={alone ? (
        <Button touchHeight onClick={onClose}>Close</Button>
      ) : (
        <>
          <Button touchHeight onClick={onClose} disabled={busy}>Cancel</Button>
          <Button
            touchHeight
            variant="primary"
            onClick={() => void leave()}
            disabled={busy || !newOwner}
          >
            Transfer ownership and leave
          </Button>
        </>
      )}
    >
      {candidates === null && (
        <p {...stylex.props(styles.loading)}>Loading members…</p>
      )}
      {options.length > 0 && (
        <ChoiceList label="New owner" options={options} value={newOwner} disabled={busy} onChange={setNewOwner} />
      )}
      {error && <p role="alert" {...stylex.props(styles.error)}>{error}</p>}
    </ChoiceDialog>
  );
};

interface ChangeRoleDialogProps {
  member: MemberItem | null;
  workspace: Workspace;
  onClose: () => void;
  onChanged: (member: MemberItem) => void;
}

/**
 * Linear's "Change role…" on a member's row: "Change <name>'s role", the roles
 * as radio options with a line each, Cancel and Save. Saving the same role just
 * closes; a change reports "Role changed", a failure "Unable to change role".
 */
export const ChangeRoleDialog: React.FC<ChangeRoleDialogProps> = ({ member, workspace, onClose, onChanged }) => {
  const [role, setRole] = useState('');
  const [busy, setBusy] = useState(false);
  const shown = useLastPresent(member);

  useEffect(() => {
    if (member) setRole(member.role);
  }, [member]);

  const save = async () => {
    if (!member) return;
    if (role === member.role) {
      onClose();
      return;
    }
    setBusy(true);
    try {
      const updated = await apiRequest<MemberItem>(`/api/workspaces/${workspace.id}/members/${member.user_id}`, {
        method: 'PATCH',
        body: JSON.stringify({ role }),
      });
      onChanged(updated);
      toast.show({
        tone: 'success',
        title: 'Role changed',
        description: `Role has been changed to ${withArticle(roleLabel(updated.role).toLowerCase())}`,
      });
    } catch (saveError) {
      toast.error('Unable to change role', errorMessage(saveError, 'Something unexpected went wrong when changing the role.'));
    }
    setBusy(false);
    onClose();
  };

  return (
    <ChoiceDialog
      open={Boolean(member)}
      title={shown ? `Change ${memberName(shown)}'s role` : 'Change role'}
      wide
      busy={busy}
      onClose={onClose}
      footer={(
        <>
          <Button touchHeight onClick={onClose} disabled={busy}>Cancel</Button>
          <Button touchHeight variant="primary" onClick={() => void save()} disabled={busy || !role}>
            Save
          </Button>
        </>
      )}
    >
      <ChoiceList
        label="Role"
        options={ASSIGNABLE_ROLES.map((option) => ({
          value: option.value,
          label: option.label,
          detail: option.description,
        }))}
        value={role}
        disabled={busy}
        onChange={setRole}
      />
    </ChoiceDialog>
  );
};

interface RemoveMemberDialogProps {
  member: MemberItem | null;
  workspace: Workspace;
  onClose: () => void;
  onRemoved: (member: MemberItem) => void;
}

/**
 * Buyerly's stand-in for Linear's "Suspend user…": Buyerly has no suspended
 * state, so the closest server action is removing the member. The dialog keeps
 * Linear's wording ("Suspend <name>?", "They won't be able to access this
 * workspace.", Confirm) but says how to undo it, and its button is red because,
 * unlike a suspension, removal can't be reversed from the row.
 */
export const RemoveMemberDialog: React.FC<RemoveMemberDialogProps> = ({ member, workspace, onClose, onRemoved }) => {
  const [busy, setBusy] = useState(false);
  const shown = useLastPresent(member);

  const remove = async () => {
    if (!member) return;
    setBusy(true);
    try {
      await apiRequest(`/api/workspaces/${workspace.id}/members/${member.user_id}`, { method: 'DELETE' });
      onRemoved(member);
      onClose();
    } catch (removeError) {
      toast.error(`Couldn't remove ${memberName(member)}`, errorMessage(removeError, 'Please try again.'));
    }
    setBusy(false);
  };

  return (
    <ConfirmDialog
      open={Boolean(member)}
      title={shown ? `Remove ${memberName(shown)}?` : 'Remove member?'}
      description="They won’t be able to access this workspace. To bring them back, invite them again."
      confirmLabel="Confirm"
      busy={busy}
      onConfirm={() => void remove()}
      onCancel={onClose}
    />
  );
};
