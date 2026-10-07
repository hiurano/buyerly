import React, { useEffect, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { ApiError, apiRequest } from '@/lib/api';
import type { Workspace } from '@/lib/types';
import { Button } from '@/ui/Button';
import { ConfirmDialog } from '@/ui/ConfirmDialog';
import { toast } from '@/ui/toast';
import { TOUCH_HEIGHT_CLASS } from '@/lib/useMediaQuery';

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
  buyer: 'Buyer',
  viewer: 'Viewer',
};

export const roleLabel = (role: string) => ROLE_LABELS[role] || role;

export const memberName = (member: MemberItem) => member.full_name || member.username;

export function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError || error instanceof Error) return error.message;
  return fallback;
}

/** Roles a member can be given here; ownership moves only by transfer. */
const ASSIGNABLE_ROLES: Array<{ value: string; description: string }> = [
  { value: 'admin', description: 'Manages members, invites and workspace settings' },
  { value: 'buyer', description: 'Works with accounts, campaigns and rules' },
  { value: 'viewer', description: 'Sees the workspace without changing it' },
];

interface ChoiceDialogProps {
  open: boolean;
  title: string;
  description: string;
  busy: boolean;
  onClose: () => void;
  children: React.ReactNode;
  footer: React.ReactNode;
}

/** The ConfirmDialog frame with room for a choice between the question and its buttons. */
const ChoiceDialog: React.FC<ChoiceDialogProps> = ({ open, title, description, busy, onClose, children, footer }) => (
  <Dialog.Root open={open} onOpenChange={(next) => { if (!next && !busy) onClose(); }}>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-[500] bg-black/50 animate-fade-in" />
      <div className="pointer-events-none fixed inset-0 z-[501] flex items-center justify-center p-4">
        <Dialog.Content className="ui-dialog pointer-events-auto w-full max-w-[480px] rounded-[var(--canvas-border-radius)] border border-[var(--color-border-secondary)] bg-[var(--card-bg)] p-6 text-left outline-none animate-scale-in shadow-[var(--dialog-elevation-shadow)]">
          <Dialog.Title className="m-0 text-[15px] font-semibold text-[var(--text-primary)]">{title}</Dialog.Title>
          <Dialog.Description className="m-0 mt-2 text-[13px] leading-[20px] text-[var(--text-secondary)]">
            {description}
          </Dialog.Description>
          {children}
          <div className="mt-5 flex justify-end gap-2">{footer}</div>
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
  <div role="radiogroup" aria-label={label} className="mt-4 flex max-h-[240px] flex-col gap-1 overflow-y-auto">
    {options.map((option) => (
      <label
        key={option.value}
        className="flex min-w-0 cursor-pointer items-center gap-2.5 rounded-[6px] px-2 py-1.5 hover:bg-[var(--item-hover-bg)]"
      >
        <input
          type="radio"
          name={label}
          value={option.value}
          checked={value === option.value}
          disabled={disabled}
          onChange={() => onChange(option.value)}
          className="accent-[var(--action-primary)]"
        />
        <span className="min-w-0">
          <span className="block truncate text-[13px] text-[var(--text-primary)]">{option.label}</span>
          <span className="block truncate text-[12px] text-[var(--text-tertiary)]">{option.detail}</span>
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
    } finally {
      setBusy(false);
    }
  };

  const title = `Leave ${workspace.name}?`;
  const consequence = 'You will lose access to its accounts, rules and inbox. To come back, someone will need to invite you again.';

  if (!isOwner) {
    return (
      <ConfirmDialog
        open={open}
        title={title}
        description={error ? `${consequence} ${error}` : consequence}
        confirmLabel="Leave workspace"
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
        <Button className={TOUCH_HEIGHT_CLASS} onClick={onClose}>Close</Button>
      ) : (
        <>
          <Button className={TOUCH_HEIGHT_CLASS} onClick={onClose} disabled={busy}>Cancel</Button>
          <Button
            className={TOUCH_HEIGHT_CLASS}
            variant="danger"
            onClick={() => void leave()}
            disabled={busy || !newOwner}
          >
            Transfer ownership and leave
          </Button>
        </>
      )}
    >
      {candidates === null && (
        <p className="m-0 mt-4 text-[13px] text-[var(--text-tertiary)]">Loading members…</p>
      )}
      {options.length > 0 && (
        <ChoiceList label="New owner" options={options} value={newOwner} disabled={busy} onChange={setNewOwner} />
      )}
      {error && <p role="alert" className="m-0 mt-3 text-[12px] text-[var(--toast-error-icon)]">{error}</p>}
    </ChoiceDialog>
  );
};

