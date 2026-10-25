import React, { useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Command } from 'cmdk';
import * as stylex from '@stylexjs/stylex';
import { colors } from '@/styles/tokens.stylex';
import { commandItemMarker } from '@/ui/markers.stylex';
import { withClassName } from '@/ui/withClassName';
import { commandMenuStyles } from './commandMenuStyles';

/** Tailwind's font-sans, as tailwind.config.js sets it. */
const SANS = '"Inter Variable", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
import { BuyerlyCheckIcon } from '@/icons/BuyerlyIcons';
import { WorkspaceAvatar } from '@/ui/WorkspaceAvatar';
import { useWorkspaceSession } from '@/lib/workspaceSession';
import { accountBlocks } from '@/lib/accounts';

const styles = stylex.create({
  surface: {
    position: 'fixed',
    left: 0,
    right: 0,
    top: '13vh',
    zIndex: 700,
    marginLeft: 'auto',
    marginRight: 'auto',
    width: 720,
    maxWidth: 'calc(100vw - 32px)',
    overflow: 'hidden',
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: colors['--color-border-secondary'],
    backgroundColor: colors['--card-bg'],
    boxShadow: colors['--dropdown-shadow'],
    outline: '2px solid transparent',
    outlineOffset: 2,
  },
  field: {
    paddingLeft: 6,
    paddingRight: 6,
    paddingTop: 6,
  },
  input: {
    height: 40,
    width: '100%',
    borderRadius: 12,
    backgroundColor: 'transparent',
    paddingLeft: 12,
    paddingRight: 12,
    paddingTop: 11,
    paddingBottom: 11,
    fontSize: 13,
    color: colors['--text-primary'],
    outline: '2px solid transparent',
    outlineOffset: 2,
    '::placeholder': {
      color: colors['--text-muted'],
    },
  },
  list: {
    maxHeight: 'min(360px, 60vh)',
    overflowY: 'auto',
    paddingBottom: 5,
    paddingTop: 6,
    userSelect: 'none',
  },
  item: {
    position: 'relative',
    display: 'flex',
    height: 46,
    cursor: 'pointer',
    alignItems: 'center',
    paddingLeft: 19,
    paddingRight: 21,
    fontSize: 13,
    fontWeight: 450,
    color: colors['--text-primary'],
    outline: '2px solid transparent',
    outlineOffset: 2,
  },
  /** The selected row's fill, inset 7px from the sides and 2px from the top and bottom. */
  pill: {
    pointerEvents: 'none',
    position: 'absolute',
    left: 7,
    right: 7,
    top: 2,
    bottom: 2,
    borderRadius: 8,
    backgroundColor: {
      default: null,
      [stylex.when.ancestor('[data-selected="true"]', commandItemMarker)]: colors['--item-hover-bg'],
    },
  },
  name: {
    position: 'relative',
    zIndex: 10,
    display: 'flex',
    minWidth: 0,
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: '0%',
    alignItems: 'center',
    gap: 8,
  },
  truncate: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  trailing: {
    position: 'relative',
    zIndex: 10,
    display: 'flex',
    flexShrink: 0,
    alignItems: 'center',
    gap: 6,
    color: colors['--text-tertiary'],
  },
  current: {
    color: colors['--text-primary'],
  },
  kbd: {
    display: 'flex',
    height: 23,
    minWidth: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 3,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: colors['--color-border-primary'],
    backgroundColor: 'transparent',
    paddingLeft: 4,
    paddingRight: 4,
    fontFamily: SANS,
    fontSize: 12,
    fontWeight: 450,
    lineHeight: 1,
  },
});

function isTyping(): boolean {
  const element = document.activeElement as HTMLElement | null;
  return element?.tagName === 'INPUT' || element?.tagName === 'TEXTAREA' || Boolean(element?.isContentEditable);
}

/** Linear's O then W: a palette of this account's workspaces, numbered 1…N, with the open one checked. */
export const WorkspaceSwitcher: React.FC = () => {
  const { user, workspace, accounts, switchWorkspace } = useWorkspaceSession();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => {
    let oPressed = false;
    let timer: ReturnType<typeof setTimeout>;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.altKey || event.metaKey || isTyping()) return;
      const key = event.key.toLowerCase();
      if (oPressed && key === 'w') {
        event.preventDefault();
        oPressed = false;
        setQuery('');
        setOpen(true);
        return;
      }
      oPressed = key === 'o';
      clearTimeout(timer);
      if (oPressed) timer = setTimeout(() => { oPressed = false; }, 1500);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      clearTimeout(timer);
    };
  }, []);

  const blocks = accountBlocks(accounts, user);
  const isOpenAccount = (accountId?: number) => accountId === undefined || user.id == null || accountId === user.id;

  const choose = (slug: string, accountId?: number) => {
    setOpen(false);
    switchWorkspace(slug, accountId);
  };

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Content
          aria-describedby={undefined}
          {...withClassName(stylex.props(styles.surface), 'animate-scale-in')}
        >
          <Dialog.Title {...stylex.props(commandMenuStyles.srOnly)}>Switch workspace</Dialog.Title>
          <Command label="Switch workspace" loop>
            <div {...stylex.props(styles.field)}>
              <Command.Input
                autoFocus
                value={query}
                onValueChange={setQuery}
                placeholder="Switch workspace…"
                onKeyDown={(event) => {
                  // Linear: with nothing typed, a workspace's number opens it right away.
                  if (query || !/^[1-9]$/.test(event.key)) return;
                  for (const block of blocks) {
                    const target = block.workspaces.find((item) => item.number === Number(event.key));
                    if (!target) continue;
                    event.preventDefault();
                    choose(target.workspace.slug, block.accountId);
                    return;
                  }
                }}
                {...stylex.props(styles.input)}
              />
            </div>
            <Command.List {...stylex.props(styles.list)}>
              {/* Linear: the same blocks as the menu, one per logged-in account. */}
              {blocks.map((block) => (
              <Command.Group
                key={block.accountId ?? 'account'}
                heading={query ? undefined : block.label}
                className="buyerly-workspace-switcher-group"
              >
                {block.workspaces.map(({ workspace: item, number }) => (
                  <Command.Item
                    key={`${block.accountId ?? 'account'}:${item.id}`}
                    value={`${item.name} ${item.slug} ${block.accountId ?? ''}`.trim()}
                    onSelect={() => choose(item.slug, block.accountId)}
                    {...stylex.props(styles.item, commandItemMarker)}
                  >
                    <span {...stylex.props(styles.pill)} />
                    <span {...stylex.props(styles.name)}>
                      <WorkspaceAvatar workspace={item} />
                      <span {...stylex.props(styles.truncate)}>{item.name}</span>
                    </span>
                    <span {...stylex.props(styles.trailing)}>
                      {item.id === workspace.id && isOpenAccount(block.accountId) && (
                        <span {...stylex.props(styles.current)} aria-label="Current workspace">
                          <BuyerlyCheckIcon size={16} />
                        </span>
                      )}
                      {!query && number <= 9 && (
                        <kbd {...stylex.props(styles.kbd)}>
                          {number}
                        </kbd>
                      )}
                    </span>
                  </Command.Item>
                ))}
              </Command.Group>
              ))}
            </Command.List>
          </Command>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
