import { useEffect, useMemo, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { BuyerlyCloseIcon, BuyerlySearchIcon } from '@/icons/BuyerlyIcons';
import { filterShortcutGroups, keyCap, type ShortcutEntry } from '@/lib/shortcutCatalog';
import { commandMenuStore, useCommandMenuStore } from '@/models/commandMenuStore';

function ShortcutKeys({ entry }: { entry: ShortcutEntry }) {
  const spoken = [...entry.keys.map(keyCap), ...(entry.then ? ['then', entry.then] : [])].join(' ');
  return (
    <span className="buyerly-shortcuts-keys" aria-label={spoken}>
      {entry.keys.map((key) => <kbd key={key}>{keyCap(key)}</kbd>)}
      {entry.then && (
        <>
          <span>then</span>
          <kbd>{entry.then}</kbd>
        </>
      )}
    </span>
  );
}

/**
 * Linear's keyboard shortcuts panel, measured on 2026-10-24 in both themes: a
 * 360px sheet 12px in from the window's right, top and bottom over a dimmed
 * page, sliding in 20px from the right. Title and close button, a search
 * field that filters the rows, then the groups. Cmd/Ctrl+/ opens and closes
 * it from anywhere except the command menu, where it means advanced search.
 */
export function BuyerlyShortcutsPanel() {
  const open = useCommandMenuStore((state) => state.isShortcutsOpen);
  const setOpen = useCommandMenuStore((state) => state.setShortcutsOpen);
  const [query, setQuery] = useState('');
  const groups = useMemo(() => filterShortcutGroups(query), [query]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.shiftKey || !(event.metaKey || event.ctrlKey)) return;
      if (event.key !== '/' && event.code !== 'Slash') return;
      if (commandMenuStore.isCommandMenuOpen) return;
      event.preventDefault();
      commandMenuStore.setShortcutsOpen(!commandMenuStore.isShortcutsOpen);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery('');
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="buyerly-shortcuts-backdrop" />
        <Dialog.Content
          className="buyerly-shortcuts-panel"
          aria-describedby={undefined}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            (event.currentTarget as HTMLElement).querySelector('input')?.focus();
          }}
        >
          <header className="buyerly-shortcuts-header">
            <Dialog.Title className="buyerly-shortcuts-title">Keyboard Shortcuts</Dialog.Title>
            <Dialog.Close className="buyerly-shortcuts-close" aria-label="Close dialog">
              <BuyerlyCloseIcon size={14} />
            </Dialog.Close>
          </header>
          <div className="buyerly-shortcuts-search">
            <BuyerlySearchIcon size={16} className="buyerly-shortcuts-search-icon" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search shortcuts"
              aria-label="Search shortcuts"
              spellCheck={false}
              autoComplete="off"
            />
          </div>
          <main className="buyerly-shortcuts-list">
            <div className="buyerly-shortcuts-groups">
              {groups.map((group) => (
                <section key={group.name} className="buyerly-shortcuts-group" aria-label={group.name}>
                  <h2>{group.name}</h2>
                  {group.shortcuts.map((entry) => (
                    <div key={entry.label} className="buyerly-shortcuts-row">
                      <span>{entry.label}</span>
                      <ShortcutKeys entry={entry} />
                    </div>
                  ))}
                </section>
              ))}
            </div>
          </main>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
