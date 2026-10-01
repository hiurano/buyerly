import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  INBOX_KINDS,
  INBOX_KIND_LABELS,
  fetchInboxFacets,
  type InboxFacets,
  type InboxFilterClause,
  type InboxKind,
  type InboxPriorityRule,
} from '@/lib/inbox';
import { useAppStore } from '@/store/useAppStore';
import { LinearFilterMenu, type FilterMenuMode } from '@/components/filters/LinearFilter';
import type { FilterClause } from '@/components/filters/filterModel';
import { InboxFilterChip } from '@/components/inbox/InboxFilterBar';
import { fromMenuClauses, inboxFilterFields, toMenuClause } from '@/components/inbox/inboxFilterFields';
import {
  LinearDotsIcon,
  LinearFilterIcon,
  LinearPencilIcon,
  LinearPlusIcon,
  LinearTrashIcon,
} from '@/icons/LinearIcons';
import { Button } from '@/ui/Button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/ui/DropdownMenu';
import { LinearToggle } from '@/ui/LinearToggle';

/** What each kind holds, in place of Linear's descriptions of its notification types. */
const KIND_DESCRIPTIONS: Record<InboxKind, string> = {
  urgent: 'Errors, expired Meta access and ad account problems',
  rule_alerts: 'Alerts from rules that only notify',
  rule_actions: 'Stops, budget changes and other actions taken by rules',
  assistant: 'Changes made through the AI assistant',
  manual: 'Changes made by hand',
  team: 'Invitations and support access',
  system: 'Everything else Buyerly reports',
};

/** Linear's custom filters use two properties: Notification type and From. */
const RULE_FIELDS = ['type', 'from'] as const;

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

function useInboxDisplay() {
  const { inboxDisplay, inboxDisplayLoaded, loadInboxDisplay, setInboxDisplay } = useAppStore();
  useEffect(() => {
    if (!inboxDisplayLoaded) void loadInboxDisplay();
  }, [inboxDisplayLoaded, loadInboxDisplay]);
  return { inboxDisplay, setInboxDisplay };
}

/** Settings → Notifications, as in Linear: here only its Inbox part, which Buyerly has. */
export const NotificationsSection: React.FC<{ onOpenPriority: () => void }> = ({ onOpenPriority }) => {
  const { inboxDisplay, setInboxDisplay } = useInboxDisplay();
  return (
    <>
      <div className="preferences-title-container">
        <h1 className="preferences-page-title">Notifications</h1>
      </div>
      <div className="preferences-section">
        <div className="preferences-section-header">
          <h3 className="preferences-section-title">Inbox</h3>
        </div>
        <p className="preferences-section-note">Manage how notifications are organized in your inbox</p>
        <section className="preferences-card-container preferences-card-container--divided">
          <div className="preferences-row-item">
            <div className="preferences-row-copy">
              <span className="preferences-row-title">Priority inbox</span>
              <span className="preferences-row-desc">Separate important notifications from the rest of your inbox</span>
            </div>
            <LinearToggle
              label="Priority inbox"
              checked={inboxDisplay.priorityInbox}
              onChange={(value) => setInboxDisplay({ priorityInbox: value })}
            />
          </div>
          <button type="button" className="preferences-row-item preferences-row-link" onClick={onOpenPriority}>
            <span className="preferences-row-copy">
              <span className="preferences-row-title">Priority notifications</span>
              <span className="preferences-row-desc">Choose which notifications are treated as priority</span>
            </span>
            <span className="preferences-row-control">
              <span className="preferences-row-value">{plural(inboxDisplay.priorityKinds.length, 'type')}</span>
              <ChevronRight size={14} aria-hidden="true" className="text-[var(--text-tertiary)]" />
            </span>
          </button>
        </section>
      </div>
    </>
  );
};

