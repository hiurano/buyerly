import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import * as stylex from '@stylexjs/stylex';
import { colors } from '@/styles/tokens.stylex';
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

const truncate = {
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
} as const;

const styles = stylex.create({
  root: {
    zIndex: 9999,
    display: 'flex',
    flexDirection: 'column',
    width: WIDTH,
    backgroundColor: colors['--card-bg'],
    color: colors['--text-primary'],
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: colors['--color-border-secondary'],
    borderRadius: 12,
    boxShadow: colors['--dropdown-shadow'],
    animationName: 'buyerlyPopoverScale',
    animationDuration: '120ms',
    animationTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)',
  },
  header: {
    display: 'flex',
    height: 43,
    flexShrink: 0,
    alignItems: 'center',
    gap: 8,
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    borderColor: colors['--color-border-primary'],
    paddingLeft: 14,
    paddingRight: 12,
  },
  srOnly: {
    position: 'absolute',
    width: 1,
    height: 1,
    paddingTop: 0,
    paddingRight: 0,
    paddingBottom: 0,
    paddingLeft: 0,
    marginTop: -1,
    marginRight: -1,
    marginBottom: -1,
    marginLeft: -1,
    overflow: 'hidden',
    clip: 'rect(0, 0, 0, 0)',
    whiteSpace: 'nowrap',
    borderWidth: 0,
  },
  input: {
    height: 36,
    minWidth: 0,
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: '0%',
    borderWidth: 0,
    backgroundColor: 'transparent',
    fontSize: 13,
    color: colors['--text-primary'],
    outline: '2px solid transparent',
    outlineOffset: 2,
    '::placeholder': {
      color: colors['--text-tertiary'],
    },
  },
  kbd: {
    display: 'inline-flex',
    height: 19,
    minWidth: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 4,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: colors['--color-border-secondary'],
    backgroundColor: colors['--item-hover-bg'],
    paddingLeft: 4,
    paddingRight: 4,
    fontSize: 11,
    fontWeight: 500,
    color: colors['--text-tertiary'],
  },
  listbox: {
    maxHeight: 340,
    overflowY: 'auto',
    paddingTop: 2,
    paddingBottom: 2,
  },
  list: {
    marginTop: 0,
    marginRight: 0,
    marginBottom: 0,
    marginLeft: 0,
    listStyleType: 'none',
    paddingTop: 0,
    paddingRight: 0,
    paddingBottom: 0,
    paddingLeft: 0,
  },
  separator: {
    boxSizing: 'border-box',
    height: 12,
    paddingTop: 6,
    paddingBottom: 6,
  },
  separatorLine: {
    height: 1,
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    borderColor: colors['--color-border-primary'],
  },
  empty: {
    paddingTop: 16,
    paddingRight: 14,
    paddingBottom: 16,
    paddingLeft: 14,
    textAlign: 'center',
    fontSize: 12,
    lineHeight: '16px',
    color: colors['--text-muted'],
  },
  option: {
    position: 'relative',
    display: 'flex',
    cursor: 'pointer',
    alignItems: 'center',
    height: ROW_HEIGHT,
    paddingTop: 0,
    paddingRight: 18,
    paddingBottom: 0,
    paddingLeft: 14,
  },
  highlight: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 6,
    right: 6,
    borderRadius: 8,
    backgroundColor: 'transparent',
    transitionProperty: 'color, background-color, border-color, text-decoration-color, fill, stroke',
    transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
    transitionDuration: '75ms',
  },
  highlightActive: {
    backgroundColor: colors['--item-hover-bg'],
  },
  boxFrame: {
    position: 'relative',
    zIndex: 1,
    display: 'flex',
    height: 14,
    width: 16,
    flexShrink: 0,
    alignItems: 'center',
  },
  box: {
    display: 'flex',
    height: 14,
    width: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 3,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: colors['--checkbox-border-rest'],
    backgroundColor: 'transparent',
    color: '#fff',
  },
  boxOn: {
    borderColor: colors['--checkbox-checked-bg'],
    backgroundColor: colors['--checkbox-checked-bg'],
  },
  dash: {
    display: 'block',
    height: 1.5,
    width: 8,
    borderRadius: 9999,
    backgroundColor: 'currentColor',
  },
  label: {
    position: 'relative',
    zIndex: 1,
    display: 'flex',
    minWidth: 0,
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: '0%',
    alignItems: 'center',
    paddingLeft: 6,
  },
  dotFrame: {
    display: 'flex',
    height: 9,
    width: 16,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    display: 'block',
    height: 9,
    width: 9,
    borderRadius: 9999,
  },
  name: {
    ...truncate,
    marginLeft: 5,
    minWidth: 0,
    fontSize: 13,
    lineHeight: '20px',
    color: colors['--text-primary'],
  },
  create: {
    position: 'relative',
    zIndex: 1,
    display: 'flex',
    minWidth: 0,
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: '0%',
    alignItems: 'center',
    gap: 8,
    fontSize: 13,
    lineHeight: '20px',
    color: colors['--text-primary'],
  },
  createIcon: {
    flexShrink: 0,
    color: colors['--text-tertiary'],
  },
  createText: {
    ...truncate,
    minWidth: 0,
  },
  createName: {
    color: colors['--text-secondary'],
  },
});

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
        {...stylex.props(styles.option)}
      >
        <div aria-hidden="true" {...stylex.props(styles.highlight, isActive && styles.highlightActive)} />
        {entry.kind === 'label' ? (
          <>
            <span {...stylex.props(styles.boxFrame)}>
              <span {...stylex.props(styles.box, (on || dash) && styles.boxOn)}>
                {on && (
                  <svg width="10" height="9" viewBox="0 0 10 8" fill="currentColor" aria-hidden="true"><path d={CHECK_PATH} /></svg>
                )}
                {dash && <span {...stylex.props(styles.dash)} />}
              </span>
            </span>
            <span {...stylex.props(styles.label)}>
              <span {...stylex.props(styles.dotFrame)}>
                <span {...stylex.props(styles.dot)} style={{ backgroundColor: entry.label.color }} />
              </span>
              <span {...stylex.props(styles.name)}>{entry.label.name}</span>
            </span>
          </>
        ) : (
          <span {...stylex.props(styles.create)}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" {...stylex.props(styles.createIcon)}>
              <path d="M8.75 4a.75.75 0 0 0-1.5 0v3.25H4a.75.75 0 0 0 0 1.5h3.25V12a.75.75 0 0 0 1.5 0V8.75H12a.75.75 0 0 0 0-1.5H8.75V4Z" />
            </svg>
            <span {...stylex.props(styles.createText)}>
              Create new label: <span {...stylex.props(styles.createName)}>"{entry.name}"</span>
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
      {...stylex.props(styles.root)}
      style={style}
    >
      <div {...stylex.props(styles.header)}>
        <span {...stylex.props(styles.srOnly)} role="status" aria-live="polite">
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
          {...stylex.props(styles.input)}
        />
        <kbd {...stylex.props(styles.kbd)}>
          L
        </kbd>
      </div>
      <div id="rule-label-options" role="listbox" aria-multiselectable="true" {...stylex.props(styles.listbox)}>
        <ul role="presentation" {...stylex.props(styles.list)}>
          {entries.map((entry, index) => (
            <React.Fragment key={entry.kind === 'label' ? entry.label.id : 'create'}>
              {index === splitAt && index > 0 && (
                <li role="separator" {...stylex.props(styles.separator)}>
                  <div {...stylex.props(styles.separatorLine)} />
                </li>
              )}
              {renderEntry(entry, index)}
            </React.Fragment>
          ))}
          {entries.length === 0 && (
            <li {...stylex.props(styles.empty)}>
              {labels.length === 0 ? 'Type a name to create the first label' : 'No labels found'}
            </li>
          )}
        </ul>
      </div>
    </div>
  );

  return inline ? picker : createPortal(picker, document.body);
};
