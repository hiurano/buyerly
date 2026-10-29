import React from 'react';
import * as stylex from '@stylexjs/stylex';
import { colors } from '@/styles/tokens.stylex';

interface IconProps extends React.SVGProps<SVGSVGElement> {
  size?: number;
}

// Delivery status: a filled ring while active, dashed while paused (14x14).
export const BuyerlyStatusCircleIcon: React.FC<{ status: 'active' | 'scaling' | 'paused'; size?: number; className?: string }> = ({
  status,
  size = 14,
  className = '',
}) => {
  if (status === 'active') {
    return (
      <svg width={size} height={size} viewBox="0 0 14 14" fill="none" className={className}>
        <circle cx="7" cy="7" r="5.5" stroke="#10b981" strokeWidth="1.5" />
        <circle cx="7" cy="7" r="3" fill="#10b981" />
      </svg>
    );
  }
  if (status === 'scaling') {
    return (
      <svg width={size} height={size} viewBox="0 0 14 14" fill="none" className={className}>
        <circle cx="7" cy="7" r="5.5" stroke="#3b82f6" strokeWidth="1.5" strokeDasharray="3 2" />
        <circle cx="7" cy="7" r="3" fill="#3b82f6" />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" className={className}>
      <circle cx="7" cy="7" r="5.5" stroke="#6b7280" strokeWidth="1.5" strokeDasharray="2 2" />
    </svg>
  );
};

// 12a. Buyerly mark (#432): monochrome, follows the theme through --site-logo
// (Linear's #222326 in light, white in dark). Same 512 frame as /buyerly-logo.png.
export const BuyerlyMark: React.FC<{ size?: number; className?: string }> = ({
  size = 16,
  className = '',
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 512 512"
    fill="none"
    aria-hidden="true"
    className={className}
    style={{ display: 'block', color: 'var(--site-logo)' }}
  >
    <path
      fill="currentColor"
      fillRule="evenodd"
      clipRule="evenodd"
      d="M192 464V336H112L80 224H192V192H288V48H320L432 464H192Z M288 224L224 256H288V224Z M192 176V48H224L256 176H192Z"
    />
  </svg>
);

// 12b. Buyerly Logo Avatar (#557), as Linear's logo in its Inbox welcome item:
// a disc in the inverse of the page (#2f2f31 in light, #e3e4e6 in dark) with
// the mark at 160/256 in the canvas color.
const avatarStyles = stylex.create({
  root: {
    display: 'block',
    flexShrink: 0,
    userSelect: 'none',
  },
  disc: {
    fill: colors['--logo-avatar-bg'],
  },
  mark: {
    fill: colors['--bg-canvas'],
  },
});

export const BuyerlyLogoAvatar: React.FC<{ size?: number }> = ({ size = 32 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 256 256"
    fill="none"
    role="img"
    aria-label="Buyerly"
    {...stylex.props(avatarStyles.root)}
  >
    <rect width="256" height="256" rx="128" {...stylex.props(avatarStyles.disc)} />
    <svg x="48" y="48" width="160" height="160" viewBox="0 0 512 512" aria-hidden="true">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M192 464V336H112L80 224H192V192H288V48H320L432 464H192Z M288 224L224 256H288V224Z M192 176V48H224L256 176H192Z"
        {...stylex.props(avatarStyles.mark)}
      />
    </svg>
  </svg>
);

// A panel's frame in Phosphor Bold's weight (1.5px at 16px), drawn for Buyerly.
const BuyerlyPanelFrame: React.FC = () => (
  <rect x="1.75" y="2.75" width="12.5" height="10.5" rx="2.75" fill="none" stroke="currentColor" strokeWidth="1.5" />
);

// The details pane toggle: its bar widens to the right while the pane is open (16x16).
export const BuyerlySidebarToggleIcon: React.FC<IconProps & { isOpen?: boolean }> = ({
  size = 16,
  isOpen = true,
  className = '',
  ...props
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    role="img"
    focusable="false"
    aria-hidden="true"
    fill="currentColor"
    className={className}
    {...props}
  >
    <g>
      <BuyerlyPanelFrame />
      <rect
        x={isOpen ? 7 : 10}
        y={5}
        width={isOpen ? 4.5 : 1.5}
        height={6}
        rx={0.75}
        style={{
          transitionProperty: 'x, width',
          transitionDuration: '250ms',
          transitionTimingFunction: 'ease',
        }}
      />
    </g>
  </svg>
);

// The sidebar toggle: its bar on the left widens with the sidebar (16x16).
export const BuyerlySidebarLeftToggleIcon: React.FC<IconProps & { isOpen?: boolean }> = ({
  size = 16,
  isOpen = true,
  className = '',
  ...props
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    role="img"
    focusable="false"
    aria-hidden="true"
    fill="currentColor"
    className={className}
    {...props}
  >
    <g>
      <BuyerlyPanelFrame />
      {/* The bar widens with the sidebar, on the sidebar's spring, as Linear's. */}
      <rect
        x={4}
        y={5}
        width={isOpen ? 4.5 : 1.5}
        height={6}
        rx={0.75}
        style={{
          transitionProperty: 'width',
          transitionDuration: 'var(--sidebar-spring-duration)',
          transitionTimingFunction: 'var(--sidebar-spring)',
        }}
      />
    </g>
  </svg>
);

// A dashed circle: a status field with no value (14x14).
export const BuyerlyBacklogDashedIcon: React.FC<IconProps> = ({ size = 14, className = '', ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 14 14"
    role="img"
    focusable="false"
    aria-hidden="true"
    fill="none"
    className={className}
    {...props}
  >
    <circle
      cx="7"
      cy="7"
      r="5.5"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeDasharray="2.5 2"
    />
  </svg>
);

// The small chevron of a select or a dropdown trigger, drawn for Buyerly: a 1.5 line with round ends.
export const BuyerlyChevronGlyph: React.FC<IconProps & { direction?: 'down' | 'right' }> = ({
  size = 10,
  direction = 'down',
  ...props
}) => (
  <svg width={size} height={size} viewBox="0 0 10 10" fill="none" aria-hidden="true" {...props}>
    <path
      d={direction === 'down' ? 'M2.25 3.75 5 6.5l2.75-2.75' : 'M3.75 2.25 6.5 5 3.75 7.75'}
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

// The tick inside a checked checkbox, drawn for Buyerly (10x8 frame).
export const BuyerlyCheckGlyph: React.FC<IconProps & { width?: number; height?: number }> = ({
  width = 10,
  height = 9,
  ...props
}) => (
  <svg width={width} height={height} viewBox="0 0 10 8" fill="none" aria-hidden="true" {...props}>
    <path d="M1.5 4.25 3.75 6.5 8.5 1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// The disclosure triangle beside a collapsible section or group, drawn for Buyerly:
// a small rounded triangle pointing right, turned down by its place while open (16x16).
export const BuyerlyDisclosureGlyph: React.FC<IconProps> = ({ size = 16, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" {...props}>
    <path d="M6.5 5.4v5.2a.6.6 0 0 0 .93.5l3.9-2.6a.6.6 0 0 0 0-1l-3.9-2.6a.6.6 0 0 0-.93.5Z" />
  </svg>
);
