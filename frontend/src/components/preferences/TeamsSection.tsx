import React, { useEffect, useMemo, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { fetchWorkspaceMembers } from '@/models/queries';
import type { Workspace } from '@/lib/types';
import { BuyerlyIcon } from '@/icons/BuyerlyIcon';
import { BuyerlyChevronGlyph } from '@/icons/BuyerlyIcons';
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
import { canAdministerWorkspace } from '@/lib/settingsPages';
import { preferencesStyles } from './preferencesStyles';
import css from './Preferences.module.css';

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
  // As Members': a phone keeps Create team only.
  exportButton: {
    display: {
      default: null,
      '@media not all and (min-width: 640px)': 'none',
    },
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

const csvCell = (value: string) => (/[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);

/** Linear's Export CSV on Teams: the teams the filter shows, whatever the search. */
function downloadTeamsCsv(workspace: Workspace, teams: TeamItem[]) {
  const rows = [
    ['Name', 'Identifier', 'Visibility', 'Members', 'Ad accounts', 'Created'],
    ...teams.map((team) => [
      team.name,
      team.key,
      team.private ? 'Private' : 'Workspace',
      String(team.member_user_ids.length),
      String(team.account_ids.length),
      team.created_at,
    ]),
  ];
  const blob = new Blob([`${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${workspace.slug}-teams.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Settings → Administration → Teams, as Linear's: "Filter by name…", the
 * Active / Retired / Recently deleted filter, Export CSV for admins and Create team over the table. A row opens the team; its menu opens the team's pages, or
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
      <div {...stylex.props(preferencesStyles.titleContainer, preferencesStyles.titleContainerWide)}>
        <h1 {...stylex.props(preferencesStyles.pageTitle)}>Teams</h1>
      </div>

      <div {...stylex.props(preferencesStyles.listToolbar)}>
        <label {...stylex.props(preferencesStyles.listSearch)}>
          <span {...stylex.props(styles.srOnly)}>Filter by name…</span>
          <BuyerlyIcon name="search" {...stylex.props(preferencesStyles.listSearchIcon)} />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter by name…"
            {...withClassName(stylex.props(preferencesStyles.listSearchInput), css.searchInput)}
          />
        </label>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={`Show teams: ${TEAM_FILTER_LABELS[filter]}`}
              {...withClassName(stylex.props(preferencesStyles.listSelect), css.listSelect)}
            >
              {TEAM_FILTER_LABELS[filter]}
              <BuyerlyChevronGlyph />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" sideOffset={4}>
            <div {...stylex.props(styles.menuGap)} />
            <DropdownMenuRadioGroup value={filter} onValueChange={(value) => setFilter(value as TeamFilter)}>
              {(Object.keys(TEAM_FILTER_LABELS) as TeamFilter[]).map((key) => (
                <DropdownMenuRadioItem key={key} value={key}>
                  <span {...stylex.props(styles.truncate)}>{TEAM_FILTER_LABELS[key]}</span>
                  {filter === key && <BuyerlyIcon name="check" size={14} />}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
            <div {...stylex.props(styles.menuGap)} />
          </DropdownMenuContent>
        </DropdownMenu>
        <div {...stylex.props(styles.spacer)} />
        {canAdministerWorkspace({ role: workspace.role }) && teams && (
          <button
            type="button"
            {...stylex.props(preferencesStyles.listButton, styles.exportButton)}
            onClick={() => downloadTeamsCsv(workspace, teams)}
          >
            Export CSV
          </button>
        )}
        <button
          type="button"
          {...stylex.props(preferencesStyles.listButton, preferencesStyles.listButtonPrimary)}
          onClick={() => openSettings('new-team')}
        >
          Create team
        </button>
      </div>

      {error && (
        <DataState title="Couldn't load teams" detail={error} role="alert" actionLabel="Retry" onAction={() => void refresh()} />
      )}
      {!error && teams === null && <DataState title="Loading teams…" detail="Reading the teams in this workspace." />}

      {!error && teams !== null && (
        <>
          <div {...stylex.props(preferencesStyles.listTable)} role="table" aria-label="Teams">
            <div
              role="row"
              {...withClassName(
                stylex.props(preferencesStyles.listRow, preferencesStyles.listRowTeams, preferencesStyles.listRowHeader),
                css.listRow,
              )}
            >
              <SortHeader label="Name" column="name" sort={sort} onSort={toggleSort} />
              <SortHeader label="Visibility" column="visibility" sort={sort} onSort={toggleSort} xstyle={preferencesStyles.listColWide} />
              <SortHeader label="Members" column="members" sort={sort} onSort={toggleSort} />
              <SortHeader label="Accounts" column="accounts" sort={sort} onSort={toggleSort} xstyle={preferencesStyles.listColWide} />
              <SortHeader
                label={filter === 'deleted' ? 'Deleted' : 'Created'}
                column="created"
                sort={sort}
                onSort={toggleSort}
                xstyle={preferencesStyles.listColWide}
              />
              <span role="columnheader" {...stylex.props(styles.srOnly)}>Actions</span>
            </div>
            {visible.length > 0 && (
              <div {...stylex.props(preferencesStyles.listGroup)}>
                {TEAM_FILTER_LABELS[filter]}
                <span {...stylex.props(preferencesStyles.listGroupCount)}>{visible.length}</span>
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
                  {...withClassName(
                    stylex.props(preferencesStyles.listRow, preferencesStyles.listRowTeams, preferencesStyles.listRowCompact),
                    `${css.listRow} ${css.listRowInteractive}`,
                  )}
                  onClick={openable ? () => openTeamSettings(team.key) : undefined}
                >
                  <span role="cell" {...stylex.props(preferencesStyles.listTeam)}>
                    <TeamIcon />
                    {openable ? (
                      <a
                        href={`#team-${team.key}`}
                        {...stylex.props(preferencesStyles.listTeamName, styles.teamLink)}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          openTeamSettings(team.key);
                        }}
                      >
                        {team.name}
                      </a>
                    ) : (
                      <span {...stylex.props(preferencesStyles.listTeamName)}>{team.name}</span>
                    )}
                    <span {...stylex.props(preferencesStyles.listTeamKey)}>{team.key}</span>
                  </span>
                  <span role="cell" {...stylex.props(preferencesStyles.listCell, preferencesStyles.listColWide, styles.medium)}>Workspace</span>
                  <span role="cell" {...stylex.props(preferencesStyles.listCell, styles.medium)}>
                    {names.length > 0 ? (
                      <Tooltip content={names.join(', ')} side="top">
                        <span>{team.member_user_ids.length}</span>
                      </Tooltip>
                    ) : team.member_user_ids.length}
                  </span>
                  <span role="cell" {...stylex.props(preferencesStyles.listCell, preferencesStyles.listColWide, styles.medium)}>{team.account_ids.length}</span>
                  <span role="cell" {...stylex.props(preferencesStyles.listCell, preferencesStyles.listColWide)}>
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
