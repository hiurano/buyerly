import React from 'react';
import { CircleHelp } from 'lucide-react';
import { Tooltip } from '@/ui/Tooltip';

const LinearAgentIcon: React.FC = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" fill="currentColor">
    <path d="M4.07132 3.8283C4.04394 3.81721 4.01406 3.81379 3.98488 3.8184C3.95566 3.82301 3.92826 3.83551 3.90561 3.85453C3.88297 3.87356 3.86594 3.8984 3.85636 3.92639C3.84678 3.95437 3.84501 3.98443 3.85124 4.01335L5.80802 13.1405C5.81898 13.1915 5.83884 13.2155 5.85542 13.2298C5.87605 13.2476 5.9078 13.2631 5.94754 13.268C5.98728 13.2729 6.0217 13.2654 6.04578 13.2532C6.06507 13.2434 6.08993 13.2252 6.11273 13.1784L7.83779 9.64746C8.05513 9.20258 8.45077 8.87059 8.92663 8.73378L12.7035 7.64791C12.7535 7.63353 12.776 7.61215 12.789 7.59475C12.8052 7.57307 12.8186 7.54044 12.8207 7.50049C12.8228 7.46054 12.813 7.42669 12.7992 7.40342C12.788 7.38476 12.7681 7.36116 12.7199 7.34158L4.07132 3.8283ZM3.75083 2.33677C4.04945 2.2896 4.35527 2.32474 4.63541 2.43841L13.2843 5.95183C14.747 6.54596 14.6351 8.65343 13.1179 9.08953L9.34109 10.1754C9.27311 10.1949 9.21659 10.2424 9.18554 10.3059L7.46077 13.8363C6.76755 15.2562 4.67275 14.9979 4.34147 13.4555L2.38492 4.3294C2.32134 4.03401 2.33935 3.72642 2.43722 3.44054C2.53514 3.15452 2.70919 2.90061 2.94065 2.70612C3.17211 2.51164 3.45221 2.38394 3.75083 2.33677Z" />
  </svg>
);

const LinearHistoryIcon: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="currentColor">
    <path d="M2.64849 9.64645L4.44209 7.85355C4.7572 7.53857 4.53403 7 4.0884 7H3.04846C3.41252 4.45578 5.60144 2.5 8.24734 2.5C11.148 2.5 13.4994 4.85051 13.4994 7.75C13.4994 10.6495 11.148 13 8.24734 13C6.96107 13 5.78452 12.5388 4.87129 11.7718C4.55402 11.5054 4.08074 11.5465 3.8142 11.8637C3.54766 12.1808 3.58878 12.6539 3.90606 12.9203C5.07954 13.9058 6.595 14.5 8.24734 14.5C11.9767 14.5 15 11.4779 15 7.75C15 4.02208 11.9767 1 8.24734 1C4.77156 1 1.90912 3.62504 1.53589 7H0.5012C0.0555715 7 -0.167599 7.53857 0.147507 7.85355L1.94111 9.64645C2.13645 9.84171 2.45315 9.84171 2.64849 9.64645Z" />
    <path d="M8.37472 5.67742C8.37472 5.30329 8.0676 5 7.68874 5C7.30988 5 7.00276 5.30329 7.00276 5.67742V8.3871C7.00276 8.76122 7.30988 9.06452 7.68874 9.06452H10.4327C10.8115 9.06452 11.1187 8.76122 11.1187 8.3871C11.1187 8.01297 10.8115 7.70968 10.4327 7.70968H8.37472V5.67742Z" />
  </svg>
);

export const SidebarUtilityFooter: React.FC = () => (
  <div className="mt-auto flex h-[36px] shrink-0 items-start gap-2 px-[10px] pt-[2px]">
    <Tooltip content="Help">
      <button
        type="button"
        aria-label="Open Help menu"
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-transparent text-[var(--text-secondary)] hover:bg-[var(--item-hover-bg)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--focus-ring-color)]"
      >
        <CircleHelp size={16} strokeWidth={1.5} aria-hidden="true" />
      </button>
    </Tooltip>
  </div>
);

export const AppUtilityBar: React.FC = () => (
  <div className="pointer-events-none fixed bottom-1 right-[10px] z-[94] flex h-7 items-center gap-[2px]">
    <Tooltip content="Agent">
      <button
        type="button"
        aria-label="Agent"
        className="pointer-events-auto flex h-7 w-[78px] items-center gap-[6px] rounded-[8px] border border-transparent px-[10px] text-[12px] font-[500] text-[var(--text-tertiary)] hover:bg-[var(--item-hover-bg)] hover:text-[var(--text-primary)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--focus-ring-color)]"
      >
        <LinearAgentIcon />
        <span>Agent</span>
      </button>
    </Tooltip>

    <Tooltip content="Chat history">
      <button
        type="button"
        aria-label="Chat history"
        className="pointer-events-auto flex h-7 w-7 items-center justify-center rounded-[8px] border border-transparent text-[var(--text-secondary)] hover:bg-[var(--item-hover-bg)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--focus-ring-color)]"
      >
        <LinearHistoryIcon />
      </button>
    </Tooltip>
  </div>
);
