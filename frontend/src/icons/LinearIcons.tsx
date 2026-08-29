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

// 6. Exact Linear Close (✕) Icon (16x16)
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

// 14. Exact Linear Sidebar Panel Toggle Icon (16x16)
export const LinearSidebarToggleIcon: React.FC<IconProps> = ({ size = 16, className = '', ...props }) => (
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
      d="M2 3.5C2 2.67157 2.67157 2 3.5 2H12.5C13.3284 2 14 2.67157 14 3.5V12.5C14 13.3284 13.3284 14 12.5 14H3.5C2.67157 14 2 13.3284 2 12.5V3.5ZM10.5 3.5H3.5V12.5H10.5V3.5ZM12 3.5H12.5V12.5H12V3.5Z"
    />
  </svg>
);

