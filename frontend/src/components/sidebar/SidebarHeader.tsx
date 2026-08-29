import React from 'react';
import { useAppStore } from '@/store/useAppStore';
import { Tooltip } from '@/ui/Tooltip';
import { BuyerlyLogoAvatar } from '@/icons/LinearIcons';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/ui/DropdownMenu';

export const SidebarHeader: React.FC = () => {
  const { workspaceName, setSearchOpen } = useAppStore();

  return (
    <div
      className="w-full select-none min-w-0"
      style={{
        paddingLeft: '12px',
        paddingRight: '12px',
        WebkitAppRegion: 'drag',
      } as React.CSSProperties}
    >
      {/* Linear Header Row: Height 44px, marginTop 8px */}
      <div
        className="flex items-center w-full min-w-0"
        style={{ height: '44px', marginTop: '8px' }}
      >
        {/* Exact Workspace Button (Fluid, shrinkable with ellipsis) */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded="false"
              aria-label={`${workspaceName} Workspace Menu`}
              className="linear-workspace-btn min-w-0 max-w-[calc(100%-40px)]"
            >
              {/* 20x20 Buyerly Logo Avatar (Gold Anubis) */}
              <BuyerlyLogoAvatar size={20} shape="rounded" />

              {/* Workspace Name (truncates when space narrows) */}
              <span
                style={{
                  fontSize: '13px',
                  fontWeight: 550,
                  lineHeight: '23px',
                  letterSpacing: '-0.1px',
                  color: 'lch(90.155% 1.2 272 / 1)',
                }}
                className="truncate min-w-0"
              >
                {workspaceName}
              </span>

              {/* Exact Linear 13x9 Chevron (8x8px) */}
              <svg
                width="8"
                height="8"
                viewBox="0 0 13 9"
                role="img"
                focusable="false"
                aria-hidden="true"
                xmlns="http://www.w3.org/2000/svg"
                className="chevron shrink-0"
              >
                <path
                  d="M10.1611 0.314094L5.99463 4.48054L1.82819 0.314094C1.4094 -0.104698 0.732886 -0.104698 0.314094 0.314094C-0.104698 0.732886 -0.104698 1.4094 0.314094 1.82819L5.24295 6.75705C5.66175 7.17584 6.33825 7.17584 6.75705 6.75705L11.6859 1.82819C12.1047 1.4094 12.1047 0.732886 11.6859 0.314094C11.2671 -0.0939598 10.5799 -0.104698 10.1611 0.314094Z"
                  transform="translate(0.77832 0.998535)"
                />
              </svg>
            </button>
          </DropdownMenuTrigger>

          {/* Exact Linear Workspace Menu Popover */}
          <DropdownMenuContent align="start" sideOffset={4}>
            <div className="h-[6px] w-full" />

            {/* 1. Settings */}
            <DropdownMenuItem>
              <span className="truncate">Settings</span>
              <div className="flex shrink-0 items-center gap-[3px]">
                <kbd className="font-sans text-[12px] font-[500] leading-[13.2px] text-[#9d9d9e] bg-transparent border-none p-0 m-0">
                  G
                </kbd>
                <span className="text-[12px] font-[450] text-[#9d9d9e] mx-[1px]">
                  then
                </span>
                <kbd className="font-sans text-[12px] font-[500] leading-[13.2px] text-[#9d9d9e] bg-transparent border-none p-0 m-0">
                  S
                </kbd>
              </div>
            </DropdownMenuItem>

            {/* 2. Invite and manage members */}
            <DropdownMenuItem>
              <span className="truncate">Invite and manage members</span>
            </DropdownMenuItem>

            <DropdownMenuSeparator />

            {/* 3. Switch workspace */}
            <DropdownMenuItem>
              <span className="truncate">Switch workspace</span>
              <div className="flex shrink-0 items-center gap-[6px]">
                <div className="flex items-center gap-[3px]">
                  <kbd className="font-sans text-[12px] font-[500] leading-[13.2px] text-[#9d9d9e] bg-transparent border-none p-0 m-0">
                    O
                  </kbd>
                  <span className="text-[12px] font-[450] text-[#9d9d9e] mx-[1px]">
                    then
                  </span>
                  <kbd className="font-sans text-[12px] font-[500] leading-[13.2px] text-[#9d9d9e] bg-transparent border-none p-0 m-0">
                    W
                  </kbd>
                </div>
                <span className="text-[7px] text-[#636364] flex items-center justify-end w-[12px]">
                  ▶
                </span>
              </div>
            </DropdownMenuItem>

            {/* 4. Log out */}
            <DropdownMenuItem>
              <span className="truncate">Log out</span>
              <div className="flex shrink-0 items-center gap-[3px]">
                <kbd className="font-sans text-[12px] font-[500] leading-[13.2px] text-[#9d9d9e] bg-transparent border-none p-0 m-0">
                  Alt
                </kbd>
                <kbd className="font-sans text-[12px] font-[500] leading-[13.2px] text-[#9d9d9e] bg-transparent border-none p-0 m-0">
                  ⇧
                </kbd>
                <kbd className="font-sans text-[12px] font-[500] leading-[13.2px] text-[#9d9d9e] bg-transparent border-none p-0 m-0">
                  Q
                </kbd>
              </div>
            </DropdownMenuItem>

            <div className="h-[6px] w-full" />
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Linear Middle Flex Spacer */}
        <div className="flex-1 min-w-[4px]" />

        {/* Right Action: Fixed Search Button pinned to right */}
        <div className="flex items-center shrink-0">
          <Tooltip content="Search workspace" shortcut="/">
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              aria-label="Search workspace"
              className="linear-icon-btn"
            >
              <span className="flex h-[14px] w-[14px] items-center justify-center">
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 16 16"
                  role="img"
                  focusable="false"
                  aria-hidden="true"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    fillRule="evenodd"
                    clipRule="evenodd"
                    d="M7 2C9.76142 2 12 4.23858 12 7C12 8.11012 11.6375 9.13519 11.0254 9.96484L13.7803 12.7197L13.832 12.7764C14.0723 13.0709 14.0549 13.5057 13.7803 13.7803C13.5057 14.0549 13.0709 14.0723 12.7764 13.832L12.7197 13.7803L9.96484 11.0254C9.13519 11.6375 8.11012 12 7 12C4.23858 12 2 9.76142 2 7C2 4.23858 4.23858 2 7 2ZM7 3.5C5.067 3.5 3.5 5.067 3.5 7C3.5 8.933 5.067 10.5 7 10.5C8.933 10.5 10.5 8.933 10.5 7C10.5 5.067 8.933 3.5 7 3.5Z"
                  />
                </svg>
              </span>
            </button>
          </Tooltip>
        </div>
      </div>
    </div>
  );
};
