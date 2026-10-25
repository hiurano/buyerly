import { scopeStore } from './scopeStore';
import { makeStore, useStore } from './store';
import { toggled } from './viewStore';

/** The rows picked and focused in Ads Manager and Rules. */
export class SelectionStore {
  selectedCampaignIds: string[] = [];
  focusedCampaignId = '';
  selectedRuleIds: string[] = [];
  focusedRuleId: string | null = null;
  selectedRuleId: string | null = null;

  constructor() {
    makeStore(this);
    scopeStore.onWorkspaceChange(() => {
      this.resetAccount();
      this.selectedRuleIds = [];
      this.focusedRuleId = null;
      this.selectedRuleId = null;
    });
  }

  /** What Ads Manager forgets when it shows other ad accounts. */
  resetAccount() {
    this.selectedCampaignIds = [];
    this.focusedCampaignId = '';
  }

  toggleCampaignSelection(id: string) {
    this.selectedCampaignIds = toggled(this.selectedCampaignIds, id);
  }

  clearCampaignSelection() {
    this.selectedCampaignIds = [];
  }

  setCampaignSelection(ids: string[]) {
    this.selectedCampaignIds = ids;
  }

  setFocusedCampaignId(id: string) {
    this.focusedCampaignId = id;
  }

  toggleRuleSelection(id: string) {
    this.selectedRuleIds = toggled(this.selectedRuleIds, id);
  }

  clearRuleSelection() {
    this.selectedRuleIds = [];
  }

  setRuleSelection(ids: string[]) {
    this.selectedRuleIds = ids;
  }

  setFocusedRuleId(id: string | null) {
    this.focusedRuleId = id;
  }

  setSelectedRuleId(id: string | null) {
    this.selectedRuleId = id;
  }

  /** A deleted rule leaves the selection. */
  forgetRule(id: string) {
    if (this.selectedRuleId === id) this.selectedRuleId = null;
    this.selectedRuleIds = this.selectedRuleIds.filter((item) => item !== id);
  }
}

export const selectionStore = new SelectionStore();

export const useSelectionStore = <T,>(select: (store: SelectionStore) => T): T => useStore(selectionStore, select);
