import { ILike, type DataSource, type Repository } from 'typeorm';
import { readConfig } from '../config.ts';
import { createBuyerlyDataSource } from '../database.ts';
import { AccountEntity, UserEntity, WorkspaceEntity, WorkspaceMemberEntity } from '../entities/index.ts';
import { MetaTokenKeyring } from '../meta/tokens.ts';
import { WORLD } from './fake-meta.ts';

// Give a fresh local database a user and a workspace to open (#611, stage 5;
// port of scripts/dev_seed.py).
//
// compose.dev.yaml runs this after the migrations, so a new local stack (or a
// per-branch preview from scripts/preview.sh) has the user dev@buyerly.localhost
// and opens straight into the "Dev" workspace instead of onboarding. Sign-in
// is by email, as everywhere: the local stack writes the email, code and link
// included, to the server log (DEV_EMAIL_LOG).
//
// With the fake Meta (compose.dev.yaml) it also connects that fake's ad
// accounts, so Ads Manager has campaigns and numbers.
//
// It only adds what is missing, so it is safe on every start, and it refuses to
// run without BUYERLY_DEV_SEED=1, which only the local compose file sets.
//
//   BUYERLY_DEV_SEED=1 node server/dist/scripts/dev-seed.js

export const USERNAME = 'dev';
export const EMAIL = 'dev@buyerly.localhost';
export const WORKSPACE_NAME = 'Dev';
export const WORKSPACE_SLUG = 'dev';

export interface SeedOptions {
  metaGraphBaseUrl: string;
  metaTokenEncryptionKey: string;
  log?: (message: string) => void;
}

export async function seed(db: DataSource, options: SeedOptions): Promise<void> {
  const log = options.log ?? ((message: string) => console.log(message));
  let user!: UserEntity;
  let added: string[] = [];
  await db.transaction(async (tx) => {
    const users = tx.getRepository(UserEntity);
    // The username matches without regard to case (ilike).
    const existing = await users.findOneBy({ username: ILike(USERNAME) });
    user = existing ?? users.create({ username: USERNAME, fullName: USERNAME, role: 'admin', isApproved: true, email: null, telegramId: null, authToken: null, activeWorkspaceId: null, emailVerifiedAt: null, unconfirmedEmail: null, title: '' });
    if (!user.email) {
      // Also a local database from before email-only sign-in: its dev user had no email.
      user.email = EMAIL;
      user.emailVerifiedAt = new Date();
    }
    user = await users.save(user);

    const workspaces = tx.getRepository(WorkspaceEntity);
    let workspace = await workspaces.findOneBy({ slug: WORKSPACE_SLUG });
    if (!workspace) {
      workspace = await workspaces.save(
        workspaces.create({ name: WORKSPACE_NAME, slug: WORKSPACE_SLUG, badgeText: WORKSPACE_NAME.slice(0, 1), ownerUserId: user.id }),
      );
    }

    const members = tx.getRepository(WorkspaceMemberEntity);
    if (!(await members.existsBy({ workspaceId: workspace.id, userId: user.id }))) {
      await members.save(members.create({ workspaceId: workspace.id, userId: user.id, role: 'owner', inboxDeletedBefore: null, inboxDisplay: null, notificationChannels: null }));
    }

    if (user.activeWorkspaceId === null) user.activeWorkspaceId = workspace.id;
    user.onboardingCompleted = true;
    user.onboardingStep = 'completed';
    user = await users.save(user);

    added = await addFakeMetaAccounts(tx.getRepository(AccountEntity), workspace.id, user.id, options);
  });

  log(`dev_seed: ${user.email} owns workspace '${WORKSPACE_NAME}' (/${WORKSPACE_SLUG})`);
  if (added.length) log(`dev_seed: added fake Meta ad accounts ${added.join(', ')}`);
}

// Connect the fake Meta's ad accounts, the way batch-add would. Only when the
// MetaClient talks to the local fake (compose.dev.yaml), never to Meta itself:
// these accounts exist nowhere else.
async function addFakeMetaAccounts(
  accounts: Repository<AccountEntity>,
  workspaceId: number,
  userId: number,
  options: SeedOptions,
): Promise<string[]> {
  if (options.metaGraphBaseUrl.replace(/\/+$/, '') === 'https://graph.facebook.com') return [];
  const keyring = new MetaTokenKeyring(options.metaTokenEncryptionKey);
  const added: string[] = [];
  for (const account of WORLD.accounts.values()) {
    if (await accounts.existsBy({ accountId: account.id })) continue;
    await accounts.save(
      accounts.create({
        workspaceId,
        accountId: account.id,
        name: account.name,
        accessToken: '',
        accessTokenEncrypted: keyring.encrypt('fake-meta-token'),
        ownerUserId: userId,
        timezoneName: account.timezone,
        currency: account.currency,
        accountStatus: 1,
        statusLabel: 'Active (ACTIVE)',
        rulesEnabled: false,
        isActive: true,
      }),
    );
    added.push(account.id);
  }
  return added;
}

// The compose stack starts the seed beside the API, which may still be
// migrating: try again until the tables are there.
export function refusal(env: NodeJS.ProcessEnv): string | null {
  return env.BUYERLY_DEV_SEED === '1' ? null : 'dev_seed: refusing to run without BUYERLY_DEV_SEED=1 (local development only)';
}

async function main(): Promise<void> {
  const refused = refusal(process.env);
  if (refused) {
    console.error(refused);
    process.exit(1);
  }
  const config = readConfig();
  const db = createBuyerlyDataSource(config.databaseUrl, { poolSize: 2 });
  const attempts = Number(process.env.DEV_SEED_ATTEMPTS ?? 100);
  for (let attempt = 1; ; attempt += 1) {
    try {
      if (!db.isInitialized) await db.initialize();
      await seed(db, { metaGraphBaseUrl: config.metaGraphBaseUrl, metaTokenEncryptionKey: config.metaTokenEncryptionKey });
      break;
    } catch (error) {
      if (attempt >= attempts) {
        console.error('dev_seed: giving up', error);
        process.exit(1);
      }
      console.log(`dev_seed: the database is not ready (${(error as Error).message}); retrying`);
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }
  await db.destroy();
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
