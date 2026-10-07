import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { apiRequest } from '@/lib/api';
import type { Workspace } from '@/lib/types';
import { Button } from '@/ui/Button';
import { DataState } from '@/ui/DataState';
import { LinearCloseIcon } from '@/icons/LinearIcons';
import { toast } from '@/ui/toast';
import { WorkspaceAvatar } from '@/ui/WorkspaceAvatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/ui/DropdownMenu';
import {
  ChangeRoleDialog,
  LeaveWorkspaceDialog,
  RemoveMemberDialog,
  errorMessage,
  memberName,
  roleLabel,
  type MemberItem,
} from './MemberDialogs';

interface InviteItem {
  id: number;
  email: string | null;
  role: string;
  status: string;
  created_at: string;
}

type LoadState = 'loading' | 'ready' | 'error';

/** Linear's short date in the Joined column: "Sep 25". */
function shortDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** Splits the invite field on commas, spaces and new lines, like Linear's email box. */
function parseEmails(text: string): string[] {
  return Array.from(new Set(
    text.split(/[\s,;]+/).map((item) => item.trim().toLowerCase()).filter(Boolean),
  ));
}

const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const Initials: React.FC<{ label: string; avatarUrl?: string; muted?: boolean }> = ({ label, avatarUrl, muted }) => {
  if (avatarUrl) {
    return <img src={avatarUrl} alt="" className="h-5 w-5 shrink-0 rounded-full object-cover" />;
  }
  return (
    <span
      aria-hidden="true"
      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-semibold uppercase ${
        muted
          ? 'border border-[var(--color-border-secondary)] text-[var(--text-tertiary)]'
          : 'bg-[var(--action-primary)] text-white'
      }`}
    >
      {label.slice(0, 2)}
    </span>
  );
};

const GroupHeader: React.FC<{ label: string; count: number }> = ({ label, count }) => (
  <div className="flex h-8 items-center gap-1.5 rounded-[4px] bg-[var(--item-hover-bg)] px-2 text-[12px] font-medium text-[var(--text-primary)]">
    {label}
    <span className="text-[var(--text-tertiary)]">{count}</span>
  </div>
);

const ROW_GRID = 'grid grid-cols-[minmax(0,2.2fr)_minmax(0,2fr)_minmax(96px,1fr)_72px_28px] items-center gap-3';

interface InviteDialogProps {
  open: boolean;
  workspace: Workspace;
  onClose: () => void;
  onSent: () => void;
}

/** Linear's "Invite to your workspace": one field that takes several comma-separated emails. */
const InviteDialog: React.FC<InviteDialogProps> = ({ open, workspace, onClose, onSent }) => {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fieldRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) {
      setText('');
      setError('');
    }
  }, [open]);

  const send = async () => {
    const emails = parseEmails(text);
    if (emails.length === 0) {
      setError('Enter at least one email address');
      return;
    }
    const invalid = emails.filter((email) => !isEmail(email));
    if (invalid.length > 0) {
      setError(`Not a valid email: ${invalid.join(', ')}`);
      return;
    }
    setBusy(true);
    setError('');
    const failed: string[] = [];
    for (const email of emails) {
      try {
        await apiRequest(`/api/workspaces/${workspace.id}/invites`, {
          method: 'POST',
          body: JSON.stringify({ email, role: 'buyer' }),
        });
        toast.show({
          tone: 'info',
          title: 'Invite sent',
          description: `${email} has been notified by email to join Buyerly`,
        });
      } catch (sendError) {
        failed.push(email);
        toast.error(`Couldn't invite ${email}`, errorMessage(sendError, 'Please try again.'));
      }
    }
    setBusy(false);
    onSent();
    if (failed.length === 0) onClose();
    else setText(failed.join(', '));
  };

  return (
    <Dialog.Root open={open} onOpenChange={(next) => { if (!next && !busy) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[500] bg-black/50 animate-fade-in" />
        <div className="pointer-events-none fixed inset-0 z-[501] flex items-center justify-center p-4">
          <Dialog.Content
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              fieldRef.current?.focus();
            }}
            className="ui-dialog pointer-events-auto w-full max-w-[456px] rounded-[var(--canvas-border-radius)] border border-[var(--color-border-secondary)] bg-[var(--card-bg)] p-4 text-left outline-none animate-scale-in shadow-[var(--dialog-elevation-shadow)]"
          >
            <div className="flex items-center gap-2">
              <WorkspaceAvatar workspace={workspace} size={16} />
              <Dialog.Title className="m-0 flex-1 text-[14px] font-medium text-[var(--text-primary)]">
                Invite to your workspace
              </Dialog.Title>
              <Dialog.Close
                aria-label="Close"
                disabled={busy}
                className="flex h-6 w-6 items-center justify-center rounded-[4px] text-[var(--text-tertiary)] outline-none hover:bg-[var(--item-hover-bg)] hover:text-[var(--text-primary)] focus-visible:ring-2 focus-visible:ring-[var(--focus-ring-color)]"
              >
                <LinearCloseIcon size={12} />
              </Dialog.Close>
            </div>
            <Dialog.Description className="sr-only">
              Enter one or more email addresses separated by commas.
            </Dialog.Description>
            <label className="mt-4 block text-[12px] font-medium text-[var(--text-primary)]" htmlFor="invite-emails">
              Email
            </label>
            <textarea
              id="invite-emails"
              ref={fieldRef}
              rows={2}
              value={text}
              disabled={busy}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault();
                  void send();
                }
              }}
              placeholder="email@example.com, email2@example.com…"
              aria-invalid={Boolean(error)}
              className="mt-2 block w-full resize-none rounded-[6px] border border-[var(--color-border-secondary)] bg-transparent px-2.5 py-2 text-[13px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)] focus:border-[var(--action-primary)]"
            />
            {error && <p role="alert" className="m-0 mt-2 text-[12px] text-[var(--toast-error-icon)]">{error}</p>}
            <div className="mt-4 flex justify-end">
              <Button variant="primary" onClick={() => void send()} disabled={busy}>
                {busy ? 'Sending…' : 'Send invites'}
              </Button>
            </div>
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

