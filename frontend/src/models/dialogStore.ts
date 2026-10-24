import type { RuleScope } from '@/lib/rules';
import type { DeletedKind } from '@/lib/trash';
import { scopeStore } from './scopeStore';
import { makeStore, useStore } from './store';

/** Where a new rule starts out running (#387). */
export interface CreateRulePrefill {
  accountId: string;
  scope: RuleScope;
}

/** The dialogs any page can open: the rule editor, a rule's states, the label picker and delete confirmation. */
export class DialogStore {
  isCreateRuleModalOpen = false;
  /** The label a new rule starts with: the "+" of a label's group. */
  createRuleTargetLabelId: string | undefined = undefined;
  /**
   * Where a new rule starts out running: the campaigns or ad sets selected in
   * Ads Manager when it was opened from "Apply rule…" (#387).
   */
  createRulePrefill: CreateRulePrefill | undefined = undefined;
  /** Rule being edited in the shared modal; null while creating a new one. */
  editingRuleId: string | null = null;
  /** Rule whose status on campaigns, ad sets or ads is open (#322). */
  ruleStatesRuleId: string | null = null;
  /** The label picker on Rules: for these rules, under this box (null: near the top). */
  ruleLabelPicker: { ruleIds: string[]; anchorRect: DOMRect | null } | null = null;
  /** Rules or a label waiting on the delete confirmation. */
  pendingDeletion: { kind: DeletedKind; ids: string[] } | null = null;

  constructor() {
    makeStore(this);
    scopeStore.onWorkspaceChange(() => {
      this.closeCreateRuleModal();
      this.ruleStatesRuleId = null;
      this.ruleLabelPicker = null;
      this.pendingDeletion = null;
    });
  }

  openCreateRuleModal(labelId?: string, prefill?: CreateRulePrefill) {
    this.isCreateRuleModalOpen = true;
    this.createRuleTargetLabelId = labelId;
    this.createRulePrefill = prefill;
    this.editingRuleId = null;
  }

  openEditRuleModal(ruleId: string) {
    this.isCreateRuleModalOpen = true;
    this.createRuleTargetLabelId = undefined;
    this.createRulePrefill = undefined;
    this.editingRuleId = ruleId;
  }

  closeCreateRuleModal() {
    this.isCreateRuleModalOpen = false;
    this.createRuleTargetLabelId = undefined;
    this.createRulePrefill = undefined;
    this.editingRuleId = null;
  }

  openRuleStates(ruleId: string | null) {
    this.ruleStatesRuleId = ruleId;
  }

  openRuleLabelPicker(ruleIds: string[], anchorRect: DOMRect | null) {
    if (ruleIds.length > 0) this.ruleLabelPicker = { ruleIds, anchorRect };
  }

  closeRuleLabelPicker() {
    this.ruleLabelPicker = null;
  }

  requestDeletion(kind: DeletedKind, ids: string[]) {
    if (ids.length > 0) this.pendingDeletion = { kind, ids };
  }

  cancelDeletion() {
    this.pendingDeletion = null;
  }
}

export const dialogStore = new DialogStore();

export const useDialogStore = <T,>(select: (store: DialogStore) => T): T => useStore(dialogStore, select);
