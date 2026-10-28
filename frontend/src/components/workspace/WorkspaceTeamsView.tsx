import * as stylex from '@stylexjs/stylex';
import React, { useMemo, useState } from 'react';
import { membersQuery } from '@/models/queries';
import { usePoolQuery } from '@/models/usePool';
import { useWorkspaceSession } from '@/lib/workspaceSession';
import { addTeamMembers, notifyTeamsChanged, removeTeamMember, useTeams, type TeamItem } from '@/lib/teams';
import { SidebarCollapsedNavigation } from '@/components/sidebar/SidebarCollapsedNavigation';
import { Initials } from '@/components/preferences/MembersSection';
import { memberName, type MemberItem } from '@/components/preferences/MemberDialogs';
import { TeamIcon } from '@/components/preferences/TeamIcon';
import { BuyerlyCheckIcon, BuyerlyLockIcon } from '@/icons/BuyerlyIcons';
import { DataState } from '@/ui/DataState';
import { HeaderCreateButton } from '@/ui/HeaderCreateButton';
import { BuyerlyDataListRow, BuyerlyDataListToolbar, BuyerlyDataTable, type BuyerlyDataListColumn } from '@/ui/BuyerlyDataList';
import { toast } from '@/ui/toast';
import { ListSearchField } from './ListSearchField';
import { colors } from '@/styles/tokens.stylex';
import { openSettings } from '@/lib/routing';
import { openTab } from '@/lib/navigation';

const styles = stylex.create({
  root: {
    display: 'flex',
    height: '100%',
    width: '100%',
    userSelect: 'none',
    flexDirection: 'column',
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
  header: {
    display: 'flex',
    flexShrink: 0,
    flexDirection: 'column',
  },
  // The 44px title bar over a hairline.
  titleBar: {
    display: 'flex',
    height: 44,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 18,
    paddingRight: 11,
  },
  title: {
    display: 'flex',
    alignItems: 'center',
  },
  heading: {
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    fontSize: 13,
    fontWeight: 500,
    color: colors['--text-secondary'],
  },
  toolbar: {
    gap: 8,
  },
  body: {
    display: 'flex',
    minHeight: 0,
    minWidth: 0,
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: '0%',
  },
  row: {
    cursor: 'pointer',
  },
  team: {
    display: 'flex',
    minWidth: 0,
    alignItems: 'center',
    gap: 10,
  },
  name: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: 13,
    fontWeight: 500,
    color: colors['--text-primary'],
  },
  key: {
    flexShrink: 0,
    fontSize: 13,
    fontWeight: 500,
    color: colors['--text-muted'],
  },
  lock: {
    flexShrink: 0,
    color: colors['--text-muted'],
  },
  faces: {
    display: 'flex',
    alignItems: 'center',
  },
  more: {
    marginLeft: 4,
    fontSize: 12,
    color: colors['--text-tertiary'],
  },
});

const COLUMNS: BuyerlyDataListColumn[] = [
  { id: 'name', label: 'Name', width: 'minmax(220px, 1fr)', sortable: true },
  { id: 'membership', label: 'Membership', width: '110px' },
  { id: 'members', label: 'Members', width: '120px' },
];

const MAX_FACES = 5;
const NO_MEMBERS: MemberItem[] = [];