/** Settings → Notifications → Priority notifications: kinds, then custom filters. */
export const PriorityNotificationsSection: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const { inboxDisplay, setInboxDisplay } = useInboxDisplay();
  const toggleKind = (kind: InboxKind, on: boolean) => setInboxDisplay({
    priorityKinds: INBOX_KINDS.filter((entry) => (entry === kind ? on : inboxDisplay.priorityKinds.includes(entry))),
  });
  return (
    <>
      <button type="button" className="preferences-breadcrumb" onClick={onBack}>
        <ChevronLeft size={14} aria-hidden="true" />
        Notifications
      </button>
      <div className="preferences-title-container preferences-title-container--with-note">
        <h1 className="preferences-page-title">Priority notifications</h1>
        <p className="preferences-page-note">Choose which notifications are treated as priority</p>
      </div>
      <div className="preferences-section">
        <section className="preferences-card-container preferences-card-container--divided">
          {INBOX_KINDS.map((kind) => (
            <div key={kind} className="preferences-row-item">
              <div className="preferences-row-copy">
                <span className="preferences-row-title">{INBOX_KIND_LABELS[kind]}</span>
                <span className="preferences-row-desc">{KIND_DESCRIPTIONS[kind]}</span>
              </div>
              <LinearToggle
                label={INBOX_KIND_LABELS[kind]}
                checked={inboxDisplay.priorityKinds.includes(kind)}
                onChange={(value) => toggleKind(kind, value)}
              />
            </div>
          ))}
        </section>
      </div>
      <CustomFilters
        rules={inboxDisplay.priorityRules}
        onChange={(priorityRules) => setInboxDisplay({ priorityRules })}
      />
    </>
  );
};

/** Which custom filter is open in the editor: a saved one by index, or a new one. */
type Editing = number | 'new' | null;

