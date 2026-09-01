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

// 3b. Exact Linear Views / Layers / Stack Icon (16x16)
export const LinearLayersIcon: React.FC<IconProps> = ({ size = 16, className = '', ...props }) => (
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
export const LinearMetaIcon: React.FC<IconProps> = ({ size = 16, className = '', ...props }) => (
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
      backgroundColor: 'var(--item-hover-bg)',
      border: '1px solid var(--color-border-secondary)',
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

// 14b. Exact Linear Left Sidebar Panel Toggle Icon (16x16)
export const LinearSidebarLeftToggleIcon: React.FC<IconProps & { isOpen?: boolean }> = ({
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
        x={4.5}
        y={5}
        width={isOpen ? 4.5 : 1.5}
        height={6}
        rx={0.75}
        style={{
          transitionProperty: 'width',
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

// 20. Exact Linear Rising Bar Chart / Statistics Icon (16x16)
export const LinearBarChartIcon: React.FC<IconProps> = ({ size = 16, className = '', ...props }) => (
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
export const LinearDashboardIcon: React.FC<IconProps> = ({ size = 16, className = '', ...props }) => (
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
export const LinearTrendingUpIcon: React.FC<IconProps> = ({ size = 16, className = '', ...props }) => (
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
export const LinearSparklesIcon: React.FC<IconProps> = ({ size = 16, className = '', ...props }) => (
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
export const LinearPieChartIcon: React.FC<IconProps> = ({ size = 16, className = '', ...props }) => (
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
export const LinearDonutChartIcon: React.FC<IconProps> = ({ size = 16, className = '', ...props }) => (
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
export const LinearInboxCheckmarkIcon: React.FC<IconProps> = ({ size = 16, className = '', ...props }) => (
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
export const LinearInboxUnreadIcon: React.FC<IconProps> = ({ size = 16, className = '', ...props }) => (
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
export const LinearPlusIcon: React.FC<IconProps> = ({ size = 16, className = '', ...props }) => (
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

// 24. Linear Shield / Stop-Loss Protection Icon (16x16)
export const LinearShieldIcon: React.FC<IconProps> = ({ size = 16, className = '', ...props }) => (
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

// 25. Linear Rocket / Scaling Icon (16x16)
export const LinearRocketIcon: React.FC<IconProps> = ({ size = 16, className = '', ...props }) => (
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
export const LinearFlaskIcon: React.FC<IconProps> = ({ size = 16, className = '', ...props }) => (
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
export const LinearBacklogDashedIcon: React.FC<IconProps> = ({ size = 14, className = '', ...props }) => (
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
export const LinearStarIcon: React.FC<IconProps> = ({ size = 14, className = '', ...props }) => (
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
export const LinearTrashIcon: React.FC<IconProps> = ({ size = 16, className = '', ...props }) => (
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
export const LinearCheckIcon: React.FC<IconProps> = ({ size = 16, className = '', ...props }) => (
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
export const LinearHalfStatusIcon: React.FC<IconProps> = ({ size = 16, className = '', ...props }) => (
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
export const LinearListIcon: React.FC<IconProps> = ({ size = 16, className = '', ...props }) => (
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
export const LinearBoardIcon: React.FC<IconProps> = ({ size = 16, className = '', ...props }) => (
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
