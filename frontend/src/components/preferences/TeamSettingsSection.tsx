import React, { useEffect, useMemo, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { fetchAccounts, fetchWorkspaceMembers } from '@/models/queries';
import type { MetaAccount, Workspace } from '@/lib/types';
import {
  TEAM_DESCRIPTION_MAX,
  TEAM_KEY_MAX,
  TEAM_NAME_MAX,
  canManageTeam,
  cleanTeamKey,
  notifyTeamsChanged,
  plural,
  addTeamAccounts,
  addTeamMembers,
  deleteTeam,
  removeTeamAccount,
  removeTeamMember,
  restoreTeam,
  retireTeam,
  setTeamOwner,
  updateTeam,
  useTeams,
  type TeamItem,
} from '@/lib/teams';
import { useWorkspaceSession } from '@/lib/workspaceSession';
import { Button } from '@/ui/Button';
import { ConfirmDialog } from '@/ui/ConfirmDialog';
import { DataState } from '@/ui/DataState';
import { DropdownMenuItem } from '@/ui/DropdownMenu';
import { Input } from '@/ui/Input';
import { BuyerlyToggle } from '@/ui/BuyerlyToggle';
import { toast } from '@/ui/toast';
import { ChoiceDialog, errorMessage, memberName, type MemberItem } from './MemberDialogs';
import { Initials, RoleStatus, RowMenu } from './MembersSection';
import { TeamIcon } from './TeamIcon';
import { useLastPresent } from '@/ui/useLastPresent';
import { rowMarker } from '@/ui/markers.stylex';
import { colors } from '@/styles/tokens.stylex';
import { openSettings, openTeamSettings } from '@/lib/routing';

const SM = '@media (min-width: 640px)';

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
  truncate: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  block: {
    display: 'block',
  },
  minWidth0: {
    minWidth: 0,
  },
  deleteNote: {
    margin: 0,
    marginTop: 8,
    fontSize: 13,
    lineHeight: '20px',
    color: colors['--text-secondary'],
  },
  strong: {
    fontWeight: 500,
    color: colors['--text-primary'],
  },
  deleteLabel: {
    marginBottom: 8,
    marginTop: 16,
    display: 'block',
    fontSize: 13,
    fontWeight: 500,
    color: colors['--text-primary'],
  },
  deleteName: {
    fontWeight: 600,
  },
  fullWidth: {
    width: '100%',
  },
  searchSpaced: {
    marginTop: 16,
    width: '100%',
  },
  nameField: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  nameIcon: {
    display: 'flex',
    height: 32,
    width: 32,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: colors['--item-hover-bg'],
  },
  description: {
    display: 'block',
    minHeight: 120,
    width: '100%',
    resize: 'none',
    borderRadius: 10,
    borderWidth: 0,
    backgroundColor: 'transparent',
    paddingTop: 16,
    paddingRight: 16,
    paddingBottom: 16,
    paddingLeft: 16,
    fontSize: 13,
    lineHeight: '20px',
    color: colors['--text-primary'],
    outline: '2px solid transparent',
    outlineOffset: 2,
    '::placeholder': {
      color: colors['--text-tertiary'],
    },
  },
  search: {
    position: 'relative',
    display: 'flex',
    height: 32,
    width: 244,
    minWidth: 0,
    maxWidth: '100%',
    flexGrow: {
      default: 1,
      [SM]: 0,
    },
    flexShrink: {
      default: 1,
      [SM]: 0,
    },
    flexBasis: {
      default: '0%',
      [SM]: 'auto',
    },
    alignItems: 'center',
  },
  searchIcon: {
    pointerEvents: 'none',
    position: 'absolute',
    left: 10,
    fill: colors['--text-tertiary'],
  },
  searchInput: {
    height: 32,
    width: '100%',
    borderRadius: 6,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: {
      default: colors['--color-border-secondary'],
      ':focus': colors['--action-primary'],
    },
    backgroundColor: 'transparent',
    paddingLeft: 32,
    paddingRight: 8,
    fontSize: 13,
    color: colors['--text-primary'],
    outline: '2px solid transparent',
    outlineOffset: 2,
    '::placeholder': {
      color: colors['--text-tertiary'],
    },
  },
  pickList: {
    marginTop: 8,
    display: 'flex',
    maxHeight: 264,
    flexDirection: 'column',
    gap: 2,
    overflowY: 'auto',
  },
  pickEmpty: {
    margin: 0,
    paddingLeft: 8,
    paddingRight: 8,
    paddingTop: 12,
    paddingBottom: 12,
    fontSize: 13,
    color: colors['--text-tertiary'],
  },
  pickOption: {
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
  checkbox: {
    accentColor: colors['--action-primary'],
  },
  primaryText: {
    display: 'block',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: 13,
    color: colors['--text-primary'],
  },
  detailText: {
    display: 'block',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: 12,
    color: colors['--text-tertiary'],
  },
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  spacer: {
    flex: '1 1 0%',
  },
  noShrink: {
    flexShrink: 0,
  },
  table: {
    marginTop: 24,
    fontSize: 13,
  },
  grid: {
    display: 'grid',
    alignItems: 'center',
    gap: 12,
  },
  memberGrid: {
    gridTemplateColumns: {
      default: 'minmax(0,1fr) minmax(0,1fr) 28px',
      [SM]: 'minmax(0,2.2fr) minmax(0,2fr) minmax(96px,1fr) 28px',
    },
  },
  accountGrid: {
    gridTemplateColumns: {
      default: 'minmax(0,1fr) 28px',
      [SM]: 'minmax(0,2.2fr) minmax(0,1.4fr) minmax(96px,1fr) 28px',
    },
  },
  headerRow: {
    height: 32,
    paddingLeft: 8,
    paddingRight: 8,
    fontSize: 12,
    fontWeight: 500,
    color: colors['--text-secondary'],
  },
  row: {
    height: 44,
    paddingLeft: 8,
    paddingRight: 8,
  },
  wideOnly: {
    display: {
      default: 'none',
      [SM]: 'block',
    },
  },
  person: {
    display: 'flex',
    minWidth: 0,
    alignItems: 'center',
    gap: 10,
  },
  name: {
    display: 'block',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontWeight: 500,
    color: colors['--text-primary'],
  },
  nameInline: {
    fontWeight: 500,
    color: colors['--text-primary'],
  },
  secondary: {
    color: colors['--text-secondary'],
  },
  actions: {
    display: 'flex',
    justifyContent: 'flex-end',
  },
});

