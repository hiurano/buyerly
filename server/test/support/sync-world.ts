import { randomInt } from 'node:crypto';
import type { DataSource, EntityTarget, ObjectLiteral } from 'typeorm';
import {
  AccountEntity,
  AuditEventEntity,
  FavoriteEntity,
  InboxNotificationStateEntity,
  RuleGroupEntity,
  RulePresetEntity,
  TeamAccountEntity,
  TeamEntity,
  TeamMemberEntity,
  UserEntity,
  ViewSettingEntity,
  WorkspaceEntity,
  WorkspaceMemberEntity,
} from '../../src/entities/index.ts';
import { Browser } from './browser.ts';
import { createUser, unique } from './db.ts';
import type { Target } from './target.ts';

// The workspace the sync tests (tests/test_sync_bootstrap.py,
// tests/test_sync_stream.py) run in, made fresh for each test with unique
// names, so tests and test files never see each other's rows:
//
// - an owner, a buyer and a guest in it, a stranger in another workspace;
// - a public team (buyer, guest), a private one (owner alone), and one in the
//   other workspace;
// - ad accounts on no team, on the public team and on the private one;
// - a rule, a label, Inbox events on each account, favorites, a view setting.

export type Who = 'owner' | 'buyer' | 'guest' | 'stranger';

export interface SyncWorld {
  db: DataSource;
  ws: WorkspaceEntity;
  other: WorkspaceEntity;
  users: Record<Who, UserEntity>;
  members: Record<Who, WorkspaceMemberEntity>;
  teams: { public: TeamEntity; private: TeamEntity; elsewhere: TeamEntity };
  accounts: { loose: AccountEntity; shared: AccountEntity; hidden: AccountEntity; foreign: AccountEntity };
  rule: RulePresetEntity;
  label: RuleGroupEntity;
  events: { hidden: AuditEventEntity; shared: AuditEventEntity; loose: AuditEventEntity };
  // A browser signed in as each, bound to their workspace by X-Workspace-Slug.
  browser(who: Who): Promise<Browser>;
}

export async function save<T extends ObjectLiteral>(db: DataSource, entity: EntityTarget<T>, fields: Partial<T>): Promise<T> {
  const repository = db.getRepository(entity);
  return repository.save(repository.create(fields as T));
}

export function metaAccountId(): string {
  return `act_${randomInt(10 ** 9, 2 ** 47)}`;
}

