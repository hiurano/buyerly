import React, { useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Command } from 'cmdk';
import { LinearCheckIcon } from '@/icons/LinearIcons';
import { WorkspaceAvatar } from '@/ui/WorkspaceAvatar';
import { useWorkspaceSession } from '@/lib/workspaceSession';
import { accountBlocks } from '@/lib/accounts';

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
          className="fixed inset-x-0 top-[13vh] z-[700] mx-auto w-[720px] max-w-[calc(100vw-32px)] overflow-hidden rounded-[12px] border border-[var(--color-border-secondary)] bg-[var(--card-bg)] shadow-[var(--dropdown-shadow)] outline-none animate-scale-in"
        >
          <Dialog.Title className="sr-only">Switch workspace</Dialog.Title>
          <Command label="Switch workspace" loop>
            <div className="px-[6px] pt-[6px]">
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
                className="h-[40px] w-full rounded-[12px] bg-transparent px-[12px] py-[11px] text-[13px] text-[var(--text-primary)] placeholder-[var(--text-muted)] outline-none"
              />
            </div>
            <Command.List className="max-h-[min(360px,60vh)] overflow-y-auto pb-[5px] pt-[6px] select-none">
              {/* Linear: the same blocks as the menu, one per logged-in account. */}
              {blocks.map((block) => (
              <Command.Group
                key={block.accountId ?? 'account'}
                heading={query ? undefined : block.label}
                className="[&_[cmdk-group-heading]]:flex [&_[cmdk-group-heading]]:h-[30px] [&_[cmdk-group-heading]]:items-center [&_[cmdk-group-heading]]:pl-[27px] [&_[cmdk-group-heading]]:pr-[12px] [&_[cmdk-group-heading]]:pt-[4px] [&_[cmdk-group-heading]]:text-[13px] [&_[cmdk-group-heading]]:font-[450] [&_[cmdk-group-heading]]:text-[var(--text-tertiary)]"
              >
                {block.workspaces.map(({ workspace: item, number }) => (
                  <Command.Item
                    key={`${block.accountId ?? 'account'}:${item.id}`}
                    value={`${item.name} ${item.slug} ${block.accountId ?? ''}`.trim()}
                    onSelect={() => choose(item.slug, block.accountId)}
                    className="group relative flex h-[46px] cursor-pointer items-center pl-[19px] pr-[21px] text-[13px] font-[450] text-[var(--text-primary)] outline-none"
                  >
                    <span className="pointer-events-none absolute inset-x-[7px] inset-y-[2px] rounded-[8px] group-data-[selected=true]:bg-[var(--item-hover-bg)]" />
                    <span className="relative z-10 flex min-w-0 flex-1 items-center gap-[8px]">
                      <WorkspaceAvatar workspace={item} />
                      <span className="truncate">{item.name}</span>
                    </span>
                    <span className="relative z-10 flex shrink-0 items-center gap-[6px] text-[var(--text-tertiary)]">
                      {item.id === workspace.id && isOpenAccount(block.accountId) && (
                        <span className="text-[var(--text-primary)]" aria-label="Current workspace">
                          <LinearCheckIcon size={16} />
                        </span>
                      )}
                      {!query && number <= 9 && (
                        <kbd className="flex h-[23px] min-w-[20px] items-center justify-center rounded-[3px] border border-[var(--color-border-primary)] bg-transparent px-[4px] font-sans text-[12px] font-[450] leading-none">
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