type TeamPage = 'overview' | 'general' | 'members' | 'accounts';

const accountName = (account: MetaAccount) => account.custom_name || account.name;

/**
 * One team's settings at /settings/teams/<KEY>, as Linear's: the overview
 * with links to General, Members and (Buyerly's counterpart of issues) Ad
 * accounts, then Danger zone with Leave, Retire and Delete. The address names
 * the team by its identifier, so renaming the identifier moves the address.
 */
export const TeamSettingsSection: React.FC<{ workspace: Workspace; path: string }> = ({ workspace, path }) => {
  const { teams, error, refresh } = useTeams(workspace.id, 'all');
  const [teamKey, sub = ''] = path.split('/');
  const page: TeamPage = sub === 'general' || sub === 'members' || sub === 'accounts' ? sub : 'overview';
  const team = teams?.find((item) => item.key.toUpperCase() === teamKey.toUpperCase()) ?? null;

  if (error) {
    return <DataState title="Couldn't load the team" detail={error} role="alert" actionLabel="Retry" onAction={() => void refresh()} />;
  }
  if (teams === null) return <DataState title="Loading team…" detail="Reading this team's settings." />;
  if (!team) {
    return (
      <DataState
        title="Team not found"
        detail="It may have been deleted, or its identifier has changed."
        actionLabel="Go to Teams"
        onAction={() => openSettings('teams')}
      />
    );
  }
  if (page === 'general') return <TeamGeneral workspace={workspace} team={team} />;
  if (page === 'members') return <TeamMembers workspace={workspace} team={team} />;
  if (page === 'accounts') return <TeamAccounts workspace={workspace} team={team} />;
  return <TeamOverview workspace={workspace} team={team} />;
};

/** Linear's way back from a team's page: the team's icon and name, or "Teams" from its overview. */
const TeamBreadcrumb: React.FC<{ team?: TeamItem }> = ({ team }) => {
  return (
    <button
      type="button"
      className="preferences-breadcrumb"
      onClick={() => (team ? openTeamSettings(team.key) : openSettings('teams'))}
    >
      <ChevronLeft size={14} aria-hidden="true" />
      {team && <TeamIcon size={12} />}
      {team ? team.name : 'Teams'}
    </button>
  );
};

/** A card row that opens one of the team's pages: title, description, value and chevron. */
const LinkRow: React.FC<{ title: string; description: string; value?: string; onOpen: () => void }> = ({
  title,
  description,
  value,
  onOpen,
}) => (
  <button type="button" className="preferences-row-item preferences-row-link" onClick={onOpen}>
    <span className="preferences-row-copy">
      <span className="preferences-row-title">{title}</span>
      <span className="preferences-row-desc">{description}</span>
    </span>
    <span className="preferences-row-control">
      {value && <span className="preferences-row-value">{value}</span>}
      <ChevronRight size={16} aria-hidden="true" className="preferences-row-chevron" />
    </span>
  </button>
);

