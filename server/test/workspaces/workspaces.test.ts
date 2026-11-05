import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DataSource } from 'typeorm';
import { AuditEventEntity, UserEntity, WorkspaceEntity, WorkspaceInviteEntity, WorkspaceMemberEntity } from '../../src/entities/index.ts';
import { normalizeWorkspaceSlug, MAX_WORKSPACE_SLUG_LENGTH, RESERVED_WORKSPACE_SLUGS } from '../../src/workspaces/slugs.ts';
import { Browser } from '../support/browser.ts';
import { createInvite, createUser, createWorkspace, testDatabase, unique, type UserOptions } from '../support/db.ts';
import { DATABASE_URL, contractTarget, type Target } from '../support/target.ts';

// Workspaces, email invites and onboarding over GraphQL (tests/test_workspaces.py
// lifecycle, URL change, slug conflicts, invites, resend, single-use and
// targeted invites): the same answers, refusals, audit events, emails and
// side effects from either server.

interface Answer {
  data: Record<string, unknown> | null;
  errors?: { message: string; extensions?: { statusCode?: number } }[];
}

type Row = Record<string, unknown>;

describe('workspace slugs', () => {
  it('normalizes the same way on every host, ASCII only and bounded', () => {
    expect(normalizeWorkspaceSlug('Канада Трафик')).toBe(normalizeWorkspaceSlug('Канада Трафик'));
    expect(normalizeWorkspaceSlug('Канада Трафик')).toMatch(/^workspace-[0-9a-f]{8}$/);
    expect(normalizeWorkspaceSlug('Crème & Media')).toBe('creme-media');
    expect(normalizeWorkspaceSlug('广告投放')).toMatch(/^workspace-[0-9a-f]{8}$/);
    expect(normalizeWorkspaceSlug('a'.repeat(100)).length).toBeLessThanOrEqual(MAX_WORKSPACE_SLUG_LENGTH);
    expect(normalizeWorkspaceSlug('')).toBe('workspace');
    // Python's _stable_fallback_hash("канада трафик").
    expect(normalizeWorkspaceSlug('Канада Трафик')).toBe('workspace-242df431');
    for (const slug of ['api', 'auth', 'connect', 'create-workspace', 'invite', 'login', 'signup', 'changelog', 'uploads']) {
      expect(RESERVED_WORKSPACE_SLUGS.has(slug)).toBe(true);
    }
    for (const slug of ['register', 'w', 'welcome', 'dashboard', 'home']) expect(RESERVED_WORKSPACE_SLUGS.has(slug)).toBe(false);
  });
});

