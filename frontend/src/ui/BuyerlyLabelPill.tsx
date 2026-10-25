import React from 'react';
import * as stylex from '@stylexjs/stylex';
import { colors } from '@/styles/tokens.stylex';
import { withClassName } from '@/ui/withClassName';

export interface BuyerlyLabelPillProps {
  label: string;
  dotColor?: string;
  className?: string;
  onClick?: (e: React.MouseEvent) => void;
}

const styles = stylex.create({
  root: {
    display: 'inline-flex',
    flexDirection: 'row',
    alignItems: 'center',
    height: 24,
    maxWidth: 224,
    paddingTop: 0,
    paddingRight: 8,
    paddingBottom: 0,
    paddingLeft: 8,
    borderRadius: 48,
    backgroundColor: colors['--item-hover-bg'],
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: colors['--color-border-secondary'],
    cursor: 'default',
    overflow: 'hidden',
    boxSizing: 'border-box',
    flexShrink: 0,
    opacity: {
      default: null,
      ':hover': 0.9,
    },
    transitionProperty: 'border-color, color, background-color',
    transitionDuration: '0.15s',
    transitionTimingFunction: 'ease',
  },
  clickable: {
    cursor: 'pointer',
  },
  dotFrame: {
    width: 14,
    height: 14,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  dot: {
    width: 9,
    height: 9,
    borderRadius: '50%',
    flexShrink: 0,
  },
  label: {
    marginTop: 0,
    marginRight: 1,
    marginBottom: 0,
    marginLeft: 6,
    fontSize: 12,
    fontWeight: 450,
    lineHeight: 'normal',
    // Its old hover colour never showed: the inline colour beat it.
    color: colors['--text-secondary'],
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis',
    overflow: 'hidden',
    transitionProperty: 'color',
    transitionDuration: '0.15s',
    transitionTimingFunction: 'ease',
  },
});

/**
 * Linear-style Label / Group Pill Badge.
 *
 * Extracted pixel-perfect from Linear DOM (`_badgeRoot_10u6g_1`):
 * - Outer pill container: height 24px, border-radius 48px, padding 0 8px
 * - Background: rgba(255, 255, 255, 0.04), hover rgba(255, 255, 255, 0.07)
 * - Border: 1px solid rgba(255, 255, 255, 0.07)
 * - Left dot wrapper: 14×14px flex centered (`_iconContainer_10u6g_25`)
 * - Left dot: 9×9px circle, border-radius 50%
 * - Text: 12px, font-weight 450, color #8f9095, hover #ffffff, margin-left 6px
 * - Transitions: border-color 0.15s, color 0.15s, background-color 0.15s
 */
export const BuyerlyLabelPill: React.FC<BuyerlyLabelPillProps> = ({
  label,
  dotColor = 'rgb(148, 163, 184)',
  className = '',
  onClick,
}) => {
  return (
    <div
      data-disabled="false"
      onClick={onClick}
      {...withClassName(stylex.props(styles.root, onClick && styles.clickable), className)}
    >
      {/* 1. Left Indicator Dot Wrapper (14×14px flex centered) */}
      <div {...stylex.props(styles.dotFrame)}>
        {/* 2. Inner Dot (9×9px circle) */}
        <div aria-hidden="true" {...stylex.props(styles.dot)} style={{ backgroundColor: dotColor }} />
      </div>

      {/* 3. Label Text */}
      <span {...stylex.props(styles.label)}>
        {label}
      </span>
    </div>
  );
};
