import type { FilterClause } from '@/components/filters/filterModel';
import {
  deleteViewSettings,
  fetchViewSettings,
  saveViewDefault,
  saveViewSettings,
  type StoredView,
  type StoredViews,
} from '@/lib/viewSettings';
import { scopeStore } from './scopeStore';
import { makeStore, useStore } from './store';

export type RuleFilterTab = 'active' | 'paused' | 'all';
export type AdsManagerEntity = 'campaigns' | 'adsets' | 'ads';
export interface AdsManagerQuickFilter {
  entity: AdsManagerEntity;
  sidebarTab: 'groups' | 'rules';
  fieldId: 'group' | 'rule';
  value: string;
}
export type CompletedIssuesFilter = 'all' | 'day' | 'week' | 'month' | 'none';

const NO_FILTERS: Record<AdsManagerEntity, FilterClause[]> = { campaigns: [], adsets: [], ads: [] };

/**
 * How each list is shown: the saved views (#385) and the workspace's defaults
 * (#472), Ads Manager's filters, collapsed groups and Display options.
 */
export class ViewStore {
  /** Each list page's saved view by key, kept per member on the server (#385); a missing key means defaults. */
  viewSettings: StoredViews = {};
  /** False until this workspace's saved views arrive (or fail to). */
  viewSettingsLoaded = false;
  /** The workspace's default view by key (#472): what a member without their own view starts from. */
  viewDefaults: StoredViews = {};
  campaignFilterTab: AdsManagerEntity = 'campaigns';
  adsManagerFilters: Record<AdsManagerEntity, FilterClause[]> = NO_FILTERS;
  adsManagerQuickFilter: AdsManagerQuickFilter | null = null;
  selectedFilterGroupId: string | null = null;
  selectedFilterRuleId: string | null = null;
  selectedFilterPlatform: string | null = null;
  isDisplayOptionsOpen = false;
  orderCompletedByRecency = false;
  showSubIssues = false;
  completedIssuesFilter: CompletedIssuesFilter = 'all';
  collapsedGroups: string[] = [];
  /** Recently deleted is a page of its own (/rules/recently-deleted), not a tab. */
  ruleFilterTab: RuleFilterTab = 'all';
  isRulesDisplayOptionsOpen = false;
  rulesCollapsedGroups: string[] = [];
  /** One save chain for all views, so the last choice for a key is the one that stays. */
  #viewSettingsSave: Promise<unknown> = Promise.resolve();
  readonly #viewSettingsTimers = new Map<string, number>();
  #viewSettingsRequest: Promise<void> | null = null;

  constructor() {
    makeStore(this);
    scopeStore.onWorkspaceChange(() => {
      this.resetAccount();
      this.viewSettings = {};
      this.viewSettingsLoaded = false;
      this.viewDefaults = {};
      this.rulesCollapsedGroups = [];
      this.adsManagerFilters = NO_FILTERS;
      this.isDisplayOptionsOpen = false;
      this.isRulesDisplayOptionsOpen = false;
    });
  }

  /** What Ads Manager forgets when it shows other ad accounts. */
  resetAccount() {
    this.adsManagerQuickFilter = null;
    this.selectedFilterGroupId = null;
    this.selectedFilterRuleId = null;
    this.selectedFilterPlatform = null;
    this.collapsedGroups = [];
  }

