import React, { useEffect, useMemo, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { fetchWorkspaceMembers } from '@/models/queries';
import type { Workspace } from '@/lib/types';
import { BuyerlyCheckIcon } from '@/icons/BuyerlyIcons';
import {
  TEAM_FILTER_LABELS,
  notifyTeamsChanged,
  restoreTeam,
  useTeams,
  type TeamFilter,
  type TeamItem,
} from '@/lib/teams';
import { DataState } from '@/ui/DataState';
import { SubmenuArrow } from '@/ui/SubmenuArrow';
import { Tooltip } from '@/ui/Tooltip';
import { withClassName } from '@/ui/withClassName';
import { toast } from '@/ui/toast';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/ui/DropdownMenu';
import { errorMessage, memberName, type MemberItem } from './MemberDialogs';
import { RowMenu, shortDate } from './MembersSection';
import { SortHeader, sortedBy, useListSort } from './SettingsListSort';
import { TeamIcon } from './TeamIcon';
import { RestoreTeamDialog } from './TeamSettingsSection';
import { colors } from '@/styles/tokens.stylex';
import { openSettings, openTeamSettings } from '@/lib/routing';

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
  teamLink: {
    textDecorationLine: {
      default: null,
      ':focus-visible': 'underline',
    },
  },
  medium: {
    fontWeight: 500,
  },
  actions: {
    display: 'flex',
    justifyContent: 'flex-end',
  },
  note: {
    marginTop: 12,
    paddingLeft: 8,
    paddingRight: 8,
    fontSize: 12,
    color: colors['--text-tertiary'],
  },
});

/**
 * Linear's Teams table: Name, Visibility, Members, Issues, Created; Buyerly
 * counts ad accounts, not issues. A phone keeps Name and Members.
 */
/** The team's pages, as Linear's row menu lists them under Settings ›. */
const TEAM_SETTINGS_PAGES: Array<{ path: string; label: string }> = [
  { path: '', label: 'Overview' },
  { path: 'general', label: 'General' },
  { path: 'members', label: 'Members' },
  { path: 'accounts', label: 'Ad accounts' },
];

/**
 * Settings → Administration → Teams, as Linear's: "Filter by name…", the
 * Active / Retired / Recently deleted filter and Create team over the table
 * (no Export CSV). A row opens the team; its menu opens the team's pages, or
 * restores a retired or deleted team. The member count lists the members on hover.
 */
