import { useState } from 'react';

/**
 * The value while it is there, else the last one that was: a closing dialog
 * keeps its words through the animation. State rather than a ref written
 * during render, which the React Compiler cannot compile (#492).
 */
export function useLastPresent<T>(value: T | null | undefined): T | null {
  const [last, setLast] = useState<T | null>(value ?? null);
  if (value != null && value !== last) setLast(value);
  return value ?? last;
}
