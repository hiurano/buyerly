import type React from 'react';

/** Points a ref of either kind at the element, so one element can feed several refs. */
export function setRef<T>(ref: React.Ref<T> | undefined, value: T | null): void {
  if (typeof ref === 'function') ref(value);
  else if (ref) (ref as React.RefObject<T | null>).current = value;
}
