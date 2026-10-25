import React from 'react';
import * as stylex from '@stylexjs/stylex';
import { colors } from '@/styles/tokens.stylex';
import { rowMarker } from '@/ui/markers.stylex';
import { withClassName } from '@/ui/withClassName';

interface BuyerlyCheckboxProps {
  checked: boolean;
  indeterminate?: boolean;
  onChange?: (checked: boolean) => void;
  className?: string;
  hidden?: boolean;
  /** Shown at rest, not only on row hover: for a list whose purpose is choosing. */
  alwaysVisible?: boolean;
  /** The row carries the checkbox role and keyboard, so this one is only drawn. */
  decorative?: boolean;
}

const styles = stylex.create({
  // Shown while its row is hovered or focused, and always on a touch screen.
  slot: {
    display: 'flex',
    height: 22,
    width: 18,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'default',
    opacity: {
      default: 0,
      [stylex.when.ancestor(':hover', rowMarker)]: 1,
      [stylex.when.ancestor(':focus-visible', rowMarker)]: 1,
      '@media (hover: none) and (pointer: coarse)': 1,
    },
    transitionProperty: 'opacity',
    transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
    transitionDuration: '75ms',
  },
  shown: {
    opacity: 1,
  },
  hidden: {
    visibility: 'hidden',
  },
  box: {
    width: 14,
    height: 14,
    borderRadius: 3,
    boxSizing: 'border-box',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    position: 'relative',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: {
      default: colors['--checkbox-border-rest'],
      ':hover': colors['--checkbox-border-hover'],
    },
    backgroundColor: 'transparent',
    transitionProperty: 'background-color, border-color',
    transitionDuration: '80ms',
    transitionTimingFunction: 'ease-out',
    cursor: 'default',
    userSelect: 'none',
  },
  boxChecked: {
    borderColor: colors['--checkbox-checked-bg'],
    backgroundColor: colors['--checkbox-checked-bg'],
  },
  srOnly: {
    position: 'absolute',
    width: 1,
    height: 1,
    padding: 0,
    margin: -1,
    overflow: 'hidden',
    clip: 'rect(0, 0, 0, 0)',
    whiteSpace: 'nowrap',
    borderWidth: 0,
  },
  check: {
    display: 'flex',
    height: 9,
    width: 10,
    alignItems: 'center',
    justifyContent: 'center',
    color: colors['--checkbox-checked-fg'],
  },
  dash: {
    display: 'flex',
    height: 2,
    width: 6,
    alignItems: 'center',
    justifyContent: 'center',
    color: colors['--checkbox-checked-fg'],
  },
});

export const BuyerlyCheckbox: React.FC<BuyerlyCheckboxProps> = ({
  checked,
  indeterminate = false,
  onChange,
  className = '',
  hidden = false,
  alwaysVisible = false,
  decorative = false,
}) => {
  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (onChange) {
      onChange(!checked);
    }
  };

  return (
    <div
      data-checked={checked || indeterminate ? 'true' : 'false'}
      aria-hidden={hidden || decorative || undefined}
      onClick={handleClick}
      {...stylex.props(styles.slot, (checked || indeterminate || alwaysVisible) && styles.shown, hidden && styles.hidden)}
    >
      <div {...withClassName(stylex.props(styles.box, (checked || indeterminate) && styles.boxChecked), className)}>
        {/* Invisible Native Input for accessibility */}
        <input
          type="checkbox"
          tabIndex={-1}
          checked={checked}
          aria-checked={indeterminate ? 'mixed' : checked}
          aria-label="Select row"
          disabled={hidden}
          onChange={() => {}}
          {...stylex.props(styles.srOnly)}
        />

        {/* Linear checkmark, light on the accent fill */}
        {checked && !indeterminate && (
          <div {...stylex.props(styles.check)}>
            <svg width="10" height="9" viewBox="0 0 10 8" fill="currentColor">
              <path strokeWidth="0.2" d="M3.46975 5.70757L1.88358 4.1225C1.65832 3.8974 1.29423 3.8974 1.06897 4.1225C0.843675 4.34765 0.843675 4.7116 1.06897 4.93674L3.0648 6.93117C3.29006 7.15628 3.65414 7.15628 3.8794 6.93117L8.93103 1.88306C9.15633 1.65792 9.15633 1.29397 8.93103 1.06883C8.70578 0.843736 8.34172 0.843724 8.11646 1.06879C8.11645 1.0688 8.11643 1.06882 8.11642 1.06883L3.46975 5.70757Z" />
            </svg>
          </div>
        )}

        {/* Exact Linear Indeterminate SVG Dash */}
        {indeterminate && (
          <div {...stylex.props(styles.dash)}>
            <svg width="6" height="2" viewBox="0 0 6 2" fill="currentColor">
              <rect y="0.25" width="6" height="1.5" />
            </svg>
          </div>
        )}
      </div>
    </div>
  );
};