/** Linear's workspace Teams page: every active team, whether you are on it, and who is. */
export const WorkspaceTeamsView: React.FC = () => {
  const { workspace, user } = useWorkspaceSession();
  const { teams, error, refresh } = useTeams(workspace.id, 'active');
  // From the pool, as Members reads them: held since that page, or the synced models, opens it without a request.
  const members = usePoolQuery(membersQuery(workspace.id)).data ?? NO_MEMBERS;
  const [query, setQuery] = useState('');
  const [direction, setDirection] = useState<'asc' | 'desc'>('asc');
  const [busyTeam, setBusyTeam] = useState<number | null>(null);
  // As in Linear, every member may create a team; guests can't.
  const canCreate = workspace.role !== 'guest';

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matching = (teams ?? []).filter((team) => !needle
      || team.name.toLowerCase().includes(needle) || team.key.toLowerCase().includes(needle));
    return [...matching].sort((a, b) => a.name.localeCompare(b.name) * (direction === 'asc' ? 1 : -1));
  }, [direction, query, teams]);

  const openTeam = (team: TeamItem) => {
    openTab('team', { teamKey: team.key });
  };

  /** Linear's Join and Leave: anyone may put themselves on a team, or take themselves off. */
  const setMembership = async (team: TeamItem, join: boolean) => {
    if (user.id == null) return;
    setBusyTeam(team.id);
    const request = join
      ? addTeamMembers(workspace.id, team.id, [user.id])
      : removeTeamMember(workspace.id, team.id, user.id);
    const title = join ? `You joined ${team.name}` : `You left ${team.name}`;
    try {
      await request;
      // Every list of teams reads them again: this page, the sidebar's Your teams.
      notifyTeamsChanged();
      toast.show({ tone: 'success', title });
    } catch (saveError) {
      toast.error(join ? "Couldn't join the team" : "Couldn't leave the team", saveError instanceof Error ? saveError.message : undefined);
    }
    setBusyTeam(null);
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
      <BuyerlyDataTable
        columns={COLUMNS}
        sortKey="name"
        sortDirection={direction}
        onSort={() => setDirection((current) => (current === 'asc' ? 'desc' : 'asc'))}
      >
        {shown.map((team) => {
          const people = faces(team);
          return (
            <BuyerlyDataListRow
              key={team.id}
              layout="grid"
              columns={COLUMNS}
              tabIndex={0}
              xstyle={styles.row}
              onClick={() => openTeam(team)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && event.target === event.currentTarget) openTeam(team);
              }}
            >
              <div {...stylex.props(styles.team)}>
                <TeamIcon size={14} />
                <span {...stylex.props(styles.name)}>{team.name}</span>
                <span {...stylex.props(styles.key)}>{team.key}</span>
                {team.private && <BuyerlyLockIcon size={12} {...stylex.props(styles.lock)} aria-label="Private team" />}
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
                  {team.is_member && <BuyerlyCheckIcon size={12} />}
                  <span className="team-membership__label">{team.is_member ? 'Joined' : 'Join'}</span>
                  {team.is_member && <span className="team-membership__leave">Leave</span>}
                </button>
              </div>
              <div {...stylex.props(styles.faces)} aria-label={`${people.length} members`}>
                {people.slice(0, MAX_FACES).map((member, index) => (
                  <span key={member.user_id} className="team-face" style={{ zIndex: MAX_FACES - index }} title={memberName(member)}>
                    <Initials label={memberName(member)} avatarUrl={member.avatar_url} />
                  </span>
                ))}
                {people.length > MAX_FACES && (
                  <span {...stylex.props(styles.more)}>+{people.length - MAX_FACES}</span>
                )}
              </div>
            </BuyerlyDataListRow>
          );
        })}
      </BuyerlyDataTable>
    );
  };

  return (
    <div {...stylex.props(styles.root)}>
      <header {...stylex.props(styles.header)}>
        {/* --canvas-border is a whole border; StyleX would split the shorthand and lose it. */}
        <div {...stylex.props(styles.titleBar)} style={{ borderBottom: 'var(--canvas-border)' }}>
          <div {...stylex.props(styles.title)}>
            <SidebarCollapsedNavigation />
            <h2 {...stylex.props(styles.heading)}>Teams</h2>
          </div>
          {canCreate && (
            <HeaderCreateButton
              label="Create team"
              tooltip="Create team"
              onClick={() => {
                openSettings('new-team');
              }}
            />
          )}
        </div>
        <BuyerlyDataListToolbar xstyle={styles.toolbar}>
          <ListSearchField value={query} onChange={setQuery} placeholder="Find teams…" />
        </BuyerlyDataListToolbar>
      </header>
      <div {...stylex.props(styles.body)}>{renderBody()}</div>
    </div>
  );
};
