import type { MemberItem } from '@/components/preferences/MemberDialogs';
import type { RuleLabelPayload } from '@/lib/rules';
import type { TeamDocument, TeamItem } from '@/lib/teams';
import { sync, type SyncRow } from './sync';

/**
 * The pages' lists as the sync engine's models give them (#507): the same
 * records, in the same order, as the REST endpoints they replace, so a page
 * draws the same either way. Undefined when the models aren't held; the pool
 * then asks the server.
 */

/** A timestamp of a row (to_jsonb, UTC) as the API writes one: ISO with "Z"; empty for none. */
export function utcIso(value: unknown): string {
  if (typeof value !== 'string' || !value) return '';
  if (/[zZ]$/.test(value)) return value;
  if (/[+-]\d\d:\d\d$/.test(value)) return value.endsWith('+00:00') ? `${value.slice(0, -6)}Z` : new Date(value).toISOString();
  return `${value}Z`;
}

const text = (value: unknown) => (typeof value === 'string' ? value : '');
const byId = (left: SyncRow, right: SyncRow) => left.id - right.id;
const byTime = (field: string) => (left: SyncRow, right: SyncRow) =>
  text(left[field]).localeCompare(text(right[field])) || byId(left, right);

/** GET /api/workspaces/:id/teams?status=all: the teams not deleted, by name, with their members and ad accounts. */
export function syncedTeams(workspaceId: number): TeamItem[] | undefined {
  const [teams, teamMembers, teamAccounts, members] = [
    sync.rows('Team'), sync.rows('TeamMember'), sync.rows('TeamAccount'), sync.rows('WorkspaceMember'),
  ];
  if (!teams || !teamMembers || !teamAccounts || !members) return undefined;
  const userOf = new Map(members.map((member) => [member.id, Number(member.user_id)]));
  const me = members.find((member) => Number(member.user_id) === sync.userId);
  const manager = me?.role === 'owner' || me?.role === 'admin';
  const guest = me?.role === 'guest';
  const memberIds = new Map<number, number[]>();
  const ownerIds = new Map<number, number[]>();
  for (const row of teamMembers.sort(byTime('joined_at'))) {
    const user = userOf.get(Number(row.member_id));
    if (user === undefined) continue;
    const team = Number(row.team_id);
    memberIds.set(team, [...(memberIds.get(team) ?? []), user]);
    if (row.is_owner) ownerIds.set(team, [...(ownerIds.get(team) ?? []), user]);
  }
  const accountIds = new Map<number, number[]>();
  for (const row of teamAccounts.sort(byTime('created_at'))) {
    const team = Number(row.team_id);
    accountIds.set(team, [...(accountIds.get(team) ?? []), Number(row.account_id)]);
  }
  return teams
    .filter((team) => Number(team.workspace_id) === workspaceId && !team.deleted_at)
    .sort((left, right) => text(left.name).toLowerCase().localeCompare(text(right.name).toLowerCase()) || byId(left, right))
    .map((team): TeamItem => {
      const memberUserIds = memberIds.get(team.id) ?? [];
      return {
        id: team.id,
        name: text(team.name),
        key: text(team.key),
        description: text(team.description),
        created_at: utcIso(team.created_at),
        retired_at: utcIso(team.retired_at) || null,
        deleted_at: null,
        restorable_until: null,
        member_user_ids: memberUserIds,
        owner_user_ids: ownerIds.get(team.id) ?? [],
        account_ids: accountIds.get(team.id) ?? [],
        is_member: sync.userId !== null && memberUserIds.includes(sync.userId),
        private: Boolean(team.private),
      };
    })
    // As the API lists them: a private team shows to its members and to admins, a guest sees only their own.
    .filter((team) => team.is_member || (!guest && (!team.private || manager)));
}

const ROLE_ORDER: Record<string, number> = { owner: 1, admin: 2, member: 3 };

/** GET /api/workspaces/:id/members: owners, admins, members, then guests, each by when they joined. */
export function syncedMembers(workspaceId: number): MemberItem[] | undefined {
  const [members, users] = [sync.rows('WorkspaceMember'), sync.rows('User')];
  if (!members || !users) return undefined;
  const userById = new Map(users.map((user) => [user.id, user]));
  const rank = (member: SyncRow) => ROLE_ORDER[text(member.role)] ?? 4;
  return members
    .filter((member) => Number(member.workspace_id) === workspaceId && userById.has(Number(member.user_id)))
    .sort((left, right) => rank(left) - rank(right) || byTime('joined_at')(left, right))
    .map((member): MemberItem => {
      const user = userById.get(Number(member.user_id)) as SyncRow;
      const username = text(user.username);
      return {
        id: member.id,
        user_id: user.id,
        username,
        full_name: text(user.full_name) || username,
        email: typeof user.email === 'string' ? user.email : null,
        avatar_url: text(user.avatar_url),
        role: text(member.role),
        joined_at: utcIso(member.joined_at),
        is_current_user: user.id === sync.userId,
      };
    });
}

/** GET /api/workspaces/:id/teams/:team/documents: the newest edit first. */
export function syncedTeamDocuments(teamId: number): TeamDocument[] | undefined {
  const documents = sync.rows('TeamDocument');
  if (!documents) return undefined;
  return documents
    .filter((document) => Number(document.team_id) === teamId)
    .sort((left, right) => byTime('updated_at')(right, left))
    .map((document): TeamDocument => ({
      id: document.id,
      team_id: Number(document.team_id),
      title: text(document.title),
      content: text(document.content),
      created_by_user_id: document.created_by_user_id == null ? null : Number(document.created_by_user_id),
      updated_by_user_id: document.updated_by_user_id == null ? null : Number(document.updated_by_user_id),
      created_at: utcIso(document.created_at),
      updated_at: utcIso(document.updated_at),
    }));
}

/** GET /api/rule-labels: by name, with how many rules carry each and when one was last put on. */
export function syncedRuleLabels(): RuleLabelPayload[] | undefined {
  const [labels, items] = [sync.rows('Label'), sync.rows('RuleLabel')];
  if (!labels || !items) return undefined;
  const usage = new Map<number, { count: number; last: string }>();
  for (const item of items) {
    const group = Number(item.group_id);
    const current = usage.get(group) ?? { count: 0, last: '' };
    const created = text(item.created_at);
    usage.set(group, { count: current.count + 1, last: created > current.last ? created : current.last });
  }
  return labels
    .sort((left, right) => text(left.name).toLowerCase().localeCompare(text(right.name).toLowerCase()) || byId(left, right))
    .map((label): RuleLabelPayload => ({
      id: label.id,
      name: text(label.name),
      color: text(label.color) || '#95a2b3',
      description: text(label.description),
      rule_count: usage.get(label.id)?.count ?? 0,
      last_applied_at: utcIso(usage.get(label.id)?.last),
      created_at: utcIso(label.created_at),
    }));
}
