import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, unlink, utimes, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { crc32 } from 'node:zlib';
import sharp from 'sharp';
import type { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { UserEntity, WorkspaceEntity } from '../../src/entities/index.ts';
import { Browser } from '../support/browser.ts';
import { createUser, createWorkspace, testDatabase } from '../support/db.ts';
import { DATABASE_URL, contractTarget, type Target } from '../support/target.ts';

// Avatar and workspace logo uploads and the files under /uploads/:
// tests/test_api.py (test_avatar_and_logo_disallow_svg,
// test_image_uploads_are_canonical_owned_and_cleaned) over HTTP, and the
// limits of services/image_uploads.py. Attaching a logo with
// PATCH /api/workspaces/… is Workspaces' and stays in the Python tests; here
// the workspace takes it in the database.

const AVATAR = '/api/onboarding/avatar';
const LOGO = '/api/onboarding/workspace/logo';

// A PNG with a text chunk that must not survive (Pillow's PngInfo "Comment").
async function pngWithComment(): Promise<Buffer> {
  const plain = await sharp({ create: { width: 48, height: 32, channels: 4, background: { r: 20, g: 40, b: 60, alpha: 0.5 } } })
    .png()
    .toBuffer();
  const text = Buffer.from('Comment\0must-be-removed', 'latin1');
  return Buffer.concat([plain.subarray(0, 33), pngChunk('tEXt', text), plain.subarray(33)]);
}

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

// Only a header: big enough to be a decompression bomb, with no pixels.
function pngHeader(width: number, height: number): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', Buffer.from([0x78, 0x9c, 0x03, 0x00, 0x00, 0x00, 0x00, 0x01])),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function riffChunk(type: string, data: Buffer): Buffer {
  const head = Buffer.alloc(8);
  head.write(type, 0, 'latin1');
  head.writeUInt32LE(data.length, 4);
  return Buffer.concat([head, data, Buffer.alloc(data.length % 2)]);
}

function uint24(value: number): Buffer {
  const out = Buffer.alloc(3);
  out.writeUIntLE(value, 0, 3);
  return out;
}

// An animated WebP of `frames` copies of a still lossless one (16×16).
function animatedWebp(still: Buffer, frames: number): Buffer {
  const vp8l = still.subarray(12);
  const vp8x = Buffer.concat([Buffer.from([0x02, 0, 0, 0]), uint24(15), uint24(15)]);
  const anim = Buffer.from([0, 0, 0, 0, 0, 0]);
  const frame = riffChunk('ANMF', Buffer.concat([uint24(0), uint24(0), uint24(15), uint24(15), uint24(100), Buffer.from([0]), vp8l]));
  const body = Buffer.concat([Buffer.from('WEBP'), riffChunk('VP8X', vp8x), riffChunk('ANIM', anim), ...Array<Buffer>(frames).fill(frame)]);
  const head = Buffer.alloc(8);
  head.write('RIFF', 0, 'latin1');
  head.writeUInt32LE(body.length, 4);
  return Buffer.concat([head, body]);
}

function solid(width: number, height: number) {
  return sharp({ create: { width, height, channels: 3, background: { r: 200, g: 80, b: 40 } } });
}

