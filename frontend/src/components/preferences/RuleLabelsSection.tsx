import React, { useEffect, useRef, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { BuyerlyIcon } from '@/icons/BuyerlyIcon';
import type { Workspace } from '@/lib/types';
import { ApiError } from '@/lib/api';
import { LABEL_COLORS, formatRelativeTime, randomLabelColor } from '@/lib/rules';
import { openAppPath, pathForTab } from '@/lib/routing';
import { ConfirmDialog } from '@/ui/ConfirmDialog';
import { DataState } from '@/ui/DataState';
import { DropdownMenuItem, DropdownMenuSeparator } from '@/ui/DropdownMenu';
import { toast } from '@/ui/toast';
import { withClassName } from '@/ui/withClassName';
import { colors } from '@/styles/tokens.stylex';
import { deletionPrompt, runPendingDeletion } from '@/components/rules/ruleActions';
import { RowMenu, shortDate } from './MembersSection';
import { SortHeader, sortedBy, useListSort } from './SettingsListSort';
import { useDialogStore } from '@/models/dialogStore';
import { useRulesStore, type RuleLabel } from '@/models/rulesStore';
import { useScopeStore } from '@/models/scopeStore';
import { shellStore, useShellStore } from '@/models/shellStore';

const styles = stylex.create({
  fullWidth: {
    width: '100%',
  },
  dotFrame: {
    position: 'relative',
    display: 'flex',
    height: 14,
    width: 14,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotButton: {
    display: 'flex',
    height: 14,
    width: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9999,
    outline: '2px solid transparent',
    outlineOffset: 2,
    backgroundColor: {
      default: null,
      ':enabled:hover': colors['--item-hover-bg'],
    },
    boxShadow: {
      default: null,
      ':focus-visible': `0 0 0 2px ${colors['--focus-ring-color']}`,
    },
    cursor: {
      default: null,
      ':disabled': 'default',
    },
  },
  dot: {
    display: 'block',
    height: 9,
    width: 9,
    borderRadius: 9999,
  },
  palette: {
    position: 'absolute',
    left: 0,
    top: 'calc(100% + 4px)',
    zIndex: 20,
    display: 'flex',
    gap: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: colors['--color-border-secondary'],
    backgroundColor: colors['--card-bg'],
    paddingTop: 6,
    paddingRight: 6,
    paddingBottom: 6,
    paddingLeft: 6,
    boxShadow: colors['--dropdown-shadow'],
  },
  swatchButton: {
    display: 'flex',
    height: 24,
    width: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9999,
    outline: '2px solid transparent',
    outlineOffset: 2,
    backgroundColor: {
      default: null,
      ':hover': colors['--item-hover-bg'],
    },
    boxShadow: {
      default: null,
      ':focus-visible': `0 0 0 2px ${colors['--focus-ring-color']}`,
    },
  },
  swatch: {
    display: 'block',
    height: 12,
    width: 12,
    borderRadius: 9999,
  },
  field: {
    width: '100%',
  },
  text: {
    cursor: {
      default: null,
      ':disabled': 'default',
    },
  },
  srOnly: {
    position: 'absolute',
    width: 1,
    height: 1,
    padding: 0,
    margin: -1,
    overflow: 'hidden',
    clip: 'rect(0, 0, 0, 0)',
    whiteSpace: 'nowrap',
    borderWidth: 0,
  },
  actions: {
    display: 'flex',
    justifyContent: 'flex-end',
  },
  truncate: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  danger: {
    color: colors['--rules-action-stop-text'],
  },
});

/**
 * Linear's Issue labels table: Name, Description, Last applied, Created; Buyerly
 * adds how many rules carry each label, linking to them. A phone keeps Name and Rules.
 */
const errorText = (error: unknown) =>
  error instanceof ApiError || error instanceof Error ? error.message : 'Please try again.';

/** The color dot: a click opens Linear's palette. */
const ColorDot: React.FC<{ color: string; label: string; disabled?: boolean; onPick: (color: string) => void }> = ({
  color,
  label,
  disabled,
  onPick,
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('mousedown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [open]);
  return (
    <span ref={ref} {...stylex.props(styles.dotFrame)}>
      <button
        type="button"
        aria-label={`Color of ${label}`}
        aria-expanded={open}
        disabled={disabled}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((value) => !value);
        }}
        {...stylex.props(styles.dotButton)}
      >
        <span {...stylex.props(styles.dot)} style={{ backgroundColor: color }} />
      </button>
      {open && (
        <span
          role="listbox"
          aria-label="Label color"
          {...stylex.props(styles.palette)}
        >
          {LABEL_COLORS.map((swatch) => (
            <button
              key={swatch}
              type="button"
              role="option"
              aria-selected={swatch === color}
              aria-label={swatch}
              onClick={(event) => {
                event.stopPropagation();
                setOpen(false);
                if (swatch !== color) onPick(swatch);
              }}
              {...stylex.props(styles.swatchButton)}
            >
              <span
                {...stylex.props(styles.swatch)}
                style={{ backgroundColor: swatch, boxShadow: swatch === color ? `0 0 0 2px var(--card-bg), 0 0 0 3.5px ${swatch}` : undefined }}
              />
            </button>
          ))}
        </span>
      )}
    </span>
  );
};

/** A text that turns into a field on click; Enter or leaving saves, Esc gives up. */
const InlineText: React.FC<{
  value: string;
  placeholder: string;
  ariaLabel: string;
  disabled?: boolean;
  strong?: boolean;
  editing?: boolean;
  onEditingChange?: (editing: boolean) => void;
  onSave: (value: string) => void;
}> = ({ value, placeholder, ariaLabel, disabled, strong, editing: forced, onEditingChange, onSave }) => {
  const [own, setOwn] = useState(false);
  const editing = forced ?? own;
  const setEditing = (next: boolean) => (onEditingChange ? onEditingChange(next) : setOwn(next));
  const [draft, setDraft] = useState(value);
  useEffect(() => {
    if (editing) setDraft(value);
  }, [editing, value]);
  const textClass = strong ? 'settings-list-inline settings-list-inline--strong' : 'settings-list-inline';
  if (editing) {
    const finish = (save: boolean) => {
      setEditing(false);
      if (save && draft.trim() !== value) onSave(draft.trim());
    };
    return (
      <input
        autoFocus
        aria-label={ariaLabel}
        value={draft}
        maxLength={strong ? 80 : 500}
        placeholder={placeholder}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => finish(true)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') finish(true);
          if (event.key === 'Escape') {
            event.stopPropagation();
            finish(false);
          }
        }}
        {...withClassName(stylex.props(styles.field), textClass)}
      />
    );
  }
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => setEditing(true)}
      {...withClassName(stylex.props(styles.text), value ? textClass : `${textClass} settings-list-inline--placeholder`)}
    >
      {value || (disabled ? '' : placeholder)}
    </button>
  );
};

