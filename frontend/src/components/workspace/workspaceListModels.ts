import { DATE_OPERATORS, type FilterFieldDefinition, type FilterOption } from '@/components/filters/filterModel';
import { memberName, roleLabel, type MemberItem } from '@/components/preferences/MemberDialogs';
import type { TeamItem } from '@/lib/teams';
import { listViewDefaults } from '@/ui/listView';

const enumOperators = ['is', 'is_not'] as const;

const counted = <T>(options: FilterOption[], items: readonly T[], values: (item: T) => string[]) =>
  options.map((option) => ({ ...option, count: items.filter((item) => values(item).includes(option.value)).length }));

const personOptions = (members: readonly MemberItem[]): FilterOption[] => members.map((member) => ({
  value: String(member.user_id),
  label: memberName(member),
  avatar: { kind: 'user' as const, url: member.avatar_url || undefined },
  keywords: [member.username],
}));

/* Members: Linear's Display options there order by Name, Role or Joined and show Role, Joined and Teams. */

export const MEMBER_ROLES = ['owner', 'admin', 'member', 'guest'];

export const MEMBERS_VIEW_DEFAULTS = listViewDefaults({
  grouping: 'none',
  ordering: 'name',
  direction: 'asc',
  properties: { role: true, joined: true, teams: true },
});

export const MEMBER_ORDERING_OPTIONS = [
  { value: 'name', label: 'Name' },
  { value: 'role', label: 'Role' },
  { value: 'joined', label: 'Joined' },
];

export const MEMBER_PROPERTY_LABELS: Record<string, string> = {
  role: 'Role',
  joined: 'Joined',
  teams: 'Teams',
};

/** Linear's Members filter: Role. */
export function createMemberFilterFields(members: readonly MemberItem[]): FilterFieldDefinition<MemberItem>[] {
  const roles = MEMBER_ROLES.filter((role) => members.some((member) => member.role === role));
  return [
    {
      id: 'role', label: 'Role', section: 'filters', type: 'enum',
      operators: [...enumOperators], defaultOperator: 'is', pluralLabel: 'roles',
      options: counted(roles.map((role) => ({ value: role, label: roleLabel(role) })), members, (member) => [member.role]),
      getValue: (member) => member.role,
    },
  ];
}

export function sortMembers(members: readonly MemberItem[], ordering: string, direction: 'asc' | 'desc'): MemberItem[] {
  const value = (member: MemberItem): string | number => {
    if (ordering === 'role') return MEMBER_ROLES.indexOf(member.role);
    if (ordering === 'joined') return member.joined_at;
    return memberName(member).toLowerCase();
  };
  const sign = direction === 'asc' ? 1 : -1;
  return [...members].sort((a, b) => (value(a) < value(b) ? -sign : value(a) > value(b) ? sign : 0));
}

/*
 * Teams: Linear orders by Name or Created (Buyerly keeps no Updated) and shows
 * ID, Membership and Members by default; Owners and Created are off. Linear's
 * Projects are Buyerly's ad accounts, off by default here.
 */

export const TEAMS_VIEW_DEFAULTS = listViewDefaults({
  grouping: 'none',
  ordering: 'name',
  direction: 'asc',
  properties: { id: true, membership: true, owners: false, accounts: false, created: false, members: true },
});

export const TEAM_ORDERING_OPTIONS = [
  { value: 'name', label: 'Name' },
  { value: 'created', label: 'Created' },
];

export const TEAM_PROPERTY_LABELS: Record<string, string> = {
  id: 'ID',
  membership: 'Membership',
  owners: 'Owners',
  accounts: 'Ad accounts',
  created: 'Created',
  members: 'Members',
};

/** Linear's Teams filter: Team name, Members, Owners, Private and Created date. */
export function createTeamFilterFields(teams: readonly TeamItem[], members: readonly MemberItem[]): FilterFieldDefinition<TeamItem>[] {
  const people = personOptions(members);
  return [
    {
      id: 'name', label: 'Team name', section: 'filters', type: 'text',
      operators: ['contains', 'not_contains'], defaultOperator: 'contains',
      placeholder: 'Name or identifier', keywords: ['title', 'identifier', 'key'],
      getValue: (team) => `${team.name} ${team.key}`,
    },
    {
      id: 'members', label: 'Members', section: 'filters', type: 'enum',
      operators: [...enumOperators], defaultOperator: 'is', pluralLabel: 'members',
      options: counted(people, teams, (team) => team.member_user_ids.map(String)),
      getValue: (team) => team.member_user_ids.map(String),
    },
    {
      id: 'owners', label: 'Owners', section: 'filters', type: 'enum',
      operators: [...enumOperators], defaultOperator: 'is', pluralLabel: 'owners',
      options: counted(people, teams, (team) => team.owner_user_ids.map(String)),
      getValue: (team) => team.owner_user_ids.map(String),
    },
    {
      id: 'private', label: 'Private', section: 'filters', type: 'enum',
      operators: [...enumOperators], defaultOperator: 'is', pluralLabel: 'values',
      options: counted([
        { value: 'yes', label: 'Private' },
        { value: 'no', label: 'Public' },
      ], teams, (team) => [team.private ? 'yes' : 'no']),
      getValue: (team) => (team.private ? 'yes' : 'no'),
    },
    {
      id: 'created', label: 'Created date', section: 'dates', type: 'date',
      operators: [...DATE_OPERATORS], defaultOperator: 'after',
      getValue: (team) => team.created_at || null,
    },
  ];
}

export function sortTeams(teams: readonly TeamItem[], ordering: string, direction: 'asc' | 'desc'): TeamItem[] {
  const sign = direction === 'asc' ? 1 : -1;
  if (ordering === 'created') return [...teams].sort((a, b) => a.created_at.localeCompare(b.created_at) * sign);
  return [...teams].sort((a, b) => a.name.localeCompare(b.name) * sign);
}
