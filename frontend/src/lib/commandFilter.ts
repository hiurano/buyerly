/**
 * Linear's command menu matches letters in order, not side by side: "gtset"
 * finds "Go to settings". Returns null when the letters are not all there, else
 * a score where whole words, word starts and runs of letters rank higher.
 */
export function commandMatchScore(query: string, text: string): number | null {
  const needle = query.toLowerCase().replace(/\s+/g, '');
  if (!needle) return 0;
  const haystack = text.toLowerCase();
  const substring = haystack.indexOf(query.trim().toLowerCase());
  if (substring >= 0) return 1000 - substring + (isWordStart(haystack, substring) ? 100 : 0);
  // Jumping to a word start can skip a letter needed later; the plain pass still finds it.
  return lettersScore(needle, haystack, true) ?? lettersScore(needle, haystack, false);
}

function lettersScore(needle: string, haystack: string, preferWordStarts: boolean): number | null {
  let score = 0;
  let from = 0;
  let previous = -2;
  for (const char of needle) {
    // Prefer the next word start that has the letter, else its next place.
    let found = -1;
    for (let index = from; index < haystack.length; index += 1) {
      if (haystack[index] !== char) continue;
      if (!preferWordStarts || index === previous + 1 || isWordStart(haystack, index)) {
        found = index;
        break;
      }
      if (found < 0) found = index;
    }
    if (found < 0) return null;
    score += found === previous + 1 ? 8 : isWordStart(haystack, found) ? 6 : 1;
    score -= Math.min(found - from, 10) * 0.1;
    previous = found;
    from = found + 1;
  }
  return score;
}

function isWordStart(text: string, index: number): boolean {
  return index === 0 || /[\s›/(-]/.test(text[index - 1]);
}

/** The best score over a label and its other words; the label counts more. */
export function bestCommandScore(query: string, label: string, keywords: string[] = []): number | null {
  let best = commandMatchScore(query, label);
  for (const keyword of keywords) {
    const score = commandMatchScore(query, keyword);
    if (score !== null && (best === null || score / 2 > best)) best = score / 2;
  }
  return best;
}