const DangerRow: React.FC<{ title: string; description: string; action: string; onClick: () => void }> = ({
  title,
  description,
  action,
  onClick,
}) => (
  <div className="preferences-row-item">
    <div className="preferences-row-copy">
      <span className="preferences-row-title">{title}</span>
      <span className="preferences-row-desc">{description}</span>
    </div>
    <button type="button" className="preferences-row-ghost-button" onClick={onClick}>{action}</button>
  </div>
);

const TeamOverview: React.FC<{ workspace: Workspace; team: TeamItem }> = ({ workspace, team }) => {
  const { user } = useWorkspaceSession();
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [retireOpen, setRetireOpen] = useState(false);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const retired = Boolean(team.retired_at);
  const canManage = canManageTeam(team, workspace.role, user.id);

  const run = async (action: () => Promise<unknown>, done: string, failed: string) => {
    try {
      await action();
      toast.show({ tone: 'success', title: done });
      notifyTeamsChanged();
      return true;
    } catch (actionError) {
      toast.error(failed, errorMessage(actionError, 'Please try again.'));
      return false;
    }
  };

  return (
    <>
      <TeamBreadcrumb />
      <div className="preferences-title-container preferences-title-container--with-note">
        <h1 className="preferences-page-title">{team.name}</h1>
        <p className="preferences-page-note">
          {retired ? 'Retired · ' : ''}{team.private ? 'Private · only members see it' : 'Accessible to all workspace members'}
        </p>
      </div>

      <div className="preferences-section">
        <section className="preferences-card-container preferences-card-container--divided">
          <LinkRow
            title="General"
            description="Name, identifier and description"
            onOpen={() => openTeamSettings(`${team.key}/general`)}
          />
          <LinkRow
            title="Members"
            description="Manage team members"
            value={plural(team.member_user_ids.length, 'member')}
            onOpen={() => openTeamSettings(`${team.key}/members`)}
          />
          <LinkRow
            title="Ad accounts"
            description="Ad accounts this team works on"
            value={team.account_ids.length ? plural(team.account_ids.length, 'account') : 'None'}
            onOpen={() => openTeamSettings(`${team.key}/accounts`)}
          />
        </section>
      </div>

      {(team.is_member || canManage) && <div className="preferences-section">
        <div className="preferences-section-header">
          <h3 className="preferences-section-title">Danger zone</h3>
        </div>
        <section className="preferences-card-container preferences-card-container--divided">
          {team.is_member && (
            <DangerRow
              title="Leave team"
              description="Remove yourself as a member of this team"
              action="Leave team…"
              onClick={() => setLeaveOpen(true)}
            />
          )}
          {canManage && (retired ? (
            <DangerRow
              title="Restore team"
              description="Make this retired team active again"
              action="Restore…"
              onClick={() => setRestoreOpen(true)}
            />
          ) : (
            <DangerRow
              title="Retire team"
              description="Move this team to Retired while keeping its members and ad accounts"
              action="Retire…"
              onClick={() => setRetireOpen(true)}
            />
          ))}
          {canManage && (
            <DangerRow
              title="Delete team"
              description="Delete this team, with a 30-day restoration window"
              action="Delete…"
              onClick={() => setDeleteOpen(true)}
            />
          )}
        </section>
      </div>}

      <ConfirmDialog
        open={leaveOpen}
        title={`Leave ${team.name}?`}
        description="You can rejoin the team at any time from its Members page."
        confirmLabel="Leave"
        onCancel={() => setLeaveOpen(false)}
        onConfirm={() => {
          setLeaveOpen(false);
          void run(
            () => removeTeamMember(workspace.id, team.id, user.id!),
            `You left ${team.name}`,
            "Couldn't leave the team",
          );
        }}
      />
      <ConfirmDialog
        open={retireOpen}
        title={`Retire the ${team.name} team?`}
        description="The team moves to Retired with its members and ad accounts. You can restore it at any time."
        confirmLabel="Retire team"
        onCancel={() => setRetireOpen(false)}
        onConfirm={() => {
          setRetireOpen(false);
          void run(
            () => retireTeam(workspace.id, team.id),
            `${team.name} was retired`,
            "Couldn't retire the team",
          );
        }}
      />
      <RestoreTeamDialog
        team={restoreOpen ? team : null}
        onClose={() => setRestoreOpen(false)}
        onConfirm={() => run(
          () => restoreTeam(workspace.id, team.id),
          `${team.name} was successfully restored.`,
          "Couldn't restore the team",
        )}
      />
      <DeleteTeamDialog
        open={deleteOpen}
        team={team}
        onClose={() => setDeleteOpen(false)}
        onDelete={async () => {
          if (await run(
            () => deleteTeam(workspace.id, team.id),
            `${team.name} was deleted`,
            "Couldn't delete the team",
          )) openSettings('teams');
        }}
      />
    </>
  );
};

