/**
 * Linear's avatar without a picture (Avatar.js, 2026-10-22): initials from the name on a color
 * picked by hashing the model's id, so a workspace keeps its color when it is renamed.
 */

/** Linear's box sizes, by the size name its avatars take. */
export type AvatarSize = 'micro' | 'tiny' | 'small' | 'regular' | 'large' | 'xlarge' | 'huge';

export const AVATAR_PX: Record<AvatarSize, number> = {
  micro: 14,
  tiny: 16,
  small: 18,
  regular: 24,
  large: 32,
  xlarge: 44,
  huge: 54,
};

/** Linear's initials font: smaller for "WW" and for three letters. */
const INITIALS_FONT: Record<AvatarSize, { normal: number; ww: number; three: number }> = {
  micro: { normal: 8, ww: 5, three: 4 },
  tiny: { normal: 9, ww: 6, three: 5 },
  small: { normal: 9, ww: 7, three: 5 },
  regular: { normal: 11, ww: 9, three: 7 },
  large: { normal: 14, ww: 12, three: 9 },
  xlarge: { normal: 18, ww: 15, three: 12 },
  huge: { normal: 22, ww: 18, three: 16 },
};

export function initialsFontSize(size: AvatarSize, initials: string | null): number {
  const font = INITIALS_FONT[size];
  if ((initials?.length ?? 0) > 2) return font.three;
  return initials === 'WW' ? font.ww : font.normal;
}

/**
 * Two words give first and last initials, more give the first and the last two, one word its
 * first two characters; an email counts only the part before @. Linear keeps only Latin letters
 * and digits and leaves "Канада" blank; here any letter counts.
 */
export function avatarInitials(name: string): string | null {
  const source = name.includes('@') ? name.split('@')[0].replace(/\./, ' ') : name;
  const words = (source.match(/\S+/g) || []).filter((word) => /^\p{Letter}/u.test(word));
  const letters = words.map((word) => word[0]);
  let initials = source.slice(0, 2);
  if (words.length > 2) initials = letters[0] + letters.slice(-2).join('');
  else if (words.length === 2) initials = letters[0] + letters[letters.length - 1];
  return /[\p{Letter}\p{Number}]/u.test(initials) ? initials.toUpperCase() : null;
}

function hash(value: string): number {
  let result = 5381;
  for (let index = value.length; index; ) result = (result * 33) ^ value.charCodeAt(--index);
  return result >>> 0;
}

/** 36 hues, 10° apart, each at lightness 40, 55 and 70; chroma 60. */
const HUES = 36;
const LIGHTNESSES = 3;

export function avatarColor(key: string): string {
  const n = hash(key);
  const index = (n % HUES) * LIGHTNESSES + (Math.floor(n / HUES) % LIGHTNESSES);
  const lightness = 40 + (index % LIGHTNESSES) * 15;
  const hue = ((360 / HUES) * Math.floor(index / LIGHTNESSES)) % 360;
  return `lch(${lightness}% 60 ${hue})`;
}
