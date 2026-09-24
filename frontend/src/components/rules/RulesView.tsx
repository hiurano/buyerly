import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pause, Play, Trash2 } from 'lucide-react';
import { useAppStore, type RuleFilterTab } from '@/store/useAppStore';
import { RuleColumn } from './RuleColumn';
import { RulesListView } from './RulesListView';
import { RecentlyDeletedView } from './RecentlyDeletedView';
import { deletionPrompt, runBulkRulesEnabled, runPendingDeletion } from './ruleActions';
import { CreateRuleModal } from './CreateRuleModal';
import { RuleDisplayOptionsPopover } from './RuleDisplayOptionsPopover';
import { RuleRightSidebar } from './RuleRightSidebar';
import {
  ActiveFilterFormula,
  FilteredEmptyState,
  FilterMenuMode,
  LinearFilterButton,
  LinearFilterMenu,
} from '@/components/filters/LinearFilter';
import { createRuleFilterFields } from '@/components/filters/filterCatalogs';
import { applyFilterClauses } from '@/components/filters/filterModel';
import {
  LinearPlusIcon,
  LinearSlidersIcon,
  LinearSidebarToggleIcon,
  LinearSidebarLeftToggleIcon,
} from '@/icons/LinearIcons';
import { LinearTabs } from '@/ui/LinearTabs';
import { DataState } from '@/ui/DataState';
import { LinearDataListToolbar } from '@/ui/LinearDataList';
import { Tooltip } from '@/ui/Tooltip';
import { ConfirmDialog } from '@/ui/ConfirmDialog';
import { toast } from '@/ui/toast';
import { SelectionDock } from '@/ui/SelectionDock';
import { SelectionCommandMenu } from '@/ui/SelectionCommandMenu';
import { useRowSelection, type SelectionAction } from '@/ui/useRowSelection';

interface OpenFilterMenu {
  mode: FilterMenuMode;
  anchor: HTMLElement;
  fieldId?: string;
}