const RowMenu: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <button
        type="button"
        aria-label={label}
        className="flex h-6 w-6 items-center justify-center rounded-[4px] text-[var(--text-tertiary)] opacity-0 outline-none transition-opacity hover:bg-[var(--item-hover-bg)] hover:text-[var(--text-primary)] focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-[var(--focus-ring-color)] group-hover:opacity-100 data-[state=open]:opacity-100"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" fill="currentColor">
          <circle cx="3" cy="8" r="1.25" />
          <circle cx="8" cy="8" r="1.25" />
          <circle cx="13" cy="8" r="1.25" />
        </svg>
      </button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" sideOffset={4}>
      <div className="h-[6px] w-full" />
      {children}
      <div className="h-[6px] w-full" />
    </DropdownMenuContent>
  </DropdownMenu>
);

/**
 * Settings → Members, after Linear: search, an Invite button, and one table
 * grouped into Active members and pending Invited emails. An invited row's
 * menu resends or revokes the invitation; your own row's menu leaves the
 * workspace, and an owner or admin changes another member's role or removes them.
 */
export const MembersSection: React.FC<{
  workspace: Workspace;
  /** Reloads the account after leaving, so the app opens the next workspace. */
  onUserChanged: () => void | Promise<unknown>;
}> = ({ workspace, onUserChanged }) => {
  const [members, setMembers] = useState<MemberItem[]>([]);
  const [invites, setInvites] = useState<InviteItem[]>([]);
  const [state, setState] = useState<LoadState>('loading');
  const [loadError, setLoadError] = useState('');
  const [query, setQuery] = useState('');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [roleTarget, setRoleTarget] = useState<MemberItem | null>(null);
  const [removeTarget, setRemoveTarget] = useState<MemberItem | null>(null);
  const canManage = workspace.role === 'owner' || workspace.role === 'admin';
  /** The server's rule: nobody manages the owner, and only the owner manages an admin. */
  const canManageMember = (member: MemberItem) => canManage && !member.is_current_user
    && member.role !== 'owner' && (member.role !== 'admin' || workspace.role === 'owner');

  const refresh = useCallback(async () => {
    try {
      const [nextMembers, nextInvites] = await Promise.all([
        apiRequest<MemberItem[]>(`/api/workspaces/${workspace.id}/members`),
        canManage
          ? apiRequest<InviteItem[]>(`/api/workspaces/${workspace.id}/invites`)
          : Promise.resolve([] as InviteItem[]),
      ]);
      setMembers(nextMembers);
      // Linear lists only invitations still waiting for someone; public links have no email.
      setInvites(nextInvites.filter((invite) => invite.email && (invite.status === 'pending' || invite.status === 'expired')));
      setState('ready');
    } catch (error) {
      setLoadError(errorMessage(error, 'Please try again.'));
      setState('error');
    }
  }, [canManage, workspace.id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const needle = query.trim().toLowerCase();
  const visibleMembers = useMemo(() => members.filter((member) => !needle
    || member.full_name.toLowerCase().includes(needle)
    || member.username.toLowerCase().includes(needle)
    || (member.email || '').toLowerCase().includes(needle)), [members, needle]);
  const visibleInvites = useMemo(() => invites.filter((invite) => !needle
    || (invite.email || '').includes(needle)), [invites, needle]);

  const resend = async (invite: InviteItem) => {
    try {
      await apiRequest(`/api/workspaces/${workspace.id}/invites/${invite.id}/resend`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      toast.show({
        tone: 'info',
        title: 'Invite sent',
        description: `${invite.email} has been notified by email to join Buyerly`,
      });
      void refresh();
    } catch (error) {
      toast.error("Couldn't resend the invite", errorMessage(error, 'Please try again.'));
    }
  };

  const revoke = async (invite: InviteItem) => {
    try {
      await apiRequest(`/api/workspaces/${workspace.id}/invites/${invite.id}`, { method: 'DELETE' });
      setInvites((current) => current.filter((item) => item.id !== invite.id));
    } catch (error) {
      toast.error("Couldn't revoke the invite", errorMessage(error, 'Please try again.'));
    }
  };

  return (
    <>
      <div className="preferences-title-container">
        <h1 className="preferences-page-title">Members</h1>
      </div>

      <div className="flex items-center gap-2">
        <label className="relative flex h-8 w-[244px] max-w-full items-center">
          <span className="sr-only">Search by name or email</span>
          <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" className="pointer-events-none absolute left-2.5 fill-[var(--text-tertiary)]">
            <path d="M7 1.5a5.5 5.5 0 0 1 4.38 8.82l3.15 3.15a.75.75 0 1 1-1.06 1.06l-3.15-3.15A5.5 5.5 0 1 1 7 1.5Zm0 1.5a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z" />
          </svg>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by name or email"
            className="h-8 w-full rounded-[6px] border border-[var(--color-border-secondary)] bg-transparent pl-8 pr-2 text-[13px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)] focus:border-[var(--action-primary)]"
          />
        </label>
        <div className="flex-1" />
        {canManage && (
          <Button variant="primary" onClick={() => setInviteOpen(true)}>Invite</Button>
        )}
      </div>

      {state === 'loading' && (
        <DataState title="Loading members…" detail="Reading the people in this workspace." />
      )}
      {state === 'error' && (
        <DataState
          title="Couldn't load members"
          detail={loadError}
          role="alert"
          actionLabel="Retry"
          onAction={() => void refresh()}
        />
      )}

      {state === 'ready' && (
        <div className="mt-6 text-[13px]" role="table" aria-label="Workspace members">
          <div role="row" className={`${ROW_GRID} h-8 px-2 text-[12px] font-medium text-[var(--text-secondary)]`}>
            <span role="columnheader">Name</span>
            <span role="columnheader">Email</span>
            <span role="columnheader">Status</span>
            <span role="columnheader">Joined</span>
            <span role="columnheader" className="sr-only">Actions</span>
          </div>

          <GroupHeader label="Active" count={visibleMembers.length} />
          {visibleMembers.map((member) => (
            <div key={member.id} role="row" className={`${ROW_GRID} group h-11 px-2`}>
              <span role="cell" className="flex min-w-0 items-center gap-2.5">
                <Initials label={member.full_name || member.username} avatarUrl={member.avatar_url} />
                <span className="min-w-0">
                  <span className="block truncate font-medium text-[var(--text-primary)]">
                    {member.full_name || member.username}
                  </span>
                  <span className="block truncate text-[12px] text-[var(--text-tertiary)]">{member.username}</span>
                </span>
              </span>
              <span role="cell" className="truncate text-[var(--text-secondary)]">{member.email || ''}</span>
              <span role="cell" className="text-[var(--text-secondary)]">{roleLabel(member.role)}</span>
              <span role="cell" className="text-[var(--text-secondary)]">{shortDate(member.joined_at)}</span>
              <span role="cell" className="flex justify-end">
                {/* Linear gives your row no menu while nobody else could run the workspace. */}
                {member.is_current_user ? (workspace.role === 'owner' && members.length < 2 ? null : (
                  <RowMenu label={`Member actions for ${memberName(member)}`}>
                    <DropdownMenuItem onSelect={() => setLeaveOpen(true)}>
                      <span className="truncate">Leave workspace…</span>
                    </DropdownMenuItem>
                  </RowMenu>
                )) : canManageMember(member) ? (
                  // Linear: Change role…, then a divider, then Suspend user… (Remove here).
                  // Its Update name/username/email… and Manage sessions/teams… have no
                  // Buyerly counterpart, so they are left out.
                  <RowMenu label={`Member actions for ${memberName(member)}`}>
                    <DropdownMenuItem onSelect={() => setRoleTarget(member)}>
                      <span className="truncate">Change role…</span>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => setRemoveTarget(member)}>
                      <span className="truncate">Remove from workspace…</span>
                    </DropdownMenuItem>
                  </RowMenu>
                ) : null}
              </span>
            </div>
          ))}

          {canManage && visibleInvites.length > 0 && (
            <>
              <GroupHeader label="Invited" count={visibleInvites.length} />
              {visibleInvites.map((invite) => (
                <div key={invite.id} role="row" className={`${ROW_GRID} group h-11 px-2`}>
                  <span role="cell" className="flex min-w-0 items-center gap-2.5">
                    <Initials label={invite.email || ''} muted />
                    <span className="truncate font-medium text-[var(--text-primary)]">{invite.email}</span>
                  </span>
                  <span role="cell" className="truncate text-[var(--text-secondary)]">{invite.email}</span>
                  <span role="cell" className="text-[var(--text-secondary)]">
                    {roleLabel(invite.role)} ({invite.status === 'expired' ? 'Expired' : 'Invited'})
                  </span>
                  <span role="cell" className="text-[var(--text-secondary)]">{shortDate(invite.created_at)}</span>
                  <span role="cell" className="flex justify-end">
                    <RowMenu label={`Invite actions for ${invite.email}`}>
                      <DropdownMenuItem onSelect={() => void resend(invite)}>
                        <span className="truncate">Resend invite</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => void revoke(invite)}>
                        <span className="truncate">Revoke invite</span>
                      </DropdownMenuItem>
                    </RowMenu>
                  </span>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      <InviteDialog
        open={inviteOpen}
        workspace={workspace}
        onClose={() => setInviteOpen(false)}
        onSent={() => void refresh()}
      />
      <LeaveWorkspaceDialog
        open={leaveOpen}
        workspace={workspace}
        onClose={() => setLeaveOpen(false)}
        onLeft={onUserChanged}
      />
      <ChangeRoleDialog
        member={roleTarget}
        workspace={workspace}
        onClose={() => setRoleTarget(null)}
        onChanged={(updated) => setMembers((current) => current.map((item) => (
          item.user_id === updated.user_id ? { ...item, role: updated.role } : item
        )))}
      />
      <RemoveMemberDialog
        member={removeTarget}
        workspace={workspace}
        onClose={() => setRemoveTarget(null)}
        onRemoved={(removed) => setMembers((current) => current.filter((item) => item.user_id !== removed.user_id))}
      />
    </>
  );
};
