import sharp from 'sharp';
import type { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { UserEntity } from '../../src/entities/index.ts';
import { Browser } from '../support/browser.ts';
import { createUser, createWorkspace, testDatabase } from '../support/db.ts';
import { DATABASE_URL, contractTarget, type Target } from '../support/target.ts';

// fileUpload (decision 55): a signed link the browser PUTs the file's bytes
// to, then userUpdate takes the file for the avatar. Against either server;
// the link of one is taken by the other (one shared pepper).

interface GraphQLAnswer {
  data: Record<string, { success: boolean; uploadFile: { upload_url: string; headers: Record<string, string> } } | null> | null;
  errors?: { message: string; extensions?: { statusCode?: number } }[];
}

const FILE_UPLOAD = 'mutation F($input: JSON!) { fileUpload(input: $input) { success uploadFile } }';

describe.skipIf(!DATABASE_URL)('fileUpload and the signed link', () => {
  let target: Target;
  let db: DataSource;
  let png: Buffer;

  beforeAll(async () => {
    target = await contractTarget();
    db = await testDatabase();
    png = await sharp({ create: { width: 8, height: 8, channels: 3, background: { r: 1, g: 2, b: 3 } } }).png().toBuffer();
  });

  afterAll(async () => {
    await target?.close();
    await db?.destroy();
  });

  async function member() {
    const user = await createUser(db);
    const workspace = await createWorkspace(db, user);
    const browser = new Browser(target, { 'x-workspace-slug': workspace.slug });
    expect((await browser.signIn(user.email!)).status).toBe(200);
    return { user, browser };
  }

  async function grant(browser: Browser, input: Record<string, unknown>): Promise<GraphQLAnswer> {
    const answer = await browser.post('/api/graphql', { query: FILE_UPLOAD, variables: { input } }, browser.csrf());
    expect(answer.status).toBe(200);
    return answer.json<GraphQLAnswer>();
  }

  it('uploads an avatar through the link, and userUpdate takes it', async () => {
    const { user, browser } = await member();
    const answer = await grant(browser, { purpose: 'avatar', content_type: 'image/png', filename: 'me.png', size: png.length });
    expect(answer.errors).toBeUndefined();
    const { upload_url: uploadUrl, headers } = answer.data!.fileUpload!.uploadFile;
    expect(uploadUrl.startsWith('/uploads/signed?token=')).toBe(true);

    // The link is the grant: a browser with no session may PUT to it.
    const put = await new Browser(target).request('PUT', uploadUrl, { body: png, headers });
    expect(put.status).toBe(200);
    const assetUrl = put.json<{ asset_url: string }>().asset_url;
    expect(assetUrl).toMatch(new RegExp(`^/uploads/avatars/avatar_${user.id}_`));
    expect((await browser.get(assetUrl)).status).toBe(200);

    const update = await browser.post(
      '/api/graphql',
      { query: 'mutation U($input: JSON!) { userUpdate(input: $input) { success } }', variables: { input: { avatar_url: assetUrl } } },
      browser.csrf(),
    );
    expect(update.json<GraphQLAnswer>().errors).toBeUndefined();
    expect((await db.getRepository(UserEntity).findOneByOrFail({ id: user.id })).avatarUrl).toBe(assetUrl);
  });

  it('refuses a forged link, a file too large and what is not an image', async () => {
    const { browser } = await member();
    const forged = await new Browser(target).request('PUT', '/uploads/signed?token=e30.0000', { body: png, headers: { 'content-type': 'image/png' } });
    expect(forged.status).toBe(403);

    const large = await grant(browser, { purpose: 'avatar', content_type: 'image/png', filename: 'a.png', size: 6 * 1024 * 1024 });
    expect(large.errors?.[0]?.extensions?.statusCode).toBe(400);
    expect(large.errors?.[0]?.message).toBe('The file must not exceed 5 MB');

    const answer = await grant(browser, { purpose: 'workspace_logo', content_type: 'image/png', filename: 'a.png', size: 5 });
    const { upload_url: uploadUrl, headers } = answer.data!.fileUpload!.uploadFile;
    const text = await new Browser(target).request('PUT', uploadUrl, { body: Buffer.from('hello'), headers });
    expect(text.status).toBe(400);
  });

  it('needs a session to hand out a link', async () => {
    const answer = await new Browser(target).post('/api/graphql', {
      query: FILE_UPLOAD,
      variables: { input: { purpose: 'avatar', content_type: 'image/png', filename: 'a.png', size: 5 } },
    });
    expect(answer.status).toBe(401);
  });
});
