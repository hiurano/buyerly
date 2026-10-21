import React, { useEffect, useMemo, useState } from 'react';
import { apiRequest } from '@/lib/api';
import { useWorkspaceSession } from '@/lib/workspaceSession';
import { notifyTeamsChanged, teamsPath, useTeams, type TeamItem } from '@/lib/teams';
import { canAdministerWorkspace } from '@/lib/settingsPages';
import { useAppStore } from '@/store/useAppStore';
import { SidebarCollapsedNavigation } from '@/components/sidebar/SidebarCollapsedNavigation';
import { Initials } from '@/components/preferences/MembersSection';
import { memberName, type MemberItem } from '@/components/preferences/MemberDialogs';
import { TeamIcon } from '@/components/preferences/TeamIcon';
import { LinearCheckIcon } from '@/icons/LinearIcons';
import { DataState } from '@/ui/DataState';
import { HeaderCreateButton } from '@/ui/HeaderCreateButton';
import { LinearDataListRow, LinearDataListToolbar, LinearDataTable, type LinearDataListColumn } from '@/ui/LinearDataList';
import { toast } from '@/ui/toast';
import { ListSearchField } from './ListSearchField';

const COLUMNS: LinearDataListColumn[] = [
  { id: 'name', label: 'Name', width: 'minmax(220px, 1fr)', sortable: true },
  { id: 'membership', label: 'Membership', width: '110px' },
  { id: 'members', label: 'Members', width: '120px' },
];

const MAX_FACES = 5;

