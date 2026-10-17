import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pause, Play, Trash2 } from 'lucide-react';
import { useAppStore, type RuleFilterTab } from '@/store/useAppStore';
import { SidebarCollapsedNavigation } from '@/components/sidebar/SidebarCollapsedNavigation';
import { RuleBoard } from './RuleBoard';
import { RulesListView } from './RulesListView';
import { deletionPrompt, runBulkRulesEnabled, runPendingDeletion } from './ruleActions';
import { RuleStatesHost } from './RuleStatesDialog';
import { RuleDisplayOptionsPopover } from './RuleDisplayOptionsPopover';
import {
  applyRuleQuickFilter,
  createRuleFacets,
  parseRuleQuickFilter,
  type RuleQuickFilter,
} from './ruleFacets';
import {
  ActiveFilterFormula,
  FilteredEmptyState,
  FilterMenuMode,
  LinearFilterButton,
  LinearFilterMenu,
} from '@/components/filters/LinearFilter';
import { createRuleFilterFields } from '@/components/filters/filterCatalogs';
import { applyFilterClauses, type FilterClause } from '@/components/filters/filterModel';
import { DisplayOptionsChangedDot } from '@/ui/LinearDisplayOptions';
import { useFiltersInAddress, writeFilterParam } from '@/ui/useListView';
import { NO_LABEL_COLOR, ruleGroupAccounts, ruleGroupIds, sortRules, useRulesView } from './rulesViewModel';
import { RuleLabelPickerHost } from './RuleLabelPickerHost';
import {
  LinearBoltIcon,
  LinearLabelIcon,
  LinearSlidersIcon,
  LinearStatusCircleIcon,
} from '@/icons/LinearIcons';
import { LinearTabs } from '@/ui/LinearTabs';
import { DetailsPaneLayout, DetailsPaneToggle } from '@/ui/DetailsPane';
import { DetailsFacets, type DetailsFacetTab } from '@/ui/DetailsFacets';
import { DataState } from '@/ui/DataState';
import { LinearDataListToolbar } from '@/ui/LinearDataList';
import { Tooltip } from '@/ui/Tooltip';
import { HeaderCreateButton } from '@/ui/HeaderCreateButton';
import { ConfirmDialog } from '@/ui/ConfirmDialog';
import { toast } from '@/ui/toast';
import { SelectionDock } from '@/ui/SelectionDock';
import { SelectionCommandMenu } from '@/ui/SelectionCommandMenu';
import { openCommandMenu } from '@/components/command/CommandMenu';
import { takeRecordActions } from '@/components/command/OpenPalette';
import { useRowSelection, type SelectionAction } from '@/ui/useRowSelection';
import { useRevealRow } from '@/ui/useRevealRow';
import { openRecentlyDeletedRules } from '@/lib/routing';

interface OpenFilterMenu {
  mode: FilterMenuMode;
  anchor: HTMLElement;
  fieldId?: string;
}

const QUICK_FILTER_KEY = 'buyerly:quick-filter:rules';

function readQuickFilter(): RuleQuickFilter | null {
  try {
    return parseRuleQuickFilter(window.sessionStorage.getItem(QUICK_FILTER_KEY));
  } catch {
    return null;
  }
}

function ruleFacetIcon(facet: string, value: string, labels: { id: string; color: string }[]): React.ReactNode {
  if (facet === 'status') {
    if (value === 'needs_review') return <span className="details-facets-dot" style={{ backgroundColor: '#f2994a' }} />;
    return <LinearStatusCircleIcon status={value === 'paused' ? 'paused' : 'active'} size={14} />;
  }
  if (facet === 'action') return <LinearBoltIcon size={14} style={{ color: 'var(--text-tertiary)' }} />;
  const color = labels.find((label) => label.id === value)?.color ?? NO_LABEL_COLOR;
  return <span className="details-facets-dot" style={{ backgroundColor: color }} />;
}

interface RulesViewProps {
  /** The rule the address names (`/rules/{id}`): a search result, a shared link. */
  revealId?: string;
  /** Changes on every navigation, Back and Forward included. */
  navigationKey: number;
}

