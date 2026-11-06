import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DataSource } from 'typeorm';
import { FavoriteEntity, UserEntity, ViewSettingEntity, WorkspaceMemberEntity, type WorkspaceEntity } from '../../src/entities/index.ts';
import { Browser } from '../support/browser.ts';
import { createUser, createWorkspace, testDatabase } from '../support/db.ts';
import { DATABASE_URL, contractTarget, type Target } from '../support/target.ts';

// Views and favorites over GraphQL (tests/test_view_settings.py,
// tests/test_favorites.py), against either server.

interface GraphQLAnswer {
  data: Record<string, unknown> | null;
  errors?: { message: string; extensions?: { statusCode?: number } }[];
}

const RULES_VIEW = { grouping: 'label', ordering: 'name', direction: 'asc' };
const RULES = { kind: 'page', path: 'team/TES/rules', title: 'Rules' };

const SAVE = 'mutation($key: String!, $input: JSON!) { viewSettingUpdate(key: $key, input: $input) { success lastSyncId viewSetting } }';
const DEFAULT = 'mutation($key: String!, $input: JSON!) { workspaceViewDefaultUpdate(key: $key, input: $input) { success viewSetting } }';
const RESET = 'mutation($key: String!) { viewSettingReset(key: $key) { success } }';
const STAR = 'mutation($input: JSON!) { favoriteCreate(input: $input) { success lastSyncId favorite } }';
const UNSTAR = 'mutation($id: Int!) { favoriteDelete(id: $id) { success } }';