export async function syncWorld(db: DataSource, target: Target): Promise<SyncWorld> {
  const users = {} as Record<Who, UserEntity>;
  for (const who of ['owner', 'buyer', 'guest', 'stranger'] as const) {
    users[who] = await createUser(db, { fullName: `${who} ${unique('name')}` });
  }
  const name = unique('Sync');
  const ws = await save(db, WorkspaceEntity, { name, slug: name.toLowerCase(), badgeText: 'S', badgeColor: '#3B82F6', ownerUserId: users.owner.id });
  const otherName = unique('Other');
  const other = await save(db, WorkspaceEntity, { name: otherName, slug: otherName.toLowerCase(), badgeText: 'O', badgeColor: '#3B82F6', ownerUserId: users.stranger.id });

  const members = {
    owner: await save(db, WorkspaceMemberEntity, { workspaceId: ws.id, userId: users.owner.id, role: 'owner' }),
    buyer: await save(db, WorkspaceMemberEntity, { workspaceId: ws.id, userId: users.buyer.id, role: 'member' }),
    guest: await save(db, WorkspaceMemberEntity, { workspaceId: ws.id, userId: users.guest.id, role: 'guest' }),
    stranger: await save(db, WorkspaceMemberEntity, { workspaceId: other.id, userId: users.stranger.id, role: 'owner' }),
  };
  // Inbox options of the owner's own, which only they receive.
  await db.query(`UPDATE workspace_members SET inbox_display = '{"ordering": "newest"}' WHERE id = $1`, [members.owner.id]);
  for (const who of ['owner', 'buyer', 'guest'] as const) await db.getRepository(UserEntity).update({ id: users[who].id }, { activeWorkspaceId: ws.id });
  await db.getRepository(UserEntity).update({ id: users.stranger.id }, { activeWorkspaceId: other.id });

  const teams = {
    public: await save(db, TeamEntity, { workspaceId: ws.id, name: 'Media', key: 'MED' }),
    private: await save(db, TeamEntity, { workspaceId: ws.id, name: 'Secret', key: 'SEC', private: true }),
    elsewhere: await save(db, TeamEntity, { workspaceId: other.id, name: 'Elsewhere', key: 'ELS' }),
  };
  await save(db, TeamMemberEntity, { teamId: teams.public.id, memberId: members.buyer.id });
  await save(db, TeamMemberEntity, { teamId: teams.public.id, memberId: members.guest.id });
  await save(db, TeamMemberEntity, { teamId: teams.private.id, memberId: members.owner.id, isOwner: true });

  const account = (workspaceId: number, owner: UserEntity, accountName: string, extra: Partial<AccountEntity> = {}) =>
    save(db, AccountEntity, { accountId: metaAccountId(), name: accountName, workspaceId, ownerUserId: owner.id, ...extra });
  const accounts = {
    loose: await account(ws.id, users.owner, 'No team'),
    shared: await account(ws.id, users.owner, 'Public'),
    hidden: await account(ws.id, users.owner, 'Private', { accessTokenEncrypted: 'secret-token' }),
    foreign: await account(other.id, users.stranger, 'Foreign'),
  };
  await save(db, TeamAccountEntity, { teamId: teams.public.id, accountId: accounts.shared.id });
  await save(db, TeamAccountEntity, { teamId: teams.private.id, accountId: accounts.hidden.id });

  const rule = await save(db, RulePresetEntity, { workspaceId: ws.id, ownerUserId: users.owner.id, name: 'Stop at CPL 10' });
  const label = await save(db, RuleGroupEntity, { workspaceId: ws.id, ownerUserId: users.owner.id, name: 'Scaling' });
  await save(db, RulePresetEntity, { workspaceId: other.id, ownerUserId: users.stranger.id, name: 'Theirs' });
  const events = {
    hidden: await save(db, AuditEventEntity, { workspaceId: ws.id, eventType: 'RULE_STOP', accountId: accounts.hidden.accountId }),
    shared: await save(db, AuditEventEntity, { workspaceId: ws.id, eventType: 'RULE_STOP', accountId: accounts.shared.accountId }),
    loose: await save(db, AuditEventEntity, { workspaceId: ws.id, eventType: 'TOKEN_ERROR' }),
  };
  await save(db, InboxNotificationStateEntity, { userId: users.buyer.id, auditEventId: events.shared.id, isRead: true });
  await save(db, FavoriteEntity, { memberId: members.buyer.id, kind: 'page', path: 'accounts', title: 'Ad accounts' });
  await save(db, FavoriteEntity, { memberId: members.owner.id, kind: 'page', path: 'rules', title: 'Rules' });
  await save(db, ViewSettingEntity, { memberId: members.guest.id, viewKey: 'rules', settings: { layout: 'list' } });

  const browsers = new Map<Who, Browser>();
  return {
    db, ws, other, users, members, teams, accounts, rule, label, events,
    async browser(who) {
      let browser = browsers.get(who);
      if (!browser) {
        browser = new Browser(target, { 'x-workspace-slug': (who === 'stranger' ? other : ws).slug });
        const signedIn = await browser.signIn(users[who].email!);
        if (signedIn.status !== 200) throw new Error(`Sign-in of ${who} failed: ${signedIn.status}`);
        browsers.set(who, browser);
      }
      return browser;
    },
  };
}

// The rows of one model in a bootstrap, by id.
export function idsOf(payload: { models: Record<string, { id: number }[]> }, model: string): Set<number> {
  return new Set(payload.models[model].map((row) => row.id));
}
