/** Joins CSS Module class names, skipping the ones a condition left out. */
export function cx(...names: (string | false | null | undefined)[]): string {
  return names.filter(Boolean).join(' ');
}
