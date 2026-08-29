import React from 'react';

interface IconProps extends React.SVGProps<SVGSVGElement> {
  size?: number;
}

// 1. Exact Linear Search Icon (16x16)
export const LinearSearchIcon: React.FC<IconProps> = ({ size = 16, className = '', ...props }) => (
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
export const LinearInboxIcon: React.FC<IconProps> = ({ size = 16, className = '', ...props }) => (
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
export const LinearMyIssuesIcon: React.FC<IconProps> = ({ size = 16, className = '', ...props }) => (
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

// 4. Exact Linear Solid Lightning Bolt / Rules Icon (16x16)
export const LinearBoltIcon: React.FC<IconProps> = ({ size = 16, className = '', ...props }) => (
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
export const LinearCommandIcon: React.FC<IconProps> = ({ size = 16, className = '', ...props }) => (
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
export const LinearCloseIcon: React.FC<IconProps> = ({ size = 16, className = '', ...props }) => (
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

// 7. Exact Linear Notification Actions (3 dots, 16x16)
export const LinearDotsIcon: React.FC<IconProps> = ({ size = 16, className = '', ...props }) => (
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
export const LinearFilterIcon: React.FC<IconProps> = ({ size = 16, className = '', ...props }) => (
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
export const LinearSlidersIcon: React.FC<IconProps> = ({ size = 16, className = '', ...props }) => (
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
export const LinearPriorityBarsIcon: React.FC<{ level?: 'urgent' | 'high' | 'medium' | 'low'; size?: number; className?: string }> = ({
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
export const LinearStatusCircleIcon: React.FC<{ status: 'active' | 'scaling' | 'paused'; size?: number; className?: string }> = ({
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

// 12. Linear Logo Avatar (32x32)
export const LinearLogoAvatar: React.FC<{ size?: number; className?: string }> = ({
  size = 32,
  className = '',
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 256 256"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    <rect width="256" height="256" rx="128" fill="#5e6ad2" />
    <path
      d="M178.679 187.153C179.558 188.032 180.969 188.086 181.887 187.247C182.788 186.425 183.674 185.578 184.545 184.707C215.818 153.433 215.818 102.729 184.545 71.4552C153.271 40.1816 102.567 40.1816 71.293 71.4552C70.4219 72.3263 69.5751 73.2124 68.7526 74.1128C67.914 75.0307 67.9678 76.4421 68.8469 77.3212L178.679 187.153Z"
      fill="#ffffff"
    />
    <path
      d="M168.167 197.336C169.48 196.572 169.678 194.777 168.604 193.702L62.2977 87.396C61.2232 86.3215 59.4282 86.5202 58.6638 87.8335C57.3596 90.0743 56.1732 92.3648 55.1047 94.6962C54.6989 95.5814 54.8997 96.6222 55.5883 97.3107L158.689 200.412C159.378 201.1 160.419 201.301 161.304 200.895C163.635 199.827 165.926 198.64 168.167 197.336Z"
      fill="#ffffff"
    />
    <path
      d="M143.33 206.674C145.139 206.321 145.76 204.106 144.456 202.803L53.1974 111.544C51.8938 110.24 49.6793 110.861 49.3262 112.67C48.7301 115.725 48.3131 118.808 48.0751 121.902C48.0228 122.581 48.2761 123.247 48.7578 123.729L132.271 207.242C132.753 207.724 133.419 207.977 134.098 207.925C137.192 207.687 140.275 207.27 143.33 206.674Z"
      fill="#ffffff"
    />
    <path
      d="M108.515 205.788C110.741 206.342 112.116 203.711 110.495 202.09L53.9103 145.505C52.289 143.884 49.6582 145.259 50.2116 147.485C53.6036 161.124 60.6307 174.045 71.293 184.707C81.9552 195.369 94.8761 202.396 108.515 205.788Z"
      fill="#ffffff"
    />
  </svg>
);

// 12b. Official Buyerly Logo Avatar (Gold Anubis)
export const BuyerlyLogoAvatar: React.FC<{
  size?: number;
  className?: string;
  shape?: 'circle' | 'rounded';
}> = ({ size = 32, className = '', shape = 'circle' }) => (
  <div
    style={{
      width: `${size}px`,
      height: `${size}px`,
      borderRadius: shape === 'circle' ? '50%' : '8px',
      backgroundColor: '#18191c',
      border: '1px solid rgba(255, 255, 255, 0.08)',
    }}
    className={`relative flex shrink-0 items-center justify-center overflow-hidden select-none ${className}`}
  >
    <img
      src="/buyerly-logo.png"
      alt="Buyerly"
      style={{
        width: `${size * 0.75}px`,
        height: `${size * 0.75}px`,
        objectFit: 'contain',
      }}
      draggable={false}
    />
  </div>
);

// 13. Exact Linear Empty State Inbox Illustration (97.5 x 100px)
export const LinearEmptyInboxIllustration: React.FC<{ className?: string }> = ({
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
      stroke="lch(61.803% 1.2 272 / 1)"
      strokeWidth="1.5"
      d="M10.4 9.11A10 10 0 0 1 20.22 1h37.56a10 10 0 0 1 9.82 8.11l8.11 42.2a10 10 0 0 1-9.82 11.9H54.7a6.36 6.36 0 0 0-5.65 3.45 6.36 6.36 0 0 1-5.66 3.45H34.6a6.36 6.36 0 0 1-5.66-3.45 6.36 6.36 0 0 0-5.65-3.46H12.1a10 10 0 0 1-9.8-11.89l8.11-42.2Z"
    />
    <path
      stroke="lch(61.803% 1.2 272 / 1)"
      strokeWidth="1.5"
      d="m2.36 55.6 3.2 14.06A12 12 0 0 0 17.26 79h43.48a12 12 0 0 0 11.7-9.34l3.2-14.06"
    />
  </svg>
);

// 14. Exact Linear Sidebar Panel Toggle Icon (16x16) with Morph Animation
export const LinearSidebarToggleIcon: React.FC<IconProps & { isOpen?: boolean }> = ({
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

// 15. Exact Linear Projects / Cube Symbol Icon (16x16)
export const LinearProjectCubeIcon: React.FC<IconProps> = ({ size = 16, className = '', ...props }) => (
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
      d="M7.331 1.07a3.2 3.2 0 0 1 1.338 0c.498.106.967.377 1.904.917l1.354.78c.937.541 1.406.812 1.747 1.19.301.334.53.728.669 1.156.157.484.157 1.025.157 2.107v1.56l-.003.718c-.007.63-.036 1.026-.154 1.389l-.057.158a3.2 3.2 0 0 1-.612.998l-.135.138c-.33.312-.792.578-1.612 1.051l-1.354.78-.623.357c-.55.309-.907.481-1.281.56l-.166.032a3.2 3.2 0 0 1-1.006 0l-.166-.031c-.374-.08-.73-.252-1.281-.561l-.623-.356-1.354-.78c-.82-.474-1.281-.74-1.612-1.052l-.135-.138a3.2 3.2 0 0 1-.612-.998l-.057-.158c-.118-.363-.147-.758-.154-1.39L1.5 8.78V7.22c0-.946 0-1.479.105-1.921l.052-.186c.122-.374.312-.723.56-1.028l.11-.128c.255-.284.583-.507 1.126-.83l.62-.36 1.354-.78c.82-.473 1.281-.739 1.718-.869zM3 7.22v1.56c0 1.183.018 1.439.084 1.643l.064.167q.11.246.292.449l.059.06c.151.143.427.318 1.323.835l1.354.78.632.36c.188.104.33.178.442.233V8.482l-4.247-1.93zm5.75 1.262v4.826c.212-.106.533-.282 1.074-.594l1.354-.78.628-.368c.499-.297.646-.407.754-.527l.113-.14q.158-.218.243-.476l.022-.081c.035-.144.051-.351.058-.835L13 8.78V7.22l-.004-.668zM7.82 2.51l-.177.027c-.159.034-.328.106-.835.39l-.632.359-1.354.78c-.896.517-1.172.692-1.323.834l-.059.06q-.046.051-.086.104l4.645 2.112 4.645-2.112-.084-.103c-.109-.12-.255-.23-.754-.528l-.628-.367-1.354-.78c-.897-.517-1.186-.668-1.386-.728l-.08-.021a1.7 1.7 0 0 0-.538-.027"
    />
  </svg>
);

// 16. Linear Analytics / Chart Icon (16x16)
export const LinearChartIcon: React.FC<IconProps> = ({ size = 16, className = '', ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.3"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    {...props}
  >
    <line x1="13" y1="13" x2="3" y2="13" />
    <line x1="3" y1="13" x2="3" y2="3" />
    <path d="M5.5 10.5L8.5 7.5L10.5 9.5L13.5 5.5" />
  </svg>
);

// 17. Linear Keyboard Icon (16x16)
export const LinearKeyboardIcon: React.FC<IconProps> = ({ size = 16, className = '', ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.3"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    {...props}
  >
    <rect x="2" y="4" width="12" height="8" rx="1.5" />
    <line x1="4.5" y1="6.5" x2="5.5" y2="6.5" />
    <line x1="7.5" y1="6.5" x2="8.5" y2="6.5" />
    <line x1="10.5" y1="6.5" x2="11.5" y2="6.5" />
    <line x1="5" y1="9.5" x2="11" y2="9.5" />
  </svg>
);

// 18. Exact Linear Clock / Snooze Icon (16x16)
export const LinearClockOutlineIcon: React.FC<IconProps> = ({ size = 16, className = '', ...props }) => (
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
export const LinearInboxDeleteIcon: React.FC<IconProps> = ({ size = 16, className = '', ...props }) => (
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


