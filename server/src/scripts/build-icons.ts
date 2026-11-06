import { writeFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

// Raster icons of the Buyerly mark, drawn from the same path as favicon.svg
// (#432; #611, stage 5: port of scripts/build_icons.py, drawn with sharp
// instead of Pillow, so the pixels differ by antialiasing only).
//
// The tab icons are Linear's favicon (#557): a white mark at 3/4 on a black
// square with corners rounded 2/16, the same on light and dark tab bars, so it
// reads at 16px in Chrome and Safari alike. The home screen icon is a full
// #222326 tile (iOS rounds its corners). buyerly-logo.png stays the bare mark,
// the CSS mask of the public pages' header.
//
//   node server/src/scripts/build-icons.ts

const ROOT = path.resolve(import.meta.dirname, '../../..');
const PUBLIC_DIR = path.join(ROOT, 'frontend', 'public');
const BRANDING_DIR = path.join(ROOT, 'docs', 'branding', 'buyerly');

const INK = '#222326';
const BLACK = '#000000';
const WHITE = '#ffffff';

// frontend/public/static/icons/favicon.svg, 512 frame, evenodd.
const BODY = '192,464 192,336 112,336 80,224 192,224 192,192 288,192 288,48 320,48 432,464';
const NOTCH = '288,224 224,256 288,256';
const FLAG = '192,176 192,48 224,48 256,176';
const MARK = `M${BODY.replace(/ /g, 'L')}ZM${FLAG.replace(/ /g, 'L')}ZM${NOTCH.replace(/ /g, 'L')}Z`;

// The mark at `scale` of the 512 frame, centred, as an SVG group of `size`.
function markGroup(size: number, color: string, scale: number): string {
  const k = (size * scale) / 512;
  const offset = (size * (1 - scale)) / 2;
  return `<g transform="translate(${offset} ${offset}) scale(${k})"><path fill="${color}" fill-rule="evenodd" d="${MARK}"/></g>`;
}

const svg = (size: number, content: string): Buffer =>
  Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${content}</svg>`);

const render = (source: Buffer): Promise<Buffer> => sharp(source, { density: 72 }).png({ compressionLevel: 9 }).toBuffer();

// The mark on a transparent square.
const mark = (size: number, color: string): Promise<Buffer> => render(svg(size, markGroup(size, color, 1)));

// White mark at `scale` on a `color` square with corners rounded `radius` of size.
const tile = (size: number, radius: number, color: string, scale: number): Promise<Buffer> =>
  render(svg(size, `<rect width="${size}" height="${size}" rx="${size * radius}" fill="${color}"/>${markGroup(size, WHITE, scale)}`));

// favicon.svg: rect rx 2/16, mark at translate(64 64) scale(0.75).
const tabIcon = (size: number): Promise<Buffer> => tile(size, 2 / 16, BLACK, 0.75);

// An .ico of PNG images, one per size.
function ico(images: { size: number; png: Buffer }[]): Buffer {
  const header = Buffer.alloc(6 + 16 * images.length);
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach(({ size, png }, index) => {
    const entry = 6 + 16 * index;
    header[entry] = size;
    header[entry + 1] = size;
    header.writeUInt16LE(1, entry + 4); // planes
    header.writeUInt16LE(32, entry + 6); // bits per pixel
    header.writeUInt32LE(png.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += png.length;
  });
  return Buffer.concat([header, ...images.map((image) => image.png)]);
}

async function main(): Promise<void> {
  // Each size drawn on its own grid rather than shrunk from the largest.
  const favicon = ico(await Promise.all([16, 32, 48].map(async (size) => ({ size, png: await tabIcon(size) }))));
  for (const directory of [PUBLIC_DIR, BRANDING_DIR]) writeFileSync(path.join(directory, 'favicon.ico'), favicon);
  // iOS rounds the corners of the home screen icon itself.
  const touch = await tile(180, 0, INK, 0.8);
  writeFileSync(path.join(PUBLIC_DIR, 'apple-touch-icon.png'), touch);
  writeFileSync(path.join(BRANDING_DIR, 'apple-touch-icon.png'), touch);
  const favicon32 = await tabIcon(32);
  writeFileSync(path.join(PUBLIC_DIR, 'static', 'icons', 'favicon-32x32.png'), favicon32);
  writeFileSync(path.join(BRANDING_DIR, 'favicon-32x32.png'), favicon32);
  writeFileSync(path.join(BRANDING_DIR, 'favicon.png'), favicon32);
  // Also the CSS mask of the public pages, where only its alpha counts.
  writeFileSync(path.join(PUBLIC_DIR, 'buyerly-logo.png'), await mark(1024, INK));
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
