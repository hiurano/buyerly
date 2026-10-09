import React, { useEffect } from 'react';
import { logOut } from '@/lib/sessions';
import { accountBlocks } from '@/lib/accounts';
import { useAppStore } from '@/store/useAppStore';
import { Tooltip } from '@/ui/Tooltip';
import { BuyerlyLogoAvatar, LinearCheckIcon } from '@/icons/LinearIcons';
import { WorkspaceAvatar } from '@/ui/WorkspaceAvatar';
import { openSearchPage } from '@/components/search/openSearchPage';
import { useWorkspaceSession } from '@/lib/workspaceSession';
import { GO_TO_KEYS } from '@/lib/shortcuts';
import { canAdministerWorkspace } from '@/lib/settingsPages';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuLabel,
} from '@/ui/DropdownMenu';

export const SidebarHeader: React.FC = () => {
  const { workspaceName, setActiveTab, setSettingsSection } = useAppStore();
  const { user, workspace, accounts, switchWorkspace, openCreateWorkspace, openAddAccount } = useWorkspaceSession();
  const blocks = accountBlocks(accounts, user);
  const isOpenAccount = (accountId?: number) => accountId === undefined || user.id == null || accountId === user.id;

  // Linear: Alt+Shift+Q logs out from anywhere in the app.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.altKey && event.shiftKey && !event.ctrlKey && !event.metaKey && event.code === 'KeyQ') {
        event.preventDefault();
        void logOut();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div
      className="w-full select-none min-w-0"
      style={{
        paddingTop: '16px',
        paddingLeft: '12px',
        paddingRight: '12px',
        marginBottom: '16px',
        WebkitAppRegion: 'drag',
      } as React.CSSProperties}
    >
      {/* Linear Header Row: Height 28px */}
      <div
        className="flex items-center w-full min-w-0"
        style={{ height: '28px' }}
      >
        {/* Exact Workspace Button (Fluid, shrinkable with ellipsis) */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded="false"
              aria-label={`${workspaceName} Workspace Menu`}
              className="linear-workspace-btn min-w-0 max-w-[calc(100%-36px)]"
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
                  color: 'var(--text-primary)',
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
          <DropdownMenuContent align="start" sideOffset={4} style={{ width: 228 }}>
            <div className="h-[6px] w-full" />

            {/* 1. Settings */}
            <DropdownMenuItem
              onSelect={() => {
                setSettingsSection('preferences');
                setActiveTab('preferences');
              }}
            >
              <span className="truncate">Settings</span>
              <div className="flex shrink-0 items-center gap-[3px]">
                <kbd className="font-sans text-[12px] font-[500] leading-[13.2px] text-[#9d9d9e] bg-transparent border-none p-0 m-0">
                  G
                </kbd>
                <span className="text-[12px] font-[450] text-[#9d9d9e] mx-[1px]">
                  then
                </span>
                <kbd className="font-sans text-[12px] font-[500] leading-[13.2px] text-[#9d9d9e] bg-transparent border-none p-0 m-0">
                  {GO_TO_KEYS.preferences}
                </kbd>
              </div>
            </DropdownMenuItem>

            {/* 2. Invite and manage members: Members is an Administration page, for an owner or admin */}
            {canAdministerWorkspace(workspace) && (
              <DropdownMenuItem
                onSelect={() => {
                  setSettingsSection('members');
                  setActiveTab('preferences');
                }}
              >
                <span className="truncate">Invite and manage members</span>
              </DropdownMenuItem>
            )}

            <DropdownMenuSeparator />

            {/* 3. Switch workspace: this account's workspaces, numbered, then Account actions (Linear) */}
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <span className="whitespace-nowrap">Switch workspace</span>
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
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent
                sideOffset={0}
                alignOffset={-36}
                style={{ width: 'auto', minWidth: 209, maxWidth: 320 }}
                onKeyDown={(event) => {
                  // Linear: a workspace's number opens it straight from the menu, across all accounts.
                  if (event.ctrlKey || event.altKey || event.metaKey || !/^[1-9]$/.test(event.key)) return;
                  for (const block of blocks) {
                    const target = block.workspaces.find((item) => item.number === Number(event.key));
                    if (!target) continue;
                    event.preventDefault();
                    switchWorkspace(target.workspace.slug, block.accountId);
                    return;
                  }
                }}
              >
                {/* Linear: one block per logged-in account, headed by its email. */}
                {blocks.map((block) => (
                  <React.Fragment key={block.accountId ?? 'account'}>
                    <DropdownMenuLabel
                      className="truncate"
                      style={{ height: 30, padding: '4px 12px 0 14px', fontSize: 13, fontWeight: 450, lineHeight: '26px' }}
                    >
                      {block.label}
                    </DropdownMenuLabel>
                    {block.workspaces.map(({ workspace: item, number }) => (
                      <DropdownMenuItem
                        key={`${block.accountId ?? 'account'}:${item.id}`}
                        onSelect={() => switchWorkspace(item.slug, block.accountId)}
                      >
                        <span className="flex min-w-0 items-center gap-[8px]">
                          <WorkspaceAvatar workspace={item} />
                          <span className="truncate">{item.name}</span>
                        </span>
                        <span className="flex shrink-0 items-center gap-[6px]">
                          {item.id === workspace.id && isOpenAccount(block.accountId) && (
                            <span className="text-[var(--text-primary)]" aria-label="Current workspace">
                              <LinearCheckIcon size={16} />
                            </span>
                          )}
                          {number <= 9 && (
                            <kbd className="font-sans text-[12px] font-[500] leading-[13.2px] text-[#9d9d9e] bg-transparent border-none p-0 m-0">
                              {number}
                            </kbd>
                          )}
                        </span>
                      </DropdownMenuItem>
                    ))}
                  </React.Fragment>
                ))}
                <DropdownMenuLabel
                  style={{ height: 30, padding: '8px 14px', fontSize: 12, fontWeight: 500, lineHeight: '14px' }}
                >
                  Account
                </DropdownMenuLabel>
                <DropdownMenuItem onSelect={openCreateWorkspace}>
                  <span className="truncate">Create or join a workspace…</span>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={openAddAccount}>
                  <span className="truncate">Add an account…</span>
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>

            {/* 4. Log out */}
            <DropdownMenuItem onSelect={() => void logOut()}>
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

        {/* Search Action */}
        <div className="flex items-center shrink-0">
          <Tooltip content="Search workspace" shortcut="/">
            <button
              type="button"
              onClick={openSearchPage}
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