/** Linear's "New label" row: a random color, the name, the description; Enter saves, Esc gives up. */
const NewLabelRow: React.FC<{ onDone: () => void }> = ({ onDone }) => {
  const createRuleLabel = useRulesStore((state) => state.createRuleLabel);
  const [color, setColor] = useState(randomLabelColor);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      await createRuleLabel(name.trim(), color, description.trim());
      onDone();
    } catch (error) {
      toast.error("Couldn't create the label", errorText(error));
      setBusy(false);
    }
  };
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      void save();
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onDone();
    }
  };
  return (
    <div role="row" className="settings-list-row">
      <span role="cell" className="settings-list-label">
        <ColorDot color={color} label="the new label" onPick={setColor} />
        <input
          autoFocus
          aria-label="Label name"
          placeholder="Label name"
          value={name}
          maxLength={80}
          disabled={busy}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={onKeyDown}
          {...withClassName(stylex.props(styles.fullWidth), 'settings-list-inline settings-list-inline--strong')}
        />
      </span>
      <span role="cell" className="settings-list-col-wide settings-list-description">
        <input
          aria-label="Label description"
          placeholder="Add label description…"
          value={description}
          maxLength={500}
          disabled={busy}
          onChange={(event) => setDescription(event.target.value)}
          onKeyDown={onKeyDown}
          {...withClassName(stylex.props(styles.fullWidth), 'settings-list-inline')}
        />
      </span>
      <span role="cell" />
      <span role="cell" className="settings-list-col-wide" />
      <span role="cell" className="settings-list-col-wide" />
      <span role="cell" />
    </div>
  );
};

