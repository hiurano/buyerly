import { randomBytes } from 'node:crypto';
import { constants } from 'node:fs';
import { chmod, mkdir, open, readdir, rename, stat, unlink } from 'node:fs/promises';
import { basename, join } from 'node:path';
import sharp, { type Metadata } from 'sharp';
import type { EntityManager } from 'typeorm';
import { WorkspaceEntity } from '../entities/index.ts';

// Validated, canonical and durable user images (services/image_uploads.py),
// in the same directory as the Python API's, so files written by either
// server stay readable and removable by the other while both run (#611).
//
// The bytes are checked, not the name: the image is decoded and encoded
// again, which drops its metadata (EXIF location, text chunks) and anything
// hidden after the picture.

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const MAX_SOURCE_DIMENSION = 8192;
export const MAX_SOURCE_PIXELS = 20_000_000;
export const MAX_STORED_DIMENSION = 2048;
export const ORPHAN_GRACE_SECONDS = 24 * 60 * 60;
// Pillow's decompression-bomb threshold (Image.MAX_IMAGE_PIXELS), which the
// Python side turns into an error: above it the image is "unsafely large".
const PILLOW_BOMB_PIXELS = Math.floor(1024 * 1024 * 1024 / 4 / 3);

export type UploadCategory = 'avatars' | 'workspaces';
type Format = 'jpeg' | 'png' | 'webp';

const FORMAT_EXTENSION: Record<Format, string> = { jpeg: '.jpg', png: '.png', webp: '.webp' };
const FORMAT_MIME: Record<Format, string> = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
const CLAIMED_FORMATS: Record<string, Format> = { '.jpg': 'jpeg', '.jpeg': 'jpeg', '.png': 'png', '.webp': 'webp' };
// What libvips reads but Pillow does not open as a picture: the Python side
// calls these "not a valid image" rather than "an unsupported format".
const NOT_RASTER = new Set(['svg', 'pdf', 'magick', 'openslide', 'fits', 'matrix', 'csv', 'vips', 'raw']);

export class InvalidImageUpload extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidImageUpload';
  }
}

function suffix(filename: string): string {
  const name = basename(filename);
  const dot = name.lastIndexOf('.');
  // pathlib's suffix: a leading dot (".png") is a name, not a suffix.
  return dot > 0 ? name.slice(dot).toLowerCase() : '';
}

// The frame count of an animated PNG (acTL), which libvips reads as a still
// image and Pillow as animated. 1 for a plain PNG.
function pngFrames(content: Buffer): number {
  let offset = 8;
  while (offset + 8 <= content.length) {
    const length = content.readUInt32BE(offset);
    const type = content.toString('latin1', offset + 4, offset + 8);
    if (type === 'acTL' && offset + 12 <= content.length) return content.readUInt32BE(offset + 8);
    if (type === 'IDAT' || type === 'IEND') return 1;
    offset += 12 + length;
  }
  return 1;
}

interface Opened {
  format: string;
  width: number;
  height: number;
  frames: number;
}

async function openImage(content: Buffer): Promise<Opened> {
  let metadata: Metadata;
  try {
    // Only the header is read here; the pixel limits are checked below.
    metadata = await sharp(content, { limitInputPixels: false, failOn: 'error' }).metadata();
  } catch {
    throw new InvalidImageUpload('The file is not a valid image');
  }
  const format = String(metadata.format ?? '');
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  if (!format || NOT_RASTER.has(format)) throw new InvalidImageUpload('The file is not a valid image');
  if (width * height > PILLOW_BOMB_PIXELS) throw new InvalidImageUpload('The image resolution is unsafely large');
  const frames = format === 'png' ? pngFrames(content) : (metadata.pages ?? 1);
  return { format, width, height, frames };
}

function isFormat(format: string): format is Format {
  return format in FORMAT_EXTENSION;
}

