import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './DropdownMenu';

export interface DetailsFacetOption {
  value: string;
  label: string;
  count: number;
  icon?: React.ReactNode;
}

export interface DetailsFacetTab {
  id: string;
  label: string;
  options: DetailsFacetOption[];
}

/** One quick filter: a value of one tab's field, on top of the view's filters. */
export interface DetailsFacetSelection {
  fieldId: string;
  value: string;
}

interface DetailsFacetsProps {
  tabs: DetailsFacetTab[];
  selection: DetailsFacetSelection | null;
  onSelect: (selection: DetailsFacetSelection | null) => void;
  /** Where the last open tab is kept for this browser tab. */
  storageKey: string;
  /** The listed things, plural: a row's hover link reads "See {noun}". */
  noun: string;
}

function readTab(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function saveTab(key: string, tab: string) {
  try {
    window.sessionStorage.setItem(key, tab);
  } catch { /* Storage is optional. */ }
}

/**
 * Linear's quick-filter section in a details pane (`QuickFilterTabs`, read
 * 2026-10-09): pill tabs over rows of values with their counts, in one card.
 * - it opens on the tab whose filter is set, else the tab last open here,
 *   else the first; switching tabs clears the filter the old tab set;
 * - when the tabs no longer fit the pane they fold into one select;
 * - a row filters the view to its value; hovering shows "See …", and the
 *   chosen row says "Clear filter" while the others fade.
 */
export function DetailsFacets({ tabs, selection, onSelect, storageKey, noun }: DetailsFacetsProps) {
  const ids = tabs.map((tab) => tab.id);
  const [activeTab, setActiveTab] = useState(() => {
    if (selection && ids.includes(selection.fieldId)) return selection.fieldId;
    const saved = readTab(storageKey);
    return saved && ids.includes(saved) ? saved : ids[0] ?? '';
  });
  const current = tabs.find((tab) => tab.id === activeTab) ?? tabs[0];

  // A filter set elsewhere shows its tab; a tab that went away gives way to the first.
  const tabKey = ids.join('\n');
  useEffect(() => {
    const available = tabKey.split('\n');
    if (selection && available.includes(selection.fieldId) && selection.fieldId !== activeTab) setActiveTab(selection.fieldId);
    else if (!available.includes(activeTab) && available[0]) setActiveTab(available[0]);
  }, [activeTab, tabKey, selection]);

  const changeTab = (id: string) => {
    if (id === current?.id) return;
    if (selection && selection.fieldId === current?.id) onSelect(null);
    saveTab(storageKey, id);
    setActiveTab(id);
  };

  // The tabs keep their natural width; when that is more than the pane has, a select takes their place.
  const listRef = useRef<HTMLDivElement>(null);
  const tabsRef = useRef<HTMLDivElement>(null);
  const [folded, setFolded] = useState(false);
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return undefined;
    const measure = () => setFolded(list.scrollWidth > list.clientWidth + 0.5);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    return () => observer.disconnect();
  }, [tabKey]);
  // Folded tabs stay laid out for measuring, but out of reach.
  useLayoutEffect(() => {
    tabsRef.current?.toggleAttribute('inert', folded);
  }, [folded]);

  const tabKeyDown = (event: React.KeyboardEvent, index: number) => {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = tabs[(index + step + tabs.length) % tabs.length];
    if (!next) return;
    changeTab(next.id);
    listRef.current?.querySelector<HTMLElement>(`[data-tab-id="${CSS.escape(next.id)}"]`)?.focus();
  };

  const digits = Math.max(1, ...(current?.options ?? []).map((option) => String(option.count).length));
  const chosen = selection && selection.fieldId === current?.id ? selection.value : null;

  return (
    <section className="details-facets" aria-label={current ? `${current.label} quick filters` : 'Quick filters'}>
      <div ref={tabsRef} className="details-facets-tabs" data-folded={folded ? 'true' : undefined} aria-hidden={folded || undefined}>
        <div ref={listRef} role="tablist" aria-label="Quick filter categories" className="details-facets-tablist">
          {tabs.map((tab, index) => {
            const active = tab.id === current?.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                data-tab-id={tab.id}
                aria-selected={active}
                tabIndex={active ? 0 : -1}
                className="details-facets-tab"
                onClick={() => changeTab(tab.id)}
                onKeyDown={(event) => tabKeyDown(event, index)}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>
      {folded && current && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="details-facets-select">
              <span className="truncate">{current.label}</span>
              <svg width="8" height="8" viewBox="0 0 12 8" fill="currentColor" aria-hidden="true">
                <path d="M10.16.31 6 4.48 1.83.31A1.07 1.07 0 0 0 .31 1.83l4.93 4.93c.42.42 1.1.42 1.52 0l4.93-4.93A1.07 1.07 0 0 0 10.16.31Z" />
              </svg>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" aria-label="Quick filter categories">
            {tabs.map((tab) => (
              <DropdownMenuItem key={tab.id} onSelect={() => changeTab(tab.id)}>
                <span className={tab.id === current.id ? 'text-[var(--text-primary)]' : undefined}>{tab.label}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {current && (
        <div
          role="tabpanel"
          aria-label={current.label}
          className="details-facets-rows"
          style={{ '--details-facets-count-width': `${digits}ch` } as React.CSSProperties}
        >
          {current.options.length ? current.options.map((option) => {
            const active = chosen === option.value;
            const status = chosen === null ? 'default' : active ? 'active' : 'muted';
            const toggle = () => onSelect(active ? null : { fieldId: current.id, value: option.value });
            return (
              <div
                key={option.value}
                role="button"
                tabIndex={0}
                aria-pressed={active}
                data-status={status}
                className="details-facets-row"
                onClick={(event) => {
                  toggle();
                  event.currentTarget.blur();
                }}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' && event.key !== ' ') return;
                  event.preventDefault();
                  toggle();
                }}
              >
                <div className="details-facets-row-content">
                  {option.icon && <span className="details-facets-row-icon">{option.icon}</span>}
                  <span className="details-facets-row-name" title={option.label}>{option.label}</span>
                  <span className="details-facets-row-link" aria-hidden="true">{active ? 'Clear filter' : `See ${noun}`}</span>
                </div>
                <span className="details-facets-row-count">{option.count}</span>
              </div>
            );
          }) : <p className="details-facets-empty">No matching {noun}</p>}
        </div>
      )}
    </section>
  );
}
