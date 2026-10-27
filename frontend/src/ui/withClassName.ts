import type React from 'react';

type StylexProps = { className?: string; style?: React.CSSProperties };

/**
 * A primitive's `stylex.props(...)` plus the semantic index.css classes its
 * caller passes. StyleX's rules outrank index.css's, so a caller's class only
 * adds properties the primitive leaves unset.
 */
export function withClassName(props: StylexProps, className?: string): StylexProps {
  if (!className) return props;
  return { ...props, className: props.className ? `${props.className} ${className}` : className };
}