/** Linear's "Restore the <name> team?" for a retired or a deleted team. */
export const RestoreTeamDialog: React.FC<{
  team: TeamItem | null;
  onClose: () => void;
  onConfirm: (team: TeamItem) => Promise<unknown> | void;
}> = ({ team, onClose, onConfirm }) => {
  const shown = useLastPresent(team);
  return (
    <ConfirmDialog
      open={Boolean(team)}
      title={shown ? `Restore the ${shown.name} team?` : 'Restore team?'}
      description="Restoring this team will make it active again, with its members and ad accounts."
      confirmLabel="Restore team"
      tone="primary"
      onCancel={onClose}
      onConfirm={() => {
        if (team) void onConfirm(team);
        onClose();
      }}
    />
  );
};

/**
 * Linear's "Delete the <name> team?": what goes, the 30 days to restore it
 * from Settings › Teams, the team's name typed to confirm, and a red Delete team.
 */
const DeleteTeamDialog: React.FC<{
  open: boolean;
  team: TeamItem;
  onClose: () => void;
  onDelete: () => Promise<void>;
}> = ({ open, team, onClose, onDelete }) => {
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setTyped('');
  }, [open]);

  const matches = typed.trim() === team.name;
  const remove = async () => {
    if (!matches) return;
    setBusy(true);
    await onDelete();
    setBusy(false);
    onClose();
  };

  return (
    <ChoiceDialog
      open={open}
      title={`Delete the ${team.name} team?`}
      busy={busy}
      onClose={onClose}
      footer={(
        <>
          <Button touchHeight onClick={onClose} disabled={busy}>Cancel</Button>
          <Button touchHeight variant="danger" disabled={busy || !matches} onClick={() => void remove()}>
            Delete team
          </Button>
        </>
      )}
    >
      <p {...stylex.props(styles.deleteNote)}>
        This team will be deleted. For the next 30 days you’ll be able to restore it from{' '}
        <strong {...stylex.props(styles.strong)}>Settings</strong> ›{' '}
        <strong {...stylex.props(styles.strong)}>Teams</strong>. Its ad accounts and the people on it stay in the workspace.
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void remove();
        }}
      >
        <label htmlFor="team-delete-name" {...stylex.props(styles.deleteLabel)}>
          Type <strong {...stylex.props(styles.deleteName)}>{team.name}</strong> to confirm
        </label>
        <Input
          id="team-delete-name"
          autoFocus
          autoComplete="off"
          {...stylex.props(styles.fullWidth)}
          placeholder={team.name}
          value={typed}
          disabled={busy}
          onChange={(event) => setTyped(event.target.value)}
        />
      </form>
    </ChoiceDialog>
  );
};

/**
 * Linear's team General page: Name (beside the team icon) and Identifier in
 * one card, then Description in a box of its own. Each field saves when it
 * loses focus or on Enter; Escape puts the saved value back.
 */