export async function canonicalizeImageUpload(
  content: Buffer,
  options: { filename: string; contentType: string | null },
): Promise<{ encoded: Buffer; extension: string }> {
  if (!content.length) throw new InvalidImageUpload('The image file is empty');
  if (content.length > MAX_UPLOAD_BYTES) throw new InvalidImageUpload('The file must not exceed 5 MB');

  const claimed = CLAIMED_FORMATS[suffix(options.filename)];
  if (!claimed) throw new InvalidImageUpload('Only PNG, JPG and WEBP formats are supported');

  const image = await openImage(content);
  if (!isFormat(image.format)) throw new InvalidImageUpload('Only PNG, JPG and WEBP formats are supported');
  if (claimed !== image.format) throw new InvalidImageUpload('The file extension does not match the image content');

  const declared = (options.contentType ?? '').split(';', 1)[0].trim().toLowerCase();
  if (!['', 'application/octet-stream', FORMAT_MIME[image.format]].includes(declared)) {
    throw new InvalidImageUpload('The file type does not match the image content');
  }

  const { width, height } = image;
  if (
    width < 1 || height < 1
    || width > MAX_SOURCE_DIMENSION || height > MAX_SOURCE_DIMENSION
    || width * height > MAX_SOURCE_PIXELS
  ) {
    throw new InvalidImageUpload('The image resolution is not allowed');
  }
  if (image.frames !== 1) throw new InvalidImageUpload('Animated images are not supported');

  let encoded: Buffer;
  try {
    // Turned upright by its EXIF orientation, no larger than 2048 on a side,
    // in sRGB with alpha only where the source had it; sharp keeps no
    // metadata unless asked to.
    const pipeline = sharp(content, { limitInputPixels: MAX_SOURCE_PIXELS, failOn: 'warning' })
      .autoOrient()
      .resize(MAX_STORED_DIMENSION, MAX_STORED_DIMENSION, { fit: 'inside', withoutEnlargement: true, kernel: 'lanczos3' })
      .toColourspace('srgb');
    if (image.format === 'jpeg') encoded = await pipeline.jpeg({ quality: 90, optimiseCoding: true }).toBuffer();
    else if (image.format === 'webp') encoded = await pipeline.webp({ quality: 90, effort: 6 }).toBuffer();
    else encoded = await pipeline.png({ compressionLevel: 9 }).toBuffer();
  } catch {
    // Pillow's verify() refuses a damaged file before decoding; libvips
    // finds the damage only while decoding it.
    throw new InvalidImageUpload('The file is not a valid image');
  }
  if (encoded.length > MAX_UPLOAD_BYTES) throw new InvalidImageUpload('The processed image exceeds the 5 MB limit');
  return { encoded, extension: FORMAT_EXTENSION[image.format] };
}

// Where uploads live on disk and how the site names them ("/uploads/…").
export class ImageStorage {
  constructor(readonly root: string) {}

  async save(
    content: Buffer,
    options: { filename: string; contentType: string | null; category: UploadCategory; ownerUserId: number },
  ): Promise<string> {
    const { encoded, extension } = await canonicalizeImageUpload(content, options);
    const prefix = options.category === 'avatars' ? 'avatar' : 'logo';
    const name = `${prefix}_${options.ownerUserId}_${Math.floor(Date.now() / 1000)}_${randomBytes(4).toString('hex')}${extension}`;
    const directory = join(this.root, options.category);
    await mkdir(directory, { recursive: true });
    // Written whole under a temporary name and renamed into place, so a
    // reader never sees half a file.
    const temporary = join(directory, `.upload-${randomBytes(6).toString('hex')}`);
    const handle = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o600);
    try {
      try {
        await handle.writeFile(encoded);
        await handle.sync();
      } finally {
        await handle.close();
      }
      const target = join(directory, name);
      await rename(temporary, target);
      await chmod(target, 0o644);
    } catch (error) {
      await unlink(temporary).catch(() => {});
      throw error;
    }
    return `/uploads/${options.category}/${name}`;
  }

  // The file behind an "/uploads/<category>/<name>" URL, or null for any
  // other URL (a remote one, another category, a path with directories).
  localPath(url: unknown, category: UploadCategory): string | null {
    const prefix = `/uploads/${category}/`;
    if (typeof url !== 'string' || !url.startsWith(prefix)) return null;
    const name = url.slice(prefix.length);
    if (!name || name !== basename(name) || name === '.' || name === '..') return null;
    return join(this.root, category, name);
  }

  async isOwned(url: string, category: UploadCategory, ownerUserId: number): Promise<boolean> {
    const path = this.localPath(url, category);
    const prefix = category === 'avatars' ? 'avatar' : 'logo';
    if (!path || !basename(path).startsWith(`${prefix}_${ownerUserId}_`)) return false;
    return stat(path).then((info) => info.isFile(), () => false);
  }

  async delete(url: unknown, category: UploadCategory, ownerPrefix = ''): Promise<boolean> {
    const path = this.localPath(url, category);
    if (!path || (ownerPrefix && !basename(path).startsWith(ownerPrefix))) return false;
    return unlink(path).then(() => true, () => false);
  }

  // Logos uploaded during onboarding or settings but never attached to a
  // workspace, once a day has passed.
  async cleanupStaleWorkspaceLogos(tx: EntityManager, graceSeconds = ORPHAN_GRACE_SECONDS): Promise<number> {
    const directory = join(this.root, 'workspaces');
    let names: string[];
    try {
      names = await readdir(directory);
    } catch {
      return 0;
    }
    const referenced = new Set(
      (await tx
        .createQueryBuilder(WorkspaceEntity, 'workspace')
        .select('workspace.logoUrl', 'logoUrl')
        .where('workspace.logoUrl LIKE :prefix', { prefix: '/uploads/workspaces/%' })
        .getRawMany<{ logoUrl: string }>()).map((row) => row.logoUrl),
    );
    const cutoff = Date.now() / 1000 - Math.max(0, graceSeconds);
    let removed = 0;
    for (const name of names) {
      if (!name.startsWith('logo_')) continue;
      const url = `/uploads/workspaces/${name}`;
      let info;
      try {
        info = await stat(join(directory, name));
      } catch {
        continue;
      }
      if (!info.isFile() || referenced.has(url) || info.mtimeMs / 1000 > cutoff) continue;
      if (await this.delete(url, 'workspaces')) removed += 1;
    }
    return removed;
  }
}
