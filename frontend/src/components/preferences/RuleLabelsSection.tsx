import React, { useEffect, useRef, useState } from 'react';
import type { Workspace } from '@/lib/types';
import { useAppStore, type RuleLabel } from '@/store/useAppStore';
import { ApiError } from '@/lib/api';
import { LABEL_COLORS, formatRelativeTime, randomLabelColor } from '@/lib/rules';
import { openAppPath, pathForTab } from '@/lib/routing';
import { ConfirmDialog } from '@/ui/ConfirmDialog';
import { DataState } from '@/ui/DataState';
import { DropdownMenuItem, DropdownMenuSeparator } from '@/ui/DropdownMenu';
import { toast } from '@/ui/toast';
import { deletionPrompt, runPendingDeletion } from '@/components/rules/ruleActions';
import { RowMenu, shortDate } from './MembersSection';
import { SortHeader, sortedBy, useListSort } from './SettingsListSort';

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
    <span ref={ref} className="relative flex h-[14px] w-[14px] shrink-0 items-center justify-center">
      <button
        type="button"
        aria-label={`Color of ${label}`}
        aria-expanded={open}
        disabled={disabled}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((value) => !value);
        }}
        className="flex h-[14px] w-[14px] items-center justify-center rounded-full outline-none hover:bg-[var(--item-hover-bg)] focus-visible:ring-2 focus-visible:ring-[var(--focus-ring-color)] disabled:cursor-default disabled:hover:bg-transparent"
      >
        <span className="block h-[9px] w-[9px] rounded-full" style={{ backgroundColor: color }} />
      </button>
      {open && (
        <span
          role="listbox"
          aria-label="Label color"
          className="absolute left-0 top-[calc(100%+4px)] z-20 flex gap-1 rounded-[8px] border border-[var(--color-border-secondary)] bg-[var(--card-bg)] p-1.5 [box-shadow:var(--dropdown-shadow)]"
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
              className="flex h-6 w-6 items-center justify-center rounded-full outline-none hover:bg-[var(--item-hover-bg)] focus-visible:ring-2 focus-visible:ring-[var(--focus-ring-color)]"
            >
              <span
                className="block h-3 w-3 rounded-full"
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
        className={`w-full ${textClass}`}
      />
    );
  }
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => setEditing(true)}
      className={`${textClass} disabled:cursor-default ${value ? '' : 'settings-list-inline--placeholder'}`}
    >
      {value || (disabled ? '' : placeholder)}
    </button>
  );
};

/** Linear's "New label" row: a random color, the name, the description; Enter saves, Esc gives up. */
const NewLabelRow: React.FC<{ onDone: () => void }> = ({ onDone }) => {
  const createRuleLabel = useAppStore((state) => state.createRuleLabel);
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
          className="settings-list-inline settings-list-inline--strong w-full"
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
          className="settings-list-inline w-full"
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
  const labels = useAppStore((state) => state.ruleLabels);
  const loadState = useAppStore((state) => state.rulesLoadState);
  const loadError = useAppStore((state) => state.rulesError);
  const loadRules = useAppStore((state) => state.loadRules);
  const updateRuleLabel = useAppStore((state) => state.updateRuleLabel);
  const newLabelRequest = useAppStore((state) => state.newRuleLabelRequest);
  const pendingDeletion = useAppStore((state) => state.pendingDeletion);
  const requestDeletion = useAppStore((state) => state.requestDeletion);
  const cancelDeletion = useAppStore((state) => state.cancelDeletion);
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const canEdit = workspace.role !== 'guest';

  // Read again once the workspace is known: a direct address opens before it is.
  const scope = useAppStore((state) => state.workspaceScope);
  const scopeGeneration = useAppStore((state) => state.scopeGeneration);
  useEffect(() => {
    if (scope) void loadRules({ ifStale: true });
  }, [loadRules, scope, scopeGeneration]);

  // Ctrl/Cmd+K's "Create new label…" lands here with the new row open, once.
  useEffect(() => {
    if (newLabelRequest === 0) return;
    if (canEdit) setAdding(true);
    useAppStore.setState({ newRuleLabelRequest: 0 });
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
          <span className="sr-only">Filter by name…</span>
          <svg viewBox="0 0 16 16" aria-hidden="true" className="settings-list-search-icon">
            <path d="M7 1.5a5.5 5.5 0 0 1 4.38 8.82l3.15 3.15a.75.75 0 1 1-1.06 1.06l-3.15-3.15A5.5 5.5 0 1 1 7 1.5Zm0 1.5a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z" />
          </svg>
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
              <span role="columnheader" className="sr-only">Actions</span>
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
                <span role="cell" className="flex justify-end">
                  {canEdit && (
                    <RowMenu label={`Label actions for ${label.name}`} visible>
                      <DropdownMenuItem onSelect={() => setRenaming(label.id)}>
                        <span className="truncate">Rename…</span>
                      </DropdownMenuItem>
                      {label.ruleCount > 0 && (
                        <DropdownMenuItem onSelect={() => openRules(label)}>
                          <span className="truncate">View rules</span>
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onSelect={() => requestDeletion('rule_group', [label.id])}>
                        <span className="truncate text-[var(--rules-action-stop-text)]">Delete label…</span>
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
