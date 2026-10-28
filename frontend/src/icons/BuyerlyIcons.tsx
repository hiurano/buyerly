import React from 'react';
import * as stylex from '@stylexjs/stylex';
import { colors } from '@/styles/tokens.stylex';

interface IconProps extends React.SVGProps<SVGSVGElement> {
  size?: number;
}

// 1. Exact Linear Search Icon (16x16)
export const BuyerlySearchIcon: React.FC<IconProps> = ({ size = 16, className = '', ...props }) => (
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
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M7 2C9.76142 2 12 4.23858 12 7C12 8.11012 11.6375 9.13519 11.0254 9.96484L13.7803 12.7197L13.832 12.7764C14.0723 13.0709 14.0549 13.5057 13.7803 13.7803C13.5057 14.0549 13.0709 14.0723 12.7764 13.832L12.7197 13.7803L9.96484 11.0254C9.13519 11.6375 8.11012 12 7 12C4.23858 12 2 9.76142 2 7C2 4.23858 4.23858 2 7 2ZM7 3.5C5.067 3.5 3.5 5.067 3.5 7C3.5 8.933 5.067 10.5 7 10.5C8.933 10.5 10.5 8.933 10.5 7C10.5 5.067 8.933 3.5 7 3.5Z"
    />
  </svg>
);

// 2. Exact Linear Inbox Tray Icon (16x16)
export const BuyerlyInboxIcon: React.FC<IconProps> = ({ size = 16, className = '', ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    role="img"
    focusable="false"
    aria-hidden="true"
    xmlns="http://www.w3.org/2000/svg"
    fill="currentColor"
    className={className}
    {...props}
  >
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M11.0069 1.00879C12.0235 1.09224 12.8967 1.78967 13.1944 2.78027L14.8907 8.42871C15.0034 8.80411 15.0258 9.20103 14.9571 9.58691L14.5069 12.1143L14.4375 12.4219C14.0542 13.8306 12.8312 14.8559 11.378 14.9863L11.0625 15H4.92875L4.6143 14.9863C3.16087 14.8561 1.93819 13.8307 1.55473 12.4219L1.48539 12.1143L1.03422 9.58691C0.974045 9.24914 0.984493 8.90311 1.06352 8.57031L1.1016 8.42871L2.79691 2.78027C3.09453 1.78948 3.96862 1.09214 4.98539 1.00879L5.19047 1H10.8018L11.0069 1.00879ZM2.96098 11.8516C3.13119 12.8053 3.96043 13.4999 4.92875 13.5H11.0625C12.031 13.5 12.8611 12.8054 13.0313 11.8516L13.2715 10.5H11.6211C11.2249 10.5 10.8512 10.6738 10.5957 10.9697L10.4932 11.1035C10.1201 11.6634 9.49195 11.9999 8.81938 12H7.17191C6.54154 11.9998 5.95019 11.7042 5.57133 11.2061L5.49809 11.1035C5.24687 10.7266 4.82396 10.5 4.37113 10.5H2.71977L2.96098 11.8516ZM5.19047 2.5C4.80433 2.50005 4.45748 2.72173 4.29203 3.06055L4.23246 3.21191L2.53715 8.86035C2.5234 8.90613 2.514 8.95293 2.50688 9H4.37113C5.32524 9.00001 6.21689 9.47715 6.74613 10.2715L6.78422 10.3223C6.88083 10.4341 7.02214 10.4998 7.17191 10.5H8.81938C8.99076 10.4999 9.15106 10.4142 9.24613 10.2715L9.34965 10.126C9.88713 9.41919 10.7268 9 11.6211 9H13.4854C13.4785 8.95295 13.4689 8.90616 13.4551 8.86035L11.7588 3.21191C11.6318 2.78947 11.2427 2.50018 10.8018 2.5H5.19047Z"
    />
  </svg>
);

// 3. Exact Linear My Issues Icon (Clean Symmetric Corner Brackets + Center Dot, 16x16)
export const BuyerlyMyIssuesIcon: React.FC<IconProps> = ({ size = 16, className = '', ...props }) => (
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
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M1 4.75v-.5A3.25 3.25 0 0 1 4.25 1h.5a.75.75 0 0 1 0 1.5h-.5A1.75 1.75 0 0 0 2.5 4.25v.5a.75.75 0 0 1-1.5 0M11.25 1h.5A3.25 3.25 0 0 1 15 4.25v.5l-.004.077a.75.75 0 0 1-1.492 0L13.5 4.75v-.5a1.75 1.75 0 0 0-1.75-1.75h-.5a.75.75 0 0 1 0-1.5m-6.5 13.995h-.5A3.25 3.25 0 0 1 1 11.745v-.5l.004-.077a.75.75 0 0 1 1.492 0l.004.077v.5c0 .967.784 1.75 1.75 1.75h.5a.75.75 0 0 1 0 1.5m6.5.005h.5A3.25 3.25 0 0 0 15 11.75v-.5l-.004-.077a.75.75 0 0 0-1.492 0l-.004.077v.5a1.75 1.75 0 0 1-1.75 1.75h-.5a.75.75 0 0 0 0 1.5M10 8a2 2 0 1 1-4 0 2 2 0 0 1 4 0"
    />
  </svg>
);

// 3b. Exact Linear Views / Layers / Stack Icon (16x16)
export const BuyerlyLayersIcon: React.FC<IconProps> = ({ size = 16, className = '', ...props }) => (
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
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M6.93213 2.21398C7.66484 1.90793 8.49512 1.93032 9.21389 2.28028L14.28 4.74739C15.2242 5.20709 15.2441 6.55895 14.3138 7.04673L9.2874 9.6826C8.48012 10.1058 7.51988 10.1058 6.7126 9.6826L1.68618 7.04673C0.75589 6.55895 0.775786 5.20709 1.71995 4.74739L6.78611 2.28028L6.93213 2.21398ZM8.55132 3.67054C8.24643 3.52213 7.89768 3.50303 7.58179 3.61428L7.44868 3.67054L2.83947 5.91363L7.41491 8.31243C7.7819 8.50486 8.2181 8.50486 8.58509 8.31243L13.1595 5.91363L8.55132 3.67054Z"
    />
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M13.9045 10.0768C14.272 9.90435 14.7242 10.0333 14.9153 10.365C15.1063 10.6966 14.9634 11.1047 14.5959 11.2772L9.49912 13.6693C8.55934 14.1102 7.44077 14.1102 6.50099 13.6693L1.40417 11.2772L1.33776 11.2428C1.01976 11.0547 0.905685 10.676 1.08483 10.365C1.26402 10.054 1.67295 9.92085 2.02626 10.0477L2.0956 10.0768L7.19241 12.468L7.38675 12.5464C7.84801 12.7022 8.36492 12.6757 8.80769 12.468L13.9045 10.0768Z"
    />
  </svg>
);

// 3c. Exact Linear Meta Brand Icon (16x16)
export const BuyerlyMetaIcon: React.FC<IconProps> = ({ size = 16, className = '', ...props }) => (
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
    <path d="M11.265 3.002c-1.23 0-2.191.93-3.061 2.11-1.196-1.528-2.197-2.11-3.394-2.11C2.37 3.002.5 6.188.5 9.56c0 2.11 1.018 3.441 2.722 3.441 1.227 0 2.11-.58 3.678-3.331l1.104-1.956q.236.383.498.825l.735 1.241c1.433 2.406 2.232 3.221 3.678 3.221 1.66 0 2.585-1.35 2.585-3.504 0-3.53-1.912-6.496-4.235-6.496M5.704 8.926c-1.272 2-1.712 2.448-2.42 2.448-.729 0-1.162-.641-1.162-1.786 0-2.448 1.217-4.952 2.668-4.952.785 0 1.442.456 2.447 1.9a200 200 0 0 0-1.533 2.39m4.8-.252-.88-1.471a31 31 0 0 0-.686-1.072c.793-1.228 1.447-1.84 2.224-1.84 1.616 0 2.908 2.387 2.908 5.318 0 1.117-.365 1.765-1.12 1.765-.725 0-1.07-.48-2.446-2.7" />
  </svg>
);

// 4. Exact Linear Solid Lightning Bolt / Rules Icon (16x16)
export const BuyerlyBoltIcon: React.FC<IconProps> = ({ size = 16, className = '', ...props }) => (
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
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M8.397 1.482a1.501 1.501 0 0 1 2.594 1.184L10.677 5.5H12.5a1.5 1.5 0 0 1 1.102 2.518l-6 6.5a1.5 1.5 0 0 1-2.593-1.184l.314-2.834H3.5a1.5 1.5 0 0 1-1.103-2.518zM3.5 9H7l-.5 4.5 6-6.5H9l.5-4.5z"
    />
  </svg>
);

// 5. Exact Linear Command (⌘) Actions Icon (16x16)
export const BuyerlyCommandIcon: React.FC<IconProps> = ({ size = 16, className = '', ...props }) => (
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
    <path d="M2 4.57143C2 5.99159 3.15126 7.14286 4.57143 7.14286H5.85714V8.85714H4.57143C3.15126 8.85714 2 10.0084 2 11.4286C2 12.8487 3.15126 14 4.57143 14C5.99159 14 7.14286 12.8487 7.14286 11.4286V10.1429H8.85714V11.4286C8.85714 12.8487 10.0084 14 11.4286 14C12.8487 14 14 12.8487 14 11.4286C14 10.0084 12.8487 8.85714 11.4286 8.85714H10.1429V7.14286H11.4286C12.8487 7.14286 14 5.99159 14 4.57143C14 3.15126 12.8487 2 11.4286 2C10.0084 2 8.85714 3.15126 8.85714 4.57143V5.85714H7.14286V4.57143C7.14286 3.15126 5.99159 2 4.57143 2C3.15126 2 2 3.15126 2 4.57143ZM5.85714 4.57143V5.85714H4.57143C3.86135 5.85714 3.28571 5.28151 3.28571 4.57143C3.28571 3.86135 3.86135 3.28571 4.57143 3.28571C5.28151 3.28571 5.85714 3.86135 5.85714 4.57143ZM7.14286 8.85714V7.14286H8.85714V8.85714H7.14286ZM4.57143 10.1429H5.85714V11.4286C5.85714 12.1387 5.28151 12.7143 4.57143 12.7143C3.86135 12.7143 3.28571 12.1387 3.28571 11.4286C3.28571 10.7185 3.86135 10.1429 4.57143 10.1429ZM10.1429 10.1429H11.4286C12.1387 10.1429 12.7143 10.7185 12.7143 11.4286C12.7143 12.1387 12.1387 12.7143 11.4286 12.7143C10.7185 12.7143 10.1429 12.1387 10.1429 11.4286V10.1429ZM10.1429 4.57143C10.1429 3.86135 10.7185 3.28571 11.4286 3.28571C12.1387 3.28571 12.7143 3.86135 12.7143 4.57143C12.7143 5.28151 12.1387 5.85714 11.4286 5.85714H10.1429V4.57143Z" />
  </svg>
);

// 6. Exact Linear Close Icon (16x16)
export const BuyerlyCloseIcon: React.FC<IconProps> = ({ size = 16, className = '', ...props }) => (
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
    <path d="M2.96967 2.96967C3.26256 2.67678 3.73744 2.67678 4.03033 2.96967L8 6.939L11.9697 2.96967C12.2626 2.67678 12.7374 2.67678 13.0303 2.96967C13.3232 3.26256 13.3232 3.73744 13.0303 4.03033L9.061 8L13.0303 11.9697C13.2966 12.2359 13.3208 12.6526 13.1029 12.9462L13.0303 13.0303C12.7374 13.3232 12.2626 13.3232 11.9697 13.0303L8 9.061L4.03033 13.0303C3.73744 13.3232 3.26256 13.3232 2.96967 13.0303C2.67678 12.7374 2.67678 12.2626 2.96967 11.9697L6.939 8L2.96967 4.03033C2.7034 3.76406 2.6792 3.3474 2.89705 3.05379L2.96967 2.96967Z" />
  </svg>
);

// 6b. Pencil, used by editable settings rows (16x16)
export const BuyerlyPencilIcon: React.FC<IconProps> = ({ size = 16, className = '', ...props }) => (
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
    <path d="M12.146 1.146a2 2 0 0 1 2.828 2.828l-.94.94-2.828-2.829.94-.939Z" />
    <path d="M10.5 2.793 13.328 5.62l-7.47 7.47a1.5 1.5 0 0 1-.693.394l-2.83.708a.5.5 0 0 1-.606-.607l.707-2.828a1.5 1.5 0 0 1 .395-.694l7.47-7.47Z" />
  </svg>
);

// 7. Exact Linear Notification Actions (3 dots, 16x16)
export const BuyerlyDotsIcon: React.FC<IconProps> = ({ size = 16, className = '', ...props }) => (
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
    <path d="M3 6.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3ZM8 6.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3ZM13 6.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Z" />
  </svg>
);

// 8. Exact Linear Add Filter Icon (Funnel lines, 16x16)
export const BuyerlyFilterIcon: React.FC<IconProps> = ({ size = 16, className = '', ...props }) => (
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
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M14.25 3a.75.75 0 0 1 0 1.5H1.75a.75.75 0 0 1 0-1.5h12.5ZM4 8a.75.75 0 0 1 .75-.75h6.5a.75.75 0 0 1 0 1.5h-6.5A.75.75 0 0 1 4 8Zm2.75 3.5a.75.75 0 0 0 0 1.5h2.5a.75.75 0 0 0 0-1.5h-2.5Z"
    />
  </svg>
);

// 9. Exact Linear Display Options Icon (Sliders, 16x16)
export const BuyerlySlidersIcon: React.FC<IconProps> = ({ size = 16, className = '', ...props }) => (
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
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M7 2.5C8.11933 2.5 9.06613 3.23584 9.38477 4.25H14.75C15.1642 4.25 15.5 4.58579 15.5 5C15.5 5.41421 15.1642 5.75 14.75 5.75H9.38477C9.06613 6.76416 8.11933 7.5 7 7.5C5.88067 7.5 4.93387 6.76416 4.61523 5.75H2.25C1.83579 5.75 1.5 5.41421 1.5 5C1.5 4.58579 1.83579 4.25 2.25 4.25H4.61523C4.93387 3.23584 5.88067 2.5 7 2.5ZM7 4C6.44772 4 6 4.44772 6 5C6 5.55228 6.44772 6 7 6C7.55228 6 8 5.55228 8 5C8 4.44772 7.55228 4 7 4Z"
    />
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M10 13.5C8.88067 13.5 7.93387 12.7642 7.61523 11.75H2.25C1.83579 11.75 1.5 11.4142 1.5 11C1.5 10.5858 1.83579 10.25 2.25 10.25H7.61523C7.93387 9.23584 8.88067 8.5 10 8.5C11.1193 8.5 12.0661 9.23584 12.3848 10.25H14.75C15.1642 10.25 15.5 10.5858 15.5 11C15.5 11.4142 15.1642 11.75 14.75 11.75H12.3848C12.0661 12.7642 11.1193 13.5 10 13.5ZM10 12C10.5523 12 11 11.5523 11 11C11 10.4477 10.5523 10 10 10C9.44772 10 9 10.4477 9 11C9 11.5523 9.44772 12 10 12Z"
    />
  </svg>
);

// 10. Exact Linear Priority Bars Icon (3 bars)
export const BuyerlyPriorityBarsIcon: React.FC<{ level?: 'urgent' | 'high' | 'medium' | 'low'; size?: number; className?: string }> = ({
  level = 'high',
  size = 16,
  className = '',
}) => {
  if (level === 'urgent') {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" fill="#f87171" className={className}>
        <path d="M3 1C1.91067 1 1 1.91067 1 3V13C1 14.0893 1.91067 15 3 15H13C14.0893 15 15 14.0893 15 13V3C15 1.91067 14.0893 1 13 1H3ZM7 4L9 4L8.75391 8.99836H7.25L7 4ZM9 11C9 11.5523 8.55228 12 8 12C7.44772 12 7 11.5523 7 11C7 10.4477 7.44772 10 8 10C8.55228 10 9 10.4477 9 11Z" />
      </svg>
    );
  }

  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" className={className}>
      <rect x="1.5" y="8" width="3" height="6" rx="1" />
      <rect x="6.5" y="5" width="3" height="9" rx="1" fillOpacity={level === 'low' ? 0.35 : 1} />
      <rect x="11.5" y="2" width="3" height="12" rx="1" fillOpacity={level === 'high' ? 1 : 0.35} />
    </svg>
  );
};