interface ChangeRoleDialogProps {
  member: MemberItem | null;
  workspace: Workspace;
  onClose: () => void;
  onChanged: (member: MemberItem) => void;
}

/** Linear's "Change role…" on a member's row. */
export const ChangeRoleDialog: React.FC<ChangeRoleDialogProps> = ({ member, workspace, onClose, onChanged }) => {
  const [role, setRole] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lastMember = useRef<MemberItem | null>(null);
  if (member) lastMember.current = member;
  const shown = member || lastMember.current;

  useEffect(() => {
    if (member) {
      setRole(member.role);
      setError('');
    }
  }, [member]);

  const save = async () => {
    if (!member) return;
    if (role === member.role) {
      onClose();
      return;
    }
    setBusy(true);
    setError('');
    try {
      const updated = await apiRequest<MemberItem>(`/api/workspaces/${workspace.id}/members/${member.user_id}`, {
        method: 'PATCH',
        body: JSON.stringify({ role }),
      });
      onChanged(updated);
      onClose();
    } catch (saveError) {
      setError(errorMessage(saveError, 'Please try again.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ChoiceDialog
      open={Boolean(member)}
      title={shown ? `Change ${memberName(shown)}'s role` : 'Change role'}
      description={`Choose what they can do in ${workspace.name}.`}
      busy={busy}
      onClose={onClose}
      footer={(
        <>
          <Button className={TOUCH_HEIGHT_CLASS} onClick={onClose} disabled={busy}>Cancel</Button>
          <Button className={TOUCH_HEIGHT_CLASS} variant="primary" onClick={() => void save()} disabled={busy}>
            Change role
          </Button>
        </>
      )}
    >
      <ChoiceList
        label="Role"
        options={ASSIGNABLE_ROLES.map((option) => ({
          value: option.value,
          label: roleLabel(option.value),
          detail: option.description,
        }))}
        value={role}
        disabled={busy}
        onChange={setRole}
      />
      {error && <p role="alert" className="m-0 mt-3 text-[12px] text-[var(--toast-error-icon)]">{error}</p>}
    </ChoiceDialog>
  );
};

interface RemoveMemberDialogProps {
  member: MemberItem | null;
  workspace: Workspace;
  onClose: () => void;
  onRemoved: (member: MemberItem) => void;
}

/** Removes another member after a confirmation that names them. */
export const RemoveMemberDialog: React.FC<RemoveMemberDialogProps> = ({ member, workspace, onClose, onRemoved }) => {
  const [busy, setBusy] = useState(false);
  const lastMember = useRef<MemberItem | null>(null);
  if (member) lastMember.current = member;
  const shown = member || lastMember.current;

  const remove = async () => {
    if (!member) return;
    setBusy(true);
    try {
      await apiRequest(`/api/workspaces/${workspace.id}/members/${member.user_id}`, { method: 'DELETE' });
      onRemoved(member);
      onClose();
    } catch (removeError) {
      toast.error(`Couldn't remove ${memberName(member)}`, errorMessage(removeError, 'Please try again.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ConfirmDialog
      open={Boolean(member)}
      title={shown ? `Remove ${memberName(shown)} from ${workspace.name}?` : 'Remove member?'}
      description="They lose access to this workspace right away. To bring them back, invite them again."
      confirmLabel="Remove member"
      busy={busy}
      onConfirm={() => void remove()}
      onCancel={onClose}
    />
  );
};