describe.skipIf(!DATABASE_URL)('views and favorites', () => {
  let target: Target;
  let db: DataSource;

  beforeAll(async () => {
    target = await contractTarget();
    db = await testDatabase();
  });

  afterAll(async () => {
    await target?.close();
    await db?.destroy();
  });

  interface Member { browser: Browser; user: UserEntity; workspace: WorkspaceEntity }

  async function signIn(user: UserEntity, workspace: WorkspaceEntity): Promise<Browser> {
    const browser = new Browser(target, { 'x-workspace-slug': workspace.slug });
    expect((await browser.signIn(user.email!)).status).toBe(200);
    return browser;
  }

  async function owner(): Promise<Member> {
    const user = await createUser(db);
    const workspace = await createWorkspace(db, user);
    return { browser: await signIn(user, workspace), user, workspace };
  }

  async function joined(workspace: WorkspaceEntity, role = 'buyer'): Promise<Member> {
    const user = await createUser(db);
    await db.getRepository(WorkspaceMemberEntity).save({ workspaceId: workspace.id, userId: user.id, role, joinedAt: new Date() });
    await db.getRepository(UserEntity).update({ id: user.id }, { activeWorkspaceId: workspace.id });
    return { browser: await signIn(user, workspace), user, workspace };
  }

  async function graphql(member: Member, query: string, variables?: Record<string, unknown>): Promise<GraphQLAnswer> {
    const answer = await member.browser.post('/api/graphql', { query, variables }, member.browser.csrf());
    expect(answer.status).toBe(200);
    return answer.body as GraphQLAnswer;
  }

  async function views(member: Member): Promise<{ views: Record<string, unknown>; defaults: Record<string, unknown> }> {
    const { data, errors } = await graphql(member, '{ viewSettings }');
    expect(errors).toBeUndefined();
    return data!.viewSettings as { views: Record<string, unknown>; defaults: Record<string, unknown> };
  }

  async function favorites(member: Member): Promise<Record<string, unknown>[]> {
    const { data, errors } = await graphql(member, '{ favorites }');
    expect(errors).toBeUndefined();
    return (data!.favorites as { favorites: Record<string, unknown>[] }).favorites;
  }

  const refusal = (answer: GraphQLAnswer): [number | undefined, string | undefined] =>
    [answer.errors?.[0].extensions?.statusCode, answer.errors?.[0].message];

  describe('view settings', () => {
    it('starts from the defaults', async () => {
      expect(await views(await owner())).toEqual({ views: {}, defaults: {} });
    });

    it('saves a view and replaces the last one', async () => {
      const me = await owner();
      const saved = await graphql(me, SAVE, { key: 'rules', input: { settings: RULES_VIEW } });
      expect(saved.data!.viewSettingUpdate).toMatchObject({ success: true, viewSetting: { view_key: 'rules', settings: RULES_VIEW } });
      expect(typeof (saved.data!.viewSettingUpdate as { lastSyncId: unknown }).lastSyncId).toBe('number');
      const changed = { ...RULES_VIEW, grouping: 'none' };
      await graphql(me, SAVE, { key: 'rules', input: { settings: changed } });
      await graphql(me, SAVE, { key: 'ads-manager.campaigns', input: { settings: { layout: 'board' } } });
      expect((await views(me)).views).toEqual({ rules: changed, 'ads-manager.campaigns': { layout: 'board' } });
      const member = await db.getRepository(WorkspaceMemberEntity).findOneByOrFail({ userId: me.user.id });
      expect(await db.getRepository(ViewSettingEntity).countBy({ memberId: member.id, viewKey: 'rules' })).toBe(1);
    });

    it('keeps views per member', async () => {
      const me = await owner();
      const buyer = await joined(me.workspace);
      await graphql(me, SAVE, { key: 'rules', input: { settings: RULES_VIEW } });
      expect((await views(buyer)).views).toEqual({});
    });

    it('keeps views and defaults per workspace, and an ads manager level its own view', async () => {
      const me = await owner();
      const elsewhere = await createWorkspace(db, me.user);
      const there: Member = { browser: await signIn(me.user, elsewhere), user: me.user, workspace: elsewhere };
      await graphql(me, SAVE, { key: 'ads-manager.campaigns', input: { settings: { ordering: 'spend' } } });
      await graphql(me, SAVE, { key: 'ads-manager.adsets', input: { settings: { ordering: 'name' } } });
      await graphql(me, DEFAULT, { key: 'rules', input: { settings: RULES_VIEW } });
      expect(await views(me)).toEqual({
        views: { 'ads-manager.campaigns': { ordering: 'spend' }, 'ads-manager.adsets': { ordering: 'name' } },
        defaults: { rules: RULES_VIEW },
      });
      expect(await views(there)).toEqual({ views: {}, defaults: {} });
      // Defaults are checked like views.
      expect(refusal(await graphql(there, DEFAULT, { key: 'Rules', input: { settings: RULES_VIEW } }))).toEqual([404, 'Unknown view.']);
      expect(refusal(await graphql(there, DEFAULT, { key: 'rules', input: { settings: { filters: ['x'.repeat(20_000)] } } })))
        .toEqual([422, 'View settings must be under 16 KB']);
    });

    it('refuses a signed-out request, and drops the views of a member who leaves', async () => {
      expect((await new Browser(target).post('/api/graphql', { query: '{ viewSettings }' })).status).toBe(401);
      const me = await owner();
      const buyer = await joined(me.workspace);
      await graphql(buyer, SAVE, { key: 'rules', input: { settings: RULES_VIEW } });
      const member = await db.getRepository(WorkspaceMemberEntity).findOneByOrFail({ workspaceId: me.workspace.id, userId: buyer.user.id });
      expect(await db.getRepository(ViewSettingEntity).countBy({ memberId: member.id })).toBe(1);
      await db.getRepository(WorkspaceMemberEntity).delete({ id: member.id });
      expect(await db.getRepository(ViewSettingEntity).countBy({ memberId: member.id })).toBe(0);
    });

    it('resets a view, also one never changed', async () => {
      const me = await owner();
      await graphql(me, SAVE, { key: 'rules', input: { settings: RULES_VIEW } });
      await graphql(me, SAVE, { key: 'inbox', input: { settings: { filters: [] } } });
      expect((await graphql(me, RESET, { key: 'rules' })).data!.viewSettingReset).toEqual({ success: true });
      expect((await views(me)).views).toEqual({ inbox: { filters: [] } });
      expect((await graphql(me, RESET, { key: 'rules' })).data!.viewSettingReset).toEqual({ success: true });
    });

    it('refuses bad keys and bodies', async () => {
      const me = await owner();
      for (const key of ['Rules', 'rules.', '-rules', 'a'.repeat(40), 'rules.campaigns.ads', 'rules%20x']) {
        expect(refusal(await graphql(me, SAVE, { key, input: { settings: RULES_VIEW } })), key).toEqual([404, 'Unknown view.']);
      }
      expect(refusal(await graphql(me, SAVE, { key: 'rules', input: { settings: ['list'] } })))
        .toEqual([422, 'Input should be a valid dictionary']);
      expect(refusal(await graphql(me, SAVE, { key: 'rules', input: {} }))).toEqual([422, 'Field required']);
      expect(refusal(await graphql(me, SAVE, { key: 'rules', input: { settings: { filters: ['x'.repeat(20_000)] } } })))
        .toEqual([422, 'View settings must be under 16 KB']);
      // json.dumps escapes non-ASCII: 3000 Cyrillic letters are 18000 characters.
      expect(refusal(await graphql(me, SAVE, { key: 'rules', input: { settings: { q: 'я'.repeat(3000) } } })))
        .toEqual([422, 'View settings must be under 16 KB']);
      // The body is checked before the key.
      expect(refusal(await graphql(me, SAVE, { key: 'Rules', input: {} }))).toEqual([422, 'Field required']);
      expect((await views(me)).views).toEqual({});
    });

    it('lets an admin set the default for everyone, and clear it', async () => {
      const me = await owner();
      const buyer = await joined(me.workspace);
      const board = { layout: 'board', grouping: 'status' };
      const set = await graphql(me, DEFAULT, { key: 'ads-manager.campaigns', input: { settings: board } });
      expect(set.data!.workspaceViewDefaultUpdate).toEqual({ success: true, viewSetting: { view_key: 'ads-manager.campaigns', settings: board } });
      expect(await views(buyer)).toEqual({ views: {}, defaults: { 'ads-manager.campaigns': board } });
      const cleared = await graphql(me, DEFAULT, { key: 'ads-manager.campaigns', input: { settings: {} } });
      expect(cleared.data!.workspaceViewDefaultUpdate).toEqual({ success: true, viewSetting: { view_key: 'ads-manager.campaigns', settings: {} } });
      expect((await views(buyer)).defaults).toEqual({});
    });

    it('lets only admins and owners set defaults', async () => {
      const me = await owner();
      for (const role of ['buyer', 'viewer']) {
        const member = await joined(me.workspace, role);
        expect(refusal(await graphql(member, DEFAULT, { key: 'rules', input: { settings: { grouping: 'none' } } })), role)
          .toEqual([403, "Only admins can set a view's default for everyone."]);
      }
      const admin = await joined(me.workspace, 'admin');
      await graphql(admin, DEFAULT, { key: 'rules', input: { settings: { grouping: 'none' } } });
      expect((await views(me)).defaults).toEqual({ rules: { grouping: 'none' } });
      expect(refusal(await graphql(me, DEFAULT, { key: 'Rules', input: { settings: RULES_VIEW } }))).toEqual([404, 'Unknown view.']);
    });
  });

  describe('favorites', () => {
    it('lists a favorite once, in the order starred', async () => {
      const me = await owner();
      expect(await favorites(me)).toEqual([]);
      const first = await graphql(me, STAR, { input: RULES });
      const payload = first.data!.favoriteCreate as { success: boolean; favorite: Record<string, unknown> };
      expect(payload.success).toBe(true);
      expect(payload.favorite).toMatchObject({ ...RULES, position: 1 });
      await graphql(me, STAR, { input: { kind: 'account', path: 'accounts/act_1001', title: '  Main account ' } });
      const again = await graphql(me, STAR, { input: { ...RULES, title: 'Other name' } });
      expect((again.data!.favoriteCreate as { favorite: unknown }).favorite).toEqual(payload.favorite);
      expect((await favorites(me)).map(({ path, title, kind, position }) => [path, title, kind, position])).toEqual([
        ['team/TES/rules', 'Rules', 'page', 1],
        ['accounts/act_1001', 'Main account', 'account', 2],
      ]);
    });

    it("keeps each member's own, and unstars only your own", async () => {
      const me = await owner();
      const buyer = await joined(me.workspace);
      const mine = ((await graphql(me, STAR, { input: RULES })).data!.favoriteCreate as { favorite: { id: number } }).favorite;
      expect(await favorites(buyer)).toEqual([]);
      expect((await graphql(buyer, UNSTAR, { id: mine.id })).data!.favoriteDelete).toEqual({ success: true });
      expect(await favorites(me)).toHaveLength(1);
      expect((await graphql(me, UNSTAR, { id: mine.id })).data!.favoriteDelete).toEqual({ success: true });
      expect(await favorites(me)).toEqual([]);
      expect((await graphql(me, UNSTAR, { id: mine.id })).data!.favoriteDelete).toEqual({ success: true });
    });

    it('refuses unknown kinds, foreign addresses and empty names', async () => {
      const me = await owner();
      const cases: [Record<string, unknown>, string][] = [
        [{ ...RULES, kind: 'issue' }, 'Unknown kind of favorite.'],
        [{ ...RULES, path: '/buyerly/rules' }, 'Not an address in the workspace.'],
        [{ ...RULES, path: 'team/../admin' }, 'Not an address in the workspace.'],
        [{ ...RULES, path: 'https://example.com' }, 'Not an address in the workspace.'],
        [{ ...RULES, title: '   ' }, 'A favorite needs a name of at most 200 characters.'],
        [{ ...RULES, title: 'x'.repeat(201) }, 'A favorite needs a name of at most 200 characters.'],
        [{ ...RULES, kind: 7, title: '' }, 'Input should be a valid string A favorite needs a name of at most 200 characters.'],
        [{ path: 'rules' }, 'Field required Field required'],
      ];
      for (const [input, message] of cases) {
        expect(refusal(await graphql(me, STAR, { input })), JSON.stringify(input)).toEqual([422, message]);
      }
      expect(await favorites(me)).toEqual([]);
    });

    it('keeps at most a hundred', async () => {
      const me = await owner();
      const member = await db.getRepository(WorkspaceMemberEntity).findOneByOrFail({ userId: me.user.id });
      await db.getRepository(FavoriteEntity).save(Array.from({ length: 100 }, (_, n) => ({
        memberId: member.id, kind: 'page', path: `page-${n}`, title: `Page ${n}`, position: n, createdAt: new Date(),
      })));
      expect(refusal(await graphql(me, STAR, { input: RULES }))).toEqual([400, 'Too many favorites.']);
      expect(await db.getRepository(FavoriteEntity).countBy({ memberId: member.id })).toBe(100);
    });
  });
});
