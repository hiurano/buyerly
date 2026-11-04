import { randomBytes } from 'node:crypto';
import type { DataSource } from 'typeorm';
import { createBuyerlyDataSource } from '../../src/database.ts';
import {
  AccountEntity,
  UserEntity,
  WorkspaceEntity,
  WorkspaceInviteEntity,
  WorkspaceMemberEntity,
} from '../../src/entities/index.ts';
import { DATABASE_URL } from './target.ts';

// Rows for contract tests, written straight to the shared database. Tests
// never truncate: every name is unique, so test files run in parallel, and
// against either server, on one database.

export function unique(prefix: string): string {
  return `${prefix}-${randomBytes(5).toString('hex')}`;
}

export async function testDatabase(): Promise<DataSource> {
  const dataSource = createBuyerlyDataSource(DATABASE_URL, { poolSize: 4 });
  await dataSource.initialize();
  return dataSource;
}

export interface UserOptions {
  username?: string;
  email?: string | null;
  verified?: boolean;
  role?: 'admin' | 'buyer';
  approved?: boolean;
  fullName?: string;
}

// A user who signs in with their email (confirmed unless `verified: false`).
export async function createUser(db: DataSource, options: UserOptions = {}): Promise<UserEntity> {
  const username = options.username ?? unique('user');
  const email = options.email === undefined ? `${username}@example.test` : options.email;
  return db.getRepository(UserEntity).save(
    db.getRepository(UserEntity).create({
      username,
      email,
      emailVerifiedAt: options.verified === false || email === null ? null : new Date(),
      role: options.role ?? 'buyer',
      isApproved: options.approved ?? true,
      fullName: options.fullName ?? username,
    }),
  );
}

// A workspace the user owns, with one ad account, active for them.
export async function createWorkspace(db: DataSource, owner: UserEntity, name = unique('Workspace')): Promise<WorkspaceEntity> {
  const workspace = await db.getRepository(WorkspaceEntity).save(
    db.getRepository(WorkspaceEntity).create({
      name,
      slug: name.toLowerCase(),
      badgeText: name.slice(0, 1).toUpperCase(),
      badgeColor: '#3B82F6',
      ownerUserId: owner.id,
    }),
  );
  await db.getRepository(WorkspaceMemberEntity).save({ workspaceId: workspace.id, userId: owner.id, role: 'owner', joinedAt: new Date() });
  await db.getRepository(UserEntity).update({ id: owner.id }, { activeWorkspaceId: workspace.id });
  await db.getRepository(AccountEntity).save(
    db.getRepository(AccountEntity).create({
      accountId: `act_${randomBytes(6).readUIntBE(0, 6)}`,
      name: 'Test account',
      ownerUserId: owner.id,
      workspaceId: workspace.id,
      timezoneName: 'UTC',
      currency: 'USD',
      rulesEnabled: false,
      isActive: true,
    }),
  );
  return workspace;
}

export async function createInvite(
  db: DataSource,
  options: { workspace: WorkspaceEntity; inviter: UserEntity; email: string | null; status?: string; maxUses?: number; usedCount?: number; expiresAt?: Date | null },
): Promise<WorkspaceInviteEntity> {
  return db.getRepository(WorkspaceInviteEntity).save(
    db.getRepository(WorkspaceInviteEntity).create({
      workspaceId: options.workspace.id,
      token: unique('invite-token'),
      email: options.email,
      role: 'buyer',
      inviterUserId: options.inviter.id,
      status: options.status ?? 'pending',
      maxUses: options.maxUses ?? 1,
      usedCount: options.usedCount ?? 0,
      expiresAt: options.expiresAt === undefined ? new Date(Date.now() + 7 * 86_400_000) : options.expiresAt,
    }),
  );
}
