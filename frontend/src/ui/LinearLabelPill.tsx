import React from 'react';

export interface LinearLabelPillProps {
  label: string;
  dotColor?: string;
  className?: string;
  onClick?: (e: React.MouseEvent) => void;
}

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
export const LinearLabelPill: React.FC<LinearLabelPillProps> = ({
  label,
  dotColor = 'rgb(148, 163, 184)',
  className = '',
  onClick,
}) => {
  return (
    <div
      data-disabled="false"
      onClick={onClick}
      style={{
        display: 'inline-flex',
        flexDirection: 'row',
        alignItems: 'center',
        height: '24px',
        maxWidth: '224px',
        padding: '0 8px',
        borderRadius: '48px',
        backgroundColor: 'var(--item-hover-bg)',
        border: '1px solid var(--color-border-secondary)',
        cursor: onClick ? 'pointer' : 'default',
        overflow: 'hidden',
        boxSizing: 'border-box',
        flexShrink: 0,
        transition: 'border-color 0.15s ease, color 0.15s ease, background-color 0.15s ease',
      }}
      className={`group/label-pill hover:opacity-90 ${className}`}
    >
      {/* 1. Left Indicator Dot Wrapper (14×14px flex centered) */}
      <div
        style={{
          width: '14px',
          height: '14px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {/* 2. Inner Dot (9×9px circle) */}
        <div
          aria-hidden="true"
          style={{
            width: '9px',
            height: '9px',
            borderRadius: '50%',
            backgroundColor: dotColor,
            flexShrink: 0,
          }}
        />
      </div>

      {/* 3. Label Text */}
      <span
        style={{
          margin: '0 1px 0 6px',
          fontSize: '12px',
          fontWeight: 450,
          lineHeight: 'normal',
          color: 'var(--text-secondary)',
          whiteSpace: 'nowrap',
          textOverflow: 'ellipsis',
          overflow: 'hidden',
          transition: 'color 0.15s ease',
        }}
        className="group-hover/label-pill:text-[var(--text-primary)]"
      >
        {label}
      </span>
    </div>
  );
};