const TeamGeneral: React.FC<{ workspace: Workspace; team: TeamItem }> = ({ workspace, team }) => {
  const { user } = useWorkspaceSession();
  // Only those who run the team change it; everyone else reads it.
  const readOnly = !canManageTeam(team, workspace.role, user.id);
  const [name, setName] = useState(team.name);
  const [key, setKey] = useState(team.key);
  const [description, setDescription] = useState(team.description);

  useEffect(() => setName(team.name), [team.name]);
  useEffect(() => setKey(team.key), [team.key]);
  useEffect(() => setDescription(team.description), [team.description]);

  const save = async (field: 'name' | 'key' | 'description', value: string, reset: () => void) => {
    const next = value.trim();
    if (next === team[field]) return;
    if (field !== 'description' && !next) {
      reset();
      toast.show({ tone: 'info', title: field === 'name' ? 'Team name can’t be empty' : 'Team identifier can’t be empty' });
      return;
    }
    try {
      const updated = await updateTeam(workspace.id, team.id, { [field]: next });
      notifyTeamsChanged();
      // The address names the team by its identifier: follow it to the new one.
      if (field === 'key') openTeamSettings(`${updated.key}/general`);
      toast.show({ tone: 'success', title: 'Team updated' });
    } catch (saveError) {
      reset();
      toast.error('Unable to update team', errorMessage(saveError, 'Please try again.'));
    }
  };

  const savePrivate = async (next: boolean) => {
    const title = next ? `${team.name} is now private` : `${team.name} is now public`;
    try {
      await updateTeam(workspace.id, team.id, { private: next });
      notifyTeamsChanged();
      toast.show({ tone: 'success', title });
    } catch (saveError) {
      toast.error('Unable to update team', errorMessage(saveError, 'Please try again.'));
    }
  };

  const fieldKeys = (reset: () => void) => (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') event.currentTarget.blur();
    if (event.key === 'Escape') reset();
  };

  return (
    <>
      <TeamBreadcrumb team={team} />
      <div className="preferences-title-container">
        <h1 className="preferences-page-title">General</h1>
      </div>

      <div className="preferences-section">
        <section className="preferences-card-container preferences-card-container--divided">
          <div className="preferences-row-item preferences-row-item--column-on-mobile">
            <div className="preferences-row-copy">
              <label htmlFor="team-name" className="preferences-row-title">Name</label>
            </div>
            <div {...stylex.props(styles.nameField)}>
              <span {...stylex.props(styles.nameIcon)}>
                <TeamIcon size={16} />
              </span>
              <Input
                id="team-name"
                autoComplete="off"
                className="preferences-row-input preferences-profile-input"
                maxLength={TEAM_NAME_MAX}
                readOnly={readOnly}
                value={name}
                onChange={(event) => setName(event.target.value)}
                onBlur={() => void save('name', name, () => setName(team.name))}
                onKeyDown={fieldKeys(() => setName(team.name))}
              />
            </div>
          </div>
          <div className="preferences-row-item preferences-row-item--column-on-mobile">
            <div className="preferences-row-copy">
              <label htmlFor="team-key" className="preferences-row-title">Identifier</label>
              <span className="preferences-row-desc">Used in this team’s address</span>
            </div>
            <Input
              id="team-key"
              autoComplete="off"
              spellCheck={false}
              className="preferences-row-input preferences-profile-input"
              maxLength={TEAM_KEY_MAX}
              readOnly={readOnly}
              value={key}
              onChange={(event) => setKey(cleanTeamKey(event.target.value))}
              onBlur={() => void save('key', key, () => setKey(team.key))}
              onKeyDown={fieldKeys(() => setKey(team.key))}
            />
          </div>
          {/* Linear's "Change team visibility": only those who run the team change it. */}
          <div className="preferences-row-item">
            <div className="preferences-row-copy">
              <span className="preferences-row-title">Private team</span>
              <span className="preferences-row-desc">Only members see this team, its ad accounts and their campaigns</span>
            </div>
            <BuyerlyToggle
              checked={team.private}
              label="Private team"
              disabled={readOnly}
              tooltipContent={readOnly ? 'Only team owners and admins change who sees this team' : undefined}
              onChange={readOnly ? undefined : (next) => void savePrivate(next)}
            />
          </div>
        </section>
      </div>

      <div className="preferences-section">
        <div className="preferences-section-header">
          <h3 className="preferences-section-title">Description</h3>
        </div>
        <p className="preferences-section-note">A short summary shown on the team page</p>
        <section className="preferences-card-container">
          <textarea
            aria-label="Team description"
            rows={4}
            maxLength={TEAM_DESCRIPTION_MAX}
            readOnly={readOnly}
            value={description}
            placeholder="e.g. Scales winning campaigns for the US market"
            onChange={(event) => setDescription(event.target.value)}
            onBlur={() => void save('description', description, () => setDescription(team.description))}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setDescription(team.description);
            }}
            {...stylex.props(styles.description)}
          />
        </section>
      </div>
    </>
  );
};

const SearchField: React.FC<{ value: string; placeholder: string; onChange: (value: string) => void }> = ({
  value,
  placeholder,
  onChange,
}) => (
  <label {...stylex.props(styles.search)}>
    <span {...stylex.props(styles.srOnly)}>{placeholder}</span>
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" {...stylex.props(styles.searchIcon)}>
      <path d="M7 1.5a5.5 5.5 0 0 1 4.38 8.82l3.15 3.15a.75.75 0 1 1-1.06 1.06l-3.15-3.15A5.5 5.5 0 1 1 7 1.5Zm0 1.5a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z" />
    </svg>
    <input
      type="search"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      {...stylex.props(styles.searchInput)}
    />
  </label>
);

interface PickOption {
  id: number;
  label: string;
  detail: string;
}

/**
 * Linear's "Add members to <team>": a searchable list to tick several at once,
 * Cancel and the add button, which stays off until something is ticked.
 */
