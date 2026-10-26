import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import * as stylex from '@stylexjs/stylex';
import { apiRequest } from '@/lib/api';
import { finishedEmails, isEmail, parseEmails } from '@/lib/emails';
import { plural, useTeams } from '@/lib/teams';
import type { Workspace } from '@/lib/types';
import { Button } from '@/ui/Button';
import { DataState } from '@/ui/DataState';
import { BuyerlyCheckIcon, BuyerlyCloseIcon } from '@/icons/BuyerlyIcons';
import { toast } from '@/ui/toast';
import { rowMarker } from '@/ui/markers.stylex';
import { withClassName } from '@/ui/withClassName';
import { colors, radii } from '@/styles/tokens.stylex';
import { SortHeader, sortedBy, useListSort } from './SettingsListSort';
import { WorkspaceAvatar } from '@/ui/WorkspaceAvatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/ui/DropdownMenu';
import {
  ASSIGNABLE_ROLES,
  ChangeRoleDialog,
  LeaveWorkspaceDialog,
  RemoveMemberDialog,
  errorMessage,
  memberName,
  roleLabel,
  type MemberItem,
} from './MemberDialogs';

const styles = stylex.create({
  roleBadge: {
    display: 'inline-flex',
    height: 19,
    alignItems: 'center',
    borderRadius: 3,
    backgroundColor: colors['--role-badge-bg'],
    paddingLeft: 6,
    paddingRight: 6,
    fontSize: 12,
    fontWeight: 450,
    color: colors['--role-badge-fg'],
  },
  avatar: {
    flexShrink: 0,
    borderRadius: 9999,
  },
  avatar16: {
    height: 16,
    width: 16,
    fontSize: 7,
  },
  avatar20: {
    height: 20,
    width: 20,
    fontSize: 9,
  },
  avatar24: {
    height: 24,
    width: 24,
    fontSize: 11,
  },
  avatarImage: {
    objectFit: 'cover',
  },
  initials: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 600,
    textTransform: 'uppercase',
  },
  initialsMuted: {
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: colors['--color-border-secondary'],
    color: colors['--text-tertiary'],
  },
  initialsFilled: {
    backgroundColor: colors['--action-primary'],
    color: 'rgb(255 255 255)',
  },
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
  dialog: {
    pointerEvents: 'auto',
    width: '100%',
    maxWidth: 456,
    borderRadius: radii['--canvas-border-radius'],
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: colors['--color-border-secondary'],
    backgroundColor: colors['--card-bg'],
    paddingTop: 16,
    paddingRight: 16,
    paddingBottom: 16,
    paddingLeft: 16,
    textAlign: 'left',
    outline: '2px solid transparent',
    outlineOffset: 2,
    boxShadow: colors['--dialog-elevation-shadow'],
  },
  dialogHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  dialogTitle: {
    margin: 0,
    flex: '1 1 0%',
    fontSize: 14,
    fontWeight: 500,
    color: colors['--text-primary'],
  },
  iconButton: {
    display: 'flex',
    height: 24,
    width: 24,
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
  emailHeader: {
    marginTop: 16,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  emailLabel: {
    display: 'block',
    fontSize: 12,
    fontWeight: 500,
    color: colors['--text-primary'],
  },
  roleTrigger: {
    display: 'flex',
    height: 24,
    alignItems: 'center',
    gap: 4,
    borderRadius: 4,
    paddingLeft: 6,
    paddingRight: 6,
    fontSize: 12,
    fontWeight: 500,
    color: colors['--text-primary'],
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
    opacity: {
      default: null,
      ':disabled': 0.5,
    },
  },
  roleTriggerPrefix: {
    fontWeight: 400,
    color: colors['--text-tertiary'],
  },
  tertiary: {
    color: colors['--text-tertiary'],
  },
  roleOption: {
    height: 'auto',
    paddingTop: 6,
    paddingBottom: 6,
  },
  roleOptionText: {
    minWidth: 0,
  },
  roleOptionLabel: {
    display: 'block',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  roleOptionDetail: {
    display: 'block',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: 12,
    color: colors['--text-tertiary'],
  },
  emails: {
    marginTop: 8,
    display: 'block',
    width: '100%',
    resize: 'none',
    borderRadius: 6,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: {
      default: colors['--color-border-secondary'],
      ':focus': colors['--action-primary'],
    },
    backgroundColor: 'transparent',
    paddingLeft: 10,
    paddingRight: 10,
    paddingTop: 8,
    paddingBottom: 8,
    fontSize: 13,
    color: colors['--text-primary'],
    outline: '2px solid transparent',
    outlineOffset: 2,
    '::placeholder': {
      color: colors['--text-tertiary'],
    },
  },
  emailsInvalid: {
    borderColor: colors['--toast-error-icon'],
  },
  error: {
    margin: 0,
    marginTop: 8,
    fontSize: 12,
    color: colors['--toast-error-icon'],
  },
  dialogFooter: {
    marginTop: 16,
    display: 'flex',
    justifyContent: 'flex-end',
  },
  rowMenuTrigger: {
    transitionProperty: 'opacity',
    transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
    transitionDuration: '150ms',
  },
  rowMenuHidden: {
    opacity: {
      default: 0,
      ':focus-visible': 1,
      ':is([data-state="open"])': 1,
      [stylex.when.ancestor(':hover', rowMarker)]: 1,
    },
  },
  menuGap: {
    height: 6,
    width: '100%',
  },
  truncate: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  spacer: {
    flex: '1 1 0%',
  },
  exportButton: {
    display: {
      default: null,
      '@media not all and (min-width: 640px)': 'none',
    },
  },
  person: {
    minWidth: 0,
  },
  actions: {
    display: 'flex',
    justifyContent: 'flex-end',
  },
});

interface InviteItem {
  id: number;
  email: string | null;
  role: string;
  status: string;
  created_at: string;
}

type LoadState = 'loading' | 'ready' | 'error';

/** Linear's filter beside the search; Applications, Suspended and Left workspace have no Buyerly counterpart. */
type MemberFilter = 'all' | 'members' | 'invites';
const FILTER_LABELS: Record<MemberFilter, string> = {
  all: 'All',
  members: 'Members',
  invites: 'Pending invites',
};

type MemberSort = 'name' | 'email' | 'status' | 'joined';
/** Status sorts as the roles rank, owner first. */
const ROLE_ORDER = ['owner', 'admin', 'member', 'guest'];

const csvCell = (value: string) => (/[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);

/** Linear's Export CSV: every member and pending invitation, whatever the search or filter shows. */
function downloadMembersCsv(workspace: Workspace, members: MemberItem[], invites: InviteItem[]) {
  const rows = [
    ['Name', 'Username', 'Email', 'Status', 'Joined'],
    ...members.map((member) => [member.full_name, member.username, member.email || '', roleLabel(member.role), member.joined_at]),
    ...invites.map((invite) => [
      '',
      '',
      invite.email || '',
      `${roleLabel(invite.role)} (${invite.status === 'expired' ? 'Expired' : 'Invited'})`,
      '',
    ]),
  ];
  const blob = new Blob([`${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${workspace.slug}-members.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

/** Linear marks only the roles above a member with a tinted badge. */
export const RoleStatus: React.FC<{ role: string }> = ({ role }) => (
  role === 'owner' || role === 'admin' || role === 'team-owner' ? (
    <span {...stylex.props(styles.roleBadge)}>
      {roleLabel(role)}
    </span>
  ) : (
    <>{roleLabel(role)}</>
  )
);

/** Linear's short date in the Joined column: "Sep 25". */
export function shortDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export const Initials: React.FC<{ label: string; avatarUrl?: string; muted?: boolean; size?: 16 | 20 | 24 }> = ({
  label,
  avatarUrl,
  muted,
  size = 20,
}) => {
  const box = size === 24 ? styles.avatar24 : size === 16 ? styles.avatar16 : styles.avatar20;
  if (avatarUrl) {
    return <img src={avatarUrl} alt="" {...stylex.props(styles.avatar, box, styles.avatarImage)} />;
  }
  return (
    <span
      aria-hidden="true"
      {...stylex.props(styles.avatar, box, styles.initials, muted ? styles.initialsMuted : styles.initialsFilled)}
    >
      {label.slice(0, 2)}
    </span>
  );
};

interface InviteDialogProps {
  open: boolean;
  workspace: Workspace;
  onClose: () => void;
  onSent: () => void;
}

/**
 * Linear's "Invite to your workspace": one field that takes several comma-separated
 * emails, flags a bad address before sending, and the role the invitees get.
 */
export const InviteDialog: React.FC<InviteDialogProps> = ({ open, workspace, onClose, onSent }) => {
  const [text, setText] = useState('');
  const [blurred, setBlurred] = useState(false);
  const [role, setRole] = useState('member');
  const [busy, setBusy] = useState(false);
  const fieldRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) {
      setText('');
      setBlurred(false);
      setRole('member');
    }
  }, [open]);

  const emails = useMemo(() => parseEmails(text), [text]);
  const invalid = useMemo(() => emails.filter((email) => !isEmail(email)), [emails]);
  // The address still being typed is judged once the field loses focus or a separator follows it.
  const shownInvalid = useMemo(
    () => (blurred ? invalid : finishedEmails(text).filter((email) => !isEmail(email))),
    [blurred, invalid, text],
  );
  const count = emails.length - invalid.length;
  const canSend = !busy && emails.length > 0 && invalid.length === 0;

  const send = async () => {
    if (!canSend) {
      // Ctrl/Cmd+Enter on a half-typed address shows why nothing was sent.
      setBlurred(true);
      return;
    }
    setBusy(true);
    const failed: string[] = [];
    for (const email of emails) {
      try {
        await apiRequest(`/api/workspaces/${workspace.id}/invites`, {
          method: 'POST',
          body: JSON.stringify({ email, role }),
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
        <Dialog.Overlay {...stylex.props(styles.overlay)} />
        <div {...stylex.props(styles.frame)}>
          <Dialog.Content
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              fieldRef.current?.focus();
            }}
            {...withClassName(stylex.props(styles.dialog), 'ui-dialog animate-scale-in')}
          >
            <div {...stylex.props(styles.dialogHeader)}>
              <WorkspaceAvatar workspace={workspace} size="tiny" />
              <Dialog.Title {...stylex.props(styles.dialogTitle)}>
                Invite to your workspace
              </Dialog.Title>
              <Dialog.Close
                aria-label="Close"
                disabled={busy}
                {...stylex.props(styles.iconButton)}
              >
                <BuyerlyCloseIcon size={12} />
              </Dialog.Close>
            </div>
            <Dialog.Description {...stylex.props(styles.srOnly)}>
              Enter one or more email addresses separated by commas.
            </Dialog.Description>
            <div {...stylex.props(styles.emailHeader)}>
              <label {...stylex.props(styles.emailLabel)} htmlFor="invite-emails">
                Email
              </label>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label={`Role: ${roleLabel(role)}`}
                    disabled={busy}
                    {...stylex.props(styles.roleTrigger)}
                  >
                    <span {...stylex.props(styles.roleTriggerPrefix)}>Invite as</span>
                    {roleLabel(role)}
                    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" {...stylex.props(styles.tertiary)}>
                      <path d="M2.5 4l2.5 2.5L7.5 4" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" style={{ width: 280 }}>
                  <DropdownMenuRadioGroup value={role} onValueChange={setRole}>
                    {ASSIGNABLE_ROLES.map((option) => (
                      <DropdownMenuRadioItem key={option.value} value={option.value} xstyle={styles.roleOption}>
                        <span {...stylex.props(styles.roleOptionText)}>
                          <span {...stylex.props(styles.roleOptionLabel)}>{option.label}</span>
                          <span {...stylex.props(styles.roleOptionDetail)}>{option.description}</span>
                        </span>
                        {role === option.value && <BuyerlyCheckIcon size={14} />}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <textarea
              id="invite-emails"
              ref={fieldRef}
              rows={2}
              value={text}
              disabled={busy}
              onChange={(event) => {
                setText(event.target.value);
                setBlurred(false);
              }}
              onBlur={() => setBlurred(true)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault();
                  void send();
                }
              }}
              placeholder="email@example.com, email2@example.com…"
              aria-invalid={shownInvalid.length > 0}
              aria-describedby={shownInvalid.length > 0 ? 'invite-emails-error' : undefined}
              {...stylex.props(styles.emails, shownInvalid.length > 0 && styles.emailsInvalid)}
            />
            {shownInvalid.length > 0 && (
              <p id="invite-emails-error" role="alert" {...stylex.props(styles.error)}>
                {shownInvalid.length === 1
                  ? `${shownInvalid[0]} isn’t a valid email address`
                  : `These aren’t valid email addresses: ${shownInvalid.join(', ')}`}
              </p>
            )}
            <div {...stylex.props(styles.dialogFooter)}>
              <Button variant="primary" onClick={() => void send()} disabled={!canSend}>
                {busy ? 'Sending…' : count > 0 ? `Send ${count} ${count === 1 ? 'invite' : 'invites'}` : 'Send invites'}
              </Button>
            </div>
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

/** A row's "…" menu; `visible` keeps it shown, as on Linear's Members page, instead of only under the cursor. */
export const RowMenu: React.FC<{ label: string; children: React.ReactNode; visible?: boolean }> = ({ label, children, visible }) => (
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <button
        type="button"
        aria-label={label}
        {...stylex.props(styles.iconButton, styles.rowMenuTrigger, !visible && styles.rowMenuHidden)}
      >
        <svg width={visible ? 16 : 14} height={visible ? 16 : 14} viewBox="0 0 16 16" aria-hidden="true" fill="currentColor">
          <circle cx="3" cy="8" r="1.25" />
          <circle cx="8" cy="8" r="1.25" />
          <circle cx="13" cy="8" r="1.25" />
        </svg>
      </button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" sideOffset={4}>
      <div {...stylex.props(styles.menuGap)} />
      {children}
      <div {...stylex.props(styles.menuGap)} />
    </DropdownMenuContent>
  </DropdownMenu>
);

/**
 * Settings → Members, after Linear: search, the All / Members / Pending invites
 * filter, Export CSV and Invite, and one table grouped into Active members and
 * pending Invited emails; owners and admins carry a badge. An invited row's
 * menu resends or revokes the invitation; your own row's menu leaves the
 * workspace, and an owner or admin changes another member's role or removes them.
 */
/** Linear lists only invitations still waiting for someone; public links have no email. */
const isWaitingInvite = (invite: InviteItem) => Boolean(invite.email) && (invite.status === 'pending' || invite.status === 'expired');

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
  const [filter, setFilter] = useState<MemberFilter>('all');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [roleTarget, setRoleTarget] = useState<MemberItem | null>(null);
  const [removeTarget, setRemoveTarget] = useState<MemberItem | null>(null);
  const canManage = workspace.role === 'owner' || workspace.role === 'admin';
  // Linear's Teams column: how many teams each member is on, retired ones included.
  const { teams } = useTeams(workspace.id, 'all');
  const teamCounts = useMemo(() => {
    const counts = new Map<number, number>();
    for (const team of teams || []) {
      for (const userId of team.member_user_ids) counts.set(userId, (counts.get(userId) || 0) + 1);
    }
    return counts;
  }, [teams]);
  /** The server's rule: nobody manages the owner, and only the owner manages an admin. */
  const canManageMember = (member: MemberItem) => canManage && !member.is_current_user
    && member.role !== 'owner' && (member.role !== 'admin' || workspace.role === 'owner');

  const refresh = useCallback(async () => {
    const invitesRead = canManage
      ? apiRequest<InviteItem[]>(`/api/workspaces/${workspace.id}/invites`)
      : Promise.resolve([] as InviteItem[]);
    try {
      const [nextMembers, nextInvites] = await Promise.all([
        apiRequest<MemberItem[]>(`/api/workspaces/${workspace.id}/members`),
        invitesRead,
      ]);
      setMembers(nextMembers);
      setInvites(nextInvites.filter(isWaitingInvite));
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
  const [sort, toggleSort] = useListSort<MemberSort>('name');
  const sortedMembers = useMemo(() => sortedBy(visibleMembers, (member) => {
    if (sort.key === 'email') return member.email || '';
    if (sort.key === 'status') return ROLE_ORDER.indexOf(member.role);
    if (sort.key === 'joined') return Date.parse(member.joined_at);
    return member.full_name || member.username;
  }, sort.direction), [visibleMembers, sort]);
  const sortedInvites = useMemo(() => sortedBy(visibleInvites, (invite) => {
    if (sort.key === 'status') return ROLE_ORDER.indexOf(invite.role);
    if (sort.key === 'joined') return Date.parse(invite.created_at);
    return invite.email || '';
  }, sort.direction), [visibleInvites, sort]);

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

      <div className="settings-list-toolbar">
        <label className="settings-list-search">
          <span {...stylex.props(styles.srOnly)}>Search by name or email</span>
          <svg viewBox="0 0 16 16" aria-hidden="true" className="settings-list-search-icon">
            <path d="M7 1.5a5.5 5.5 0 0 1 4.38 8.82l3.15 3.15a.75.75 0 1 1-1.06 1.06l-3.15-3.15A5.5 5.5 0 1 1 7 1.5Zm0 1.5a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z" />
          </svg>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by name or email"
            className="settings-list-search-input"
          />
        </label>
        {canManage && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={`Show: ${FILTER_LABELS[filter]}`}
                className="settings-list-select"
              >
                {FILTER_LABELS[filter]}
                <svg width="10" height="5" viewBox="0 0 9 5" aria-hidden="true">
                  <path d="M1.915.557a.667.667 0 0 0-.943.943l2.862 2.862a.942.942 0 0 0 1.333 0L8.028 1.5a.667.667 0 0 0-.943-.943L4.5 3.14 1.915.557Z" />
                </svg>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" sideOffset={4}>
              <div {...stylex.props(styles.menuGap)} />
              <DropdownMenuRadioGroup value={filter} onValueChange={(value) => setFilter(value as MemberFilter)}>
                {(Object.keys(FILTER_LABELS) as MemberFilter[]).map((key) => (
                  <DropdownMenuRadioItem key={key} value={key}>
                    <span {...stylex.props(styles.truncate)}>{FILTER_LABELS[key]}</span>
                    {filter === key && <BuyerlyCheckIcon size={14} />}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
              <div {...stylex.props(styles.menuGap)} />
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        <div {...stylex.props(styles.spacer)} />
        {canManage && state === 'ready' && (
          <button type="button" {...withClassName(stylex.props(styles.exportButton), 'settings-list-button')} onClick={() => downloadMembersCsv(workspace, members, invites)}>
            Export CSV
          </button>
        )}
        {canManage && (
          <button type="button" className="settings-list-button settings-list-button--primary" onClick={() => setInviteOpen(true)}>
            Invite
          </button>
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
        <div className="settings-list-table" role="table" aria-label="Workspace members">
          <div role="row" className="settings-list-row settings-list-row--header">
            <SortHeader label="Name" column="name" sort={sort} onSort={toggleSort} />
            <SortHeader label="Email" column="email" sort={sort} onSort={toggleSort} className="settings-list-col-wide" />
            <SortHeader label="Status" column="status" sort={sort} onSort={toggleSort} />
            <span role="columnheader" className="settings-list-col-wide">Teams</span>
            <SortHeader label="Joined" column="joined" sort={sort} onSort={toggleSort} className="settings-list-col-wide" />
            <span role="columnheader" {...stylex.props(styles.srOnly)}>Actions</span>
          </div>

          {filter !== 'invites' && (
            <div className="settings-list-group">
              Active
              <span className="settings-list-group-count">{visibleMembers.length}</span>
            </div>
          )}
          {filter !== 'invites' && sortedMembers.map((member) => (
            <div key={member.id} role="row" className="settings-list-row">
              <span role="cell" className="settings-list-person">
                <Initials label={member.full_name || member.username} avatarUrl={member.avatar_url} size={24} />
                <span {...stylex.props(styles.person)}>
                  <span className="settings-list-person-name">{member.full_name || member.username}</span>
                  <span className="settings-list-person-handle">{member.username}</span>
                </span>
              </span>
              <span role="cell" className="settings-list-cell settings-list-col-wide">{member.email || ''}</span>
              <span role="cell" className="settings-list-cell"><RoleStatus role={member.role} /></span>
              <span role="cell" className="settings-list-cell settings-list-col-wide">
                {teamCounts.get(member.user_id) ? plural(teamCounts.get(member.user_id) as number, 'team') : ''}
              </span>
              <span role="cell" className="settings-list-cell settings-list-col-wide">{shortDate(member.joined_at)}</span>
              <span role="cell" {...stylex.props(styles.actions)}>
                {/* Linear gives your row no menu while nobody else could run the workspace. */}
                {member.is_current_user ? (workspace.role === 'owner' && members.length < 2 ? null : (
                  <RowMenu label={`Member actions for ${memberName(member)}`} visible>
                    <DropdownMenuItem onSelect={() => setLeaveOpen(true)}>
                      <span {...stylex.props(styles.truncate)}>Leave workspace…</span>
                    </DropdownMenuItem>
                  </RowMenu>
                )) : canManageMember(member) ? (
                  // Linear: Change role…, then a divider, then Suspend user… (Remove here).
                  // Its Update name/username/email… and Manage sessions/teams… have no
                  // Buyerly counterpart, so they are left out.
                  <RowMenu label={`Member actions for ${memberName(member)}`} visible>
                    <DropdownMenuItem onSelect={() => setRoleTarget(member)}>
                      <span {...stylex.props(styles.truncate)}>Change role…</span>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => setRemoveTarget(member)}>
                      <span {...stylex.props(styles.truncate)}>Remove from workspace…</span>
                    </DropdownMenuItem>
                  </RowMenu>
                ) : null}
              </span>
            </div>
          ))}

          {canManage && filter !== 'members' && (visibleInvites.length > 0 || filter === 'invites') && (
            <>
              <div className="settings-list-group">
                Invited
                <span className="settings-list-group-count">{visibleInvites.length}</span>
              </div>
              {sortedInvites.map((invite) => (
                <div key={invite.id} role="row" className="settings-list-row">
                  <span role="cell" className="settings-list-person">
                    <Initials label={invite.email || ''} muted size={24} />
                    <span className="settings-list-person-name">{invite.email}</span>
                  </span>
                  <span role="cell" className="settings-list-cell settings-list-col-wide">{invite.email}</span>
                  <span role="cell" className="settings-list-cell">
                    {roleLabel(invite.role)} ({invite.status === 'expired' ? 'Expired' : 'Invited'})
                  </span>
                  <span role="cell" className="settings-list-col-wide" />
                  <span role="cell" className="settings-list-cell settings-list-col-wide">{shortDate(invite.created_at)}</span>
                  <span role="cell" {...stylex.props(styles.actions)}>
                    <RowMenu label={`Invite actions for ${invite.email}`} visible>
                      <DropdownMenuItem onSelect={() => void resend(invite)}>
                        <span {...stylex.props(styles.truncate)}>Resend invite</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => void revoke(invite)}>
                        <span {...stylex.props(styles.truncate)}>Revoke invite</span>
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