/**
 * Settings → Rules → Labels (#383), as Linear's Settings → Issues → Labels:
 * "Filter by name…" and New label over a table of the workspace's rule labels.
 * A label is renamed, recolored and described in place; deleting it takes it
 * off its rules, which stay, and keeps it in Recently deleted.
 */
export const RuleLabelsSection: React.FC<{ workspace: Workspace }> = ({ workspace }) => {
  const labels = useRulesStore((state) => state.ruleLabels);
  const loadState = useRulesStore((state) => state.rulesLoadState);
  const loadError = useRulesStore((state) => state.rulesError);
  const loadRules = useRulesStore((state) => state.loadRules);
  const updateRuleLabel = useRulesStore((state) => state.updateRuleLabel);
  const newLabelRequest = useShellStore((state) => state.newRuleLabelRequest);
  const pendingDeletion = useDialogStore((state) => state.pendingDeletion);
  const requestDeletion = useDialogStore((state) => state.requestDeletion);
  const cancelDeletion = useDialogStore((state) => state.cancelDeletion);
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const canEdit = workspace.role !== 'guest';

  // Read again once the workspace is known: a direct address opens before it is.
  const scope = useScopeStore((state) => state.workspaceScope);
  const scopeGeneration = useScopeStore((state) => state.scopeGeneration);
  useEffect(() => {
    if (scope) void loadRules({ ifStale: true });
  }, [loadRules, scope, scopeGeneration]);

  // Ctrl/Cmd+K's "Create new label…" lands here with the new row open, once.
  useEffect(() => {
    if (newLabelRequest === 0) return;
    if (canEdit) setAdding(true);
    shellStore.takeNewRuleLabelRequest();
  }, [canEdit, newLabelRequest]);

  const save = async (label: RuleLabel, patch: { name?: string; color?: string; description?: string }) => {
    if (patch.name === '') return;
    try {
      await updateRuleLabel(label.id, patch);
    } catch (error) {
      toast.error("Couldn't save the label", errorText(error));
    }
  };

  const openRules = (label: RuleLabel) => {
    const filter = [{ fieldId: 'label', operator: 'includes_any', values: [label.id] }];
    openAppPath(`${pathForTab(workspace.slug, 'rules')}?filter=${encodeURIComponent(JSON.stringify(filter))}`);
  };

  const needle = query.trim().toLocaleLowerCase();
  const [sort, toggleSort] = useListSort<'name' | 'description' | 'rules' | 'lastApplied' | 'created'>('name');
  const visible = sortedBy(labels.filter((label) => !needle || label.name.toLocaleLowerCase().includes(needle)), (label) => {
    if (sort.key === 'description') return label.description;
    if (sort.key === 'rules') return label.ruleCount;
    if (sort.key === 'lastApplied') return label.lastAppliedAt ? Date.parse(label.lastAppliedAt) : null;
    if (sort.key === 'created') return Date.parse(label.createdAt);
    return label.name;
  }, sort.direction);
  const deletion = pendingDeletion?.kind === 'rule_group' ? deletionPrompt('rule_group', pendingDeletion.ids) : null;

  return (
    <>
      <div className="settings-list-title-row">
        <div className="preferences-title-container">
          <h1 className="preferences-page-title">Rule labels</h1>
        </div>
        {canEdit && (
          <button type="button" className="settings-list-button settings-list-button--primary" onClick={() => setAdding(true)}>
            New label
          </button>
        )}
      </div>

      <div className="settings-list-filter-row">
        <label className="settings-list-search">
          <span {...stylex.props(styles.srOnly)}>Filter by name…</span>
          <BuyerlyIcon name="search" className="settings-list-search-icon" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter by name…"
            className="settings-list-search-input"
          />
        </label>
      </div>

      {loadState === 'error' && (
        <DataState title="Couldn't load labels" detail={loadError} role="alert" actionLabel="Retry" onAction={() => void loadRules()} />
      )}
      {(loadState === 'idle' || loadState === 'loading') && (
        <DataState title="Loading labels…" detail="Reading the rule labels in this workspace." />
      )}

      {loadState === 'ready' && (
        <>
          <div className="settings-list-table settings-list--labels" role="table" aria-label="Rule labels">
            <div role="row" className="settings-list-row settings-list-row--header">
              <SortHeader label="Name" column="name" sort={sort} onSort={toggleSort} />
              <SortHeader label="Description" column="description" sort={sort} onSort={toggleSort} className="settings-list-col-wide" />
              <SortHeader label="Rules" column="rules" sort={sort} onSort={toggleSort} />
              <SortHeader label="Last applied" column="lastApplied" sort={sort} onSort={toggleSort} className="settings-list-col-wide" />
              <SortHeader label="Created" column="created" sort={sort} onSort={toggleSort} className="settings-list-col-wide" />
              <span role="columnheader" {...stylex.props(styles.srOnly)}>Actions</span>
            </div>
            {adding && <NewLabelRow onDone={() => setAdding(false)} />}
            {visible.map((label) => (
              <div key={label.id} role="row" className="settings-list-row">
                <span role="cell" className="settings-list-label">
                  <ColorDot
                    color={label.color}
                    label={label.name}
                    disabled={!canEdit}
                    onPick={(color) => void save(label, { color })}
                  />
                  <InlineText
                    strong
                    value={label.name}
                    placeholder="Label name"
                    ariaLabel={`Name of ${label.name}`}
                    disabled={!canEdit}
                    editing={renaming === label.id}
                    onEditingChange={(editing) => setRenaming(editing ? label.id : null)}
                    onSave={(name) => void save(label, { name })}
                  />
                </span>
                <span role="cell" className="settings-list-col-wide settings-list-description">
                  <InlineText
                    value={label.description}
                    placeholder="Add label description…"
                    ariaLabel={`Description of ${label.name}`}
                    disabled={!canEdit}
                    onSave={(description) => void save(label, { description })}
                  />
                </span>
                <span role="cell" className="settings-list-cell">
                  {label.ruleCount > 0 ? (
                    <a
                      href={`${pathForTab(workspace.slug, 'rules')}`}
                      aria-label={`${label.ruleCount} ${label.ruleCount === 1 ? 'rule' : 'rules'} labelled ${label.name}`}
                      className="settings-list-count"
                      onClick={(event) => {
                        event.preventDefault();
                        openRules(label);
                      }}
                    >
                      {label.ruleCount}
                    </a>
                  ) : (
                    <span className="settings-list-count">0</span>
                  )}
                </span>
                <span role="cell" className="settings-list-cell settings-list-col-wide">
                  {label.lastAppliedAt ? formatRelativeTime(label.lastAppliedAt) : ''}
                </span>
                <span role="cell" className="settings-list-cell settings-list-col-wide">{shortDate(label.createdAt)}</span>
                <span role="cell" {...stylex.props(styles.actions)}>
                  {canEdit && (
                    <RowMenu label={`Label actions for ${label.name}`} visible>
                      <DropdownMenuItem onSelect={() => setRenaming(label.id)}>
                        <span {...stylex.props(styles.truncate)}>Rename…</span>
                      </DropdownMenuItem>
                      {label.ruleCount > 0 && (
                        <DropdownMenuItem onSelect={() => openRules(label)}>
                          <span {...stylex.props(styles.truncate)}>View rules</span>
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onSelect={() => requestDeletion('rule_group', [label.id])}>
                        <span {...stylex.props(styles.truncate, styles.danger)}>Delete label…</span>
                      </DropdownMenuItem>
                    </RowMenu>
                  )}
                </span>
              </div>
            ))}
          </div>
          {visible.length === 0 && !adding && (
            <DataState
              title={needle ? 'No labels found' : 'No labels yet'}
              detail={needle
                ? 'No label matches this name.'
                : 'Labels sort rules by what they are for: launch, scaling, tests. A rule can carry several; group and filter the rules by them.'}
              actionLabel={!needle && canEdit ? 'New label' : undefined}
              onAction={!needle && canEdit ? () => setAdding(true) : undefined}
            />
          )}
        </>
      )}

      <ConfirmDialog
        open={Boolean(deletion)}
        title={deletion?.title ?? ''}
        description={deletion?.description ?? ''}
        confirmLabel="Delete"
        onConfirm={() => void runPendingDeletion()}
        onCancel={cancelDeletion}
      />
    </>
  );
};
