import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRulesStore, type RuleLabel } from '@/models/rulesStore';

interface RuleLabelPickerProps {
  /** Labels every rule being changed carries. */
  checked: string[];
  /** Labels only some of several rules carry: shown with a dash, as Linear does. */
  mixed?: string[];
  onToggle: (labelId: string, next: boolean) => void;
  /** "Create new label: …": the new label is put on at once. */
  onCreate: (name: string) => Promise<void>;
  onClose: () => void;
  /** Opens under this box; without one, near the top of the window like Ctrl/Cmd+K. */
  anchorRect?: DOMRect | null;
  /** In place under its parent instead of a portal: inside a dialog that owns the pointer. */
  inline?: boolean;
  placeholder?: string;
}

const WIDTH = 279;
const ROW_HEIGHT = 32;
const MARGIN = 8;

type Entry = { kind: 'label'; label: RuleLabel } | { kind: 'create'; name: string };

const CHECK_PATH =
  'M3.46975 5.70757L1.88358 4.1225C1.65832 3.8974 1.29423 3.8974 1.06897 4.1225C0.843675 4.34765 0.843675 4.7116 1.06897 4.93674L3.0648 6.93117C3.29006 7.15628 3.65414 7.15628 3.8794 6.93117L8.93103 1.88306C9.15633 1.65792 9.15633 1.29397 8.93103 1.06883C8.70578 0.843736 8.34172 0.843724 8.11646 1.06879L3.46975 5.70757Z';

/**
 * Linear's label picker (#383): search, several labels at once without
 * closing, the labels already on first, and "Create new label: …" for a name
 * that does not exist yet. L opens it on a row or a selection. An element
 * marked `data-label-picker-trigger` opens and closes it without the
 * outside click closing it first.
 */