// 11. Exact Linear Status Circle Icon (Active, Scaling, Paused)
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

// 13. Exact Linear Empty State Inbox Illustration (97.5 x 100px)
export const BuyerlyEmptyInboxIllustration: React.FC<{ className?: string }> = ({
  className = '',
}) => (
  <svg
    viewBox="0 0 78 80"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    style={{ width: '97.5px', height: '100px' }}
    className={className}
  >
    <path
      stroke="var(--text-tertiary)"
      strokeWidth="1.5"
      d="M10.4 9.11A10 10 0 0 1 20.22 1h37.56a10 10 0 0 1 9.82 8.11l8.11 42.2a10 10 0 0 1-9.82 11.9H54.7a6.36 6.36 0 0 0-5.65 3.45 6.36 6.36 0 0 1-5.66 3.45H34.6a6.36 6.36 0 0 1-5.66-3.45 6.36 6.36 0 0 0-5.65-3.46H12.1a10 10 0 0 1-9.8-11.89l8.11-42.2Z"
    />
    <path
      stroke="var(--text-tertiary)"
      strokeWidth="1.5"
      d="m2.36 55.6 3.2 14.06A12 12 0 0 0 17.26 79h43.48a12 12 0 0 0 11.7-9.34l3.2-14.06"
    />
  </svg>
);

// 14. Exact Linear Sidebar Panel Toggle Icon (16x16) with Morph Animation
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
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M4.25 2C2.45508 2 1 3.45508 1 5.25V10.75C1 12.5449 2.45508 14 4.25 14H11.75C13.5449 14 15 12.5449 15 10.75V5.25C15 3.45508 13.5449 2 11.75 2H4.25ZM2.5 5.5C2.5 4.39543 3.39543 3.5 4.5 3.5H11.5C12.6046 3.5 13.5 4.39543 13.5 5.5V10.5C13.5 11.6046 12.6046 12.5 11.5 12.5H4.5C3.39543 12.5 2.5 11.6046 2.5 10.5V5.5Z"
      />
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

// 14b. Exact Linear Left Sidebar Panel Toggle Icon (16x16)
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
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M4.25 2C2.45508 2 1 3.45508 1 5.25V10.75C1 12.5449 2.45508 14 4.25 14H11.75C13.5449 14 15 12.5449 15 10.75V5.25C15 3.45508 13.5449 2 11.75 2H4.25ZM2.5 5.5C2.5 4.39543 3.39543 3.5 4.5 3.5H11.5C12.6046 3.5 13.5 4.39543 13.5 5.5V10.5C13.5 11.6046 12.6046 12.5 11.5 12.5H4.5C3.39543 12.5 2.5 11.6046 2.5 10.5V5.5Z"
      />
      {/* Linear's: the bar at x 4 widens with the sidebar, on the sidebar's spring. */}
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

