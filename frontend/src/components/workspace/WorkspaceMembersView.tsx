import * as stylex from '@stylexjs/stylex';
import React, { useMemo, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { pool } from '@/models/pool';
import { membersQuery } from '@/models/queries';
import { usePoolQuery } from '@/models/usePool';
import { useWorkspaceSession } from '@/lib/workspaceSession';
import { useTeams, type TeamItem } from '@/lib/teams';
import { canAdministerWorkspace } from '@/lib/settingsPages';
import { SidebarCollapsedNavigation } from '@/components/sidebar/SidebarCollapsedNavigation';
import { InviteDialog, Initials, RoleStatus, shortDate } from '@/components/preferences/MembersSection';
import { memberName, type MemberItem } from '@/components/preferences/MemberDialogs';
import { TeamIcon } from '@/components/preferences/TeamIcon';
import { DataState } from '@/ui/DataState';
import { HeaderCreateButton } from '@/ui/HeaderCreateButton';
import { BuyerlyDataListRow, BuyerlyDataListToolbar, BuyerlyDataTable, type BuyerlyDataListColumn } from '@/ui/BuyerlyDataList';
import { ListSearchField } from './ListSearchField';
import { colors } from '@/styles/tokens.stylex';
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
  person: {
    display: 'flex',
    minWidth: 0,
    alignItems: 'center',
    gap: 10,
  },
  names: {
    display: 'flex',
    minWidth: 0,
    flexDirection: 'column',
  },
  name: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: 13,
    fontWeight: 500,
    color: colors['--text-secondary'],
  },
  username: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: 12,
    fontWeight: 500,
    color: colors['--text-tertiary'],
  },
  cell: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: 12,
    fontWeight: 450,
    color: colors['--text-tertiary'],
  },
  teams: {
    display: 'flex',
    minWidth: 0,
    alignItems: 'center',
    gap: 4,
    overflow: 'hidden',
  },
});

type MemberSort = 'name' | 'status' | 'joined';
const ROLE_ORDER = ['owner', 'admin', 'member', 'guest'];

// As Linear's Members: the name takes the room, Role and Teams keep to their content, and the
// Name label starts over the avatar, its pill's 6px out to the left.
const COLUMNS: BuyerlyDataListColumn[] = [
  { id: 'name', label: 'Name', width: 'minmax(180px, 1fr)', sortable: true, headerInset: -6 },
  { id: 'status', label: 'Role', width: '87px', sortable: true },
  { id: 'joined', label: 'Joined', width: '100px', sortable: true },
  { id: 'teams', label: 'Teams', width: '120px' },
];

/** One member's row; draws again only when that member or the teams change (#500). */
const MemberRow = React.memo(function MemberRow({ member, teams }: { member: MemberItem; teams: readonly TeamItem[] | null }) {
  const memberTeams = (teams ?? []).filter((team) => team.member_user_ids.includes(member.user_id));
  return (
    <BuyerlyDataListRow layout="grid" columns={COLUMNS} height={50}>
      <div {...stylex.props(styles.person)}>
        <Initials label={memberName(member)} avatarUrl={member.avatar_url} size={24} />
        <div {...stylex.props(styles.names)}>
          <span {...stylex.props(styles.name)}>{memberName(member)}</span>
          {member.username && (
            <span {...stylex.props(styles.username)}>{member.username}</span>
          )}
        </div>
      </div>
      <span {...stylex.props(styles.cell)}><RoleStatus role={member.role} /></span>
      <span {...stylex.props(styles.cell)}>{shortDate(member.joined_at)}</span>
      <div {...stylex.props(styles.teams)}>
        {memberTeams.map((team) => (
          <button
            key={team.id}
            type="button"
            className="team-chip"
            title={team.name}
            onClick={() => {
              openTab('team', { teamKey: team.key });
            }}
          >
            <TeamIcon size={16} />
            <span>{team.key}</span>
          </button>
        ))}
      </div>
    </BuyerlyDataListRow>
  );
});

/** Linear's workspace Members page: who is in the workspace, their role and their teams. */
const WorkspaceMembersViewContent: React.FC = () => {
  const { workspace } = useWorkspaceSession();
  const { teams } = useTeams(workspace.id, 'active');
  // From the pool: a page already visited draws its members at once (#488).
  const { data: members, error } = usePoolQuery(membersQuery(workspace.id));
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<{ key: MemberSort; direction: 'asc' | 'desc' }>({ key: 'name', direction: 'asc' });
  const [inviting, setInviting] = useState(false);
  const canInvite = canAdministerWorkspace({ role: workspace.role });

  const load = () => pool.fetch(membersQuery(workspace.id), { afterWrite: true });

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
        {shown.map((member) => <MemberRow key={member.id} member={member} teams={teams} />)}
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
            <h2 {...stylex.props(styles.heading)}>Members</h2>
          </div>
          {canInvite && <HeaderCreateButton label="Invite members" tooltip="Invite members" onClick={() => setInviting(true)} />}
        </div>
        <BuyerlyDataListToolbar xstyle={styles.toolbar}>
          <ListSearchField value={query} onChange={setQuery} placeholder="Find members…" />
        </BuyerlyDataListToolbar>
      </header>
      <div {...stylex.props(styles.body)}>{renderBody()}</div>
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

/** Draws the pool's models as they change (#488). */
export const WorkspaceMembersView = observer(WorkspaceMembersViewContent);