const PickDialog: React.FC<{
  open: boolean;
  title: string;
  searchPlaceholder: string;
  emptyText: string;
  options: PickOption[];
  confirmLabel: string;
  onClose: () => void;
  onConfirm: (ids: number[]) => Promise<void>;
}> = ({ open, title, searchPlaceholder, emptyText, options, confirmLabel, onClose, onConfirm }) => {
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setPicked([]);
  }, [open]);

  const needle = query.trim().toLowerCase();
  const shown = options.filter((option) => !needle
    || option.label.toLowerCase().includes(needle)
    || option.detail.toLowerCase().includes(needle));

  const confirm = async () => {
    setBusy(true);
    await onConfirm(picked);
    setBusy(false);
    onClose();
  };

  return (
    <ChoiceDialog
      open={open}
      wide
      title={title}
      busy={busy}
      onClose={onClose}
      footer={(
        <>
          <Button touchHeight onClick={onClose} disabled={busy}>Cancel</Button>
          <Button touchHeight variant="primary" disabled={busy || picked.length === 0} onClick={() => void confirm()}>
            {confirmLabel}
          </Button>
        </>
      )}
    >
      <Input
        aria-label={searchPlaceholder}
        autoFocus
        autoComplete="off"
        {...stylex.props(styles.searchSpaced)}
        placeholder={searchPlaceholder}
        value={query}
        disabled={busy}
        onChange={(event) => setQuery(event.target.value)}
      />
      <div role="group" aria-label={title} {...stylex.props(styles.pickList)}>
        {shown.length === 0 && (
          <p {...stylex.props(styles.pickEmpty)}>{options.length ? 'No matches' : emptyText}</p>
        )}
        {shown.map((option) => (
          <label
            key={option.id}
            {...stylex.props(styles.pickOption)}
          >
            <input
              type="checkbox"
              aria-label={option.label}
              checked={picked.includes(option.id)}
              disabled={busy}
              onChange={(event) => setPicked((current) => (
                event.target.checked ? [...current, option.id] : current.filter((id) => id !== option.id)
              ))}
              {...stylex.props(styles.checkbox)}
            />
            <span {...stylex.props(styles.minWidth0)}>
              <span {...stylex.props(styles.primaryText)}>{option.label}</span>
              <span {...stylex.props(styles.detailText)}>{option.detail}</span>
            </span>
          </label>
        ))}
      </div>
    </ChoiceDialog>
  );
};

/**
 * Linear's "Team members": search by name or email, Add a member, and Name /
 * Email / Role rows. Your own row's menu leaves the team; another member's
 * removes them from it, at once, as Linear does.
 */