// 16. Linear Analytics / Chart Icon (16x16)
export const BuyerlyChartIcon: React.FC<IconProps> = ({ size = 16, className = '', ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    {...props}
  >
    {/* Coordinate axes X and Y */}
    <path d="M2.5 2.5V13.5H13.5" />
    {/* Analytical chart trend line */}
    <path d="M5.5 10.5L8 7.5L10.5 9.5L13.5 5.5" />
  </svg>
);

// 17. Linear Keyboard Icon (16x16)

// 18. Exact Linear Clock / Snooze Icon (16x16)
export const BuyerlyClockOutlineIcon: React.FC<IconProps> = ({ size = 16, className = '', ...props }) => (
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
    <path d="M8.75 5a.75.75 0 0 0-1.5 0v3c0 .414.336.75.75.75h3a.75.75 0 0 0 0-1.5H8.75z" />
    <path fillRule="evenodd" clipRule="evenodd" d="M15 8A7 7 0 1 1 1 8a7 7 0 0 1 14 0m-1.5 0a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0" />
  </svg>
);

// 19. Exact Linear Inbox Delete / Tray with X Icon (16x16)
export const BuyerlyInboxDeleteIcon: React.FC<IconProps> = ({ size = 16, className = '', ...props }) => (
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
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M7.25 1.00006C7.66421 1.00006 8 1.33585 8 1.75006C7.99997 2.16425 7.66419 2.50006 7.25 2.50006H5.17969C4.79573 2.50009 4.45093 2.71908 4.28418 3.05475L4.22363 3.20612L2.74902 8.00006H4.37305C5.32773 8.00006 6.21946 8.4772 6.74902 9.27155L6.78809 9.32233C6.8848 9.43418 7.02584 9.49999 7.17578 9.50006H8.82422C8.99569 9.49997 9.15584 9.41422 9.25098 9.27155L9.35449 9.12604C9.89229 8.41924 10.732 8.00006 11.627 8.00006H14.5L14.8232 8.00885C14.9404 8.38976 15 8.78611 15 9.18463V11.5001L14.9951 11.6797C14.9015 13.5292 13.3727 15.0001 11.5 15.0001H4.5C2.62729 15.0001 1.09845 13.5292 1.00488 11.6797L1 11.5001V9.18463C1.00002 8.88566 1.03339 8.58784 1.09961 8.29694L1.17676 8.00885L2.79004 2.76471C3.09264 1.78131 3.96362 1.09035 4.97559 1.00787L5.17969 1.00006H7.25ZM2.5 11.5001C2.50003 12.6046 3.39545 13.5001 4.5 13.5001H11.5C12.6045 13.5001 13.5 12.6046 13.5 11.5001V9.50006H11.627C11.2304 9.50006 10.8572 9.67386 10.6016 9.96979L10.499 10.1036C10.1257 10.6635 9.49722 11 8.82422 11.0001H7.17578C6.54495 11 5.95335 10.7043 5.57422 10.2061L5.50098 10.1036C5.24961 9.72653 4.8262 9.50006 4.37305 9.50006H2.5V11.5001Z"
    />
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M13.7197 1.21979C14.0126 0.926894 14.4874 0.926894 14.7803 1.21979C15.0731 1.51269 15.0731 1.98746 14.7803 2.28033L13.5605 3.50006L14.7803 4.71979C15.0732 5.01268 15.0732 5.48744 14.7803 5.78033C14.4874 6.07317 14.0126 6.07321 13.7197 5.78033L12.5 4.56061L11.2803 5.78033C10.9874 6.07321 10.5126 6.07317 10.2197 5.78033C9.92683 5.48744 9.92683 5.01268 10.2197 4.71979L11.4395 3.50006L10.2197 2.28033C9.92685 1.98746 9.92689 1.51269 10.2197 1.21979C10.5126 0.926894 10.9874 0.926894 11.2803 1.21979L12.5 2.43951L13.7197 1.21979Z"
    />
  </svg>
);

// 20. Exact Linear Rising Bar Chart / Statistics Icon (16x16)
export const BuyerlyBarChartIcon: React.FC<IconProps> = ({ size = 16, className = '', ...props }) => (
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
    {/* Bar 1 (left, low) */}
    <rect x="1.5" y="9" width="3" height="5.5" rx="0.75" />
    {/* Bar 2 (center, mid) */}
    <rect x="6.5" y="5" width="3" height="9.5" rx="0.75" />
    {/* Bar 3 (right, high) */}
    <rect x="11.5" y="1.5" width="3" height="13" rx="0.75" />
  </svg>
);

// 20e. Exact Linear Dashboard / Metric Cards Layout Icon (16x16)
export const BuyerlyDashboardIcon: React.FC<IconProps> = ({ size = 16, className = '', ...props }) => (
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
    {/* Top wide card (Hero metric / chart) */}
    <rect x="1.5" y="1.5" width="13" height="5.5" rx="1" />
    {/* Bottom-left card (KPI 1) */}
    <rect x="1.5" y="9" width="5.5" height="5.5" rx="1" />
    {/* Bottom-right card (KPI 2) */}
    <rect x="9" y="9" width="5.5" height="5.5" rx="1" />
  </svg>
);

// 20f. Exact Linear Trending Up / Performance Statistics Icon (16x16)
export const BuyerlyTrendingUpIcon: React.FC<IconProps> = ({ size = 16, className = '', ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    role="img"
    focusable="false"
    aria-hidden="true"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    {...props}
  >
    {/* Trend Line */}
    <polyline points="1.5 12 5.5 7.5 8.5 9.5 14.5 3.5" />
    {/* Arrow Head */}
    <polyline points="10 3.5 14.5 3.5 14.5 8" />
  </svg>
);

// 20b. Exact Linear AI Sparkles / Magic Insights Icon (16x16)
export const BuyerlySparklesIcon: React.FC<IconProps> = ({ size = 16, className = '', ...props }) => (
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
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M6 3.5C6 6.81371 8.68629 9.5 12 9.5C8.68629 9.5 6 12.1863 6 15.5C6 12.1863 3.31371 9.5 0 9.5C3.31371 9.5 6 6.81371 6 3.5ZM11.5 0.5C11.5 2.433 13.067 4 15 4C13.067 4 11.5 5.567 11.5 7.5C11.5 5.567 9.933 4 8 4C9.933 4 11.5 2.433 11.5 0.5Z"
    />
  </svg>
);

// 20c. Exact Linear Pie Chart / Diagram Icon (16x16)
export const BuyerlyPieChartIcon: React.FC<IconProps> = ({ size = 16, className = '', ...props }) => (
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
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M9 1.07C12.35 1.45 14.93 4.28 14.93 7.75H9V1.07ZM7.5 1.07V9.25H14.93C14.53 12.63 11.66 15.25 8.15 15.25C4.37 15.25 1.3 12.18 1.3 8.4C1.3 4.69 4.12 1.62 7.5 1.07Z"
    />
  </svg>
);

// 20d. Exact Linear Donut / Segmented Diagram Icon (16x16)
export const BuyerlyDonutChartIcon: React.FC<IconProps> = ({ size = 16, className = '', ...props }) => (
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
    {/* Top-right segment */}
    <path
      d="M9 1.07C12.4 1.46 14.93 4.3 14.93 7.75H12.43C12.43 5.48 10.74 3.61 9 3.32V1.07Z"
    />
    {/* Main 3/4 ring segment */}
    <path
      d="M7.5 1.07V3.32C5.38 3.64 3.75 5.51 3.75 7.75C3.75 10.23 5.77 12.25 8.25 12.25C10.49 12.25 12.36 10.62 12.68 8.5H14.93C14.6 11.86 11.73 14.5 8.25 14.5C4.52 14.5 1.5 11.48 1.5 7.75C1.5 4.27 4.14 1.4 7.5 1.07Z"
    />
  </svg>
);

// 21. Exact Linear Inbox Checkmark / Mark all as read Icon (16x16)
export const BuyerlyInboxCheckmarkIcon: React.FC<IconProps> = ({ size = 16, className = '', ...props }) => (
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
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M6.25 1C6.66421 1 7 1.33579 7 1.75C7 2.16421 6.66421 2.5 6.25 2.5H5.17969C4.79573 2.50003 4.45093 2.71902 4.28418 3.05469L4.22363 3.20605L2.74902 8H4.37305C5.32773 8 6.21946 8.47714 6.74902 9.27148L6.78809 9.32227C6.8848 9.43414 7.02582 9.49992 7.17578 9.5H8.82422C8.99571 9.49991 9.15584 9.41418 9.25098 9.27148L9.35449 9.12598C9.89229 8.41918 10.732 8 11.627 8H13.251C13.2527 8.0051 13.2574 8.00859 13.2627 8.00879H14.085C14.5238 8.00895 14.9247 8.29453 14.9746 8.73047C14.9918 8.88092 15 9.03274 15 9.18457V11.5L14.9951 11.6797C14.9016 13.5292 13.3727 15 11.5 15H4.5C2.62727 15 1.09842 13.5292 1.00488 11.6797L1 11.5V9.18457C1.00002 8.88558 1.03338 8.5878 1.09961 8.29688L1.17676 8.00879L2.79004 2.76465C3.09264 1.78125 3.96362 1.09029 4.97559 1.00781L5.17969 1H6.25ZM2.5 11.5C2.5 12.6046 3.39543 13.5 4.5 13.5H11.5C12.6046 13.5 13.5 12.6046 13.5 11.5V9.5H11.627C11.2304 9.5 10.8572 9.6738 10.6016 9.96973L10.499 10.1035C10.1257 10.6635 9.49724 10.9999 8.82422 11H7.17578C6.54494 10.9999 5.95335 10.7043 5.57422 10.2061L5.50098 10.1035C5.24961 9.72647 4.8262 9.5 4.37305 9.5H2.5V11.5Z"
    />
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M13.5088 1.43262C13.822 1.16157 14.2963 1.19568 14.5674 1.50879C14.8384 1.82196 14.8043 2.2963 14.4912 2.56738L10.7354 5.81738C10.4376 6.0747 9.99171 6.05807 9.71387 5.7793L8.21875 4.2793L8.16699 4.22266C7.92727 3.92768 7.94568 3.49286 8.2207 3.21875C8.4958 2.94467 8.93046 2.9281 9.22461 3.16895L9.28125 3.2207L10.2822 4.22461L13.5088 1.43262Z"
    />
  </svg>
);

// 22. Exact Linear Inbox Unread / Mark as unread Icon (16x16)
export const BuyerlyInboxUnreadIcon: React.FC<IconProps> = ({ size = 16, className = '', ...props }) => (
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
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M7.25 1C7.66421 1 8 1.33579 8 1.75C7 2.16421 6.66421 2.5 6.25 2.5H5.17969C4.79573 2.50003 4.45093 2.71902 4.28418 3.05469L4.22363 3.20605L2.74902 8H4.37305C5.32773 8 6.21946 8.47714 6.74902 9.27148L6.78809 9.32227C6.8848 9.43414 7.02582 9.49992 7.17578 9.5H8.82422C8.99571 9.49991 9.15584 9.41418 9.25098 9.27148L9.35449 9.12598C9.89229 8.41918 10.732 8 11.627 8H14.8115C14.8169 8.0002 14.8215 8.00369 14.8232 8.00879C14.9404 8.38972 15 8.78603 15 9.18457V11.5L14.9951 11.6797C14.9016 13.5292 13.3727 15 11.5 15H4.5C2.62727 15 1.09842 13.5292 1.00488 11.6797L1 11.5V9.18457C1.00002 8.88558 1.03338 8.5878 1.09961 8.29688L1.17676 8.00879L2.79004 2.76465C3.09264 1.78125 3.96362 1.09029 4.97559 1.00781L5.17969 1H7.25ZM2.5 11.5C2.5 12.6046 3.39543 13.5 4.5 13.5H11.5C12.6046 13.5 13.5 12.6046 13.5 11.5V9.5H11.627C11.2304 9.5 10.8572 9.6738 10.6016 9.96973L10.499 10.1035C10.1257 10.6635 9.49724 10.9999 8.82422 11H7.17578C6.54494 10.9999 5.95335 10.7043 5.57422 10.2061L5.50098 10.1035C5.24961 9.72647 4.8262 9.5 4.37305 9.5H2.5V11.5Z"
    />
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M12.5 1C13.8807 1 15 2.11929 15 3.5C15 4.88071 13.8807 6 12.5 6C11.1193 6 10 4.88071 10 3.5C10 2.11929 11.1193 1 12.5 1Z"
    />
  </svg>
);

// 23. Exact Linear Plus Icon (16x16)
export const BuyerlyPlusIcon: React.FC<IconProps> = ({ size = 16, className = '', ...props }) => (
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
    <path d="M8.75 4C8.75 3.58579 8.41421 3.25 8 3.25C7.58579 3.25 7.25 3.58579 7.25 4V7.25H4C3.58579 7.25 3.25 7.58579 3.25 8C3.25 8.41421 3.58579 8.75 4 8.75H7.25V12C7.25 12.4142 7.58579 12.75 8 12.75C8.41421 12.75 8.75 12.4142 8.75 12V8.75H12C12.4142 8.75 12.75 8.41421 12.75 8C12.75 7.58579 12.4142 7.25 12 7.25H8.75V4Z" />
  </svg>
);

/** Linear's label tag, as its Settings → Labels and Labels filter draw it (16x16). */
export const BuyerlyLabelIcon: React.FC<IconProps> = ({ size = 16, className = '', ...props }) => (
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
    <path d="M12 11.5V13H5.132v-1.5H12Zm1.5-1.5V6a1.5 1.5 0 0 0-1.346-1.492L12 4.5H5.133a.5.5 0 0 0-.303.103l-.08.076-2.382 2.834a.5.5 0 0 0-.11.234l-.008.087v.331a.5.5 0 0 0 .118.321l2.382 2.835a.5.5 0 0 0 .383.179V13l-.22-.012a2 2 0 0 1-1.16-.54l-.15-.16L1.218 9.45a2 2 0 0 1-.46-1.11L.75 8.165v-.331a2 2 0 0 1 .363-1.147l.106-.14 2.383-2.834a2 2 0 0 1 1.312-.701L5.134 3H12a3 3 0 0 1 3 3v4a3 3 0 0 1-3.002 3v-1.5c.778 0 1.417-.59 1.494-1.347L13.5 10Z" />
    <path d="M5.5 8a1 1 0 1 1 2 0 1 1 0 0 1-2 0Z" />
  </svg>
);

// 24. Linear Shield / Stop-Loss Protection Icon (16x16)
export const BuyerlyShieldIcon: React.FC<IconProps> = ({ size = 16, className = '', ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    role="img"
    focusable="false"
    aria-hidden="true"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.3"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    {...props}
  >
    <path d="M8 1.5l5.5 2.5v4.5c0 3.5-2.5 6-5.5 7-3-1-5.5-3.5-5.5-7V4L8 1.5z" />
  </svg>
);

// Linear's Security & access mark in Settings: a person with a padlock (16x16)
// Linear's Settings → Security & access: a person with a key (17.10).
export const BuyerlyUserLockIcon: React.FC<IconProps> = ({ size = 16, className = '', ...props }) => (
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
    <path d="M8 6C8 4.702 8.61826 3.5484 9.57635 2.81761C9.2054 1.75941 8.19201 1 7 1C5.49377 1 4.27273 2.21256 4.27273 3.70833C4.27273 5.2041 5.49377 6.41667 7 6.41667C7.35541 6.41667 7.69494 6.34916 8.0063 6.22634C8.00212 6.15143 8 6.07596 8 6Z" />
    <path d="M15 6C15 7.30622 14.1652 8.41746 13 8.82929V9L13.803 9.59928C14.071 9.79924 14.071 10.2008 13.803 10.4007L13 11L13.9039 12.1998C14.0378 12.3776 14.0381 12.6226 13.9045 12.8007L12.401 14.8053C12.2007 15.0724 11.7999 15.0719 11.6003 14.8044L11.0993 14.133C11.0679 14.091 11.0436 14.0446 11.0268 13.9956C11.0092 13.9439 11 13.8893 11 13.834V8.82929C10.6723 8.71346 10.3707 8.54231 10.1065 8.32706C10.0787 8.30439 10.0513 8.28123 10.0243 8.2576C9.39645 7.70772 9 6.90016 9 6C9 5.83146 9.0139 5.66617 9.04061 5.50521C9.12879 4.97388 9.35659 4.48973 9.68505 4.09172L9.70317 4.06998C10.2535 3.41576 11.0782 3 12 3C13.6569 3 15 4.34315 15 6ZM12 5.75C12.4142 5.75 12.75 5.41421 12.75 5C12.75 4.58579 12.4142 4.25 12 4.25C11.5858 4.25 11.25 4.58579 11.25 5C11.25 5.41421 11.5858 5.75 12 5.75Z" />
    <path d="M1.00629 12.0873C1.08958 13.1574 1.99037 14 3.08932 14H10.0092C10.0031 13.9451 10 13.8897 10 13.834V9.46457C9.27584 9.04568 8.6948 8.40614 8.34941 7.63741C6.8915 7.32126 5.34693 7.52365 4 8.24461L2.71993 8.92977L2.53717 9.03527C1.5851 9.62642 1 10.6658 1 11.7907V11.9252L1.00629 12.0873Z" />
  </svg>
);

// 25. Linear Rocket / Scaling Icon (16x16)
export const BuyerlyRocketIcon: React.FC<IconProps> = ({ size = 16, className = '', ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    role="img"
    focusable="false"
    aria-hidden="true"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.3"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    {...props}
  >
    <path d="M9.5 2.5a6.5 6.5 0 0 1 4 4L11 9l-4-4 2.5-2.5z" />
    <path d="M7 5L3 9l-.5 3.5L6 12l4-4" />
    <path d="M2.5 13.5l1.5-1.5" />
  </svg>
);

// 26. Linear Flask / Testing Icon (16x16)
export const BuyerlyFlaskIcon: React.FC<IconProps> = ({ size = 16, className = '', ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    role="img"
    focusable="false"
    aria-hidden="true"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.3"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    {...props}
  >
    <path d="M6 2h4M7 2v3.5L3.5 12A1.5 1.5 0 0 0 4.8 14h6.4a1.5 1.5 0 0 0 1.3-2L9 5.5V2" />
    <path d="M5 10h6" />
  </svg>
);

// 27. Exact Linear Backlog Dashed Circle Icon (16x16)
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

// 28. Exact Linear Star Favorite Icon (16x16)
export const BuyerlyStarIcon: React.FC<IconProps> = ({ size = 14, className = '', ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    role="img"
    focusable="false"
    aria-hidden="true"
    fill="none"
    className={className}
    {...props}
  >
    <path
      d="M8 1.75l1.854 4.146a.5.5 0 00.416.302l4.523.411-3.41 3.013a.5.5 0 00-.154.475l1.01 4.417-3.918-2.316a.5.5 0 00-.502 0l-3.918 2.316 1.01-4.417a.5.5 0 00-.154-.475L1.757 6.609l4.523-.411a.5.5 0 00.416-.302L8 1.75z"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

// 29. Exact Linear Trash Icon (16x16)
export const BuyerlyTrashIcon: React.FC<IconProps> = ({ size = 16, className = '', ...props }) => (
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
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="m2 3 1.652 9.911A2.5 2.5 0 0 0 6.118 15h3.764a2.5 2.5 0 0 0 2.466-2.089L14 3H2Zm1.77 1.5 1.361 8.164a1 1 0 0 0 .987.836h3.764a1 1 0 0 0 .987-.836l1.36-8.164H3.771Z"
    />
    <path d="M5.5 2.5A1.5 1.5 0 0 1 7 1h2a1.5 1.5 0 0 1 1.5 1.5v1h-5v-1Z" />
    <path d="M1 3.75A.75.75 0 0 1 1.75 3h12.5a.75.75 0 0 1 0 1.5H1.75A.75.75 0 0 1 1 3.75Z" />
  </svg>
);

// 30. Exact Linear Checkmark Icon (16x16)
export const BuyerlyCheckIcon: React.FC<IconProps> = ({ size = 16, className = '', ...props }) => (
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
    <path d="M4.2996 7.23968C4.01775 6.93614 3.5432 6.91857 3.23966 7.20042C2.93613 7.48227 2.91856 7.95682 3.20041 8.26035L6.45041 11.7603C6.7612 12.095 7.29647 12.0766 7.58346 11.7212L12.8335 5.22127C13.0937 4.89904 13.0435 4.42683 12.7213 4.16657C12.399 3.9063 11.9268 3.95654 11.6665 4.27877L6.96051 10.1053L4.2996 7.23968Z" />
  </svg>
);

// 31. Exact Linear Half Status Icon (16x16)
export const BuyerlyHalfStatusIcon: React.FC<IconProps> = ({ size = 16, className = '', ...props }) => (
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
    <path d="M13.5 8C13.5 4.96243 11.0376 2.5 8 2.5C4.96243 2.5 2.5 4.96243 2.5 8C2.5 11.0376 4.96243 13.5 8 13.5C11.0376 13.5 13.5 11.0376 13.5 8ZM15 8C15 11.866 11.866 15 8 15C4.13401 15 1 11.866 1 8C1 4.13401 4.13401 1 8 1C11.866 1 15 4.13401 15 8ZM12 8C12 10.2091 10.2091 12 8 12V4C10.2091 4 12 5.79086 12 8Z" />
  </svg>
);

// 32. Exact Linear List Layout Icon (16x16)
export const BuyerlyListIcon: React.FC<IconProps> = ({ size = 16, className = '', ...props }) => (
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
    <path d="M1 1.8c0-.28 0-.42.054-.527a.5.5 0 0 1 .219-.218C1.38 1 1.52 1 1.8 1h12.4c.28 0 .42 0 .527.054a.5.5 0 0 1 .218.219C15 1.38 15 1.52 15 1.8v.4c0 .28 0 .42-.055.527a.5.5 0 0 1-.218.219C14.62 3 14.48 3 14.2 3H1.8c-.28 0-.42 0-.527-.054a.5.5 0 0 1-.218-.219C1 2.62 1 2.48 1 2.2v-.4ZM1 13.8c0-.28 0-.42.054-.527a.5.5 0 0 1 .219-.218C1.38 13 1.52 13 1.8 13h12.4c.28 0 .42 0 .527.055a.5.5 0 0 1 .218.218c.055.107.055.247.055.527v.4c0 .28 0 .42-.055.527a.5.5 0 0 1-.218.218C14.62 15 14.48 15 14.2 15H1.8c-.28 0-.42 0-.527-.055a.5.5 0 0 1-.218-.218C1 14.62 1 14.48 1 14.2v-.4ZM1 9.8c0-.28 0-.42.054-.527a.5.5 0 0 1 .219-.218C1.38 9 1.52 9 1.8 9h12.4c.28 0 .42 0 .527.055a.5.5 0 0 1 .218.218C15 9.38 15 9.52 15 9.8v.4c0 .28 0 .42-.055.527a.5.5 0 0 1-.218.218C14.62 11 14.48 11 14.2 11H1.8c-.28 0-.42 0-.527-.055a.5.5 0 0 1-.218-.218C1 10.62 1 10.48 1 10.2v-.4ZM1 5.8c0-.28 0-.42.054-.527a.5.5 0 0 1 .219-.218C1.38 5 1.52 5 1.8 5h12.4c.28 0 .42 0 .527.054a.5.5 0 0 1 .218.219C15 5.38 15 5.52 15 5.8v.4c0 .28 0 .42-.055.527a.5.5 0 0 1-.218.218C14.62 7 14.48 7 14.2 7H1.8c-.28 0-.42 0-.527-.054a.5.5 0 0 1-.218-.219C1 6.62 1 6.48 1 6.2v-.4Z" />
  </svg>
);

// 33. Exact Linear Board / Kanban Layout Icon (16x16)
export const BuyerlyBoardIcon: React.FC<IconProps> = ({ size = 16, className = '', ...props }) => (
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
    <path d="M1 2.6c0-.56 0-.84.109-1.054a1 1 0 0 1 .437-.437C1.76 1 2.04 1 2.6 1h2.8c.56 0 .84 0 1.054.109a1 1 0 0 1 .437.437C7 1.76 7 2.04 7 2.6v.8c0 .56 0 .84-.109 1.054a1 1 0 0 1-.437.437C6.24 5 5.96 5 5.4 5H2.6c-.56 0-.84 0-1.054-.109a1 1 0 0 1-.437-.437C1 4.24 1 3.96 1 3.4v-.8ZM9 2.6c0-.56 0-.84.109-1.054a1 1 0 0 1 .437-.437C9.76 1 10.04 1 10.6 1h2.8c.56 0 .84 0 1.054.109a1 1 0 0 1 .437.437C15 1.76 15 2.04 15 2.6v.8c0 .56 0 .84-.109 1.054a1 1 0 0 1-.437.437C14.24 5 13.96 5 13.4 5h-2.8c-.56 0-.84 0-1.054-.109a1 1 0 0 1-.437-.437C9 4.24 9 3.96 9 3.4v-.8ZM1 7.6c0-.56 0-.84.109-1.054a1 1 0 0 1 .437-.437C1.76 6 2.04 6 2.6 6h2.8c.56 0 .84 0 1.054.109a1 1 0 0 1 .437.437C7 6.76 7 7.04 7 7.6v.8c0 .56 0 .84-.109 1.054a1 1 0 0 1-.437.437C6.24 10 5.96 10 5.4 10H2.6c-.56 0-.84 0-1.054-.109a1 1 0 0 1-.437-.437C1 9.24 1 8.96 1 8.4v-.8ZM9 7.6c0-.56 0-.84.109-1.054a1 1 0 0 1 .437-.437C9.76 6 10.04 6 10.6 6h2.8c.56 0 .84 0 1.054.109a1 1 0 0 1 .437.437C15 6.76 15 7.04 15 7.6v.8c0 .56 0 .84-.109 1.054a1 1 0 0 1-.437.437C14.24 10 13.96 10 13.4 10h-2.8c-.56 0-.84 0-1.054-.109a1 1 0 0 1-.437-.437C9 9.24 9 8.96 9 8.4v-.8ZM1 12.6c0-.56 0-.84.109-1.054a1 1 0 0 1 .437-.437C1.76 11 2.04 11 2.6 11h2.8c.56 0 .84 0 1.054.109a1 1 0 0 1 .437.437C7 11.76 7 12.04 7 12.6v.8c0 .56 0 .84-.109 1.054a1 1 0 0 1-.437.437C6.24 15 5.96 15 5.4 15H2.6c-.56 0-.84 0-1.054-.109a1 1 0 0 1-.437-.437C1 14.24 1 13.96 1 13.4v-.8ZM9 12.6c0-.56 0-.84.109-1.054a1 1 0 0 1 .437-.437C9.76 11 10.04 11 10.6 11h2.8c.56 0 .84 0 1.054.109a1 1 0 0 1 .437.437C15 11.76 15 12.04 15 12.6v.8c0 .56 0 .84-.109 1.054a1 1 0 0 1-.437.437C14.24 15 13.96 15 13.4 15h-2.8c-.56 0-.84 0-1.054-.109a1 1 0 0 1-.437-.437C9 14.24 9 13.96 9 13.4v-.8Z" />
  </svg>
);

// Exact Linear Email Icon (16x16), Settings → Notifications → Push notifications
export const BuyerlyEmailIcon: React.FC<IconProps> = ({ size = 16, className = '', ...props }) => (
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
    <path
      fillRule="evenodd"
      d="M11 2c1.4 0 2.1 0 2.635.272a2.5 2.5 0 0 1 1.092 1.093C15 3.9 15 4.6 15 6v4c0 1.4 0 2.1-.273 2.635l-.096.173a2.5 2.5 0 0 1-.996.92l-.21.09c-.365.13-.82.168-1.498.178L11 14H5l-.927-.004c-.677-.01-1.133-.048-1.499-.179l-.209-.09a2.5 2.5 0 0 1-1.093-1.092c-.204-.401-.255-.896-.268-1.708L1 10V6c0-1.225 0-1.914.183-2.426l.09-.209a2.5 2.5 0 0 1 .92-.996l.172-.097C2.9 2 3.6 2 5 2zM9.03 7.679a1.75 1.75 0 0 1-2.06 0L2.533 4.45l-.003.03c-.029.342-.03.795-.03 1.52v4c0 .725.001 1.178.03 1.52.026.324.069.413.08.434a1 1 0 0 0 .436.437c.02.01.11.053.434.08.342.028.795.029 1.52.029h6c.725 0 1.178-.001 1.52-.03.324-.026.413-.069.434-.08a1 1 0 0 0 .437-.436c.01-.02.053-.11.08-.434.028-.342.029-.795.029-1.52V6c0-.725-.001-1.178-.03-1.52l-.003-.03zM5 3.5c-.525 0-.908 0-1.209.012l4.062 2.954a.25.25 0 0 0 .294 0l4.061-2.954C11.908 3.5 11.525 3.5 11 3.5z"
    />
  </svg>
);

// A screen, as Linear's Desktop channel in Settings → Notifications
export const BuyerlyDesktopIcon: React.FC<IconProps> = ({ size = 16, className = '', ...props }) => (
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
    <path
      fillRule="evenodd"
      d="M12 2a3 3 0 0 1 3 3v3.5a3 3 0 0 1-3 3H4a3 3 0 0 1-3-3V5a3 3 0 0 1 3-3zM4 3.5A1.5 1.5 0 0 0 2.5 5v3.5A1.5 1.5 0 0 0 4 10h8a1.5 1.5 0 0 0 1.5-1.5V5A1.5 1.5 0 0 0 12 3.5zM4.75 13h6.5a.75.75 0 0 1 0 1.5h-6.5a.75.75 0 0 1 0-1.5"
    />
  </svg>
);

// Telegram logo, one colour like Linear's Slack logo in the same row (Simple Icons, CC0)
export const TelegramIcon: React.FC<IconProps> = ({ size = 16, className = '', ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    role="img"
    focusable="false"
    aria-hidden="true"
    fill="currentColor"
    className={className}
    {...props}
  >
    <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
  </svg>
);

/** Linear's Settings → Connected accounts icon. */
export const BuyerlyConnectedIcon: React.FC<IconProps> = ({ size = 16, className = '', ...props }) => (
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
    <path d="M7 6.96a.5.5 0 0 0-.5.5v2a.5.5 0 0 0 .5.5h2a.5.5 0 0 0 .5-.5v-2a.5.5 0 0 0-.5-.5z" />
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M11 2.21a.75.75 0 0 0-1.5 0v1.25h-3V2.21a.75.75 0 1 0-1.5 0v1.3c-.98.2-1.751.971-1.95 1.95h-1.3a.75.75 0 1 0 0 1.5H3v3H1.75a.75.75 0 1 0 0 1.5h1.3A2.5 2.5 0 0 0 5 13.41v1.3a.75.75 0 1 0 1.5 0v-1.25h3v1.25a.75.75 0 1 0 1.5 0v-1.3a2.5 2.5 0 0 0 1.95-1.95h1.3a.75.75 0 1 0 0-1.5H13v-3h1.25a.75.75 0 0 0 0-1.5h-1.3A2.5 2.5 0 0 0 11 3.51zM5.5 4.96h5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-5a1 1 0 0 1-1-1v-5a1 1 0 0 1 1-1z"
    />
  </svg>
);

/** The ↗ after Linear's "Connect" and "Connected" buttons. */
export const BuyerlyArrowUpRightIcon: React.FC<IconProps> = ({ size = 16, className = '', ...props }) => (
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
    <path d="M11.75 10a.75.75 0 1 1-1.5 0V6.81l-4.72 4.72a.75.75 0 1 1-1.06-1.06l4.72-4.72H6a.75.75 0 0 1 0-1.5h5a.75.75 0 0 1 .75.75z" />
  </svg>
);

const sidebarIcon = (paths: React.ReactNode): React.FC<IconProps> => {
  const Icon: React.FC<IconProps> = ({ size = 16, className = '', ...props }) => (
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
      {paths}
    </svg>
  );
  return Icon;
};

// Linear's sidebar Members: two people (16x16).
export const BuyerlyMembersIcon = sidebarIcon(
  <>
    <path fillRule="evenodd" clipRule="evenodd" d="M10.9933 10.0137C12.0962 10.0789 12.8652 10.3673 13.4151 10.7998C13.8745 11.1612 14.1329 11.5958 14.2901 11.9014L14.4171 12.1572C14.4895 12.2985 14.5578 12.5105 14.6075 12.6748C14.6647 12.8638 14.725 13.0835 14.7794 13.2881C14.834 13.4937 14.8839 13.6898 14.92 13.834C14.938 13.9059 14.9528 13.9653 14.963 14.0068C14.9681 14.0276 14.972 14.0444 14.9747 14.0557C14.976 14.0611 14.9769 14.0654 14.9776 14.0684C14.978 14.0698 14.9784 14.0714 14.9786 14.0723C15.0761 14.4747 14.8292 14.8809 14.4269 14.9785C14.0243 15.0759 13.619 14.8283 13.5216 14.4258C13.5215 14.4252 13.5209 14.424 13.5206 14.4229C13.52 14.4203 13.5189 14.4162 13.5177 14.4111C13.5151 14.4007 13.5108 14.3851 13.506 14.3652C13.4962 14.3255 13.4824 14.268 13.4649 14.1982C13.4299 14.0584 13.3814 13.8694 13.3292 13.6729C13.2767 13.4754 13.221 13.2747 13.171 13.1094C13.1168 12.9304 13.0863 12.851 13.0831 12.8428L12.9532 12.5869C12.8299 12.3483 12.7123 12.1564 12.4874 11.9795C12.2386 11.7838 11.7871 11.5637 10.9054 11.5117L10.5001 11.5C9.35452 11.5 8.80921 11.7545 8.52451 11.9785C8.2188 12.2193 8.11174 12.4807 7.90342 12.8594L7.90439 12.8604C7.908 12.8543 7.87818 12.9233 7.82139 13.1104C7.77177 13.2738 7.71736 13.4731 7.66611 13.6699C7.61516 13.8656 7.56804 14.0541 7.53428 14.1934C7.51748 14.2626 7.50456 14.3199 7.49521 14.3594C7.49061 14.3788 7.48688 14.394 7.48447 14.4043C7.4833 14.4093 7.48214 14.4135 7.48154 14.416C7.48125 14.4172 7.4807 14.4184 7.48057 14.4189C7.38673 14.8224 6.98361 15.0743 6.58018 14.9805C6.17691 14.8866 5.92589 14.4834 6.01963 14.0801C6.01981 14.0793 6.02026 14.0766 6.02061 14.0752C6.02129 14.0723 6.02227 14.0679 6.02353 14.0625C6.02618 14.0512 6.03033 14.0344 6.03525 14.0137C6.04513 13.9719 6.05972 13.9122 6.07725 13.8398C6.11228 13.6953 6.16022 13.4984 6.21396 13.292C6.26738 13.0869 6.32781 12.8659 6.38584 12.6748C6.43545 12.5114 6.50614 12.2896 6.58896 12.1387C6.72536 11.8909 6.99052 11.2777 7.5958 10.8008C8.22303 10.3069 9.1325 10 10.5001 10L10.9933 10.0137Z" />
    <path fillRule="evenodd" clipRule="evenodd" d="M5.71592 6.0127C5.86516 6.02118 6.00774 6.03415 6.14365 6.05078C6.55479 6.10113 6.84732 6.47558 6.79697 6.88672C6.74639 7.29744 6.37281 7.58914 5.96201 7.53906C5.75847 7.51415 5.52088 7.50001 5.24619 7.5C4.09451 7.50011 3.64308 7.75722 3.43955 7.94336C3.32997 8.04366 3.24909 8.16093 3.17197 8.30859C3.13166 8.3858 3.09633 8.46418 3.05283 8.55859C3.01292 8.64521 2.96118 8.75425 2.90342 8.85938L2.90439 8.86035C2.908 8.85434 2.87818 8.92333 2.82139 9.11035C2.77177 9.27378 2.71736 9.47313 2.66611 9.66992C2.61516 9.86558 2.56804 10.0541 2.53428 10.1934C2.51748 10.2626 2.50456 10.3199 2.49521 10.3594C2.49061 10.3788 2.48688 10.394 2.48447 10.4043C2.4833 10.4093 2.48214 10.4135 2.48154 10.416C2.48125 10.4172 2.4807 10.4184 2.48057 10.4189C2.38673 10.8224 1.98361 11.0743 1.58018 10.9805C1.17691 10.8866 0.925892 10.4834 1.01963 10.0801C1.01981 10.0793 1.02026 10.0766 1.02061 10.0752C1.02129 10.0723 1.02227 10.0679 1.02353 10.0625C1.02618 10.0512 1.03033 10.0344 1.03525 10.0137C1.04514 9.97195 1.05972 9.91217 1.07725 9.83984C1.11228 9.69532 1.16022 9.49838 1.21396 9.29199C1.26738 9.08686 1.32781 8.86594 1.38584 8.6748C1.43545 8.5114 1.50614 8.28958 1.58896 8.13867C1.61712 8.08751 1.64705 8.02502 1.69053 7.93066C1.73061 7.84367 1.78222 7.73041 1.84287 7.61426C1.96769 7.37529 2.14427 7.09444 2.42686 6.83594C3.00841 6.30406 3.88547 6.00003 5.24717 6L5.71592 6.0127Z" />
    <path fillRule="evenodd" clipRule="evenodd" d="M10.5001 5C11.6047 5 12.5001 5.89543 12.5001 7C12.5001 8.10457 11.6047 9 10.5001 9C9.39558 8.99994 8.5001 8.10453 8.5001 7C8.5001 5.89547 9.39558 5.00006 10.5001 5Z" />
    <path fillRule="evenodd" clipRule="evenodd" d="M5.5001 1C6.60467 1 7.5001 1.89543 7.5001 3C7.5001 4.10457 6.60467 5 5.5001 5C4.39558 4.99994 3.5001 4.10453 3.5001 3C3.5001 1.89547 4.39558 1.00006 5.5001 1Z" />
  </>,
);

// Linear's sidebar Teams: a person in a rounded frame (16x16).
export const BuyerlyTeamsIcon = sidebarIcon(
  <>
    <path fillRule="evenodd" clipRule="evenodd" d="M12.5 13.5V15H3.5V13.5H12.5ZM13.5 12.5V3.5C13.5 2.94771 13.0523 2.5 12.5 2.5H3.5C2.94771 2.5 2.5 2.94772 2.5 3.5V12.5C2.5 13.0523 2.94772 13.5 3.5 13.5V15L3.24414 14.9873C2.06772 14.8677 1.13227 13.9323 1.0127 12.7559L1 12.5V3.5C1 2.20566 1.98361 1.14082 3.24414 1.0127L3.5 1H12.5L12.7559 1.0127C14.0164 1.14082 15 2.20566 15 3.5V12.5L14.9873 12.7559C14.8677 13.9323 13.9323 14.8677 12.7559 14.9873L12.5 15V13.5C13.0523 13.5 13.5 13.0523 13.5 12.5Z" />
    <path fillRule="evenodd" clipRule="evenodd" d="M10 6C10 7.10457 9.10457 8 8 8C6.89543 8 6 7.10457 6 6C6 4.89543 6.89543 4 8 4C9.10457 4 10 4.89543 10 6Z" />
    <path fillRule="evenodd" clipRule="evenodd" d="M11.405 12H4.59566C4.18761 12 3.88127 11.6641 4.0449 11.307C4.40693 10.5169 5.38905 9.33333 8.02449 9.33333C10.673 9.33333 11.6222 10.5286 11.9603 11.3187C12.1123 11.6738 11.8066 12 11.405 12Z" />
  </>,
);

// Linear's team Home: a house (16x16).
export const BuyerlyHomeIcon = sidebarIcon(
  <path fillRule="evenodd" clipRule="evenodd" d="M6.56055 1.52061C7.39447 0.826788 8.60553 0.826788 9.43945 1.52061L14.3027 5.56651C14.7446 5.93422 15 6.47993 15 7.05479V7.57042C14.9998 8.27774 14.6006 8.90369 14 9.2169V12.7491C13.9997 13.9916 12.9925 14.9991 11.75 14.9991H4.25C3.00752 14.9991 2.00026 13.9916 2 12.7491V9.2169C1.39944 8.90369 1.00017 8.27774 1 7.57042V7.05479C1 6.47993 1.25539 5.93422 1.69727 5.56651L6.56055 1.52061ZM8.47949 2.67393C8.20152 2.44266 7.79848 2.44266 7.52051 2.67393L2.65723 6.71983C2.55789 6.80255 2.5 6.92551 2.5 7.05479V7.57042C2.50021 7.74408 2.62489 7.89249 2.7959 7.92296C3.20319 7.99553 3.49983 8.3501 3.5 8.76378V12.7491C3.50026 13.1631 3.83594 13.4991 4.25 13.4991H5V10.2491C5 9.00649 6.00736 7.99913 7.25 7.99913H8.75C9.99264 7.99913 11 9.00649 11 10.2491V13.4991H11.75C12.1641 13.4991 12.4997 13.1631 12.5 12.7491V8.76378C12.5002 8.3501 12.7968 7.99553 13.2041 7.92296C13.3751 7.89249 13.4998 7.74408 13.5 7.57042V7.05479C13.5 6.92551 13.4421 6.80255 13.3428 6.71983L8.47949 2.67393ZM7.25 9.49913C6.83579 9.49913 6.5 9.83491 6.5 10.2491V13.4991H9.5V10.2491C9.5 9.83491 9.16421 9.49913 8.75 9.49913H7.25Z" />,
);

// Linear's disclosure triangle beside sidebar sections, pointing right; turned down when open (16x16).
export const BuyerlyDisclosureIcon = sidebarIcon(
  <path d="M6.75194 10.6239C6.41861 10.8183 6 10.5779 6 10.192V5.80802C6 5.42212 6.41861 5.18169 6.75194 5.37613L10.5096 7.56811C10.8404 7.76105 10.8404 8.23895 10.5096 8.43189L6.75194 10.6239Z" />,
);

// A document: a page with lines (16x16).
export const BuyerlyDocumentIcon = sidebarIcon(
  <path fillRule="evenodd" clipRule="evenodd" d="M4.75 1A2.75 2.75 0 0 0 2 3.75v8.5A2.75 2.75 0 0 0 4.75 15h6.5A2.75 2.75 0 0 0 14 12.25v-8.5A2.75 2.75 0 0 0 11.25 1h-6.5ZM3.5 3.75c0-.69.56-1.25 1.25-1.25h6.5c.69 0 1.25.56 1.25 1.25v8.5c0 .69-.56 1.25-1.25 1.25h-6.5c-.69 0-1.25-.56-1.25-1.25v-8.5ZM5.75 5a.75.75 0 0 0 0 1.5h4.5a.75.75 0 0 0 0-1.5h-4.5ZM5 8.25a.75.75 0 0 1 .75-.75h4.5a.75.75 0 0 1 0 1.5h-4.5A.75.75 0 0 1 5 8.25ZM5.75 10a.75.75 0 0 0 0 1.5h2.5a.75.75 0 0 0 0-1.5h-2.5Z" />,
);

// A chain link: Copy URL (16x16).
export const BuyerlyLinkIcon = sidebarIcon(
  <path fillRule="evenodd" clipRule="evenodd" d="M9.53 2.47a3.25 3.25 0 0 1 4.6 4.6l-1.5 1.5a.75.75 0 1 1-1.06-1.06l1.5-1.5a1.75 1.75 0 0 0-2.48-2.48l-2.5 2.5a1.75 1.75 0 0 0 0 2.48 .75.75 0 1 1-1.06 1.06 3.25 3.25 0 0 1 0-4.6l2.5-2.5ZM7.97 6.97a.75.75 0 0 1 1.06 0 3.25 3.25 0 0 1 0 4.6l-2.5 2.5a3.25 3.25 0 0 1-4.6-4.6l1.5-1.5a.75.75 0 0 1 1.06 1.06l-1.5 1.5a1.75 1.75 0 0 0 2.48 2.48l2.5-2.5a1.75 1.75 0 0 0 0-2.48 .75.75 0 0 1 0-1.06Z" />,
);

// A padlock: a private team (16x16).
export const BuyerlyLockIcon = sidebarIcon(
  <path fillRule="evenodd" clipRule="evenodd" d="M8 1.5A3.25 3.25 0 0 0 4.75 4.75V6.5h-.5A1.75 1.75 0 0 0 2.5 8.25v4.5c0 .966.784 1.75 1.75 1.75h7.5a1.75 1.75 0 0 0 1.75-1.75v-4.5A1.75 1.75 0 0 0 11.75 6.5h-.5V4.75A3.25 3.25 0 0 0 8 1.5Zm1.75 5V4.75a1.75 1.75 0 1 0-3.5 0V6.5h3.5ZM4.25 8a.25.25 0 0 0-.25.25v4.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-4.5a.25.25 0 0 0-.25-.25h-7.5Z" />,
);

// Linear's team Issues: two stacked cards, our Campaigns (16x16).
export const BuyerlyIssuesIcon = sidebarIcon(
  <>
    <path fillRule="evenodd" clipRule="evenodd" d="M13.25 5.25C14.2165 5.25 15 6.0335 15 7V11.75C15 13.5449 13.5449 15 11.75 15H6.75C5.7835 15 5 14.2165 5 13.25C5 12.8358 5.33579 12.5 5.75 12.5C6.16421 12.5 6.5 12.8358 6.5 13.25C6.5 13.3881 6.61193 13.5 6.75 13.5H11.75C12.7165 13.5 13.5 12.7165 13.5 11.75V7C13.5 6.86193 13.3881 6.75 13.25 6.75C12.8358 6.75 12.5 6.41421 12.5 6C12.5 5.58579 12.8358 5.25 13.25 5.25Z" />
    <path fillRule="evenodd" clipRule="evenodd" d="M8.1543 1.00391C9.73945 1.08421 11 2.39489 11 4V8L10.9961 8.1543C10.9184 9.68834 9.68834 10.9184 8.1543 10.9961L8 11H4L3.8457 10.9961C2.31166 10.9184 1.08163 9.68834 1.00391 8.1543L1 8V4C1 2.39489 2.26055 1.08421 3.8457 1.00391L4 1H8L8.1543 1.00391ZM4 2.5C3.17157 2.5 2.5 3.17157 2.5 4V8C2.5 8.82843 3.17157 9.5 4 9.5H8C8.82843 9.5 9.5 8.82843 9.5 8V4C9.5 3.17157 8.82843 2.5 8 2.5H4Z" />
  </>,
);

// Linear's Projects: a cube, our Ad accounts (16x16).
export const BuyerlyProjectIcon = sidebarIcon(
  <path fillRule="evenodd" clipRule="evenodd" d="M7.331 1.07a3.2 3.2 0 0 1 1.338 0c.498.106.967.377 1.904.917l1.354.78c.937.541 1.406.812 1.747 1.19.301.334.53.728.669 1.156.157.484.157 1.025.157 2.107v1.56l-.003.718c-.007.63-.036 1.026-.154 1.389l-.057.158a3.2 3.2 0 0 1-.612.998l-.135.138c-.33.312-.792.578-1.612 1.051l-1.354.78-.623.357c-.55.309-.907.481-1.281.56l-.166.032a3.2 3.2 0 0 1-1.006 0l-.166-.031c-.374-.08-.73-.252-1.281-.561l-.623-.356-1.354-.78c-.82-.474-1.281-.74-1.612-1.052l-.135-.138a3.2 3.2 0 0 1-.612-.998l-.057-.158c-.118-.363-.147-.758-.154-1.39L1.5 8.78V7.22c0-.946 0-1.479.105-1.921l.052-.186c.122-.374.312-.723.56-1.028l.11-.128c.255-.284.583-.507 1.126-.83l.62-.36 1.354-.78c.82-.473 1.281-.739 1.718-.869zM3 7.22v1.56c0 1.183.018 1.439.084 1.643l.064.167q.11.246.292.449l.059.06c.151.143.427.318 1.323.835l1.354.78.632.36c.188.104.33.178.442.233V8.482l-4.247-1.93zm5.75 1.262v4.826c.212-.106.533-.282 1.074-.594l1.354-.78.628-.368c.499-.297.646-.407.754-.527l.113-.14q.158-.218.243-.476l.022-.081c.035-.144.051-.351.058-.835L13 8.78V7.22l-.004-.668zM7.82 2.51l-.177.027c-.159.034-.328.106-.835.39l-.632.359-1.354.78c-.896.517-1.172.692-1.323.834l-.059.06q-.046.051-.086.104l4.645 2.112 4.645-2.112-.084-.103c-.109-.12-.255-.23-.754-.528l-.628-.367-1.354-.78c-.897-.517-1.186-.668-1.386-.728l-.08-.021a1.7 1.7 0 0 0-.538-.027" />,
);

const linearIcon = (paths: React.ReactNode): React.FC<IconProps> => {
  const Icon: React.FC<IconProps> = ({ size = 16, className = '', ...props }) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      role="img"
      focusable="false"
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
      fill="currentColor"
      className={className}
      {...props}
    >
      {paths}
    </svg>
  );
  return Icon;
};

// Linear's QuestionMark, on the Help button at the sidebar's foot (2026-10-24).
export const BuyerlyQuestionMarkIcon = linearIcon(
  <path d="M7.569 9.75c-.332 0-.614-.27-.578-.6.021-.188.061-.372.136-.62q.158-.51.447-.82a3.4 3.4 0 0 1 .703-.577q.284-.182.507-.396.229-.219.358-.486a1.4 1.4 0 0 0 .13-.606 1.2 1.2 0 0 0-.171-.653 1.2 1.2 0 0 0-.466-.429 1.36 1.36 0 0 0-.647-.152q-.33 0-.628.148a1.23 1.23 0 0 0-.587.622c-.123.295-.367.555-.686.555h-.472c-.337 0-.616-.28-.55-.611q.103-.513.363-.905a2.55 2.55 0 0 1 1.08-.915A3.6 3.6 0 0 1 7.998 3q.888 0 1.563.32.68.319 1.057.91.382.586.382 1.392 0 .543-.172.972a2.4 2.4 0 0 1-.48.763 3.5 3.5 0 0 1-.74.595 3.2 3.2 0 0 0-.62.496 1.7 1.7 0 0 0-.353.605l-.034.106c-.1.316-.35.591-.682.591zM8.75 12a1 1 0 1 1-2 0 1 1 0 0 1 2 0" />,
);

// Linear's ChatLine, the Help menu's "Contact us".
export const BuyerlyChatIcon = linearIcon(
  <>
    <path fillRule="evenodd" clipRule="evenodd" d="M4.8 9.25a.75.75 0 0 1 .75-.75h2.895a.75.75 0 1 1 0 1.5H5.551a.75.75 0 0 1-.75-.75m.004-3a.75.75 0 0 1 .75-.75h4.894a.75.75 0 0 1 0 1.5H5.555a.75.75 0 0 1-.75-.75" />
    <path fillRule="evenodd" clipRule="evenodd" d="M11.869 11.52c.946-.767 1.631-1.956 1.631-3.77s-.685-3.003-1.631-3.77C10.879 3.178 9.486 2.75 8 2.75c-1.694 0-3.065.44-3.985 1.213-.88.74-1.515 1.918-1.515 3.787 0 1.104.255 1.96.641 2.622.541.81.224 1.65.119 1.906-.073.177-.16.344-.219.455l-.03.057a7 7 0 0 0-.136.268c.242.18.563.217 1.1.078a7 7 0 0 0 .893-.32l.027-.01c.124-.052.29-.12.438-.17.08-.027.21-.067.36-.092.09-.014.365-.057.695.03A7.3 7.3 0 0 0 8 12.75c1.486 0 2.88-.428 3.869-1.23m-5.852 2.507A8.8 8.8 0 0 0 8 14.25c3.501 0 7-2.005 7-6.5s-3.499-6.5-7-6.5c-3.866 0-7 2.005-7 6.5 0 1.372.326 2.512.878 3.434.168.222.003.535-.19.901-.3.565-.665 1.257.02 1.942 1.215 1.215 2.864.534 3.739.173.289-.119.493-.203.57-.173" />
  </>,
);

// Linear's settings gear, the Help menu's "Settings".
export const BuyerlyGearIcon = linearIcon(
  <>
    <path fillRule="evenodd" clipRule="evenodd" d="M8.00021 5.25C9.51887 5.25015 10.7502 6.48131 10.7502 8C10.7502 9.51869 9.51887 10.7499 8.00021 10.75C6.48142 10.75 5.25021 9.51878 5.25021 8C5.25021 6.48122 6.48142 5.25 8.00021 5.25ZM8.00021 6.75C7.30985 6.75 6.75021 7.30964 6.75021 8C6.75021 8.69036 7.30985 9.25 8.00021 9.25C8.69044 9.24985 9.25021 8.69027 9.25021 8C9.25021 7.30973 8.69044 6.75015 8.00021 6.75Z" />
    <path fillRule="evenodd" clipRule="evenodd" d="M8.4797 1C8.79032 1.00005 9.11521 1.07609 9.39571 1.28516C9.67641 1.49469 9.84241 1.78493 9.93087 2.08301L10.0764 2.57422C10.1033 2.66485 10.1451 2.71838 10.2268 2.76562L11.4192 3.4541C11.5007 3.50111 11.5678 3.51013 11.6594 3.48828L12.1584 3.36914C12.4605 3.2968 12.7939 3.29566 13.1154 3.43359C13.4372 3.57185 13.666 3.81486 13.8215 4.08398L14.302 4.91602C14.4573 5.18528 14.554 5.50472 14.5129 5.85254C14.4717 6.20036 14.303 6.48828 14.0891 6.71387L13.7365 7.08594C13.6717 7.15443 13.6467 7.21713 13.6467 7.31152V8.68848C13.6467 8.78287 13.6717 8.84557 13.7365 8.91406L14.0891 9.28613C14.303 9.51172 14.4717 9.79964 14.5129 10.1475C14.554 10.4953 14.4573 10.8147 14.302 11.084L13.8215 11.916C13.666 12.1851 13.4372 12.4281 13.1154 12.5664C12.7939 12.7043 12.4605 12.7032 12.1584 12.6309L11.6594 12.5117C11.5678 12.4899 11.5007 12.4989 11.4192 12.5459L10.2268 13.2344C10.1451 13.2816 10.1033 13.3352 10.0764 13.4258L9.93087 13.917C9.84241 14.2151 9.67641 14.5053 9.39571 14.7148C9.11521 14.9239 8.79032 15 8.4797 15H7.51974C7.20899 14.9999 6.8833 14.9242 6.60275 14.7148C6.32229 14.5053 6.15699 14.2149 6.06857 13.917L5.92306 13.4258C5.89612 13.3351 5.85359 13.2817 5.77169 13.2344L4.58028 12.5459C4.51915 12.5107 4.46564 12.4967 4.4045 12.501L4.33907 12.5117L3.84103 12.6309C3.53875 12.7032 3.20473 12.7047 2.88302 12.5664C2.56142 12.428 2.33239 12.1852 2.17696 11.916L1.69747 11.084C1.54209 10.8147 1.44542 10.4953 1.48653 10.1475C1.52769 9.79988 1.69567 9.51165 1.90939 9.28613L2.26192 8.91406C2.327 8.84544 2.35271 8.783 2.35275 8.68848V7.31152C2.35271 7.217 2.327 7.15455 2.26192 7.08594L1.90939 6.71387C1.69567 6.48835 1.52769 6.20012 1.48653 5.85254C1.44542 5.50474 1.54209 5.18527 1.69747 4.91602L2.17696 4.08398C2.33239 3.81484 2.56142 3.57196 2.88302 3.43359C3.20473 3.29533 3.53875 3.29676 3.84103 3.36914L4.33907 3.48828L4.4045 3.49902C4.46564 3.50331 4.51915 3.48931 4.58028 3.4541L5.77169 2.76562C5.85359 2.71834 5.89612 2.66492 5.92306 2.57422L6.06857 2.08301C6.15699 1.78507 6.32229 1.49467 6.60275 1.28516C6.8833 1.07582 7.20899 1.0001 7.51974 1H8.4797ZM7.50607 2.50977L7.36056 3.00098C7.2244 3.45982 6.93621 3.82513 6.52169 4.06445L5.33028 4.75293C4.9675 4.96225 4.56891 5.03929 4.16329 4.98047L3.98946 4.94727L3.49142 4.82812C3.48792 4.82734 3.48373 4.82682 3.48067 4.82617C3.47921 4.82856 3.47735 4.83128 3.47579 4.83398L2.9963 5.66602C2.99471 5.66872 2.99276 5.67137 2.99142 5.67383C2.9935 5.67614 2.99584 5.67906 2.99825 5.68164L3.35079 6.05371C3.68013 6.401 3.8527 6.83292 3.85275 7.31152V8.68848C3.8527 9.16708 3.68013 9.599 3.35079 9.94629L2.99825 10.3184C2.99599 10.3207 2.99337 10.323 2.99142 10.3252C2.99288 10.3279 2.99458 10.331 2.9963 10.334L3.47579 11.166C3.4772 11.1685 3.47931 11.1707 3.48067 11.1729C3.48367 11.1722 3.48798 11.1726 3.49142 11.1719L3.98946 11.0527L4.16329 11.0195C4.56891 10.9607 4.96751 11.0378 5.33028 11.2471L6.52169 11.9355C6.93621 12.1749 7.2244 12.5402 7.36056 12.999L7.50607 13.4902L7.509 13.499C7.51207 13.4991 7.51622 13.4999 7.51974 13.5H8.4797C8.48257 13.5 8.48588 13.4992 8.48849 13.499C8.48939 13.4962 8.49141 13.4934 8.49239 13.4902L8.6379 12.999L8.6965 12.8311C8.84844 12.4508 9.11439 12.1449 9.47677 11.9355L10.6692 11.2471C11.0834 11.008 11.5439 10.9414 12.009 11.0527L12.508 11.1719C12.5108 11.1725 12.5142 11.1724 12.5168 11.1729C12.5182 11.1705 12.5211 11.1686 12.5227 11.166L13.0022 10.334C13.0038 10.3311 13.0047 10.3278 13.0061 10.3252C13.0043 10.3232 13.0022 10.3205 13.0002 10.3184L12.6477 9.94629C12.3186 9.59908 12.1467 9.16687 12.1467 8.68848V7.31152C12.1467 6.83313 12.3186 6.40092 12.6477 6.05371L13.0002 5.68164C13.0024 5.67931 13.0042 5.67603 13.0061 5.67383C13.0048 5.67147 13.0036 5.66858 13.0022 5.66602L12.5227 4.83398C12.521 4.83114 12.5183 4.82869 12.5168 4.82617C12.5142 4.82674 12.5109 4.82744 12.508 4.82812L12.009 4.94727C11.5439 5.05858 11.0834 4.99203 10.6692 4.75293L9.47677 4.06445C9.11439 3.8551 8.84844 3.54923 8.6965 3.16895L8.6379 3.00098L8.49239 2.50977C8.49133 2.50626 8.48948 2.50306 8.48849 2.5H7.509L7.50607 2.50977Z" />
  </>,
);

// Linear's keyboard, the Help menu's "Keyboard shortcuts" (2026-10-24).
export const BuyerlyKeyboardIcon = linearIcon(
  <path fillRule="evenodd" clipRule="evenodd" d="M2 4C1.44772 4 1 4.44772 1 5V11C1 11.5523 1.44772 12 2 12H14C14.5523 12 15 11.5523 15 11V5C15 4.44772 14.5523 4 14 4H2ZM2 5.5C2 5.22386 2.22386 5 2.5 5H3C3.27614 5 3.5 5.22386 3.5 5.5V6C3.5 6.27614 3.27614 6.5 3 6.5H2.5C2.22386 6.5 2 6.27614 2 6V5.5ZM2 10C2 9.72386 2.22386 9.5 2.5 9.5H3C3.27614 9.5 3.5 9.72386 3.5 10V10.5C3.5 10.7761 3.27614 11 3 11H2.5C2.22386 11 2 10.7761 2 10.5V10ZM5 10C5 9.72386 5.22386 9.5 5.5 9.5H10.5C10.7761 9.5 11 9.72386 11 10V10.5C11 10.7761 10.7761 11 10.5 11H5.5C5.22386 11 5 10.7761 5 10.5V10ZM13 9.5C12.7239 9.5 12.5 9.72386 12.5 10V10.5C12.5 10.7761 12.7239 11 13 11H13.5C13.7761 11 14 10.7761 14 10.5V10C14 9.72386 13.7761 9.5 13.5 9.5H13ZM5 5C4.72386 5 4.5 5.22386 4.5 5.5V6C4.5 6.27614 4.72386 6.5 5 6.5H5.5C5.77614 6.5 6 6.27614 6 6V5.5C6 5.22386 5.77614 5 5.5 5H5ZM7.25 5.5C7.25 5.22386 7.47386 5 7.75 5H8.25C8.52614 5 8.75 5.22386 8.75 5.5V6C8.75 6.27614 8.52614 6.5 8.25 6.5H7.75C7.47386 6.5 7.25 6.27614 7.25 6V5.5ZM10.5 5C10.2239 5 10 5.22386 10 5.5V6C10 6.27614 10.2239 6.5 10.5 6.5H11C11.2761 6.5 11.5 6.27614 11.5 6V5.5C11.5 5.22386 11.2761 5 11 5H10.5ZM12.5 5.5C12.5 5.22386 12.7239 5 13 5H13.5C13.7761 5 14 5.22386 14 5.5V6C14 6.27614 13.7761 6.5 13.5 6.5H13C12.7239 6.5 12.5 6.27614 12.5 6V5.5ZM2.5 7.25C2.22386 7.25 2 7.47386 2 7.75V8.25C2 8.52614 2.22386 8.75 2.5 8.75H3C3.27614 8.75 3.5 8.52614 3.5 8.25V7.75C3.5 7.47386 3.27614 7.25 3 7.25H2.5ZM4.5 7.75C4.5 7.47386 4.72386 7.25 5 7.25H5.5C5.77614 7.25 6 7.47386 6 7.75V8.25C6 8.52614 5.77614 8.75 5.5 8.75H5C4.72386 8.75 4.5 8.52614 4.5 8.25V7.75ZM7.75 7.25C7.47386 7.25 7.25 7.47386 7.25 7.75V8.25C7.25 8.52614 7.47386 8.75 7.75 8.75H8.25C8.52614 8.75 8.75 8.52614 8.75 8.25V7.75C8.75 7.47386 8.52614 7.25 8.25 7.25H7.75ZM10 7.75C10 7.47386 10.2239 7.25 10.5 7.25H11C11.2761 7.25 11.5 7.47386 11.5 7.75V8.25C11.5 8.52614 11.2761 8.75 11 8.75H10.5C10.2239 8.75 10 8.52614 10 8.25V7.75ZM13 7.25C12.7239 7.25 12.5 7.47386 12.5 7.75V8.25C12.5 8.52614 12.7239 8.75 13 8.75H13.5C13.7761 8.75 14 8.52614 14 8.25V7.75C14 7.47386 13.7761 7.25 13.5 7.25H13Z" />,
);

// Linear's clipboard, the row menu's "Copy" (2026-10-24).
export const BuyerlyClipboardIcon = linearIcon(
  <>
    <path fillRule="evenodd" clipRule="evenodd" d="M6.08 2.5v1.167h3.834V2.5H6.08Zm-1.5-.083C4.58 1.634 5.216 1 5.998 1h4c.783 0 1.417.634 1.417 1.417V3.75c0 .782-.634 1.417-1.417 1.417h-4A1.417 1.417 0 0 1 4.581 3.75V2.417Z" />
    <path fillRule="evenodd" clipRule="evenodd" d="M4.087 3.749a.583.583 0 0 0-.583.583l.001 8.583a.583.583 0 0 0 .584.584h7.82a.583.583 0 0 0 .583-.584V4.332a.583.583 0 0 0-.584-.583H11a.75.75 0 0 1 0-1.5h.909a2.083 2.083 0 0 1 2.083 2.083v8.583A2.083 2.083 0 0 1 11.908 15h-7.82a2.083 2.083 0 0 1-2.083-2.084l-.001-8.583A2.084 2.084 0 0 1 4.087 2.25H5a.75.75 0 1 1 0 1.5h-.913Z" />
  </>,
);

// Linear's "Copy ID".
export const BuyerlyCopyIdIcon = linearIcon(
  <>
    <path d="M10.957 1.8643C11.4444 2.31542 11.0188 3 10.3547 3c-.2436 0-.47136-.10549-.67781-.23466C9.40812 2.59719 9.09041 2.5 8.75 2.5h-4.5c-.47683 0-.90911.1907-1.22475.5H3v.02525c-.3093.31564-.5.74792-.5 1.22475v4.5c0 .34041.09719.65812.26534.92689C2.8945 9.88334 3 10.1111 3 10.3547c0 .6641-.68458 1.0897-1.1357.6023C1.32786 10.3775 1 9.60202 1 8.75v-4.5C1 2.45507 2.45507 1 4.25 1h4.5c.85202 0 1.6275.32786 2.207.8643ZM11.8284 8.34533c.3757.7514.406 1.62906.0829 2.40447l-.0815.1957c-.2018.4842-.6749.7996-1.1994.7996h-.1255V7.75506h.3685c.4044 0 .7742.22851.955.59027Z" />
    <path fillRule="evenodd" clipRule="evenodd" d="M11.7499 14.9999c1.795 0 3.25-1.455 3.25-3.25V7.24994c0-1.79492-1.455-3.25-3.25-3.25H7.24994c-1.79492 0-3.25 1.45508-3.25 3.25v4.49996c0 1.795 1.45508 3.25 3.25 3.25h4.49996ZM7.24995 6.24506c.41697 0 .755.33802.755.755v5.50004c0 .4169-.33803.755-.755.755-.41698 0-.755-.3381-.755-.755V7.00006c0-.41698.33802-.755.755-.755Zm6.05515 5.08554c.4919-1.1805.4459-2.51666-.1261-3.66056-.4366-.87332-1.3292-1.42498-2.3056-1.42498H9.74992c-.41697 0-.755.33802-.755.755v5.50004c0 .4169.33803.755.755.755h.88048c1.1341 0 2.157-.682 2.5932-1.7289l.0815-.1956Z" />
  </>,
);

// Linear's "Copy URL".
export const BuyerlyCopyUrlIcon = linearIcon(
  <path d="M9.30558 10.206C9.57224 10.4726 9.59447 10.8912 9.37225 11.1831L9.30558 11.2594L6.84751 13.7175C5.58692 14.9781 3.54311 14.9781 2.28252 13.7175C1.0654 12.5004 1.02344 10.5531 2.15661 9.28564L2.28252 9.15251L4.74059 6.69443C5.0315 6.40353 5.50315 6.40353 5.79405 6.69443C6.06071 6.9611 6.08294 7.37963 5.86072 7.67161L5.79405 7.74789L3.33598 10.206C2.6572 10.8847 2.6572 11.9853 3.33598 12.664C3.98082 13.3089 5.00628 13.3411 5.68918 12.7608L5.79405 12.664L8.25212 10.206C8.54303 9.91506 9.01468 9.91506 9.30558 10.206ZM9.82982 6.17019C10.1207 6.46109 10.1207 6.93274 9.82982 7.22365L7.34921 9.70427C7.0583 9.99518 6.58665 9.99518 6.29575 9.70427C6.00484 9.41337 6.00484 8.94172 6.29575 8.65081L8.77637 6.17019C9.06727 5.87928 9.53892 5.87928 9.82982 6.17019ZM13.7175 2.2825C14.9346 3.49962 14.9766 5.44688 13.8434 6.71436L13.7175 6.84749L11.2594 9.30557C10.9685 9.59647 10.4969 9.59647 10.206 9.30557C9.93931 9.03891 9.91709 8.62037 10.1393 8.32839L10.206 8.25211L12.664 5.79403C13.3428 5.11525 13.3428 4.01474 12.664 3.33596C12.0192 2.69112 10.9938 2.65888 10.3109 3.23923L10.206 3.33596L7.74791 5.79403C7.457 6.08494 6.98535 6.08494 6.69445 5.79403C6.42779 5.52737 6.40556 5.10883 6.62778 4.81686L6.69445 4.74057L9.15252 2.2825C10.4131 1.02191 12.4569 1.02191 13.7175 2.2825Z" />,
);

// Linear's "Copy title".
export const BuyerlyCopyTitleIcon = linearIcon(
  <path fillRule="evenodd" clipRule="evenodd" d="M13.6 2.391a.7.7 0 0 0-.7-.7H3.1a.7.7 0 0 0-.7.7v2.8a.7.7 0 0 0 .7.7h.153a.7.7 0 0 0 .68-.53l.461-1.845a.56.56 0 0 1 .543-.425H6.95v9.8a1.4 1.4 0 0 1-1.4 1.4h-.583c-.645 0-1.167.523-1.167 1.167 0 .129.104.233.233.233h7.934a.233.233 0 0 0 .233-.233c0-.644-.522-1.167-1.167-1.167h-.583a1.4 1.4 0 0 1-1.4-1.4v-9.8h2.013a.56.56 0 0 1 .543.425l.462 1.845a.7.7 0 0 0 .679.53h.153a.7.7 0 0 0 .7-.7v-2.8Z" />,
);

// Linear's favorite star, outlined until starred (2026-10-24).
export const BuyerlyStarOutlineIcon = linearIcon(
  <path d="M10.5193 4.98997L9.46118 2.01693C9.34483 1.70806 9.1452 1.45362 8.88451 1.27433C8.62466 1.09562 8.31641 1 8.00081 1C7.68521 1 7.37696 1.09562 7.11712 1.27433C6.85642 1.45362 6.65679 1.70806 6.54528 2.00374L5.48248 4.98997L2.55536 4.98997C2.23765 4.98973 1.92683 5.08675 1.66556 5.26809C1.40342 5.45004 1.20379 5.70812 1.09414 6.00737C0.984248 6.30728 0.970192 6.63372 1.05394 6.94194C1.13753 7.2496 1.31442 7.52386 1.56019 7.7275L4.08545 9.80411L3.02371 12.9604C2.91854 13.2733 2.91647 13.6112 3.01776 13.9252C3.11884 14.2385 3.3175 14.5113 3.58464 14.7044C3.85102 14.8969 4.17178 15.0003 4.50071 14.9996C4.82872 14.9993 5.14907 14.8951 5.41483 14.702L8.00053 12.8223L10.5851 14.7014C10.8496 14.8944 11.17 14.9991 11.4991 15C11.8281 15.0009 12.1491 14.8978 12.4157 14.7054C12.6831 14.5124 12.882 14.2394 12.9833 13.926C13.0848 13.6113 13.0827 13.2731 12.9773 12.9602L11.9156 9.80207L14.444 7.72408C14.695 7.51166 14.8686 7.23684 14.9493 6.92968C15.0168 6.67352 15.0167 6.40505 14.9504 6.15011L14.9022 5.99753C14.791 5.70157 14.5918 5.44667 14.3314 5.26673C14.0718 5.08736 13.7637 4.9909 13.4479 4.98998L10.5193 4.98997ZM13.4986 6.54821C13.4962 6.55733 13.491 6.56562 13.4832 6.57224L10.7049 8.85551C10.546 8.98629 10.4307 9.16168 10.3739 9.35896C10.3168 9.55714 10.3214 9.76807 10.3875 9.96371L11.5556 13.4385C11.5586 13.4474 11.5587 13.4565 11.5559 13.4652C11.553 13.4741 11.5467 13.4827 11.5378 13.4891C11.5281 13.4961 11.5159 13.5 11.503 13.5C11.4902 13.5 11.4779 13.496 11.4683 13.4889L8.60012 11.4036C8.42554 11.2769 8.21577 11.2088 8.00055 11.2088C7.78531 11.2088 7.5755 11.2769 7.40134 11.4034L4.53289 13.4886C4.52321 13.4957 4.511 13.4996 4.49835 13.4996C4.48523 13.4997 4.47312 13.4958 4.46329 13.4887C4.45442 13.4822 4.44826 13.4738 4.4453 13.4646C4.44255 13.4561 4.4426 13.4471 4.44547 13.4386L5.61393 9.96499C5.67961 9.76981 5.68428 9.5592 5.62728 9.3612C5.57043 9.16375 5.45499 8.98835 5.29643 8.85789L2.51507 6.57069C2.50925 6.56586 2.50387 6.55753 2.50146 6.54865C2.49919 6.54032 2.49957 6.53163 2.50257 6.52343C2.50583 6.51453 2.5121 6.50643 2.52085 6.50035C2.53046 6.49368 2.54238 6.48996 2.55479 6.48997H5.8221C6.03248 6.4897 6.23685 6.42501 6.40824 6.30453C6.58053 6.18341 6.71109 6.01179 6.78158 5.81318L7.9609 2.49821C7.95727 2.50944 7.95646 2.51419 7.9574 2.5155C7.97668 2.50367 7.98851 2.5 8.00081 2.5C8.01311 2.5 8.02494 2.50367 8.03451 2.51025C8.04324 2.51625 8.04952 2.52427 8.05284 2.53307L9.22029 5.81379C9.29053 6.01192 9.42137 6.18383 9.59407 6.30503C9.76589 6.4256 9.97082 6.49011 10.1806 6.48997H13.4457C13.4563 6.49001 13.4686 6.49385 13.4786 6.50077L13.4902 6.5114L13.4977 6.52418C13.5004 6.53198 13.5007 6.54022 13.4986 6.54821Z" />,
);

// Linear's bell on a page's header: what of it reaches the Inbox.
export const BuyerlyBellIcon = linearIcon(
  <path fillRule="evenodd" clipRule="evenodd" d="M8 1C10.347 1.00026 12.25 2.90296 12.25 5.25V5.92969C12.25 6.76016 12.5519 7.56241 13.0986 8.1875L13.499 8.64551C13.822 9.01469 14.001 9.48899 14.001 9.97949V11.6162C14.0009 12.2422 13.4922 12.7497 12.8662 12.75H10.7021C10.4668 14.0298 9.34788 15 8 15C6.65212 15 5.53316 14.0298 5.29785 12.75H3.13477C2.50865 12.7499 2.00014 12.2423 2 11.6162V9.97949C2 9.48895 2.17898 9.01472 2.50195 8.64551L2.90234 8.18848C3.44909 7.56333 3.75098 6.7602 3.75098 5.92969V5.25C3.75098 2.90295 5.65302 1.00026 8 1ZM6.85547 12.75C7.04848 13.1912 7.48763 13.5 8 13.5C8.51237 13.5 8.95152 13.1912 9.14453 12.75H6.85547ZM8 2.5C6.48144 2.50026 5.25098 3.73138 5.25098 5.25V5.92969C5.25098 7.12346 4.81717 8.27722 4.03125 9.17578L3.63086 9.63281C3.54706 9.72861 3.50098 9.85222 3.50098 9.97949V11.25H12.501V9.97949C12.501 9.85232 12.4538 9.72856 12.3701 9.63281L11.9697 9.17578C11.1836 8.27722 10.75 7.12362 10.75 5.92969V5.25C10.75 3.73138 9.51855 2.50026 8 2.5Z" />,
);

// Linear's favorite star, filled once starred.
export const BuyerlyStarFilledIcon = linearIcon(
  <path d="M14.9441 6.05256C14.8798 5.88159 14.7646 5.73411 14.6136 5.6298C14.4626 5.52549 14.2832 5.46931 14.0992 5.46877H10.4417C10.3795 5.46881 10.3187 5.44969 10.2679 5.41405C10.2171 5.37841 10.1787 5.32801 10.1581 5.2698L8.84514 1.58061C8.78083 1.4101 8.66552 1.26313 8.51465 1.15936C8.36377 1.0556 8.18453 1 8.00091 1C7.81728 1 7.63804 1.0556 7.48717 1.15936C7.33629 1.26313 7.22098 1.4101 7.15667 1.58061L7.15367 1.59014L5.84375 5.2698C5.82313 5.32791 5.78483 5.37825 5.73415 5.41388C5.68346 5.44951 5.62288 5.46869 5.56075 5.46877H1.902C1.71682 5.46863 1.53608 5.52504 1.38439 5.63033C1.23269 5.73562 1.11739 5.88468 1.05416 6.05724C0.990937 6.22979 0.982856 6.41746 1.03102 6.59473C1.07919 6.772 1.18126 6.93025 1.32335 7.04798L4.4383 9.6095C4.4849 9.64784 4.51872 9.69923 4.53534 9.75695C4.55196 9.81467 4.5506 9.87603 4.53143 9.93297L3.22272 13.8235C3.16224 14.0034 3.16105 14.1977 3.21932 14.3783C3.27758 14.5589 3.39229 14.7164 3.54684 14.8281C3.70139 14.9398 3.88777 15 4.07903 14.9996C4.27029 14.9994 4.45652 14.9388 4.61076 14.8267L7.82305 12.4915C7.87456 12.4541 7.93675 12.4339 8.00061 12.4339C8.06446 12.4339 8.12665 12.4541 8.17817 12.4915L11.3893 14.8261C11.5434 14.9386 11.7297 14.9995 11.9212 15C12.1126 15.0005 12.2992 14.9406 12.454 14.8289C12.6087 14.7172 12.7236 14.5595 12.782 14.3788C12.8403 14.198 12.8391 14.0035 12.7785 13.8235L11.4698 9.93059C11.4506 9.87364 11.4493 9.81229 11.4659 9.75457C11.4825 9.69685 11.5163 9.64545 11.5629 9.60712L14.6839 7.04202C14.8242 6.9233 14.9243 6.76477 14.9708 6.58783C15.0174 6.41089 15.0081 6.22406 14.9441 6.05256Z" />,
);
