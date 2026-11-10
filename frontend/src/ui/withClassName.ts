import type React from 'react';

type StylexProps = { className?: string; style?: React.CSSProperties };

/**
 * A primitive's `stylex.props(...)` plus the classes its caller adds: a CSS
 * Module's class (where StyleX cannot reach a child or a descendant) and the
 * plain hooks a browser check reads. StyleX outranks a caller's class, so it
 * only adds the properties the primitive leaves unset.
 */
export function withClassName(props: StylexProps, ...classNames: Array<string | undefined | false>): StylexProps {
  const added = classNames.filter(Boolean).join(' ');
  if (!added) return props;
  return { ...props, className: props.className ? `${props.className} ${added}` : added };
}
