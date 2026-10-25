import React, { useEffect } from 'react';
import * as stylex from '@stylexjs/stylex';
import { colors } from '@/styles/tokens.stylex';
import { withClassName } from '@/ui/withClassName';
import { logOut } from '@/lib/sessions';
import { accountBlocks } from '@/lib/accounts';
import { Tooltip } from '@/ui/Tooltip';
import { BuyerlyCheckIcon } from '@/icons/BuyerlyIcons';
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
import { useScopeStore } from '@/models/scopeStore';
import { useShellStore } from '@/models/shellStore';

/** Tailwind's font-sans, as tailwind.config.js sets it. */
const SANS = '"Inter Variable", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

const styles = stylex.create({
  header: {
    width: '100%',
    userSelect: 'none',
    minWidth: 0,
  },
  /** Linear's header row: the workspace, then Search at the end. */
  row: {
    display: 'flex',
    alignItems: 'center',
    width: '100%',
    minWidth: 0,
  },
  /** Fluid, and leaves Search its 36px. */
  workspace: {
    minWidth: 0,
    maxWidth: 'calc(100% - 36px)',
  },
  truncate: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  shrinkable: {
    minWidth: 0,
  },
  fixed: {
    flexShrink: 0,
  },
  nowrap: {
    whiteSpace: 'nowrap',
  },
  /** The menu's 6px above its first item and below its last. */
  menuEdge: {
    height: 6,
    width: '100%',
  },
  keys: {
    display: 'flex',
    flexShrink: 0,
    alignItems: 'center',
    gap: 3,
  },
  sequence: {
    display: 'flex',
    alignItems: 'center',
    gap: 3,
  },
  subKeys: {
    display: 'flex',
    flexShrink: 0,
    alignItems: 'center',
    gap: 6,
  },
  /** A key as Linear's menus write it: plain text, no box. */
  key: {
    fontFamily: SANS,
    fontSize: 12,
    fontWeight: 500,
    lineHeight: '13.2px',
    color: '#9d9d9e',
    backgroundColor: 'transparent',
    borderStyle: 'none',
    paddingTop: 0,
    paddingRight: 0,
    paddingBottom: 0,
    paddingLeft: 0,
    marginTop: 0,
    marginRight: 0,
    marginBottom: 0,
    marginLeft: 0,
  },
  then: {
    fontSize: 12,
    fontWeight: 450,
    color: '#9d9d9e',
    marginLeft: 1,
    marginRight: 1,
  },
  arrow: {
    fontSize: 7,
    color: '#636364',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    width: 12,
  },
  workspaceItem: {
    display: 'flex',
    minWidth: 0,
    alignItems: 'center',
    gap: 8,
  },
  current: {
    color: colors['--text-primary'],
  },
  spacer: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: '0%',
    minWidth: 4,
  },
  search: {
    display: 'flex',
    alignItems: 'center',
    flexShrink: 0,
  },
  searchIcon: {
    display: 'flex',
    height: 14,
    width: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export const SidebarHeader: React.FC = () => {
  const workspaceName = useScopeStore((state) => state.workspaceName);
  const setActiveTab = useShellStore((state) => state.setActiveTab);
  const setSettingsSection = useShellStore((state) => state.setSettingsSection);
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
      {...stylex.props(styles.header)}
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
        {...stylex.props(styles.row)}
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
              {...withClassName(stylex.props(styles.workspace), 'buyerly-workspace-btn')}
            >
              {/* Linear: the workspace's own mark, its regular avatar in a 20px box. */}
              <WorkspaceAvatar workspace={workspace} size="regular" px={20} />

              {/* Workspace Name (truncates when space narrows) */}
              <span
                style={{
                  fontSize: '13px',
                  fontWeight: 550,
                  lineHeight: '23px',
                  letterSpacing: '-0.1px',
                  color: 'var(--sidebar-workspace-fg)',
                }}
                {...stylex.props(styles.truncate, styles.shrinkable)}
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
                {...withClassName(stylex.props(styles.fixed), 'chevron')}
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
            <div {...stylex.props(styles.menuEdge)} />

            {/* 1. Settings */}
            <DropdownMenuItem
              onSelect={() => {
                setSettingsSection('preferences');
                setActiveTab('preferences');
              }}
            >
              <span {...stylex.props(styles.truncate)}>Settings</span>
              <div {...stylex.props(styles.keys)}>
                <kbd {...stylex.props(styles.key)}>
                  G
                </kbd>
                <span {...stylex.props(styles.then)}>
                  then
                </span>
                <kbd {...stylex.props(styles.key)}>
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
                <span {...stylex.props(styles.truncate)}>Invite and manage members</span>
              </DropdownMenuItem>
            )}

            <DropdownMenuSeparator />

            {/* 3. Switch workspace: this account's workspaces, numbered, then Account actions (Linear) */}
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <span {...stylex.props(styles.nowrap)}>Switch workspace</span>
                <div {...stylex.props(styles.subKeys)}>
                  <div {...stylex.props(styles.sequence)}>
                    <kbd {...stylex.props(styles.key)}>
                      O
                    </kbd>
                    <span {...stylex.props(styles.then)}>
                      then
                    </span>
                    <kbd {...stylex.props(styles.key)}>
                      W
                    </kbd>
                  </div>
                  <span {...stylex.props(styles.arrow)}>
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
                      xstyle={styles.truncate}
                      style={{ height: 30, padding: '4px 12px 0 14px', fontSize: 13, fontWeight: 450, lineHeight: '26px' }}
                    >
                      {block.label}
                    </DropdownMenuLabel>
                    {block.workspaces.map(({ workspace: item, number }) => (
                      <DropdownMenuItem
                        key={`${block.accountId ?? 'account'}:${item.id}`}
                        onSelect={() => switchWorkspace(item.slug, block.accountId)}
                      >
                        <span {...stylex.props(styles.workspaceItem)}>
                          <WorkspaceAvatar workspace={item} />
                          <span {...stylex.props(styles.truncate)}>{item.name}</span>
                        </span>
                        <span {...stylex.props(styles.subKeys)}>
                          {item.id === workspace.id && isOpenAccount(block.accountId) && (
                            <span {...stylex.props(styles.current)} aria-label="Current workspace">
                              <BuyerlyCheckIcon size={16} />
                            </span>
                          )}
                          {number <= 9 && (
                            <kbd {...stylex.props(styles.key)}>
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
                  <span {...stylex.props(styles.truncate)}>Create or join a workspace…</span>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={openAddAccount}>
                  <span {...stylex.props(styles.truncate)}>Add an account…</span>
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>

            {/* 4. Log out */}
            <DropdownMenuItem onSelect={() => void logOut()}>
              <span {...stylex.props(styles.truncate)}>Log out</span>
              <div {...stylex.props(styles.keys)}>
                <kbd {...stylex.props(styles.key)}>
                  Alt
                </kbd>
                <kbd {...stylex.props(styles.key)}>
                  ⇧
                </kbd>
                <kbd {...stylex.props(styles.key)}>
                  Q
                </kbd>
              </div>
            </DropdownMenuItem>

            <div {...stylex.props(styles.menuEdge)} />
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Linear Middle Flex Spacer */}
        <div {...stylex.props(styles.spacer)} />

        {/* Search Action */}
        <div {...stylex.props(styles.search)}>
          <Tooltip content="Search workspace" shortcut="/">
            <button
              type="button"
              onClick={openSearchPage}
              aria-label="Search workspace"
              className="buyerly-icon-btn buyerly-sidebar-icon-btn"
            >
              <span {...stylex.props(styles.searchIcon)}>
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
