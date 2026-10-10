import React, { useEffect, useMemo, useState } from 'react';
import { apiRequest } from '@/lib/api';
import type { Workspace } from '@/lib/types';
import { useAppStore } from '@/store/useAppStore';
import { LinearCheckIcon } from '@/icons/LinearIcons';
import {
  TEAM_FILTER_LABELS,
  notifyTeamsChanged,
  teamsPath,
  useTeams,
  type TeamFilter,
  type TeamItem,
} from '@/lib/teams';
import { Button } from '@/ui/Button';
import { DataState } from '@/ui/DataState';
import { SubmenuArrow } from '@/ui/SubmenuArrow';
import { Tooltip } from '@/ui/Tooltip';
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
import { GroupHeader, RowMenu, shortDate } from './MembersSection';
import { TeamIcon } from './TeamIcon';
import { RestoreTeamDialog } from './TeamSettingsSection';

/**
 * Linear's Teams table: Name, Visibility, Members, Issues, Created; Buyerly
 * counts ad accounts, not issues. A phone keeps Name and Members.
 */
const ROW_GRID = 'grid grid-cols-[minmax(0,1fr)_72px_28px] sm:grid-cols-[minmax(0,2.4fr)_minmax(88px,1fr)_72px_72px_72px_28px] items-center gap-3';

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
  const { setSettingsSection, openTeamSettings } = useAppStore();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<TeamFilter>('active');
  const { teams, error, refresh } = useTeams(workspace.id, filter);
  const [members, setMembers] = useState<MemberItem[]>([]);
  const [restoreTarget, setRestoreTarget] = useState<TeamItem | null>(null);

  useEffect(() => {
    apiRequest<MemberItem[]>(`/api/workspaces/${workspace.id}/members`).then(setMembers).catch(() => setMembers([]));
  }, [workspace.id]);

  const membersById = useMemo(() => new Map(members.map((member) => [member.user_id, member])), [members]);
  const needle = query.trim().toLowerCase();
  const visible = (teams || []).filter((team) => !needle
    || team.name.toLowerCase().includes(needle)
    || team.key.toLowerCase().includes(needle));

  const restore = async (team: TeamItem) => {
    try {
      await apiRequest(teamsPath(workspace.id, `/${team.id}/restore`), { method: 'POST' });
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

      <div className="flex items-center gap-2">
        <label className="relative flex h-8 w-[244px] min-w-0 max-w-full flex-1 items-center sm:flex-none">
          <span className="sr-only">Filter by name…</span>
          <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" className="pointer-events-none absolute left-2.5 fill-[var(--text-tertiary)]">
            <path d="M7 1.5a5.5 5.5 0 0 1 4.38 8.82l3.15 3.15a.75.75 0 1 1-1.06 1.06l-3.15-3.15A5.5 5.5 0 1 1 7 1.5Zm0 1.5a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z" />
          </svg>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter by name…"
            className="h-8 w-full rounded-[6px] border border-[var(--color-border-secondary)] bg-transparent pl-8 pr-2 text-[13px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)] focus:border-[var(--action-primary)]"
          />
        </label>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button aria-label={`Show teams: ${TEAM_FILTER_LABELS[filter]}`} className="shrink-0 gap-1.5">
              {TEAM_FILTER_LABELS[filter]}
              <svg width="9" height="5" viewBox="0 0 9 5" fill="currentColor" aria-hidden="true">
                <path d="M1.915.557a.667.667 0 0 0-.943.943l2.862 2.862a.942.942 0 0 0 1.333 0L8.028 1.5a.667.667 0 0 0-.943-.943L4.5 3.14 1.915.557Z" />
              </svg>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" sideOffset={4}>
            <div className="h-[6px] w-full" />
            <DropdownMenuRadioGroup value={filter} onValueChange={(value) => setFilter(value as TeamFilter)}>
              {(Object.keys(TEAM_FILTER_LABELS) as TeamFilter[]).map((key) => (
                <DropdownMenuRadioItem key={key} value={key}>
                  <span className="truncate">{TEAM_FILTER_LABELS[key]}</span>
                  {filter === key && <LinearCheckIcon size={14} />}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
            <div className="h-[6px] w-full" />
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="flex-1" />
        <Button variant="primary" className="shrink-0" onClick={() => setSettingsSection('new-team')}>Create team</Button>
      </div>

      {error && (
        <DataState title="Couldn't load teams" detail={error} role="alert" actionLabel="Retry" onAction={() => void refresh()} />
      )}
      {!error && teams === null && <DataState title="Loading teams…" detail="Reading the teams in this workspace." />}

      {!error && teams !== null && (
        <>
          <div className="mt-6 text-[13px]" role="table" aria-label="Teams">
            <div role="row" className={`${ROW_GRID} h-8 px-2 text-[12px] font-medium text-[var(--text-secondary)]`}>
              <span role="columnheader">Name</span>
              <span role="columnheader" className="hidden sm:block">Visibility</span>
              <span role="columnheader">Members</span>
              <span role="columnheader" className="hidden sm:block">Accounts</span>
              <span role="columnheader" className="hidden sm:block">{filter === 'deleted' ? 'Deleted' : 'Created'}</span>
              <span role="columnheader" className="sr-only">Actions</span>
            </div>
            {visible.length > 0 && <GroupHeader label={TEAM_FILTER_LABELS[filter]} count={visible.length} />}
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
                  className={`${ROW_GRID} group h-11 rounded-[4px] px-2 ${openable ? 'hover:bg-[var(--item-hover-bg)]' : ''}`}
                  onClick={openable ? () => openTeamSettings(team.key) : undefined}
                >
                  <span role="cell" className="flex min-w-0 items-center gap-2">
                    <TeamIcon />
                    {openable ? (
                      <a
                        href={`#team-${team.key}`}
                        className="truncate font-medium text-[var(--text-primary)] outline-none focus-visible:underline"
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          openTeamSettings(team.key);
                        }}
                      >
                        {team.name}
                      </a>
                    ) : (
                      <span className="truncate font-medium text-[var(--text-primary)]">{team.name}</span>
                    )}
                    <span className="shrink-0 font-medium text-[var(--text-tertiary)]">{team.key}</span>
                  </span>
                  <span role="cell" className="hidden text-[12px] font-medium text-[var(--text-secondary)] sm:block">Workspace</span>
                  <span role="cell" className="text-[12px] font-medium text-[var(--text-secondary)]">
                    {names.length > 0 ? (
                      <Tooltip content={names.join(', ')} side="top">
                        <span>{team.member_user_ids.length}</span>
                      </Tooltip>
                    ) : team.member_user_ids.length}
                  </span>
                  <span role="cell" className="hidden text-[12px] font-medium text-[var(--text-secondary)] sm:block">{team.account_ids.length}</span>
                  <span role="cell" className="hidden text-[12px] text-[var(--text-secondary)] sm:block">
                    {shortDate(filter === 'deleted' && team.deleted_at ? team.deleted_at : team.created_at)}
                  </span>
                  <span role="cell" className="flex justify-end" onClick={(event) => event.stopPropagation()}>
                    <RowMenu label={`Team actions for ${team.name}`}>
                      {openable && (
                        <DropdownMenuSub>
                          <DropdownMenuSubTrigger>
                            <span className="truncate">Settings</span>
                            <SubmenuArrow />
                          </DropdownMenuSubTrigger>
                          <DropdownMenuSubContent>
                            {TEAM_SETTINGS_PAGES.map((page) => (
                              <DropdownMenuItem
                                key={page.label}
                                onSelect={() => openTeamSettings(page.path ? `${team.key}/${page.path}` : team.key)}
                              >
                                <span className="truncate">{page.label}</span>
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuSubContent>
                        </DropdownMenuSub>
                      )}
                      {openable && team.retired_at && <DropdownMenuSeparator />}
                      {(filter === 'deleted' || team.retired_at) && (
                        <DropdownMenuItem onSelect={() => setRestoreTarget(team)}>
                          <span className="truncate">Restore team…</span>
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
              onAction={!needle && filter === 'active' ? () => setSettingsSection('new-team') : undefined}
            />
          )}
          {filter === 'deleted' && visible.length > 0 && (
            <p className="mt-3 px-2 text-[12px] text-[var(--text-tertiary)]">
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
