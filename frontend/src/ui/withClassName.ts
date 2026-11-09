import type React from 'react';

type StylexProps = { className?: string; style?: React.CSSProperties };

/**
 * A primitive's `stylex.props(...)` plus the semantic index.css classes its
 * caller passes. StyleX's rules outrank index.css's, so a caller's class only
 * adds properties the primitive leaves unset.
 */
export function withClassName(props: StylexProps, ...classNames: Array<string | undefined | false>): StylexProps {
  const added = classNames.filter(Boolean).join(' ');
  if (!added) return props;
  return { ...props, className: props.className ? `${props.className} ${added}` : added };
}