const TeamMembers: React.FC<{ workspace: Workspace; team: TeamItem }> = ({ workspace, team }) => {
  const { user } = useWorkspaceSession();
  const canManage = canManageTeam(team, workspace.role, user.id);
  const [members, setMembers] = useState<MemberItem[] | null>(null);
  const [query, setQuery] = useState('');
  const [addOpen, setAddOpen] = useState(false);

  useEffect(() => {
    fetchWorkspaceMembers(workspace.id).then(setMembers).catch(() => setMembers([]));
  }, [workspace.id]);

  const onTeam = useMemo(() => {
    const byId = new Map((members || []).map((member) => [member.user_id, member]));
    return team.member_user_ids.map((id) => byId.get(id)).filter((member): member is MemberItem => Boolean(member));
  }, [members, team.member_user_ids]);
  const needle = query.trim().toLowerCase();
  const visible = onTeam.filter((member) => !needle
    || memberName(member).toLowerCase().includes(needle)
    || (member.email || '').toLowerCase().includes(needle));
  const candidates = (members || []).filter((member) => !team.member_user_ids.includes(member.user_id));

  const remove = async (member: MemberItem) => {
    const title = member.is_current_user ? `You left ${team.name}` : `${memberName(member)} was removed from ${team.name}`;
    try {
      await removeTeamMember(workspace.id, team.id, member.user_id);
      toast.show({ tone: 'success', title });
      notifyTeamsChanged();
    } catch (removeError) {
      toast.error("Couldn't remove from team", errorMessage(removeError, 'Please try again.'));
    }
  };

  /** Linear's "Make team owner" / "Remove team owner". */
  const setOwner = async (member: MemberItem, isOwner: boolean) => {
    const title = isOwner ? `${memberName(member)} is now a team owner` : `${memberName(member)} is no longer a team owner`;
    try {
      await setTeamOwner(workspace.id, team.id, member.user_id, isOwner);
      toast.show({ tone: 'success', title });
      notifyTeamsChanged();
    } catch (ownerError) {
      toast.error("Couldn't change the team owner", errorMessage(ownerError, 'Please try again.'));
    }
  };

  return (
    <>
      <TeamBreadcrumb team={team} />
      <div className="preferences-title-container">
        <h1 className="preferences-page-title">Team members</h1>
      </div>
      <div {...stylex.props(styles.toolbar)}>
        <SearchField value={query} onChange={setQuery} placeholder="Search by name or email" />
        <div {...stylex.props(styles.spacer)} />
        {canManage && <Button variant="primary" xstyle={styles.noShrink} onClick={() => setAddOpen(true)}>Add a member</Button>}
      </div>

      {members === null ? (
        <DataState title="Loading members…" detail="Reading the people on this team." />
      ) : (
        <div {...stylex.props(styles.table)} role="table" aria-label="Team members">
          <div role="row" {...stylex.props(styles.grid, styles.memberGrid, styles.headerRow)}>
            <span role="columnheader">Name</span>
            <span role="columnheader">Email</span>
            <span role="columnheader" {...stylex.props(styles.wideOnly)}>Role</span>
            <span role="columnheader" {...stylex.props(styles.srOnly)}>Actions</span>
          </div>
          {visible.map((member) => (
            <div key={member.user_id} role="row" {...stylex.props(styles.grid, styles.memberGrid, styles.row, rowMarker)}>
              <span role="cell" {...stylex.props(styles.person)}>
                <Initials label={memberName(member)} avatarUrl={member.avatar_url} />
                <span {...stylex.props(styles.minWidth0)}>
                  <span {...stylex.props(styles.name)}>{memberName(member)}</span>
                  <span {...stylex.props(styles.detailText)}>{member.username}</span>
                </span>
              </span>
              <span role="cell" {...stylex.props(styles.truncate, styles.secondary)}>{member.email || ''}</span>
              <span role="cell" {...stylex.props(styles.wideOnly, styles.secondary)}>
                {team.owner_user_ids.includes(member.user_id) ? <RoleStatus role="team-owner" /> : <RoleStatus role={member.role} />}
              </span>
              <span role="cell" {...stylex.props(styles.actions)}>
                {(canManage || member.is_current_user) && (
                  <RowMenu label={`Member actions for ${memberName(member)}`}>
                    {canManage && member.role !== 'guest' && (
                      team.owner_user_ids.includes(member.user_id) ? (
                        <DropdownMenuItem onSelect={() => void setOwner(member, false)}>
                          <span {...stylex.props(styles.truncate)}>Remove team owner</span>
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem onSelect={() => void setOwner(member, true)}>
                          <span {...stylex.props(styles.truncate)}>Make team owner</span>
                        </DropdownMenuItem>
                      )
                    )}
                    {(canManage || member.is_current_user) && (
                      <DropdownMenuItem onSelect={() => void remove(member)}>
                        <span {...stylex.props(styles.truncate)}>{member.is_current_user ? 'Leave team' : 'Remove from team'}</span>
                      </DropdownMenuItem>
                    )}
                  </RowMenu>
                )}
              </span>
            </div>
          ))}
          {visible.length === 0 && (
            <DataState
              title={needle ? 'No members found' : 'No members yet'}
              detail={needle ? 'Nobody on this team matches.' : 'Add the people who work on this team’s ad accounts.'}
            />
          )}
        </div>
      )}

      <PickDialog
        open={addOpen}
        title={`Add members to ${team.name}`}
        searchPlaceholder="Search members…"
        emptyText="Everyone in the workspace is on this team."
        confirmLabel="Add members"
        options={candidates.map((member) => ({
          id: member.user_id,
          label: memberName(member),
          detail: member.email || member.username,
        }))}
        onClose={() => setAddOpen(false)}
        onConfirm={async (ids) => {
          const title = ids.length === 1 ? 'Member added' : `${ids.length} members added`;
          try {
            await addTeamMembers(workspace.id, team.id, ids);
            toast.show({ tone: 'success', title });
            notifyTeamsChanged();
          } catch (addError) {
            toast.error("Couldn't add members", errorMessage(addError, 'Please try again.'));
          }
        }}
      />
    </>
  );
};

/**
 * The team's ad accounts, Buyerly's counterpart of Linear's team issues:
 * search, Add ad accounts, and Name / Account ID / Status rows that each
 * come off the team from their menu.
 */
