import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { apiRequest } from '@/lib/api';
import { useWorkspaceSession } from '@/lib/workspaceSession';
import { useTeams } from '@/lib/teams';
import { canAdministerWorkspace } from '@/lib/settingsPages';
import { useAppStore } from '@/store/useAppStore';
import { SidebarCollapsedNavigation } from '@/components/sidebar/SidebarCollapsedNavigation';
import { InviteDialog, Initials, RoleStatus, shortDate } from '@/components/preferences/MembersSection';
import { memberName, type MemberItem } from '@/components/preferences/MemberDialogs';
import { TeamIcon } from '@/components/preferences/TeamIcon';
import { DataState } from '@/ui/DataState';
import { HeaderCreateButton } from '@/ui/HeaderCreateButton';
import { BuyerlyDataListRow, BuyerlyDataListToolbar, BuyerlyDataTable, type BuyerlyDataListColumn } from '@/ui/BuyerlyDataList';
import { ListSearchField } from './ListSearchField';

type MemberSort = 'name' | 'status' | 'joined';
const ROLE_ORDER = ['owner', 'admin', 'member', 'guest'];

const COLUMNS: BuyerlyDataListColumn[] = [
  { id: 'name', label: 'Name', width: 'minmax(220px, 1fr)', sortable: true },
  { id: 'status', label: 'Status', width: '100px', sortable: true },
  { id: 'joined', label: 'Joined', width: '100px', sortable: true },
  { id: 'teams', label: 'Teams', width: 'minmax(120px, 220px)' },
];

/** Linear's workspace Members page: who is in the workspace, their role and their teams. */
export const WorkspaceMembersView: React.FC = () => {
  const { workspace } = useWorkspaceSession();
  const { teams } = useTeams(workspace.id, 'active');
  const setActiveTab = useAppStore((state) => state.setActiveTab);
  const setActiveTeamKey = useAppStore((state) => state.setActiveTeamKey);
  const [members, setMembers] = useState<MemberItem[] | null>(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<{ key: MemberSort; direction: 'asc' | 'desc' }>({ key: 'name', direction: 'asc' });
  const [inviting, setInviting] = useState(false);
  const canInvite = canAdministerWorkspace({ role: workspace.role });

  const load = useCallback(async () => {
    try {
      setMembers(await apiRequest<MemberItem[]>(`/api/workspaces/${workspace.id}/members`));
      setError('');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Please try again.');
    }
  }, [workspace.id]);

  useEffect(() => {
    setMembers(null);
    void load();
  }, [load]);

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matching = (members ?? []).filter((member) => !needle
      || [member.full_name, member.username, member.email ?? ''].some((value) => value.toLowerCase().includes(needle)));
    const value = (member: MemberItem): string | number => {
      if (sort.key === 'status') return ROLE_ORDER.indexOf(member.role);
      if (sort.key === 'joined') return member.joined_at;
      return memberName(member).toLowerCase();
    };
    const sign = sort.direction === 'asc' ? 1 : -1;
    return [...matching].sort((a, b) => (value(a) < value(b) ? -sign : value(a) > value(b) ? sign : 0));
  }, [members, query, sort]);

  const teamsOf = (member: MemberItem) => (teams ?? []).filter((team) => team.member_user_ids.includes(member.user_id));

  const renderBody = () => {
    if (error && !members) {
      return <DataState title="Couldn't load members" detail={error} role="alert" actionLabel="Retry" onAction={() => void load()} />;
    }
    if (!members) return <DataState title="Loading members…" detail="Reading the members of this workspace." />;
    if (shown.length === 0) {
      return <DataState title="No members found" detail="No member's name, username or email matches the search." />;
    }
    return (
      <BuyerlyDataTable
        columns={COLUMNS}
        sortKey={sort.key}
        sortDirection={sort.direction}
        onSort={(columnId) => setSort((current) => ({
          key: columnId as MemberSort,
          direction: current.key === columnId && current.direction === 'asc' ? 'desc' : 'asc',
        }))}
      >
        {shown.map((member) => (
          <BuyerlyDataListRow key={member.id} layout="grid" columns={COLUMNS} height={50}>
            <div className="flex min-w-0 items-center gap-[10px]">
              <Initials label={memberName(member)} avatarUrl={member.avatar_url} size={24} />
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-[13px] font-medium text-[var(--text-secondary)]">{memberName(member)}</span>
                {member.username && (
                  <span className="truncate text-[12px] font-medium text-[var(--text-tertiary)]">{member.username}</span>
                )}
              </div>
            </div>
            <span className="truncate text-[12px] font-[450] text-[var(--text-tertiary)]"><RoleStatus role={member.role} /></span>
            <span className="truncate text-[12px] font-[450] text-[var(--text-tertiary)]">{shortDate(member.joined_at)}</span>
            <div className="flex min-w-0 items-center gap-1 overflow-hidden">
              {teamsOf(member).map((team) => (
                <button
                  key={team.id}
                  type="button"
                  className="team-chip"
                  title={team.name}
                  onClick={() => {
                    setActiveTeamKey(team.key);
                    setActiveTab('team');
                  }}
                >
                  <TeamIcon size={14} />
                  <span>{team.key}</span>
                </button>
              ))}
            </div>
          </BuyerlyDataListRow>
        ))}
      </BuyerlyDataTable>
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
            <h2 className="overflow-hidden whitespace-nowrap text-[13px] font-medium text-[var(--text-secondary)]">Members</h2>
          </div>
          {canInvite && <HeaderCreateButton label="Invite members" tooltip="Invite members" onClick={() => setInviting(true)} />}
        </div>
        <BuyerlyDataListToolbar className="gap-2">
          <ListSearchField value={query} onChange={setQuery} placeholder="Find members…" />
        </BuyerlyDataListToolbar>
      </header>
      <div className="flex min-h-0 min-w-0 flex-1">{renderBody()}</div>
      <InviteDialog
        open={inviting}
        workspace={workspace}
        onClose={() => setInviting(false)}
        onSent={() => {
          setInviting(false);
          void load();
        }}
      />
    </div>
  );
};
