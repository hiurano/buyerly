// Python's str.strip(): whitespace as str.isspace() knows it.
const SPACE = '[\\t\\n\\v\\f\\r\\x1c-\\x20\\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000]';
const STRIP = new RegExp(`^${SPACE}+|${SPACE}+$`, 'g');

export const strip = (value: string): string => value.replace(STRIP, '');

// str.split() with no separator: the words between runs of that whitespace.
const RUNS = new RegExp(`${SPACE}+`);
export const words = (value: string): string[] => value.split(RUNS).filter(Boolean);