  loadViewSettings(): Promise<void> {
    if (this.viewSettingsLoaded) return Promise.resolve();
    if (this.#viewSettingsRequest) return this.#viewSettingsRequest;
    const inScope = scopeStore.captureScope();
    this.#viewSettingsRequest = fetchViewSettings()
      .catch(() => ({ views: {}, defaults: {} }))
      .then(({ views, defaults }) => {
        this.#viewSettingsRequest = null;
        if (inScope()) this.showLoadedViews(views, defaults);
      });
    return this.#viewSettingsRequest;
  }

  /** Saves a page's view, or with null resets it to the page's defaults. */
  setViewSettings(key: string, settings: StoredView | null) {
    const viewSettings = { ...this.viewSettings };
    if (settings) viewSettings[key] = settings;
    else delete viewSettings[key];
    this.viewSettings = viewSettings;
    const inScope = scopeStore.captureScope();
    // Quick toggles in a row make one request; a reset goes out at once.
    window.clearTimeout(this.#viewSettingsTimers.get(key));
    const write = () => {
      this.#viewSettingsTimers.delete(key);
      this.#viewSettingsSave = this.#viewSettingsSave
        .then(() => {
          if (!inScope()) return undefined;
          return settings ? saveViewSettings(key, settings) : deleteViewSettings(key);
        })
        .catch(() => {
          // The view still applies here until the page is reloaded.
        });
    };
    if (settings) this.#viewSettingsTimers.set(key, window.setTimeout(write, 150));
    else write();
  }

  /** Linear's "Set default for everyone"; rejects when the server refuses. */
  async setViewDefault(key: string, settings: StoredView) {
    const inScope = scopeStore.captureScope();
    await saveViewDefault(key, settings);
    if (inScope()) this.showViewDefault(key, settings);
  }

  setCampaignFilterTab(tab: AdsManagerEntity) {
    this.campaignFilterTab = tab;
    this.adsManagerQuickFilter = null;
  }

  setAdsManagerFilters(entity: AdsManagerEntity, clauses: FilterClause[]) {
    this.adsManagerFilters = { ...this.adsManagerFilters, [entity]: clauses };
  }

  clearAdsManagerFilters(entity: AdsManagerEntity) {
    this.adsManagerFilters = { ...this.adsManagerFilters, [entity]: [] };
  }

  setAdsManagerQuickFilter(filter: AdsManagerQuickFilter | null) {
    this.adsManagerQuickFilter = filter;
  }

  clearAdsManagerQuickFilter() {
    this.adsManagerQuickFilter = null;
  }

  setSelectedFilterGroupId(groupId: string | null) {
    this.selectedFilterGroupId = this.selectedFilterGroupId === groupId ? null : groupId;
  }

  setSelectedFilterRuleId(id: string | null) {
    this.selectedFilterRuleId = this.selectedFilterRuleId === id ? null : id;
  }

  setSelectedFilterPlatform(platform: string | null) {
    this.selectedFilterPlatform = this.selectedFilterPlatform === platform ? null : platform;
  }

  setIsDisplayOptionsOpen(open: boolean) {
    this.isDisplayOptionsOpen = open;
  }

  toggleDisplayOptions() {
    this.isDisplayOptionsOpen = !this.isDisplayOptionsOpen;
  }

  setOrderCompletedByRecency(value: boolean) {
    this.orderCompletedByRecency = value;
  }

  setShowSubIssues(show: boolean) {
    this.showSubIssues = show;
  }

  setCompletedIssuesFilter(filter: CompletedIssuesFilter) {
    this.completedIssuesFilter = filter;
  }

  toggleGroupCollapse(groupId: string) {
    this.collapsedGroups = toggled(this.collapsedGroups, groupId);
  }

  setRuleFilterTab(tab: RuleFilterTab) {
    this.ruleFilterTab = tab;
  }

  setIsRulesDisplayOptionsOpen(open: boolean) {
    this.isRulesDisplayOptionsOpen = open;
  }

  toggleRulesDisplayOptions() {
    this.isRulesDisplayOptionsOpen = !this.isRulesDisplayOptionsOpen;
  }

  toggleRulesGroupCollapse(groupId: string) {
    this.rulesCollapsedGroups = toggled(this.rulesCollapsedGroups, groupId);
  }

  private showLoadedViews(views: StoredViews, defaults: StoredViews) {
    // A choice made while this was loading wins over the saved one.
    this.viewSettings = { ...views, ...this.viewSettings };
    this.viewDefaults = { ...defaults, ...this.viewDefaults };
    this.viewSettingsLoaded = true;
  }

  private showViewDefault(key: string, settings: StoredView) {
    const viewDefaults = { ...this.viewDefaults };
    if (Object.keys(settings).length) viewDefaults[key] = settings;
    else delete viewDefaults[key];
    this.viewDefaults = viewDefaults;
  }
}

/** The list with `id` added, or without it when it was there. */
export function toggled(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id];
}

export const viewStore = new ViewStore();

export const useViewStore = <T,>(select: (store: ViewStore) => T): T => useStore(viewStore, select);