/** Linear's workspace Teams page: every active team, whether you are on it, and who is. */
export const WorkspaceTeamsView: React.FC = () => {
  const { workspace, user } = useWorkspaceSession();
  const { teams, error, refresh } = useTeams(workspace.id, 'active');
  const setActiveTab = useAppStore((state) => state.setActiveTab);
  const setActiveTeamKey = useAppStore((state) => state.setActiveTeamKey);
  const setSettingsSection = useAppStore((state) => state.setSettingsSection);
  const [members, setMembers] = useState<MemberItem[]>([]);
  const [query, setQuery] = useState('');
  const [direction, setDirection] = useState<'asc' | 'desc'>('asc');
  const [busyTeam, setBusyTeam] = useState<number | null>(null);
  const canCreate = canAdministerWorkspace({ role: workspace.role });

  useEffect(() => {
    let active = true;
    apiRequest<MemberItem[]>(`/api/workspaces/${workspace.id}/members`)
      .then((items) => { if (active) setMembers(items); })
      .catch(() => {});
    return () => { active = false; };
  }, [workspace.id]);

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matching = (teams ?? []).filter((team) => !needle
      || team.name.toLowerCase().includes(needle) || team.key.toLowerCase().includes(needle));
    return [...matching].sort((a, b) => a.name.localeCompare(b.name) * (direction === 'asc' ? 1 : -1));
  }, [direction, query, teams]);

  const openTeam = (team: TeamItem) => {
    setActiveTeamKey(team.key);
    setActiveTab('team');
  };

  /** Linear's Join and Leave: anyone may put themselves on a team, or take themselves off. */
  const setMembership = async (team: TeamItem, join: boolean) => {
    if (user.id == null) return;
    setBusyTeam(team.id);
    try {
      await apiRequest(
        join ? teamsPath(workspace.id, `/${team.id}/members`) : teamsPath(workspace.id, `/${team.id}/members/${user.id}`),
        join ? { method: 'POST', body: JSON.stringify({ user_ids: [user.id] }) } : { method: 'DELETE' },
      );
      // Every list of teams reads them again: this page, the sidebar's Your teams.
      notifyTeamsChanged();
      toast.show({ tone: 'success', title: join ? `You joined ${team.name}` : `You left ${team.name}` });
    } catch (saveError) {
      toast.error(join ? "Couldn't join the team" : "Couldn't leave the team", saveError instanceof Error ? saveError.message : undefined);
    } finally {
      setBusyTeam(null);
    }
  };

  const faces = (team: TeamItem) => team.member_user_ids
    .map((id) => members.find((member) => member.user_id === id))
    .filter((member): member is MemberItem => Boolean(member));

  const renderBody = () => {
    if (error && !teams) {
      return <DataState title="Couldn't load teams" detail={error} role="alert" actionLabel="Retry" onAction={() => void refresh()} />;
    }
    if (!teams) return <DataState title="Loading teams…" detail="Reading the teams of this workspace." />;
    if (shown.length === 0) {
      return <DataState title="No teams found" detail={query ? 'No team name or identifier matches the search.' : 'This workspace has no active team.'} />;
    }
    return (
      <LinearDataTable
        columns={COLUMNS}
        sortKey="name"
        sortDirection={direction}
        onSort={() => setDirection((current) => (current === 'asc' ? 'desc' : 'asc'))}
      >
        {shown.map((team) => {
          const people = faces(team);
          return (
            <LinearDataListRow
              key={team.id}
              layout="grid"
              columns={COLUMNS}
              tabIndex={0}
              className="cursor-pointer"
              onClick={() => openTeam(team)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && event.target === event.currentTarget) openTeam(team);
              }}
            >
              <div className="flex min-w-0 items-center gap-[10px]">
                <TeamIcon size={14} />
                <span className="truncate text-[13px] font-medium text-[var(--text-primary)]">{team.name}</span>
                <span className="shrink-0 text-[13px] font-medium text-[var(--text-muted)]">{team.key}</span>
              </div>
              <div>
                <button
                  type="button"
                  className="team-membership"
                  data-joined={team.is_member ? 'true' : 'false'}
                  disabled={busyTeam === team.id}
                  onClick={(event) => {
                    event.stopPropagation();
                    void setMembership(team, !team.is_member);
                  }}
                >
                  {team.is_member && <LinearCheckIcon size={12} />}
                  <span className="team-membership__label">{team.is_member ? 'Joined' : 'Join'}</span>
                  {team.is_member && <span className="team-membership__leave">Leave</span>}
                </button>
              </div>
              <div className="flex items-center" aria-label={`${people.length} members`}>
                {people.slice(0, MAX_FACES).map((member, index) => (
                  <span key={member.user_id} className="team-face" style={{ zIndex: MAX_FACES - index }} title={memberName(member)}>
                    <Initials label={memberName(member)} avatarUrl={member.avatar_url} />
                  </span>
                ))}
                {people.length > MAX_FACES && (
                  <span className="ml-1 text-[12px] text-[var(--text-tertiary)]">+{people.length - MAX_FACES}</span>
                )}
              </div>
            </LinearDataListRow>
          );
        })}
      </LinearDataTable>
    );
  };

  return (
    <div className="flex h-full w-full select-none flex-col overflow-hidden bg-transparent">
      <header className="flex shrink-0 flex-col">
        <div
          style={{ borderBottom: 'var(--canvas-border)', paddingLeft: '18px', paddingRight: '11px' }}
          className="flex h-[44px] items-center justify-between"
        >
          <div className="flex items-center">
            <SidebarCollapsedNavigation />
            <h2 className="overflow-hidden whitespace-nowrap text-[13px] font-medium text-[var(--text-secondary)]">Teams</h2>
          </div>
          {canCreate && (
            <HeaderCreateButton
              label="Create team"
              tooltip="Create team"
              onClick={() => {
                setSettingsSection('new-team');
                setActiveTab('preferences');
              }}
            />
          )}
        </div>
        <LinearDataListToolbar className="gap-2">
          <ListSearchField value={query} onChange={setQuery} placeholder="Find teams…" />
        </LinearDataListToolbar>
      </header>
      <div className="flex min-h-0 min-w-0 flex-1">{renderBody()}</div>
    </div>
  );
};