export const RulesView: React.FC<RulesViewProps> = ({ revealId, navigationKey }) => {
  const {
    rules,
    ruleLabels,
    ruleAccounts,
    ruleFilterTab,
    setRuleFilterTab,
    openCreateRuleModal,
    isRulesDisplayOptionsOpen,
    toggleRulesDisplayOptions,
    setIsRulesDisplayOptionsOpen,
    rulesLoadState,
    rulesError,
    rulesMutationError,
    clearRulesMutationError,
    loadRules,
    selectedRuleIds,
    setRuleSelection,
    pendingDeletion,
    requestDeletion,
    cancelDeletion,
    rulesCollapsedGroups,
    toggleRulesGroupCollapse,
  } = useAppStore();

  // The view and its filters are saved per member on the server (#385); filters also ride in the address.
  const {
    view: rulesView,
    update: updateRulesView,
    loaded: rulesViewLoaded,
    displayChanged: rulesDisplayChanged,
  } = useRulesView();
  const rulesViewMode = rulesView.layout;
  const rulesDisplayGrouping = rulesView.grouping;
  const rulesFilterClauses = rulesView.filters;
  const setRulesFilterClauses = (clauses: FilterClause[]) => {
    updateRulesView({ filters: clauses });
    writeFilterParam(clauses.length ? clauses : null);
  };
  useFiltersInAddress(rulesFilterClauses, (clauses) => updateRulesView({ filters: clauses }), rulesViewLoaded, navigationKey);

  // Rules are read again on arrival and whenever an address names one, so a
  // rule created since the list was loaded is found as well.
  const revealKey = revealId ? navigationKey : null;
  const [loadedFor, setLoadedFor] = useState<number | null | undefined>(undefined);
  useEffect(() => {
    let active = true;
    void loadRules().finally(() => {
      if (active) setLoadedFor(revealKey);
    });
    return () => {
      active = false;
    };
  }, [loadRules, revealKey]);

  const displayOptionsButtonRef = useRef<HTMLButtonElement>(null);
  const filterButtonRef = useRef<HTMLButtonElement>(null);
  const [openFilterMenu, setOpenFilterMenu] = useState<OpenFilterMenu | null>(null);

  const groupAccounts = useMemo(() => ruleGroupAccounts(ruleAccounts), [ruleAccounts]);
  const filterFields = useMemo(
    () => createRuleFilterFields({ rules, ruleLabels, accounts: groupAccounts }),
    [groupAccounts, ruleLabels, rules]
  );

  // The details pane's one quick filter, on top of the filters; kept for this browser tab.
  const [quick, setQuickState] = useState<RuleQuickFilter | null>(readQuickFilter);
  const setQuick = (next: RuleQuickFilter | null) => {
    setQuickState(next);
    try {
      window.sessionStorage.setItem(QUICK_FILTER_KEY, JSON.stringify(next));
    } catch { /* Storage is optional. */ }
  };

  // The pane counts what the filters and the tab leave, before its own quick filter.
  const baseRules = useMemo(() => {
    const matchingFilters = applyFilterClauses(rules, filterFields, rulesFilterClauses);
    return ruleFilterTab === 'all'
      ? matchingFilters
      : matchingFilters.filter((rule) => rule.status === ruleFilterTab);
  }, [filterFields, ruleFilterTab, rules, rulesFilterClauses]);
  const filteredRules = useMemo(
    () => sortRules(applyRuleQuickFilter(baseRules, quick), rulesView.ordering, rulesView.direction),
    [baseRules, quick, rulesView.ordering, rulesView.direction],
  );

  const totalForTab =
    ruleFilterTab === 'all'
      ? rules.length
      : rules.filter((rule) => rule.status === ruleFilterTab).length;
  const hiddenCount = totalForTab - filteredRules.length;

  // A change shows on the rows themselves; a failed write is the only thing
  // reported on its own, as a toast, and the list stays as it is.
  useEffect(() => {
    if (!rulesMutationError) return;
    toast.error("Couldn't save the change", rulesMutationError);
    clearRulesMutationError();
  }, [clearRulesMutationError, rulesMutationError]);

  const liveSelection = () => selectedRuleIds.filter((id) => rules.some((rule) => rule.id === id));
  const selectionActions: SelectionAction[] = [
    { id: 'pause', label: 'Pause rules', shortcut: 'p', icon: <Pause size={14} />, run: () => void runBulkRulesEnabled(liveSelection(), false) },
    { id: 'resume', label: 'Resume rules', shortcut: 'r', icon: <Play size={14} />, run: () => void runBulkRulesEnabled(liveSelection(), true) },
    // Linear's L on a selection: one picker puts a label on, or takes it off, every selected rule.
    {
      id: 'labels',
      label: 'Labels…',
      shortcut: 'l',
      icon: <LinearLabelIcon size={14} />,
      run: () => useAppStore.getState().openRuleLabelPicker(liveSelection(), null),
    },
    {
      id: 'delete',
      label: 'Delete rules',
      shortcut: 'Delete',
      withModifier: true,
      icon: <Trash2 size={14} />,
      run: () => requestDeletion('rule', liveSelection()),
    },
  ];
  const visibleRuleIds = useMemo(() => filteredRules.map((rule) => rule.id), [filteredRules]);
  const selection = useRowSelection({
    selectedIds: selectedRuleIds,
    visibleIds: visibleRuleIds,
    setSelection: setRuleSelection,
    actions: selectionActions,
    // Selection lives in the list; the board has no row checkboxes.
    enabled: rulesLoadState === 'ready' && rulesViewMode === 'list',
  });

  useEffect(() => {
    if (rulesViewMode !== 'list') setRuleSelection([]);
  }, [rulesViewMode, setRuleSelection]);

  // The rule an address names opens on its row, or its card on the board.
  // One already in the loaded list opens at once; any other waits for the
  // fresh list before it is reported missing.
  const revealedRule = revealId ? rules.find((rule) => rule.id === revealId) : undefined;
  useRevealRow({
    id: revealId,
    navigationKey,
    ready: rulesLoadState === 'ready' && (Boolean(revealedRule) || loadedFor === revealKey),
    exists: Boolean(revealedRule),
    show: () => {
      if (!revealedRule) return false;
      let changed = false;
      if (ruleFilterTab !== 'all' && revealedRule.status !== ruleFilterTab) {
        setRuleFilterTab('all');
        changed = true;
      }
      if (applyFilterClauses([revealedRule], filterFields, rulesFilterClauses).length === 0) {
        setRulesFilterClauses([]);
        changed = true;
      }
      if (applyRuleQuickFilter([revealedRule], quick).length === 0) {
        setQuick(null);
        changed = true;
      }
      if (rulesViewMode === 'list') {
        const groupKeys = ruleGroupIds(rulesDisplayGrouping, revealedRule, ruleLabels, groupAccounts);
        for (const key of groupKeys.filter((candidate) => rulesCollapsedGroups.includes(candidate))) {
          toggleRulesGroupCollapse(key);
          changed = true;
        }
      }
      return changed;
    },
    missing: () => ({
      title: "Couldn't open",
      message: `rule ${revealId ?? ''}.`,
      description: 'This workspace has no such rule. A deleted rule stays in Recently deleted for 30 days.',
      action: { label: 'View recently deleted', onClick: openRecentlyDeletedRules },
    }),
    onDone: (shown) => {
      // Alt+Enter in an "Open rule…" palette: the row's own actions, as Linear's "More actions".
      if (!revealId || !takeRecordActions(`rule:${revealId}`) || !shown || rulesViewMode !== 'list') return;
      setRuleSelection([revealId]);
      selection.setMenuOpen(true);
    },
  });

  const deletion = pendingDeletion ? deletionPrompt(pendingDeletion.kind, pendingDeletion.ids) : null;
  // One selected rule is named on the actions menu's chip, as Linear's "BUY-4 ⋅ Title".
  const singleSelected = selection.count === 1 ? rules.find((rule) => rule.id === selectedRuleIds[0]) : undefined;

  const hasFilters = rulesFilterClauses.length > 0 || quick !== null;
  const clearFilters = () => {
    setRulesFilterClauses([]);
    setQuick(null);
  };

  const showFilterMenu = (mode: FilterMenuMode, anchor: HTMLElement, fieldId?: string) => {
    setOpenFilterMenu({ mode, anchor, fieldId });
  };

  // Global hotkeys: 'C' for create rule, Shift 'V' for display options, 'F' for filter; the app handles Ctrl+I.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return;
      }

      if ((e.key === 'l' || e.key === 'L') && !e.metaKey && !e.ctrlKey && !e.altKey) {
        // Linear's L on the row under the pointer, else the focused one; a selection has its own L.
        if (e.defaultPrevented || document.querySelector('[role="dialog"]')) return;
        const row = document.querySelector<HTMLElement>('[data-row-id]:hover')
          ?? (document.activeElement as HTMLElement | null)?.closest<HTMLElement>('[data-row-id]');
        const id = row?.dataset.rowId;
        if (!row || !id) return;
        e.preventDefault();
        const cell = row.querySelector<HTMLElement>('[data-rule-labels]') ?? row;
        const rect = cell.getBoundingClientRect();
        useAppStore.getState().openRuleLabelPicker([id], cell === row ? new DOMRect(rect.left + 40, rect.top, 0, rect.height) : rect);
        return;
      }

      if ((e.key === 'c' || e.key === 'C') && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        openCreateRuleModal();
      } else if ((e.key === 'v' || e.key === 'V') && e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setOpenFilterMenu(null);
        toggleRulesDisplayOptions();
      } else if ((e.key === 'f' || e.key === 'F') && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setIsRulesDisplayOptionsOpen(false);
        if (filterButtonRef.current) {
          setOpenFilterMenu((current) =>
            current ? null : { mode: 'root', anchor: filterButtonRef.current as HTMLElement }
          );
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [openCreateRuleModal, setIsRulesDisplayOptionsOpen, toggleRulesDisplayOptions]);

  useEffect(() => {
    setOpenFilterMenu(null);
  }, [ruleFilterTab]);

  const ruleTabs = [
    { id: 'all', label: 'All rules' },
    { id: 'active', label: 'Active' },
    { id: 'paused', label: 'Paused' },
  ];

  const detailsTabs: DetailsFacetTab[] = createRuleFacets(baseRules, ruleLabels).map((facet) => ({
    ...facet,
    options: facet.options.map((option) => ({ ...option, icon: ruleFacetIcon(facet.id, option.value, ruleLabels) })),
  }));
  const details = rulesLoadState === 'ready' && rules.length > 0 ? (
    <DetailsFacets
      tabs={detailsTabs}
      selection={quick}
      onSelect={setQuick}
      storageKey="buyerly:details-tab:rules"
      noun="rules"
    />
  ) : null;

  return (
    <div className="flex h-full w-full select-none flex-col overflow-hidden bg-transparent">
      {/* 1. Exact Linear 2-Tier Header Stack (87px total) */}
      <header className="flex shrink-0 flex-col w-full bg-transparent">
        {/* Tier 1: Title Bar (Height: 44px, Border-Bottom: 1px solid var(--color-border-primary)) */}
        <div
          style={{
            height: '44px',
            borderBottom: '1px solid var(--color-border-primary)',
            boxSizing: 'border-box',
            paddingLeft: '14px',
          }}
          className="flex items-center justify-between pr-2.5"
        >
          {/* Left: Clean Title */}
          <div className="flex items-center">
            <SidebarCollapsedNavigation />
            <h2
              style={{
                fontSize: '13px',
                fontWeight: 500,
                lineHeight: '16px',
                letterSpacing: '-0.01em',
                color: 'var(--text-secondary)',
                margin: 0,
                padding: 0,
              }}
            >
              Rules
            </h2>
          </div>

          {/* Always shown, at every width: the "+" on group headers needs a pointer over them.
              Like Linear's "New project": the label shows above 1024px, below it only the "+". */}
          <HeaderCreateButton
            label="New rule"
            tooltip="Create new rule"
            shortcut="C"
            onClick={() => openCreateRuleModal()}
          />
        </div>

        {/* Tier 2: View Filter Tabs & Action Buttons (Height: 43px, NO border bottom) */}
        <LinearDataListToolbar className="gap-2">
          {/* Left: Capsule Tabs; when they no longer fit they fold into one menu, as in Linear. */}
          <LinearTabs
            collapseOverflow
            tabs={ruleTabs}
            activeTabId={ruleFilterTab}
            onChange={(id) => setRuleFilterTab(id as RuleFilterTab)}
          />

          {/* Right: Add filter + Display options + Toggle Sidebar */}
          <div className="flex shrink-0 items-center gap-1.5">
            {/* Add Filter Button with Popover */}
            <div className="relative">
              <Tooltip content="Add Filter" shortcut="F" disabled={Boolean(openFilterMenu)}>
                <LinearFilterButton
                  ref={filterButtonRef}
                  active={rulesFilterClauses.length > 0}
                  open={Boolean(openFilterMenu)}
                  onMouseDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    const anchor = event.currentTarget;
                    setIsRulesDisplayOptionsOpen(false);
                    setOpenFilterMenu((current) =>
                      current ? null : { mode: 'root', anchor }
                    );
                  }}
                />
              </Tooltip>
            </div>

            {/* Display Options Button with Popover */}
            <div className="relative">
              <Tooltip content="Show display options" shortcut="Shift V" disabled={isRulesDisplayOptionsOpen}>
                <button
                  ref={displayOptionsButtonRef}
                  type="button"
                  aria-label="Display options"
                  data-active={isRulesDisplayOptionsOpen ? 'true' : undefined}
                  onMouseDown={(event) => event.stopPropagation()}
                  onClick={() => {
                    setOpenFilterMenu(null);
                    toggleRulesDisplayOptions();
                  }}
                  className={`linear-header-target group relative flex h-[28px] w-[28px] items-center justify-center rounded-full border border-transparent outline-none transition-all ${
                    isRulesDisplayOptionsOpen
                      ? 'bg-[var(--item-active-bg)] text-[var(--text-primary)]'
                      : 'bg-transparent text-[var(--text-tertiary)] hover:bg-[var(--item-hover-bg)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <LinearSlidersIcon size={14} />
                  <DisplayOptionsChangedDot show={rulesDisplayChanged} />
                </button>
              </Tooltip>

              <RuleDisplayOptionsPopover
                isOpen={isRulesDisplayOptionsOpen}
                onClose={() => setIsRulesDisplayOptionsOpen(false)}
                anchorRef={displayOptionsButtonRef}
              />
            </div>

            <DetailsPaneToggle pane="rules" />
          </div>
        </LinearDataListToolbar>

        <ActiveFilterFormula
          fields={filterFields}
          clauses={rulesFilterClauses}
          onChange={setRulesFilterClauses}
          onOpenMenu={showFilterMenu}
        />
      </header>

      <LinearFilterMenu
        isOpen={Boolean(openFilterMenu)}
        mode={openFilterMenu?.mode ?? 'root'}
        anchorElement={openFilterMenu?.anchor ?? null}
        fieldId={openFilterMenu?.fieldId}
        fields={filterFields}
        clauses={rulesFilterClauses}
        onChange={setRulesFilterClauses}
        onClose={() => setOpenFilterMenu(null)}
        items={rules}
        countNoun={['rule', 'rules']}
      />

      {/* 2. Main Content Area: the list or board, with the details pane on the right */}
      <DetailsPaneLayout pane="rules" label="Rules details" details={details}>
        {rulesLoadState === 'loading' || rulesLoadState === 'idle' ? (
          <DataState
            title="Loading rules…"
            detail="Reading the automation rules saved in this workspace."
          />
        ) : rulesLoadState === 'error' ? (
          <DataState
            title="Couldn't load rules"
            detail={rulesError}
            role="alert"
            actionLabel="Retry"
            onAction={() => void loadRules()}
          />
        ) : rules.length === 0 ? (
          <DataState
            title="No rules yet"
            detail="A rule watches your metrics and acts on its own — pausing an ad set or changing a budget — or only notifies you in Inbox, the safest way to start. Create the first one to get started."
            actionLabel="New rule"
            onAction={() => openCreateRuleModal()}
          />
        ) : hasFilters && filteredRules.length === 0 ? (
          <div className="min-w-0 flex-1 overflow-y-auto">
            <FilteredEmptyState noun="rules" hiddenCount={hiddenCount} onClear={clearFilters} />
          </div>
        ) : rulesViewMode === 'list' ? (
          <div className="relative flex min-w-0 flex-1">
            <RulesListView filteredRules={filteredRules} />
            <SelectionDock count={selection.count} onOpenActions={() => selection.setMenuOpen(true)} onClear={selection.clear} />
          </div>
        ) : (
          /* Linear's Board: the columns are the grouping's groups (#390). */
          <div className="min-w-0 flex-1 overflow-x-auto overflow-y-hidden px-5 py-3">
            <RuleBoard rules={filteredRules} />
          </div>
        )}
      </DetailsPaneLayout>

      <SelectionCommandMenu
        open={selection.menuOpen}
        onOpenChange={selection.setMenuOpen}
        scope={singleSelected
          ? { prefix: singleSelected.identifier, label: singleSelected.name }
          : { label: `${selection.count} ${selection.count === 1 ? 'rule' : 'rules'}` }}
        actions={selectionActions}
        onClearScope={openCommandMenu}
      />

      <ConfirmDialog
        open={Boolean(deletion)}
        title={deletion?.title ?? ''}
        description={deletion?.description ?? ''}
        confirmLabel="Delete"
        onConfirm={() => void runPendingDeletion()}
        onCancel={cancelDeletion}
      />

      <RuleStatesHost />
      <RuleLabelPickerHost />
    </div>
  );
};
