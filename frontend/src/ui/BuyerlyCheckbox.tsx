import React from 'react';
import * as stylex from '@stylexjs/stylex';
import { BuyerlyCheckGlyph } from '@/icons/BuyerlyIcons';
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
            <BuyerlyCheckGlyph />
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