export const RulesView: React.FC = () => {
  const {
    rules,
    ruleGroups,
    ruleFilterTab,
    setRuleFilterTab,
    addRuleGroup,
    openCreateRuleModal,
    rulesViewMode,
    isRulesDisplayOptionsOpen,
    toggleRulesDisplayOptions,
    setIsRulesDisplayOptionsOpen,
    isRulesRightSidebarOpen,
    toggleRulesRightSidebar,
    rulesFilterClauses,
    setRulesFilterClauses,
    isSidebarCollapsed,
    toggleSidebarCollapsed,
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
  } = useAppStore();
  const showingDeleted = ruleFilterTab === 'deleted';

  useEffect(() => {
    void loadRules();
  }, [loadRules]);

  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const displayOptionsButtonRef = useRef<HTMLButtonElement>(null);
  const filterButtonRef = useRef<HTMLButtonElement>(null);
  const [openFilterMenu, setOpenFilterMenu] = useState<OpenFilterMenu | null>(null);

  const filterFields = useMemo(
    () => createRuleFilterFields({ rules, ruleGroups }),
    [ruleGroups, rules]
  );

  const filteredRules = useMemo(() => {
    const matchingFilters = applyFilterClauses(rules, filterFields, rulesFilterClauses);
    return ruleFilterTab === 'all'
      ? matchingFilters
      : matchingFilters.filter((rule) => rule.status === ruleFilterTab);
  }, [filterFields, ruleFilterTab, rules, rulesFilterClauses]);

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
    enabled: rulesLoadState === 'ready' && rulesViewMode === 'list' && !showingDeleted,
  });

  useEffect(() => {
    if (rulesViewMode !== 'list' || showingDeleted) setRuleSelection([]);
  }, [rulesViewMode, setRuleSelection, showingDeleted]);

  const deletion = pendingDeletion ? deletionPrompt(pendingDeletion.kind, pendingDeletion.ids) : null;

  const hasFilters = rulesFilterClauses.length > 0;

  const showFilterMenu = (mode: FilterMenuMode, anchor: HTMLElement, fieldId?: string) => {
    setOpenFilterMenu({ mode, anchor, fieldId });
  };

  // Global hotkeys: 'C' for create rule, 'V' for display options, 'F' for filter, 'Alt+I' for sidebar
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

      if ((e.key === 'c' || e.key === 'C') && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        openCreateRuleModal();
      } else if ((e.key === 'v' || e.key === 'V') && !e.metaKey && !e.ctrlKey && !e.altKey) {
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
      } else if ((e.key === 'i' || e.key === 'I') && e.altKey) {
        e.preventDefault();
        toggleRulesRightSidebar();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [openCreateRuleModal, setIsRulesDisplayOptionsOpen, toggleRulesDisplayOptions, toggleRulesRightSidebar]);

  useEffect(() => {
    setOpenFilterMenu(null);
  }, [ruleFilterTab]);

  const handleCreateGroup = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName.trim()) return;
    void addRuleGroup(newGroupName.trim());
    setNewGroupName('');
    setIsCreatingGroup(false);
  };

  const ruleTabs = [
    { id: 'all', label: 'All rules' },
    { id: 'active', label: 'Active' },
    { id: 'paused', label: 'Paused' },
    { id: 'deleted', label: 'Recently deleted' },
  ];

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
            <div
              style={{
                width: isSidebarCollapsed ? '28px' : '0px',
                opacity: isSidebarCollapsed ? 1 : 0,
                transform: isSidebarCollapsed ? 'scale(1)' : 'scale(0.85)',
                marginRight: isSidebarCollapsed ? '6px' : '0px',
                pointerEvents: isSidebarCollapsed ? 'auto' : 'none',
                overflow: 'hidden',
                transition:
                  'width 0.32s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.22s cubic-bezier(0.16, 1, 0.3, 1), transform 0.22s cubic-bezier(0.16, 1, 0.3, 1), margin-right 0.32s cubic-bezier(0.16, 1, 0.3, 1)',
              }}
              className="flex shrink-0 items-center justify-center"
            >
              <Tooltip content="Open sidebar" shortcut="[" side="bottom" sideOffset={6}>
                <button
                  type="button"
                  onClick={toggleSidebarCollapsed}
                  className="linear-icon-btn"
                  aria-label="Open sidebar"
                >
                  <LinearSidebarLeftToggleIcon size={14} isOpen={false} aria-hidden="true" />
                </button>
              </Tooltip>
            </div>
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
        </div>

        {/* Tier 2: View Filter Tabs & Action Buttons (Height: 43px, NO border bottom) */}
        <LinearDataListToolbar>
          {/* Left: Capsule Tabs */}
          <div className="flex items-center gap-2">
            <LinearTabs
              tabs={ruleTabs}
              activeTabId={ruleFilterTab}
              onChange={(id) => setRuleFilterTab(id as RuleFilterTab)}
            />
          </div>

          {/* Right: Add filter + Display options + Toggle Sidebar */}
          <div className="flex items-center gap-1.5">
            {/* Add Filter Button with Popover */}
            <div className="relative">
              <Tooltip content="Filter" shortcut="F">
                <LinearFilterButton
                  ref={filterButtonRef}
                  active={hasFilters}
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
              <Tooltip content="Display options" shortcut="V">
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
                  className={`group relative flex h-[28px] w-[28px] items-center justify-center rounded-full border border-transparent outline-none transition-all ${
                    isRulesDisplayOptionsOpen
                      ? 'bg-[var(--item-active-bg)] text-[var(--text-primary)]'
                      : 'bg-transparent text-[var(--text-tertiary)] hover:bg-[var(--item-hover-bg)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <LinearSlidersIcon size={14} />
                </button>
              </Tooltip>

              <RuleDisplayOptionsPopover
                isOpen={isRulesDisplayOptionsOpen}
                onClose={() => setIsRulesDisplayOptionsOpen(false)}
                anchorRef={displayOptionsButtonRef}
              />
            </div>

            {/* Toggle Right Details Sidebar */}
            <Tooltip
              content={isRulesRightSidebarOpen ? 'Close details' : 'Open details'}
              shortcut="Alt I"
            >
              <button
                type="button"
                aria-label={isRulesRightSidebarOpen ? 'Close details' : 'Open details'}
                onClick={toggleRulesRightSidebar}
                className={`group relative flex h-[28px] w-[28px] items-center justify-center rounded-full transition-all border ${
                  isRulesRightSidebarOpen
                    ? 'bg-[var(--item-hover-bg)] border-[var(--color-border-secondary)] text-[var(--text-primary)]'
                    : 'bg-transparent border-transparent text-[var(--text-tertiary)] hover:bg-[var(--item-hover-bg)] hover:text-[var(--text-primary)]'
                }`}
              >
                <LinearSidebarToggleIcon isOpen={isRulesRightSidebarOpen} size={14} />
              </button>
            </Tooltip>
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
      />

      {/* 2. Main Content Area (Split: Left content, Right sidebar) */}
      <div className="flex flex-1 overflow-hidden" style={{ flexDirection: 'row' }}>
        {showingDeleted ? (
          <div className="flex min-w-0 flex-1">
            <RecentlyDeletedView />
          </div>
        ) : rulesLoadState === 'loading' || rulesLoadState === 'idle' ? (
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
            detail="A rule watches one metric and acts on its own — pausing an ad set or changing a budget. Create the first one to get started."
            actionLabel="New rule"
            onAction={() => openCreateRuleModal()}
          />
        ) : hasFilters && filteredRules.length === 0 ? (
          <div className="min-w-0 flex-1 overflow-y-auto">
            <FilteredEmptyState noun="rules" hiddenCount={hiddenCount} onClear={() => setRulesFilterClauses([])} />
          </div>
        ) : rulesViewMode === 'list' ? (
          <div className="relative flex min-w-0 flex-1">
            <RulesListView filteredRules={filteredRules} />
            <SelectionDock count={selection.count} onOpenActions={() => selection.setMenuOpen(true)} onClear={selection.clear} />
          </div>
        ) : (
          /* Left: Linear Board Container (Horizontal Scroll) */
          <div className="min-w-0 flex-1 overflow-x-auto overflow-y-hidden px-5 py-3">
            <div className="flex h-full items-start gap-0 pb-2">
              {/* Column 1: System Master Catalog ("All rules") */}
              <RuleColumn
                id="all"
                title="All rules"
                rules={filteredRules}
                isSystemColumn={true}
              />

              {/* Columns 2..N: Dynamic Rule Groups */}
              {ruleGroups.map((group) => {
                const groupRules = filteredRules.filter((rule) =>
                  group.ruleIds.includes(rule.id)
                );

                return (
                  <RuleColumn
                    key={group.id}
                    id={group.id}
                    title={group.name}
                    rules={groupRules}
                  />
                );
              })}

              {/* Column N+1: "+ New group" Button / Inline Creator */}
              <div className="flex w-[240px] shrink-0 flex-col pt-0.5 pl-2">
                {isCreatingGroup ? (
                  <form onSubmit={handleCreateGroup} className="rounded-[8px] border border-[#5e6ad2] bg-[lch(8.2%_0.8_272_/_1)] p-2.5 shadow-md">
                    <input
                      type="text"
                      autoFocus
                      value={newGroupName}
                      onChange={(e) => setNewGroupName(e.target.value)}
                      placeholder="Group name... (e.g. Scaling v2)"
                      style={{
                        fontSize: '12px',
                        color: '#ffffff',
                      }}
                      className="w-full bg-transparent outline-none placeholder-[#6b7280]"
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') setIsCreatingGroup(false);
                      }}
                    />
                    <div className="mt-2 flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => setIsCreatingGroup(false)}
                        className="rounded px-2 py-0.5 text-[11px] text-[#9ca3af] hover:bg-white/[0.06]"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="rounded bg-[#5e6ad2] px-2.5 py-0.5 text-[11px] font-medium text-white hover:bg-[#6875e5]"
                      >
                        Create
                      </button>
                    </div>
                  </form>
                ) : (
                  <button
                    type="button"
                    onClick={() => setIsCreatingGroup(true)}
                    className="flex h-[36px] items-center gap-1.5 rounded-[6px] px-3 text-[13px] font-medium text-[#8a8f98] transition-colors hover:bg-white/[0.04] hover:text-white outline-none cursor-pointer"
                  >
                    <LinearPlusIcon size={14} />
                    <span>New group</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Right Details Sidebar */}
        <RuleRightSidebar />
      </div>

      <SelectionCommandMenu
        open={selection.menuOpen}
        onOpenChange={selection.setMenuOpen}
        scopeLabel={`${selection.count} ${selection.count === 1 ? 'rule' : 'rules'}`}
        actions={selectionActions}
      />

      <ConfirmDialog
        open={Boolean(deletion)}
        title={deletion?.title ?? ''}
        description={deletion?.description ?? ''}
        confirmLabel="Delete"
        onConfirm={() => void runPendingDeletion()}
        onCancel={cancelDeletion}
      />

      {/* Linear Fast Create Rule Modal */}
      <CreateRuleModal />
    </div>
  );
};