describe.skipIf(!DATABASE_URL)('image uploads', () => {
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

  const onDisk = (url: string) => join(target.uploadsRoot, url.replace(/^\/uploads\//, ''));

  async function signedIn() {
    const user = await createUser(db);
    const workspace = await createWorkspace(db, user);
    const browser = new Browser(target);
    expect((await browser.signIn(user.email!)).status).toBe(200);
    return { user, workspace, browser };
  }

  function upload(browser: Browser, path: string, filename: string, content: Buffer | string, type?: string) {
    return browser.postForm(path, [{ name: 'file', filename, content, type }], browser.csrf());
  }

  it('refuses a signed-out upload and one without the CSRF header', async () => {
    const png = await solid(4, 4).png().toBuffer();
    const anonymous = await new Browser(target).postForm(AVATAR, [{ name: 'file', filename: 'a.png', content: png, type: 'image/png' }]);
    expect(anonymous.status).toBe(401);
    expect(anonymous.json()).toEqual({ detail: 'Sign-in is required' });

    const { browser } = await signedIn();
    const forged = await browser.postForm(AVATAR, [{ name: 'file', filename: 'a.png', content: png, type: 'image/png' }]);
    expect(forged.status).toBe(403);
  });

  it('disallows SVG and files that are not images', async () => {
    const { browser } = await signedIn();
    const svg = '<svg onload=alert(1)>';
    const avatarSvg = await upload(browser, AVATAR, 'avatar.svg', svg, 'image/svg+xml');
    expect(avatarSvg.status).toBe(400);
    expect(avatarSvg.json()).toEqual({ detail: 'Only PNG, JPG and WEBP formats are supported' });

    const logoSvg = await upload(browser, LOGO, 'logo.svg', svg, 'image/svg+xml');
    expect(logoSvg.status).toBe(400);

    const disguisedText = await upload(browser, AVATAR, 'avatar.png', 'this is not a png', 'image/png');
    expect(disguisedText.status).toBe(400);
    expect(disguisedText.json()).toEqual({ detail: 'The file is not a valid image' });

    const disguisedSvg = await upload(browser, AVATAR, 'avatar.png', svg, 'image/png');
    expect(disguisedSvg.status).toBe(400);
    expect(disguisedSvg.json()).toEqual({ detail: 'The file is not a valid image' });
  });

  it('checks the content against the name and the declared type', async () => {
    const { browser } = await signedIn();
    const png = await solid(8, 8).png().toBuffer();
    const gif = await solid(8, 8).gif().toBuffer();

    const wrongName = await upload(browser, AVATAR, 'avatar.jpg', png, 'image/jpeg');
    expect(wrongName.json()).toEqual({ detail: 'The file extension does not match the image content' });
    const wrongType = await upload(browser, AVATAR, 'avatar.png', png, 'image/jpeg');
    expect(wrongType.json()).toEqual({ detail: 'The file type does not match the image content' });
    const gifAsPng = await upload(browser, AVATAR, 'avatar.png', gif, 'image/png');
    expect(gifAsPng.json()).toEqual({ detail: 'Only PNG, JPG and WEBP formats are supported' });
    const empty = await upload(browser, AVATAR, 'avatar.png', Buffer.alloc(0), 'image/png');
    expect(empty.json()).toEqual({ detail: 'The image file is empty' });

    // A type the browser could not guess is not a mismatch.
    expect((await upload(browser, AVATAR, 'avatar.png', png, 'application/octet-stream')).status).toBe(200);
  });

  it('limits size, resolution and frames', async () => {
    const { browser } = await signedIn();
    const tooBig = await upload(browser, AVATAR, 'avatar.png', randomBytes(5 * 1024 * 1024 + 10), 'image/png');
    expect(tooBig.status).toBe(400);
    expect(tooBig.json()).toEqual({ detail: 'The file must not exceed 5 MB' });

    const wide = await upload(browser, AVATAR, 'avatar.png', await solid(8193, 1).png().toBuffer(), 'image/png');
    expect(wide.json()).toEqual({ detail: 'The image resolution is not allowed' });
    const bomb = await upload(browser, AVATAR, 'avatar.png', pngHeader(10_000, 10_000), 'image/png');
    expect(bomb.json()).toEqual({ detail: 'The image resolution is unsafely large' });

    const animated = animatedWebp(await solid(16, 16).webp({ lossless: true }).toBuffer(), 2);
    const moving = await upload(browser, AVATAR, 'avatar.webp', animated, 'image/webp');
    expect(moving.json()).toEqual({ detail: 'Animated images are not supported' });
  });

  it('refuses a request over 6 MB before reading it', async () => {
    const response = await new Browser(target).postForm(AVATAR, [
      { name: 'file', filename: 'avatar.png', content: Buffer.alloc(6 * 1024 * 1024 + 1), type: 'image/png' },
    ]);
    expect(response.status).toBe(413);
    expect(response.json()).toEqual({ detail: 'The request body exceeds the allowed size limit.' });
  });

  it('answers a form without the file as FastAPI does', async () => {
    const { browser } = await signedIn();
    const response = await browser.postForm(AVATAR, [{ name: 'other', value: 'x' }], browser.csrf());
    expect(response.status).toBe(422);
    expect(response.json()).toEqual({ detail: [{ type: 'missing', loc: ['body', 'file'], msg: 'Field required', input: null }] });
  });

  it('stores images canonical, upright, small and without metadata', async () => {
    const { browser } = await signedIn();
    // 40×20 photographed sideways (EXIF orientation 6), with a camera note.
    const photo = await solid(40, 20).jpeg().withExif({ IFD0: { Make: 'Secret camera' } }).withMetadata({ orientation: 6 }).toBuffer();
    const stored = await upload(browser, AVATAR, 'photo.JPEG', photo, 'image/jpeg');
    expect(stored.status).toBe(200);
    const url = stored.json<{ avatar_url: string }>().avatar_url;
    expect(url).toMatch(/^\/uploads\/avatars\/avatar_\d+_\d+_[0-9a-f]{8}\.jpg$/);
    const meta = await sharp(onDisk(url)).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(['jpeg', 20, 40]);
    expect(meta.exif).toBeUndefined();

    const large = await upload(browser, LOGO, 'logo.webp', await solid(3000, 1000).webp().toBuffer(), 'image/webp');
    const logo = await sharp(onDisk(large.json<{ logo_url: string }>().logo_url)).metadata();
    expect(logo.format).toBe('webp');
    expect(logo.width).toBe(2048);
    expect(logo.height).toBeGreaterThanOrEqual(682);
    expect(logo.height).toBeLessThanOrEqual(683);
  });

  it('keeps uploads canonical, owned and cleaned', async () => {
    const { user, workspace, browser } = await signedIn();
    const png = await pngWithComment();

    const mismatched = await upload(browser, AVATAR, 'avatar.jpg', png, 'image/jpeg');
    expect(mismatched.status).toBe(400);

    const firstAvatar = await upload(browser, AVATAR, 'avatar.png', png, 'image/png');
    expect(firstAvatar.status).toBe(200);
    const firstAvatarUrl = firstAvatar.json<{ status: string; avatar_url: string }>().avatar_url;
    expect(firstAvatar.json()).toEqual({ status: 'ok', avatar_url: firstAvatarUrl });
    expect(firstAvatarUrl.startsWith(`/uploads/avatars/avatar_${user.id}_`)).toBe(true);
    expect(existsSync(onDisk(firstAvatarUrl))).toBe(true);
    const storedAvatar = await sharp(onDisk(firstAvatarUrl)).metadata();
    expect(storedAvatar.format).toBe('png');
    expect(storedAvatar.comments ?? []).toEqual([]);
    expect((await db.getRepository(UserEntity).findOneByOrFail({ id: user.id })).avatarUrl).toBe(firstAvatarUrl);

    const secondAvatar = await upload(browser, AVATAR, 'avatar.png', png, 'image/png');
    expect(secondAvatar.status).toBe(200);
    expect(existsSync(onDisk(firstAvatarUrl))).toBe(false);

    const firstLogo = await upload(browser, LOGO, 'logo.png', png, 'image/png');
    expect(firstLogo.status).toBe(200);
    const firstLogoUrl = firstLogo.json<{ logo_url: string }>().logo_url;
    expect(firstLogo.json()).toEqual({ status: 'ok', logo_url: firstLogoUrl });
    expect(firstLogoUrl.startsWith(`/uploads/workspaces/logo_${user.id}_`)).toBe(true);
    await utimes(onDisk(firstLogoUrl), 0, 0);

    const secondLogo = await upload(browser, LOGO, 'logo.png', png, 'image/png');
    expect(secondLogo.status).toBe(200);
    expect(existsSync(onDisk(firstLogoUrl))).toBe(false);
    const secondLogoUrl = secondLogo.json<{ logo_url: string }>().logo_url;

    // Taken by a workspace: kept however old it is.
    await db.getRepository(WorkspaceEntity).update({ id: workspace.id }, { logoUrl: secondLogoUrl });
    await utimes(onDisk(secondLogoUrl), 0, 0);
    expect((await upload(browser, LOGO, 'logo.png', png, 'image/png')).status).toBe(200);
    expect(existsSync(onDisk(secondLogoUrl))).toBe(true);
  });

  it('never removes another member’s avatar file', async () => {
    const { user, browser } = await signedIn();
    const foreign = `avatar_${user.id + 1_000_000}_0_deadbeef.png`;
    await mkdir(join(target.uploadsRoot, 'avatars'), { recursive: true });
    await writeFile(join(target.uploadsRoot, 'avatars', foreign), 'x');
    await db.getRepository(UserEntity).update({ id: user.id }, { avatarUrl: `/uploads/avatars/${foreign}` });

    const response = await upload(browser, AVATAR, 'avatar.png', await solid(8, 8).png().toBuffer(), 'image/png');
    expect(response.status).toBe(200);
    expect(existsSync(join(target.uploadsRoot, 'avatars', foreign))).toBe(true);
    await unlink(join(target.uploadsRoot, 'avatars', foreign));
  });

  it('removes the avatar', async () => {
    const { user, browser } = await signedIn();
    const uploaded = await upload(browser, AVATAR, 'avatar.png', await solid(8, 8).png().toBuffer(), 'image/png');
    const url = uploaded.json<{ avatar_url: string }>().avatar_url;

    const removed = await browser.delete(AVATAR, browser.csrf());
    expect(removed.status).toBe(200);
    expect(removed.json()).toEqual({ status: 'ok', avatar_url: '' });
    expect(existsSync(onDisk(url))).toBe(false);
    expect((await db.getRepository(UserEntity).findOneByOrFail({ id: user.id })).avatarUrl).toBe('');
    expect((await browser.get('/api/me')).json()).toMatchObject({ avatar_url: '' });
  });

  it('serves uploads for a year and nothing else', async () => {
    const { browser } = await signedIn();
    const png = await solid(8, 8).png().toBuffer();
    const url = (await upload(browser, AVATAR, 'avatar.png', png, 'image/png')).json<{ avatar_url: string }>().avatar_url;

    const visitor = new Browser(target);
    const file = await visitor.get(url);
    expect(file.status).toBe(200);
    expect(file.headers['content-type']).toBe('image/png');
    expect(file.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expect(file.headers['x-content-type-options']).toBe('nosniff');
    expect((await sharp(file.raw).metadata()).width).toBe(8);

    const missing = await visitor.get('/uploads/avatars/avatar_0_0_00000000.png');
    expect(missing.status).toBe(404);
    expect(missing.json()).toEqual({ detail: 'Not Found' });
    expect((await visitor.get('/uploads/avatars/')).status).toBe(404);
    expect((await visitor.get('/uploads/avatars/..%2F..%2Fpackage.json')).status).toBe(404);
  });
});
