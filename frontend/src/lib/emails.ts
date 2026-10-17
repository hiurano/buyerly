/** Splits an invite field on commas, spaces and new lines, like Linear's email box. */
export function parseEmails(text: string): string[] {
  return Array.from(new Set(
    text.split(/[\s,;]+/).map((item) => item.trim().toLowerCase()).filter(Boolean),
  ));
}

export const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

/**
 * Addresses already finished with a separator after them. While someone types
 * the last one it isn't judged yet, so "ann@acm" doesn't flash as an error.
 */
export function finishedEmails(text: string): string[] {
  const finished = text.replace(/[^\s,;]+$/, '');
  return parseEmails(finished);
}