export const RuleLabelPicker: React.FC<RuleLabelPickerProps> = ({
  checked,
  mixed = [],
  onToggle,
  onCreate,
  onClose,
  anchorRect = null,
  inline = false,
  placeholder = 'Change or add labels…',
}) => {
  const labels = useRulesStore((state) => state.ruleLabels);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(-1);
  const [creating, setCreating] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  // The labels on when it opened stay on top while it is open, so a click never moves a row.
  const [initiallyOn] = useState(() => new Set([...checked, ...mixed]));

  const text = query.trim();
  const entries = useMemo<Entry[]>(() => {
    const needle = text.toLocaleLowerCase();
    const matching = labels.filter((label) => label.name.toLocaleLowerCase().includes(needle));
    const ordered = [
      ...matching.filter((label) => initiallyOn.has(label.id)),
      ...matching.filter((label) => !initiallyOn.has(label.id)),
    ];
    const list: Entry[] = ordered.map((label) => ({ kind: 'label', label }));
    if (text && !labels.some((label) => label.name.toLocaleLowerCase() === needle)) {
      list.push({ kind: 'create', name: text });
    }
    return list;
  }, [initiallyOn, labels, text]);
  const splitAt = text ? -1 : entries.findIndex((entry) => entry.kind === 'label' && !initiallyOn.has(entry.label.id));

  useEffect(() => {
    const timer = window.setTimeout(() => inputRef.current?.focus(), 30);
    return () => window.clearTimeout(timer);
  }, []);

  // Typing picks the first match, so Enter takes it.
  useEffect(() => {
    setActive(text ? 0 : -1);
  }, [text]);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Element | null;
      if (rootRef.current?.contains(target)) return;
      // A trigger opens and closes the picker itself.
      if (target?.closest?.('[data-label-picker-trigger]')) return;
      onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || inline) return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };
    document.addEventListener('mousedown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('mousedown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [inline, onClose]);

  const choose = async (entry: Entry | undefined) => {
    if (!entry || creating) return;
    if (entry.kind === 'label') {
      onToggle(entry.label.id, !checked.includes(entry.label.id));
      window.requestAnimationFrame(() => inputRef.current?.focus());
      return;
    }
    setCreating(true);
    const settle = () => {
      setCreating(false);
      window.requestAnimationFrame(() => inputRef.current?.focus());
    };
    try {
      await onCreate(entry.name);
      setQuery('');
    } catch (error) {
      settle();
      throw error;
    }
    settle();
  };

  const onInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (entries.length === 0) return;
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActive((index) => (index < 0 ? (step > 0 ? 0 : entries.length - 1) : (index + step + entries.length) % entries.length));
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      void choose(entries[active]);
      return;
    }
    if (event.key === 'Escape' && inline) {
      // The dialog around it gives way through its own Escape handler.
      event.preventDefault();
      onClose();
    }
  };

  const height = Math.min(44 + Math.max(entries.length, 1) * ROW_HEIGHT + 16, 395);
  let style: React.CSSProperties;
  if (inline) {
    style = { position: 'absolute', top: 'calc(100% + 6px)', left: 0 };
  } else if (anchorRect) {
    let left = anchorRect.left;
    let top = anchorRect.bottom + 6;
    if (left + WIDTH > window.innerWidth - MARGIN) left = window.innerWidth - WIDTH - MARGIN;
    if (top + height > window.innerHeight - MARGIN) top = Math.max(MARGIN, anchorRect.top - height - 6);
    style = { position: 'fixed', left: Math.max(MARGIN, left), top };
  } else {
    style = { position: 'fixed', left: '50%', top: '13vh', transform: 'translateX(-50%)' };
  }

  const renderEntry = (entry: Entry, index: number) => {
    const isActive = index === active;
    const id = entry.kind === 'label' ? `rule-label-option-${entry.label.id}` : 'rule-label-option-create';
    const on = entry.kind === 'label' && checked.includes(entry.label.id);
    const dash = entry.kind === 'label' && !on && mixed.includes(entry.label.id);
    return (
      <li
        id={id}
        key={id}
        role="option"
        aria-selected={entry.kind === 'label' ? on : false}
        aria-checked={entry.kind === 'label' ? (dash ? 'mixed' : on) : undefined}
        onMouseEnter={() => setActive(index)}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => void choose(entry)}
        className="relative flex cursor-pointer items-center"
        style={{ height: ROW_HEIGHT, padding: '0 18px 0 14px' }}
      >
        <div
          aria-hidden="true"
          className="absolute inset-y-0 left-1.5 right-1.5 rounded-[8px] transition-colors duration-75"
          style={{ backgroundColor: isActive ? 'var(--item-hover-bg)' : 'transparent' }}
        />
        {entry.kind === 'label' ? (
          <>
            <span className="relative z-[1] flex h-[14px] w-4 shrink-0 items-center">
              <span
                className="flex h-[14px] w-[14px] items-center justify-center rounded-[3px] border"
                style={{
                  borderColor: on || dash ? 'var(--checkbox-checked-bg)' : 'var(--checkbox-border-rest)',
                  backgroundColor: on || dash ? 'var(--checkbox-checked-bg)' : 'transparent',
                  color: '#fff',
                }}
              >
                {on && (
                  <svg width="10" height="9" viewBox="0 0 10 8" fill="currentColor" aria-hidden="true"><path d={CHECK_PATH} /></svg>
                )}
                {dash && <span className="block h-[1.5px] w-[8px] rounded-full bg-current" />}
              </span>
            </span>
            <span className="relative z-[1] flex min-w-0 flex-1 items-center pl-1.5">
              <span className="flex h-[9px] w-4 shrink-0 items-center justify-center">
                <span className="block h-[9px] w-[9px] rounded-full" style={{ backgroundColor: entry.label.color }} />
              </span>
              <span className="ml-[5px] min-w-0 truncate text-[13px] leading-5 text-[var(--text-primary)]">{entry.label.name}</span>
            </span>
          </>
        ) : (
          <span className="relative z-[1] flex min-w-0 flex-1 items-center gap-2 text-[13px] leading-5 text-[var(--text-primary)]">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" className="shrink-0 text-[var(--text-tertiary)]">
              <path d="M8.75 4a.75.75 0 0 0-1.5 0v3.25H4a.75.75 0 0 0 0 1.5h3.25V12a.75.75 0 0 0 1.5 0V8.75H12a.75.75 0 0 0 0-1.5H8.75V4Z" />
            </svg>
            <span className="min-w-0 truncate">
              Create new label: <span className="text-[var(--text-secondary)]">"{entry.name}"</span>
            </span>
          </span>
        )}
      </li>
    );
  };

  const picker = (
    <div
      ref={rootRef}
      role="dialog"
      aria-label="Labels"
      data-rule-label-picker="true"
      onClick={(event) => event.stopPropagation()}
      className="z-[9999] flex flex-col"
      style={{
        ...style,
        width: WIDTH,
        backgroundColor: 'var(--card-bg)',
        color: 'var(--text-primary)',
        border: '1px solid var(--color-border-secondary)',
        borderRadius: 12,
        boxShadow: 'var(--dropdown-shadow)',
        animation: 'buyerlyPopoverScale 120ms cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      <div
        className="flex h-[43px] shrink-0 items-center gap-2 border-b border-[var(--color-border-primary)] pl-[14px] pr-3"
      >
        <span className="sr-only" role="status" aria-live="polite">
          {text ? `${entries.length} matching` : 'Showing all labels'}
        </span>
        <input
          ref={inputRef}
          type="text"
          value={query}
          placeholder={placeholder}
          aria-label={placeholder}
          aria-controls="rule-label-options"
          aria-activedescendant={active >= 0 && entries[active]
            ? (entries[active].kind === 'label' ? `rule-label-option-${(entries[active] as { label: RuleLabel }).label.id}` : 'rule-label-option-create')
            : undefined}
          spellCheck={false}
          maxLength={80}
          disabled={creating}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={onInputKeyDown}
          className="h-9 min-w-0 flex-1 border-0 bg-transparent text-[13px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)]"
        />
        <kbd className="inline-flex h-[19px] min-w-[18px] items-center justify-center rounded-[4px] border border-[var(--color-border-secondary)] bg-[var(--item-hover-bg)] px-1 text-[11px] font-medium text-[var(--text-tertiary)]">
          L
        </kbd>
      </div>
      <div id="rule-label-options" role="listbox" aria-multiselectable="true" className="max-h-[340px] overflow-y-auto py-0.5">
        <ul role="presentation" className="m-0 list-none p-0">
          {entries.map((entry, index) => (
            <React.Fragment key={entry.kind === 'label' ? entry.label.id : 'create'}>
              {index === splitAt && index > 0 && (
                <li role="separator" className="box-border h-3 py-1.5">
                  <div className="h-px border-b border-[var(--color-border-primary)]" />
                </li>
              )}
              {renderEntry(entry, index)}
            </React.Fragment>
          ))}
          {entries.length === 0 && (
            <li className="px-[14px] py-4 text-center text-xs text-[var(--text-muted)]">
              {labels.length === 0 ? 'Type a name to create the first label' : 'No labels found'}
            </li>
          )}
        </ul>
      </div>
    </div>
  );

  return inline ? picker : createPortal(picker, document.body);
};