const CustomFilters: React.FC<{
  rules: InboxPriorityRule[];
  onChange: (rules: InboxPriorityRule[]) => void;
}> = ({ rules, onChange }) => {
  const [editing, setEditing] = useState<Editing>(null);
  const [draft, setDraft] = useState<FilterClause[]>([]);
  const [facets, setFacets] = useState<InboxFacets | null>(null);
  const [menu, setMenu] = useState<{ mode: FilterMenuMode; anchor: HTMLElement; fieldId?: string } | null>(null);

  useEffect(() => {
    // Every notification, snoozed or read, offers its type and sender.
    fetchInboxFacets(false, true).then(setFacets).catch(() => {});
  }, []);

  // One clause per property with every value in use, so saved filters keep their labels.
  const fields = useMemo(() => {
    const inUse: InboxFilterClause[] = RULE_FIELDS.map((field) => ({
      field,
      operator: 'is',
      values: [...new Set([...rules.flat(), ...fromMenuClauses(draft)]
        .filter((clause) => clause.field === field)
        .flatMap((clause) => clause.values))],
    }));
    return inboxFilterFields(facets, inUse, RULE_FIELDS);
  }, [draft, facets, rules]);

  const startEditing = (target: Exclude<Editing, null>) => {
    setDraft(target === 'new' ? [] : rules[target].map(toMenuClause));
    setEditing(target);
  };
  const stopEditing = () => {
    setEditing(null);
    setDraft([]);
    setMenu(null);
  };
  const save = () => {
    const rule = fromMenuClauses(draft).filter(
      (clause): clause is InboxPriorityRule[number] =>
        (clause.field === 'type' || clause.field === 'from') && clause.values.length > 0,
    );
    if (rule.length === 0) return;
    onChange(editing === 'new' || editing === null
      ? [...rules, rule]
      : rules.map((current, index) => (index === editing ? rule : current)));
    stopEditing();
  };
  const openMenu = (mode: FilterMenuMode, anchor: HTMLElement, fieldId?: string) =>
    setMenu({ mode, anchor, fieldId });

  const editor = (
    <div className="preferences-filter-row" aria-label="Custom filter">
      <span className="preferences-filter-include">Include</span>
      <div className="preferences-filter-chips">
        {draft.length === 0 ? (
          <button
            type="button"
            className="preferences-filter-button"
            onClick={(event) => openMenu('root', event.currentTarget)}
          >
            <LinearFilterIcon size={14} />
            Filter
          </button>
        ) : (
          <>
            {draft.map((clause) => {
              const field = fields.find((entry) => entry.id === clause.fieldId);
              return field ? (
                <InboxFilterChip
                  key={clause.fieldId}
                  field={field}
                  clause={clause}
                  onOpenMenu={openMenu}
                  onRemove={() => setDraft(draft.filter((entry) => entry.fieldId !== clause.fieldId))}
                />
              ) : null;
            })}
            {draft.length < RULE_FIELDS.length && (
              <button
                type="button"
                aria-label="Add another filter"
                className="preferences-filter-icon-button"
                onClick={(event) => openMenu('root', event.currentTarget)}
              >
                <LinearPlusIcon size={14} />
              </button>
            )}
          </>
        )}
      </div>
      <div className="preferences-filter-actions">
        <Button size="compact" onClick={stopEditing}>Cancel</Button>
        <Button size="compact" variant="primary" disabled={fromMenuClauses(draft).length === 0} onClick={save}>
          Save
        </Button>
      </div>
    </div>
  );

  return (
    <div className="preferences-section">
      <div className="preferences-section-header">
        <h3 className="preferences-section-title">Custom filters</h3>
      </div>
      <p className="preferences-section-note">Include additional notifications in your Priority inbox</p>
      <section className="preferences-card-container preferences-card-container--divided" aria-label="Custom filters">
        <div className="preferences-filter-row">
          {rules.length === 0 ? (
            <span className="preferences-filter-count preferences-filter-count--empty">No custom filters</span>
          ) : (
            <span className="preferences-filter-count">{plural(rules.length, 'custom filter')}</span>
          )}
          {editing === null && (rules.length === 0 ? (
            <button type="button" className="preferences-filter-add" onClick={() => startEditing('new')}>
              Add filter
            </button>
          ) : (
            <button
              type="button"
              aria-label="Add filter"
              className="preferences-filter-icon-button"
              onClick={() => startEditing('new')}
            >
              <LinearPlusIcon size={14} />
            </button>
          ))}
        </div>
        {rules.map((rule, index) => (editing === index ? (
          <React.Fragment key={index}>{editor}</React.Fragment>
        ) : (
          <SavedFilter
            key={index}
            rule={rule}
            fields={fields}
            canEdit={editing === null}
            onEdit={() => startEditing(index)}
            onDelete={() => onChange(rules.filter((_, current) => current !== index))}
          />
        )))}
        {editing === 'new' && editor}
      </section>
      <LinearFilterMenu
        isOpen={Boolean(menu)}
        mode={menu?.mode ?? 'root'}
        anchorElement={menu?.anchor ?? null}
        fieldId={menu?.fieldId}
        fields={fields}
        clauses={draft}
        onChange={setDraft}
        onClose={() => setMenu(null)}
        countNoun={['notification', 'notifications']}
        childWidth={311}
        rootPlaceholder="Filter notifications by…"
      />
    </div>
  );
};

const SavedFilter: React.FC<{
  rule: InboxPriorityRule;
  fields: ReturnType<typeof inboxFilterFields>;
  canEdit: boolean;
  onEdit: () => void;
  onDelete: () => void;
}> = ({ rule, fields, canEdit, onEdit, onDelete }) => {
  return (
    <div className="preferences-filter-row preferences-filter-row--saved">
      <span className="preferences-filter-include">Include</span>
      <div className="preferences-filter-chips">
        {rule.map((clause) => {
          const menuClause = toMenuClause(clause);
          const field = fields.find((entry) => entry.id === menuClause.fieldId);
          return field ? <InboxFilterChip key={menuClause.fieldId} field={field} clause={menuClause} /> : null;
        })}
      </div>
      {canEdit && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Custom filter actions"
              className="preferences-filter-icon-button preferences-filter-actions-trigger"
            >
              <LinearDotsIcon size={14} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={onEdit}>
              <span className="flex items-center gap-2.5">
                <LinearPencilIcon size={14} />
                Edit
              </span>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onDelete}>
              <span className="flex items-center gap-2.5">
                <LinearTrashIcon size={14} />
                Delete
              </span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
};