describe.skipIf(!DATABASE_URL)('workspaces, invites and onboarding', () => {
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

  interface Person {
    user: UserEntity;
    call(query: string, variables?: Record<string, unknown>): Promise<Answer>;
  }

  async function person(user: UserEntity, workspace?: WorkspaceEntity): Promise<Person> {
    const browser = new Browser(target, workspace ? { 'x-workspace-slug': workspace.slug } : {});
    expect((await browser.signIn(user.email!)).status).toBe(200);
    return {
      user,
      async call(query, variables) {
        const answer = await browser.post('/api/graphql', { query, variables }, browser.csrf());
        expect(answer.status).toBe(200);
        return answer.body as Answer;
      },
    };
  }

  async function world() {
    const ownerUser = await createUser(db, { fullName: 'Artem Owner' });
    const ws = await createWorkspace(db, ownerUser);
    const join = async (role: string, options: UserOptions = {}) => {
      const user = await createUser(db, options);
      await db.getRepository(WorkspaceMemberEntity).save({ workspaceId: ws.id, userId: user.id, role, joinedAt: new Date() });
      await db.getRepository(UserEntity).update({ id: user.id }, { activeWorkspaceId: ws.id });
      return person(user, ws);
    };
    const owner = await person(ownerUser, ws);
    const admin = await join('admin', { fullName: 'Bob Admin' });
    const member = await join('member', { fullName: 'Charlie Member' });
    const outsiderUser = await createUser(db);
    const outsider = await person(outsiderUser, await createWorkspace(db, outsiderUser));
    return { ws, owner, admin, member, outsider };
  }

  function refusal(answer: Answer): [number | undefined, string] {
    expect(answer.errors, JSON.stringify(answer)).toBeDefined();
    return [answer.errors![0].extensions?.statusCode, answer.errors![0].message];
  }

  function data<T>(answer: Answer, field: string, entity?: string): T {
    expect(answer.errors, JSON.stringify(answer.errors)).toBeUndefined();
    const value = answer.data![field];
    return (entity ? (value as Row)[entity] : value) as T;
  }

  async function logoOf(userId: number): Promise<string> {
    const name = `logo_${userId}_1700000000_${unique('x').slice(2, 10)}.png`;
    await mkdir(join(target.uploadsRoot, 'workspaces'), { recursive: true });
    await writeFile(join(target.uploadsRoot, 'workspaces', name), Buffer.from('logo'));
    return `/uploads/workspaces/${name}`;
  }

  const logoFile = (url: string) => join(target.uploadsRoot, 'workspaces', url.split('/').pop()!);

  const CREATE = 'mutation($input: JSON!) { workspaceCreate(input: $input) { success workspace } }';
  const UPDATE = 'mutation($id: Int!, $input: JSON!) { workspaceUpdate(id: $id, input: $input) { workspace } }';
  const DELETE = 'mutation($id: Int!) { workspaceDelete(id: $id) { workspace } }';
  const SWITCH = 'mutation($input: JSON!) { workspaceSwitch(input: $input) { workspace } }';
  const SLUG = 'query($slug: String!) { workspaceSlugCheck(slug: $slug) }';
  const INVITE = 'mutation($ws: Int!, $input: JSON!) { workspaceInviteCreate(workspaceId: $ws, input: $input) { workspaceInvite } }';
  const RESEND = 'mutation($ws: Int!, $id: Int!) { workspaceInviteResend(workspaceId: $ws, id: $id) { workspaceInvite } }';
  const ACCEPT = 'mutation($token: String!) { workspaceInviteAccept(token: $token) { workspaceInvite } }';
  const DETAILS = 'mutation($input: JSON!) { onboardingPersonalDetailsUpdate(input: $input) { onboarding } }';
  const FIRST = 'mutation($input: JSON!) { onboardingWorkspaceCreate(input: $input) { onboarding } }';
  const TEAMMATES = 'mutation($input: JSON!) { onboardingInvitesSend(input: $input) { onboarding } }';
  const SKIP = 'mutation { onboardingSkip { onboarding } }';

  it('creates, renames, switches and deletes a workspace', async () => {
    const w = await world();
    const name = unique('Canada Traffic');
    const created = data<Row>(await w.owner.call(CREATE, { input: { name, badge_color: '#7C3AED', badge_text: 'C' } }), 'workspaceCreate', 'workspace');
    expect(created).toEqual({
      id: expect.any(Number) as number, name, slug: normalizeWorkspaceSlug(name), badge_text: 'C', badge_color: '#7C3AED', logo_url: '',
      role: 'owner', is_active: true, accounts_count: 0, members_count: 1,
    });
    const id = created.id as number;
    const owner = await db.getRepository(UserEntity).findOneByOrFail({ id: w.owner.user.id });
    expect([owner.activeWorkspaceId, owner.onboardingStep, owner.onboardingCompleted]).toEqual([id, 'completed', true]);
    // It starts with a team named after it, the owner on it as its owner.
    const [team] = await db.query<Row[]>('SELECT t.name, tm.is_owner FROM teams t JOIN team_members tm ON tm.team_id = t.id WHERE t.workspace_id = $1', [id]);
    expect(team).toEqual({ name, is_owner: true });

    const renamed = data<Row>(await w.owner.call(UPDATE, { id, input: { name: `${name} Pro`, badge_color: '#1D4ED8' } }), 'workspaceUpdate', 'workspace');
    expect([renamed.name, renamed.badge_color]).toEqual([`${name} Pro`, '#1D4ED8']);

    const switched = data<Row>(await w.owner.call(SWITCH, { input: { slug: w.ws.slug } }), 'workspaceSwitch', 'workspace');
    expect(switched.status).toBe('ok');
    expect((switched.active_workspace as Row).slug).toBe(w.ws.slug);
    expect((await db.getRepository(UserEntity).findOneByOrFail({ id: w.owner.user.id })).activeWorkspaceId).toBe(w.ws.id);
    expect(refusal(await w.owner.call(SWITCH, { input: { slug: unique('missing') } }))).toEqual([404, 'Workspace not found']);
    expect(refusal(await w.outsider.call(SWITCH, { input: { workspace_id: w.ws.id } }))).toEqual([403, 'You do not have access to this workspace']);

    expect(refusal(await w.member.call(UPDATE, { id: w.ws.id, input: { name: 'Mine' } })))
      .toEqual([403, 'You do not have permission to edit this workspace']);
    const blocked = await db.getRepository(AuditEventEntity).findOneByOrFail({ workspaceId: w.ws.id, action: 'UPDATE_WORKSPACE' });
    expect([blocked.eventType, blocked.status]).toEqual(['UNAUTHORIZED_ACCESS_ATTEMPT', 'BLOCKED']);
    expect(refusal(await w.admin.call(DELETE, { id: w.ws.id }))).toEqual([403, 'Only the owner can delete a workspace']);

    const deleted = data<Row>(await w.owner.call(DELETE, { id }), 'workspaceDelete', 'workspace');
    expect(deleted).toEqual({ status: 'ok', message: 'Workspace deleted', next_workspace_id: w.ws.id });
    expect(await db.getRepository(WorkspaceEntity).findOneBy({ id })).toBeNull();
    expect(refusal(await w.owner.call(DELETE, { id: w.ws.id }))).toEqual([400, 'You cannot delete your only workspace']);
    expect(refusal(await w.owner.call(DELETE, { id: 2_000_000_000 }))).toEqual([404, 'Workspace not found']);
  });

  it('keeps workspace addresses unique and the server ones reserved', async () => {
    const w = await world();
    const name = unique('Канада Трафик Media');
    const [first, second] = await Promise.all([w.owner.call(CREATE, { input: { name } }), w.owner.call(CREATE, { input: { name } })]);
    const conflict = first.errors ? first : second;
    expect([first, second].filter((answer) => !answer.errors)).toHaveLength(1);
    expect(refusal(conflict)).toEqual([409, 'That workspace name is already taken']);
    expect(refusal(await w.owner.call(CREATE, { input: { name: 'API', slug: 'api' } }))).toEqual([409, 'That workspace address is unavailable']);
    expect(refusal(await w.owner.call(CREATE, { input: { name: '   ' } }))).toEqual([400, 'A workspace name is required']);
    expect(refusal(await w.owner.call(CREATE, { input: {} }))).toEqual([422, 'Field required']);
    expect(refusal(await w.owner.call(CREATE, { input: { name: 'x', logo_url: 'ftp://logo' } })))
      .toEqual([422, 'logo_url must start with https://, http:// or /uploads/workspaces/']);

    // Settings → Workspace → URL normalizes what is typed, as creation does.
    const own = data<Row>(await w.owner.call(CREATE, { input: { name: unique('Url') } }), 'workspaceCreate', 'workspace');
    const moved = data<Row>(await w.owner.call(UPDATE, { id: own.id, input: { slug: `${String(own.slug)} Media` } }), 'workspaceUpdate', 'workspace');
    expect(moved.slug).toBe(`${String(own.slug)}-media`);
    expect(data<Row>(await w.owner.call(UPDATE, { id: own.id, input: { slug: `${String(own.slug)}-media` } }), 'workspaceUpdate', 'workspace').slug)
      .toBe(`${String(own.slug)}-media`);
    const taken = (await db.getRepository(WorkspaceEntity).findOneByOrFail({ ownerUserId: w.outsider.user.id })).slug;
    expect(refusal(await w.owner.call(UPDATE, { id: own.id, input: { slug: taken } }))).toEqual([409, 'That workspace URL is already taken']);
    expect(refusal(await w.owner.call(UPDATE, { id: own.id, input: { slug: 'api' } }))).toEqual([409, 'That workspace address is unavailable']);

    const check = async (slug: string) => data<Row>(await w.owner.call(SLUG, { slug }), 'workspaceSlugCheck');
    expect(await check('api')).toEqual({ slug: 'api', available: false, message: 'That slug is reserved by the system' });
    expect(await check(taken.toUpperCase())).toEqual({ slug: taken, available: false, message: 'That workspace address is already taken' });
    const free = unique('free');
    expect(await check(` ${free} `)).toEqual({ slug: free, available: true, message: 'Address available' });
    expect(refusal(await w.owner.call(SLUG, { slug: 'a' }))).toEqual([422, 'String should have at least 2 characters']);
  });

  it('attaches only the uploader’s own logo and drops the one it replaces', async () => {
    const w = await world();
    const foreign = await logoOf(w.outsider.user.id);
    expect(refusal(await w.owner.call(CREATE, { input: { name: unique('Logo'), logo_url: foreign } })))
      .toEqual([400, 'Logo not found, or it belongs to another user']);
    const first = await logoOf(w.owner.user.id);
    const created = data<Row>(await w.owner.call(CREATE, { input: { name: unique('Logo'), logo_url: first } }), 'workspaceCreate', 'workspace');
    expect(created.logo_url).toBe(first);
    const second = await logoOf(w.owner.user.id);
    const updated = data<Row>(await w.owner.call(UPDATE, { id: created.id, input: { logo_url: second } }), 'workspaceUpdate', 'workspace');
    expect(updated.logo_url).toBe(second);
    expect([existsSync(logoFile(first)), existsSync(logoFile(second)), existsSync(logoFile(foreign))]).toEqual([false, true, true]);
    data(await w.owner.call(DELETE, { id: created.id }), 'workspaceDelete');
    expect(existsSync(logoFile(second))).toBe(false);
  });

  it('invites by email, sends the invitation and records both', async () => {
    const w = await world();
    const email = `${unique('dave')}@example.test`;
    expect(refusal(await w.member.call(INVITE, { ws: w.ws.id, input: { email } }))).toEqual([403, 'You do not have permission to create invites']);
    expect(refusal(await w.outsider.call(INVITE, { ws: w.ws.id, input: { email } }))).toEqual([403, 'You do not have access to this workspace']);
    expect(refusal(await w.owner.call(INVITE, { ws: w.ws.id, input: { email, expires_in_days: 0 } })))
      .toEqual([422, 'Input should be greater than or equal to 1']);

    const invite = data<Row>(await w.admin.call(INVITE, { ws: w.ws.id, input: { email: ` ${email.toUpperCase()} ` } }), 'workspaceInviteCreate', 'workspaceInvite');
    expect(invite).toMatchObject({
      workspace_id: w.ws.id, workspace_name: w.ws.name, email, role: 'member', status: 'pending', max_uses: 1, used_count: 0, inviter_name: 'Bob Admin',
    });
    expect(invite.token).toMatch(/^inv_[A-Za-z0-9_-]{32}$/);
    expect(invite.invite_url).toBe(`https://buyerly.test/invite/${String(invite.token)}`);
    const days = (Date.parse(invite.expires_at as string) - Date.parse(invite.created_at as string)) / 86_400_000;
    expect(Math.round(days)).toBe(7);
    const mail = await target.lastEmail(email);
    expect(mail.text).toBe(`You've been invited to join ${w.ws.name} on Buyerly by Bob Admin.\n\nClick the link below to accept your invitation:\nhttps://buyerly.app/invite/${String(invite.token)}`);
    const events = await db.getRepository(AuditEventEntity).find({ where: { workspaceId: w.ws.id, category: 'WORKSPACE_INVITE' }, order: { id: 'ASC' } });
    expect(events.map((event) => [event.eventType, event.status, event.message])).toEqual([
      ['INVITE_CREATE', 'SUCCESS', `Invite created for ${email}`],
      ['INVITE_SEND', 'SUCCESS', `Invite delivery to ${email}: success`],
    ]);
    expect(events[0].details).toEqual({ invite_id: invite.id, email, role: 'member', max_uses: 1 });
    // No raw token in the audit log.
    expect(JSON.stringify(events)).not.toContain(invite.token as string);

    const link = data<Row>(await w.owner.call(INVITE, { ws: w.ws.id, input: { role: 'guest', max_uses: 0 } }), 'workspaceInviteCreate', 'workspaceInvite');
    expect([link.email, link.role, link.max_uses]).toEqual([null, 'guest', 0]);
  });

  it('sends a pending invite again with a fresh expiry', async () => {
    const w = await world();
    const email = `${unique('erin')}@example.test`;
    const invite = await createInvite(db, { workspace: w.ws, inviter: w.owner.user, email, expiresAt: new Date(Date.now() - 1000) });
    const resent = data<Row>(await w.owner.call(RESEND, { ws: w.ws.id, id: invite.id }), 'workspaceInviteResend', 'workspaceInvite');
    expect([resent.status, resent.message]).toEqual(['ok', 'Invite resent']);
    expect(Math.round((Date.parse(resent.expires_at as string) - Date.now()) / 86_400_000)).toBe(7);
    expect((await target.lastEmail(email)).text).toContain(`https://buyerly.app/invite/${String(invite.token)}`);
    const event = await db.getRepository(AuditEventEntity).findOneByOrFail({ workspaceId: w.ws.id, eventType: 'INVITE_SEND' });
    expect([event.status, event.message, event.details]).toEqual(['SUCCESS', `Invite resent to ${email}: success`, { invite_id: invite.id, email, resend: true }]);

    const link = await createInvite(db, { workspace: w.ws, inviter: w.owner.user, email: null });
    expect(refusal(await w.owner.call(RESEND, { ws: w.ws.id, id: link.id }))).toEqual([400, 'Only a pending email invite can be resent']);
    expect(refusal(await w.owner.call(RESEND, { ws: w.ws.id, id: 2_000_000_000 }))).toEqual([404, 'Invite not found']);
    expect(refusal(await w.member.call(RESEND, { ws: w.ws.id, id: invite.id }))).toEqual([403, 'You do not have permission to resend invites']);
  });

  it('joins through an invite once, and tells whoever sent it', async () => {
    const w = await world();
    const link = await createInvite(db, { workspace: w.ws, inviter: w.owner.user, email: null, maxUses: 1 });
    await db.getRepository(WorkspaceInviteEntity).update({ id: link.id }, { role: 'guest' });
    const daveUser = await createUser(db, { fullName: 'Dave New' });
    const dave = await person(daveUser, await createWorkspace(db, daveUser));

    const joined = data<Row>(await dave.call(ACCEPT, { token: link.token }), 'workspaceInviteAccept', 'workspaceInvite');
    expect(joined).toEqual({
      status: 'ok', message: `You have joined the workspace ${w.ws.name}`, workspace_id: w.ws.id, workspace_slug: w.ws.slug,
      role: 'guest', onboarding_step: 'completed', onboarding_completed: true,
    });
    const member = await db.getRepository(WorkspaceMemberEntity).findOneByOrFail({ workspaceId: w.ws.id, userId: daveUser.id });
    expect(member.role).toBe('guest');
    expect((await db.getRepository(UserEntity).findOneByOrFail({ id: daveUser.id })).activeWorkspaceId).toBe(w.ws.id);
    expect(await db.getRepository(WorkspaceInviteEntity).findOneByOrFail({ id: link.id })).toMatchObject({ status: 'accepted', usedCount: 1 });
    const mail = await target.lastEmail(w.owner.user.email!);
    expect(mail.text).toBe([
      'Dave New joined your Buyerly workspace', '', 'Invite more teammates to your workspace:',
      `https://buyerly.test/${w.ws.slug}/settings/members`, '', `Unsubscribe: https://buyerly.test/${w.ws.slug}/settings/account/notifications`,
    ].join('\n'));

    // The winner's retry changes nothing; anyone else finds it used up.
    expect(data<Row>(await dave.call(ACCEPT, { token: link.token }), 'workspaceInviteAccept', 'workspaceInvite').role).toBe('guest');
    expect((await db.getRepository(WorkspaceInviteEntity).findOneByOrFail({ id: link.id })).usedCount).toBe(1);
    expect(refusal(await w.outsider.call(ACCEPT, { token: link.token }))).toEqual([400, 'This invite has reached its usage limit']);
    const events = await db.getRepository(AuditEventEntity).find({ where: { workspaceId: w.ws.id, category: 'WORKSPACE_INVITE' }, order: { id: 'ASC' } });
    expect(events.map((event) => [event.eventType, event.status, event.details.reason ?? null])).toEqual([
      ['INVITE_ACCEPT', 'SUCCESS', null], ['INVITE_ACCEPT', 'SUCCESS', null], ['INVITE_REJECT', 'FAILED', 'max_uses_reached'],
    ]);
    expect(events[0].details).toEqual({ invite_id: link.id, workspace_id: w.ws.id, user_id: daveUser.id, role: 'guest' });
    expect(refusal(await dave.call(ACCEPT, { token: unique('inv_missing') }))).toEqual([404, 'Invite not found']);
  });

  it('refuses revoked, expired and other people’s invites', async () => {
    const w = await world();
    const revoked = await createInvite(db, { workspace: w.ws, inviter: w.owner.user, email: null, status: 'revoked' });
    expect(refusal(await w.outsider.call(ACCEPT, { token: revoked.token }))).toEqual([400, 'This invite was revoked']);
    const expired = await createInvite(db, { workspace: w.ws, inviter: w.owner.user, email: null, expiresAt: new Date(Date.now() - 1000) });
    expect(refusal(await w.outsider.call(ACCEPT, { token: expired.token }))).toEqual([400, 'This invite has expired']);
    expect((await db.getRepository(WorkspaceInviteEntity).findOneByOrFail({ id: expired.id })).status).toBe('expired');

    const personal = await createInvite(db, { workspace: w.ws, inviter: w.owner.user, email: `${unique('frank')}@example.test` });
    expect(refusal(await w.outsider.call(ACCEPT, { token: personal.token })))
      .toEqual([403, 'This invite is intended for a different email address.']);
    const unverifiedUser = await createUser(db, { email: personal.email });
    const unverified = await person(unverifiedUser, await createWorkspace(db, unverifiedUser));
    await db.getRepository(UserEntity).update({ id: unverifiedUser.id }, { emailVerifiedAt: null });
    expect(refusal(await unverified.call(ACCEPT, { token: personal.token })))
      .toEqual([403, 'A confirmed email address is required to accept a personal invite.']);
    await db.getRepository(UserEntity).update({ id: unverifiedUser.id }, { emailVerifiedAt: new Date() });
    expect(data<Row>(await unverified.call(ACCEPT, { token: personal.token }), 'workspaceInviteAccept', 'workspaceInvite').status).toBe('ok');

    const reasons = await db.getRepository(AuditEventEntity).find({ where: { workspaceId: w.ws.id, eventType: 'INVITE_REJECT' }, order: { id: 'ASC' } });
    expect(reasons.map((event) => event.details.reason)).toEqual(['revoked', 'expired', 'email_mismatch', 'unverified_email']);
    expect(await db.getRepository(WorkspaceMemberEntity).countBy({ workspaceId: w.ws.id, userId: w.outsider.user.id })).toBe(0);
  });

  it('takes a new user through onboarding', async () => {
    const newcomer = await createUser(db, { fullName: '' });
    const me = await person(newcomer);
    expect(refusal(await me.call(SKIP))).toEqual([409, 'Create a workspace first']);
    const details = data<Row>(await me.call(DETAILS, { input: { first_name: ' Nina ', last_name: 'New ' } }), 'onboardingPersonalDetailsUpdate', 'onboarding');
    expect(details).toMatchObject({ onboarding_step: 'workspace', onboarding_completed: false, active_workspace: null });
    expect(details.user).toMatchObject({ id: null, full_name: 'Nina New', first_name: 'Nina', last_name: 'New', email: newcomer.email, workspaces: [] });
    expect(refusal(await me.call(DETAILS, { input: { first_name: '  ' } }))).toEqual([400, 'Name is required']);

    const name = unique('Nina Media');
    const ws = data<Row>(await me.call(FIRST, { input: { name } }), 'onboardingWorkspaceCreate', 'onboarding');
    expect(ws).toMatchObject({ name, slug: normalizeWorkspaceSlug(name), role: 'owner', is_active: true, members_count: 1 });
    expect(await db.getRepository(UserEntity).findOneByOrFail({ id: newcomer.id })).toMatchObject({
      activeWorkspaceId: ws.id, onboardingStep: 'personal_details', onboardingCompleted: false,
    });
    expect(refusal(await me.call(FIRST, { input: { name: unique('Second') } }))).toEqual([409, 'This user already has a workspace']);

    const again = data<Row>(await me.call(DETAILS, { input: { first_name: 'Nina' } }), 'onboardingPersonalDetailsUpdate', 'onboarding');
    expect([again.onboarding_step, (again.active_workspace as Row).id]).toEqual(['invites', ws.id]);

    const email = `${unique('team')}@example.test`;
    const sent = data<Row>(await me.call(TEAMMATES, { input: { invites: [{ email: ` ${email} `, role: 'admin' }, { email: 'nope' }] } }), 'onboardingInvitesSend', 'onboarding');
    expect([sent.sent_count, sent.onboarding_completed, sent.redirect_url]).toEqual([1, true, '/']);
    const [invite] = sent.invites as Row[];
    expect(invite).toMatchObject({ email, role: 'admin', max_uses: 1, inviter_name: 'Nina', invite_url: `/invite/${String(invite.token)}` });
    expect((await target.lastEmail(email)).text).toContain(`by Nina.`);
    const kinds = await db.getRepository(AuditEventEntity).find({ where: { workspaceId: ws.id as number, category: 'WORKSPACE_INVITE' }, order: { id: 'ASC' } });
    expect(kinds.map((event) => [event.eventType, event.status])).toEqual([['INVITE_CREATE', 'SUCCESS'], ['INVITE_SEND', 'SUCCESS']]);
    expect(await db.getRepository(UserEntity).findOneByOrFail({ id: newcomer.id })).toMatchObject({ onboardingStep: 'completed', onboardingCompleted: true });
    expect(data<Row>(await me.call(SKIP), 'onboardingSkip', 'onboarding')).toEqual({ status: 'ok', onboarding_completed: true, redirect_url: '/' });
  });

  it('keeps the last onboarding steps to the owner', async () => {
    const w = await world();
    expect(refusal(await w.member.call(SKIP))).toEqual([403, 'This step is available to the workspace owner only']);
    expect(refusal(await w.member.call(TEAMMATES, { input: { invites: [] } }))).toEqual([403, 'Only the owner can invite the team at this step']);
  });
});