export const TeamsSection: React.FC<{ workspace: Workspace }> = ({ workspace }) => {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<TeamFilter>('active');
  const { teams, error, refresh } = useTeams(workspace.id, filter);
  const [members, setMembers] = useState<MemberItem[]>([]);
  const [restoreTarget, setRestoreTarget] = useState<TeamItem | null>(null);

  useEffect(() => {
    fetchWorkspaceMembers(workspace.id).then(setMembers).catch(() => setMembers([]));
  }, [workspace.id]);

  const membersById = useMemo(() => new Map(members.map((member) => [member.user_id, member])), [members]);
  const needle = query.trim().toLowerCase();
  const [sort, toggleSort] = useListSort<'name' | 'visibility' | 'members' | 'accounts' | 'created'>('name');
  const visible = sortedBy((teams || []).filter((team) => !needle
    || team.name.toLowerCase().includes(needle)
    || team.key.toLowerCase().includes(needle)), (team) => {
    if (sort.key === 'members') return team.member_user_ids.length;
    if (sort.key === 'accounts') return team.account_ids.length;
    if (sort.key === 'created') return Date.parse(filter === 'deleted' && team.deleted_at ? team.deleted_at : team.created_at);
    if (sort.key === 'visibility') return 'Workspace';
    return team.name;
  }, sort.direction);

  const restore = async (team: TeamItem) => {
    try {
      await restoreTeam(workspace.id, team.id);
      toast.show({ tone: 'success', title: `${team.name} was successfully restored.` });
      notifyTeamsChanged();
    } catch (restoreError) {
      toast.error("Couldn't restore the team", errorMessage(restoreError, 'Please try again.'));
    }
  };

  return (
    <>
      <div className="preferences-title-container">
        <h1 className="preferences-page-title">Teams</h1>
      </div>

      <div className="settings-list-toolbar">
        <label className="settings-list-search">
          <span {...stylex.props(styles.srOnly)}>Filter by name…</span>
          <svg viewBox="0 0 16 16" aria-hidden="true" className="settings-list-search-icon">
            <path d="M7 1.5a5.5 5.5 0 0 1 4.38 8.82l3.15 3.15a.75.75 0 1 1-1.06 1.06l-3.15-3.15A5.5 5.5 0 1 1 7 1.5Zm0 1.5a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z" />
          </svg>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter by name…"
            className="settings-list-search-input"
          />
        </label>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" aria-label={`Show teams: ${TEAM_FILTER_LABELS[filter]}`} className="settings-list-select">
              {TEAM_FILTER_LABELS[filter]}
              <svg width="10" height="5" viewBox="0 0 9 5" aria-hidden="true">
                <path d="M1.915.557a.667.667 0 0 0-.943.943l2.862 2.862a.942.942 0 0 0 1.333 0L8.028 1.5a.667.667 0 0 0-.943-.943L4.5 3.14 1.915.557Z" />
              </svg>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" sideOffset={4}>
            <div {...stylex.props(styles.menuGap)} />
            <DropdownMenuRadioGroup value={filter} onValueChange={(value) => setFilter(value as TeamFilter)}>
              {(Object.keys(TEAM_FILTER_LABELS) as TeamFilter[]).map((key) => (
                <DropdownMenuRadioItem key={key} value={key}>
                  <span {...stylex.props(styles.truncate)}>{TEAM_FILTER_LABELS[key]}</span>
                  {filter === key && <BuyerlyCheckIcon size={14} />}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
            <div {...stylex.props(styles.menuGap)} />
          </DropdownMenuContent>
        </DropdownMenu>
        <div {...stylex.props(styles.spacer)} />
        <button type="button" className="settings-list-button settings-list-button--primary" onClick={() => openSettings('new-team')}>
          Create team
        </button>
      </div>

      {error && (
        <DataState title="Couldn't load teams" detail={error} role="alert" actionLabel="Retry" onAction={() => void refresh()} />
      )}
      {!error && teams === null && <DataState title="Loading teams…" detail="Reading the teams in this workspace." />}

      {!error && teams !== null && (
        <>
          <div className="settings-list-table settings-list--teams" role="table" aria-label="Teams">
            <div role="row" className="settings-list-row settings-list-row--header">
              <SortHeader label="Name" column="name" sort={sort} onSort={toggleSort} />
              <SortHeader label="Visibility" column="visibility" sort={sort} onSort={toggleSort} className="settings-list-col-wide" />
              <SortHeader label="Members" column="members" sort={sort} onSort={toggleSort} />
              <SortHeader label="Accounts" column="accounts" sort={sort} onSort={toggleSort} className="settings-list-col-wide" />
              <SortHeader
                label={filter === 'deleted' ? 'Deleted' : 'Created'}
                column="created"
                sort={sort}
                onSort={toggleSort}
                className="settings-list-col-wide"
              />
              <span role="columnheader" {...stylex.props(styles.srOnly)}>Actions</span>
            </div>
            {visible.length > 0 && (
              <div className="settings-list-group">
                {TEAM_FILTER_LABELS[filter]}
                <span className="settings-list-group-count">{visible.length}</span>
              </div>
            )}
            {visible.map((team) => {
              const names = team.member_user_ids
                .map((id) => membersById.get(id))
                .filter((member): member is MemberItem => Boolean(member))
                .map(memberName);
              const openable = filter !== 'deleted';
              return (
                <div
                  key={team.id}
                  role="row"
                  className="settings-list-row"
                  onClick={openable ? () => openTeamSettings(team.key) : undefined}
                >
                  <span role="cell" className="settings-list-team">
                    <TeamIcon />
                    {openable ? (
                      <a
                        href={`#team-${team.key}`}
                        {...withClassName(stylex.props(styles.teamLink), 'settings-list-team-name')}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          openTeamSettings(team.key);
                        }}
                      >
                        {team.name}
                      </a>
                    ) : (
                      <span className="settings-list-team-name">{team.name}</span>
                    )}
                    <span className="settings-list-team-key">{team.key}</span>
                  </span>
                  <span role="cell" {...withClassName(stylex.props(styles.medium), 'settings-list-cell settings-list-col-wide')}>Workspace</span>
                  <span role="cell" {...withClassName(stylex.props(styles.medium), 'settings-list-cell')}>
                    {names.length > 0 ? (
                      <Tooltip content={names.join(', ')} side="top">
                        <span>{team.member_user_ids.length}</span>
                      </Tooltip>
                    ) : team.member_user_ids.length}
                  </span>
                  <span role="cell" {...withClassName(stylex.props(styles.medium), 'settings-list-cell settings-list-col-wide')}>{team.account_ids.length}</span>
                  <span role="cell" className="settings-list-cell settings-list-col-wide">
                    {shortDate(filter === 'deleted' && team.deleted_at ? team.deleted_at : team.created_at)}
                  </span>
                  <span role="cell" {...stylex.props(styles.actions)} onClick={(event) => event.stopPropagation()}>
                    <RowMenu label={`Team actions for ${team.name}`} visible>
                      {openable && (
                        <DropdownMenuSub>
                          <DropdownMenuSubTrigger>
                            <span {...stylex.props(styles.truncate)}>Settings</span>
                            <SubmenuArrow />
                          </DropdownMenuSubTrigger>
                          <DropdownMenuSubContent>
                            {TEAM_SETTINGS_PAGES.map((page) => (
                              <DropdownMenuItem
                                key={page.label}
                                onSelect={() => openTeamSettings(page.path ? `${team.key}/${page.path}` : team.key)}
                              >
                                <span {...stylex.props(styles.truncate)}>{page.label}</span>
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuSubContent>
                        </DropdownMenuSub>
                      )}
                      {openable && team.retired_at && <DropdownMenuSeparator />}
                      {(filter === 'deleted' || team.retired_at) && (
                        <DropdownMenuItem onSelect={() => setRestoreTarget(team)}>
                          <span {...stylex.props(styles.truncate)}>Restore team…</span>
                        </DropdownMenuItem>
                      )}
                    </RowMenu>
                  </span>
                </div>
              );
            })}
          </div>
          {visible.length === 0 && (
            <DataState
              title={needle ? 'No teams found' : filter === 'active' ? 'No teams yet' : `No ${TEAM_FILTER_LABELS[filter].toLowerCase()} teams`}
              detail={needle
                ? 'No team matches this name.'
                : filter === 'active'
                  ? 'A team groups the members and the ad accounts they work on. Everyone in the workspace still sees all of it.'
                  : filter === 'retired'
                    ? 'Retired teams keep their members and ad accounts and can be restored at any time.'
                    : 'Deleted teams stay here for 30 days and can be restored.'}
              actionLabel={!needle && filter === 'active' ? 'Create team' : undefined}
              onAction={!needle && filter === 'active' ? () => openSettings('new-team') : undefined}
            />
          )}
          {filter === 'deleted' && visible.length > 0 && (
            <p {...stylex.props(styles.note)}>
              Deleted teams can be restored for 30 days, then they are gone for good.
            </p>
          )}
        </>
      )}

      <RestoreTeamDialog
        team={restoreTarget}
        onClose={() => setRestoreTarget(null)}
        onConfirm={(team) => restore(team)}
      />
    </>
  );
};