const TeamAccounts: React.FC<{ workspace: Workspace; team: TeamItem }> = ({ workspace, team }) => {
  const { user } = useWorkspaceSession();
  const canManage = canManageTeam(team, workspace.role, user.id);
  const [accounts, setAccounts] = useState<MetaAccount[] | null>(null);
  const [query, setQuery] = useState('');
  const [addOpen, setAddOpen] = useState(false);

  useEffect(() => {
    fetchAccounts().then(setAccounts).catch(() => setAccounts([]));
  }, [workspace.id]);

  const onTeam = useMemo(() => {
    const byId = new Map((accounts || []).map((account) => [account.id, account]));
    return team.account_ids.map((id) => byId.get(id)).filter((account): account is MetaAccount => Boolean(account));
  }, [accounts, team.account_ids]);
  const needle = query.trim().toLowerCase();
  const visible = onTeam.filter((account) => !needle
    || accountName(account).toLowerCase().includes(needle)
    || account.account_id.toLowerCase().includes(needle));
  const candidates = (accounts || []).filter((account) => account.id != null && !team.account_ids.includes(account.id));

  const remove = async (account: MetaAccount) => {
    try {
      await removeTeamAccount(workspace.id, team.id, account.id!);
      toast.show({ tone: 'success', title: `${accountName(account)} was removed from ${team.name}` });
      notifyTeamsChanged();
    } catch (removeError) {
      toast.error("Couldn't remove the ad account", errorMessage(removeError, 'Please try again.'));
    }
  };

  return (
    <>
      <TeamBreadcrumb team={team} />
      <div className="preferences-title-container">
        <h1 className="preferences-page-title">Ad accounts</h1>
      </div>
      <div {...stylex.props(styles.toolbar)}>
        <SearchField value={query} onChange={setQuery} placeholder="Search by name or ID" />
        <div {...stylex.props(styles.spacer)} />
        {canManage && <Button variant="primary" xstyle={styles.noShrink} onClick={() => setAddOpen(true)}>Add ad accounts</Button>}
      </div>

      {accounts === null ? (
        <DataState title="Loading ad accounts…" detail="Reading the ad accounts of this team." />
      ) : (
        <div {...stylex.props(styles.table)} role="table" aria-label="Team ad accounts">
          <div role="row" {...stylex.props(styles.grid, styles.accountGrid, styles.headerRow)}>
            <span role="columnheader">Name</span>
            <span role="columnheader" {...stylex.props(styles.wideOnly)}>Account ID</span>
            <span role="columnheader" {...stylex.props(styles.wideOnly)}>Status</span>
            <span role="columnheader" {...stylex.props(styles.srOnly)}>Actions</span>
          </div>
          {visible.map((account) => (
            <div key={account.id} role="row" {...stylex.props(styles.grid, styles.accountGrid, styles.row, rowMarker)}>
              <span role="cell" {...stylex.props(styles.truncate, styles.nameInline)}>{accountName(account)}</span>
              <span role="cell" {...stylex.props(styles.wideOnly, styles.truncate, styles.secondary)}>{account.account_id}</span>
              <span role="cell" {...stylex.props(styles.wideOnly, styles.truncate, styles.secondary)}>
                {account.is_active === false ? 'Off in Buyerly' : (account.status_label || '').replace(/\s*\(.*\)$/, '') || 'Active'}
              </span>
              <span role="cell" {...stylex.props(styles.actions)}>
                {canManage && (
                  <RowMenu label={`Ad account actions for ${accountName(account)}`}>
                    <DropdownMenuItem onSelect={() => void remove(account)}>
                      <span {...stylex.props(styles.truncate)}>Remove from team</span>
                    </DropdownMenuItem>
                  </RowMenu>
                )}
              </span>
            </div>
          ))}
          {visible.length === 0 && (
            <DataState
              title={needle ? 'No ad accounts found' : 'No ad accounts yet'}
              detail={needle ? 'No ad account on this team matches.' : 'Add the ad accounts this team works on.'}
            />
          )}
        </div>
      )}

      <PickDialog
        open={addOpen}
        title={`Add ad accounts to ${team.name}`}
        searchPlaceholder="Search ad accounts…"
        emptyText="Every ad account of the workspace is on this team."
        confirmLabel="Add ad accounts"
        options={candidates.map((account) => ({
          id: account.id as number,
          label: accountName(account),
          detail: account.account_id,
        }))}
        onClose={() => setAddOpen(false)}
        onConfirm={async (ids) => {
          const title = ids.length === 1 ? 'Ad account added' : `${ids.length} ad accounts added`;
          try {
            await addTeamAccounts(workspace.id, team.id, ids);
            toast.show({ tone: 'success', title });
            notifyTeamsChanged();
          } catch (addError) {
            toast.error("Couldn't add ad accounts", errorMessage(addError, 'Please try again.'));
          }
        }}
      />
    </>
  );
};
