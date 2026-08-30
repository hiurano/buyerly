import React from 'react';

interface CampaignGroupHeaderProps {
  groupId: string;
  groupName: string;
  count: number;
  dotColor: string;        // rgb(...) — цвет точки (circle dot)
  accentLch: string;       // lch(10.756 C H) — левый стоп градиента
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

/**
 * Linear-style Group Header Row.
 *
 * Extracted pixel-perfect from https://linear.app/ai-bratva/my-issues/assigned:
 *  - Sticky bar: position:sticky; top:-1px; z-index:2; height:36px; margin-bottom:2px
 *  - Background: linear-gradient(90deg, lch(10.756 C H) 0%, lch(9.232 0.85 272) 100%)
 *  - Left: chevron ▶ (solid triangle, border-radius:9999px, 20×20px, padding:2px)
 *  - Dot: 9×9px circle, border-radius:50%
 *  - Title: 13px, font-weight:450, color:lch(100 0 272) = #fff
 *  - Count: <button> transparent, 13px, font-weight:450, color:lch(63.304 7 H)
 *  - Right: + button (24×24px, border-radius:9999px), always visible
 */
export const CampaignGroupHeader: React.FC<CampaignGroupHeaderProps> = ({
  groupId: _groupId,
  groupName,
  count,
  dotColor,
  accentLch,
  isCollapsed,
  onToggleCollapse,
}) => {
  const neutralBg = 'lch(9.232 0.85 272)';
  const gradient = `linear-gradient(90deg, ${accentLch} 0%, ${neutralBg} 100%)`;

  return (
    /* Outer sticky wrapper — matches Linear's _rowShared + _elementTransition + _gridMode */
    <div
      style={{
        position: 'sticky',
        top: '-1px',
        zIndex: 2,
        height: '36px',
        marginBottom: '2px',
        borderRadius: '8px',
        isolation: 'isolate',
        willChange: 'transform',
        contain: 'layout style',
        display: 'flex',
        alignItems: 'center',
      }}
    >
      {/* Inner content bar with gradient background */}
      <div
        className="group/header"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          height: '36px',
          width: '100%',
          paddingRight: '8px',
          background: gradient,
          borderRadius: '8px',
        }}
      >
        {/* Chevron outer wrapper 28×28px */}
        <div
          style={{
            width: '28px',
            height: '28px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          {/* Chevron button: DIV[role=button], 20×20px, border-radius:9999px */}
          <div
            role="button"
            aria-label={isCollapsed ? 'Expand group' : 'Collapse group'}
            data-open={!isCollapsed}
            onClick={onToggleCollapse}
            style={{
              width: '20px',
              height: '20px',
              borderRadius: '9999px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '2px',
              margin: '4px',
              background: 'transparent',
              cursor: 'pointer',
              transition: 'background 0.15s',
              flexShrink: 0,
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.06)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLDivElement).style.background = 'transparent';
            }}
          >
            {/* Solid right-pointing triangle ▶ — Linear's exact chevron SVG */}
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              aria-hidden="true"
              style={{
                fill: 'lch(63.304% 7 272)',
                transition: 'transform 0.15s ease',
                transform: isCollapsed ? 'rotate(0deg)' : 'rotate(90deg)',
                flexShrink: 0,
              }}
            >
              <path d="M7.00194 10.6239C6.66861 10.8183 6.25 10.5779 6.25 10.192V5.80802C6.25 5.42212 6.66861 5.18169 7.00194 5.37613L10.7596 7.56811C11.0904 7.76105 11.0904 8.23895 10.7596 8.43189L7.00194 10.6239Z" />
            </svg>
          </div>
        </div>

        {/* Dot wrapper 16×16px */}
        <div
          aria-hidden="true"
          style={{
            width: '16px',
            height: '16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          {/* Solid color circle 9×9px — Linear's group color dot */}
          <div
            style={{
              width: '9px',
              height: '9px',
              borderRadius: '50%',
              background: dotColor,
              display: 'block',
              flexShrink: 0,
            }}
          />
        </div>

        {/* Title + Count flex row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            flex: '0 1 auto',
            minWidth: 0,
          }}
        >
          {/* Group Title span — 13px, font-weight:450, color:white */}
          <span
            style={{
              fontSize: '13px',
              fontWeight: 450,
              lineHeight: 'normal',
              color: 'lch(100 0 272)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {groupName}
          </span>

          {/* Count Badge — <button>, transparent, 24px height, border-radius:8px */}
          <button
            tabIndex={-1}
            type="button"
            style={{
              height: '24px',
              minWidth: '8px',
              borderRadius: '8px',
              background: 'transparent',
              border: 'none',
              padding: '0',
              cursor: 'default',
              display: 'flex',
              alignItems: 'center',
              fontSize: '13px',
              fontWeight: 450,
              color: 'lch(63.304% 7 272)',
              lineHeight: 'normal',
            }}
          >
            {count}
          </button>
        </div>

        {/* Spacer — pushes action buttons to the right */}
        <div style={{ flex: 1 }} />

        {/* Right Actions — gap:6px */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          {/* + Create button: 24×24px, border-radius:9999px (circle) */}
          <button
            type="button"
            aria-label="Create new campaign"
            style={{
              width: '24px',
              height: '24px',
              borderRadius: '9999px',
              background: 'transparent',
              border: 'none',
              padding: '2px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'background 0.15s',
              opacity: 0,
              color: 'lch(63.304% 7 272)',
            }}
            className="group-hover/header:opacity-100"
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.06)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
            }}
          >
            {/* Plus icon — Linear's exact path */}
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8.75 4C8.75 3.58579 8.41421 3.25 8 3.25C7.58579 3.25 7.25 3.58579 7.25 4V7.25H4C3.58579 7.25 3.25 7.58579 3.25 8C3.25 8.41421 3.58579 8.75 4 8.75H7.25V12C7.25 12.4142 7.58579 12.75 8 12.75C8.41421 12.75 8.75 12.4142 8.75 12V8.75H12C12.4142 8.75 12.75 8.41421 12.75 8C12.75 7.58579 12.4142 7.25 12 7.25H8.75V4Z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
};
