import { applyRulesEnabled, useAppStore } from '@/store/useAppStore';
import { ApiError } from '@/lib/api';
import {
  describeRestoreGaps,
  restoreDeletedItem,
  TRASH_RETENTION_DAYS,
  type DeletedItem,
  type DeletedKind,
} from '@/lib/trash';
import { pushHistory } from '@/lib/undoHistory';
import { toast } from '@/ui/toast';

/*
 * Rule actions follow Linear: a change shows on the row and says nothing, a
 * deletion is confirmed first and reported after, and every change can be
 * taken back with Ctrl+Z. Only failures raise a toast on their own.
 */

const NOUNS: Record<DeletedKind, { singular: string; plural: string }> = {
  rule: { singular: 'rule', plural: 'rules' },
  rule_group: { singular: 'group', plural: 'groups' },
};

function errorMessage(error: unknown): string {
  if (error instanceof ApiError || error instanceof Error) return error.message;
  return 'Could not reach the server. Please try again.';
}

function countOf(kind: DeletedKind, count: number): string {
  return `${count} ${count === 1 ? NOUNS[kind].singular : NOUNS[kind].plural}`;
}

function nameOf(kind: DeletedKind, id: string): string {
  const state = useAppStore.getState();
  const source = kind === 'rule' ? state.rules : state.ruleGroups;
  return source.find((item) => item.id === id)?.name ?? NOUNS[kind].singular;
}

/** The confirmation Linear shows before a deletion, worded for these items. */
export function deletionPrompt(kind: DeletedKind, ids: string[]): { title: string; description: string } {
  const title = ids.length === 1
    ? `Delete ${NOUNS[kind].singular} "${nameOf(kind, ids[0])}"?`
    : `Delete ${countOf(kind, ids.length)}?`;
  const kept = kind === 'rule'
    ? 'They stop running on every ad account now.'
    : 'Their rules are kept and keep running.';
  return {
    title,
    description: `${kept} Deleted ${NOUNS[kind].plural} are available in Recently deleted for ${TRASH_RETENTION_DAYS} days, before they are permanently deleted.`,
  };
}

async function deleteOne(kind: DeletedKind, id: string): Promise<number> {
  const state = useAppStore.getState();
  return kind === 'rule' ? state.deleteRule(id) : state.deleteRuleGroup(id);
}

/** Deletes each item; reports which went to Recently deleted and which failed. */
async function deleteMany(kind: DeletedKind, ids: string[]) {
  const deleted: { id: string; itemId: number }[] = [];
  const failed: { id: string; error: string }[] = [];
  for (const id of ids) {
    try {
      deleted.push({ id, itemId: await deleteOne(kind, id) });
    } catch (error) {
      failed.push({ id, error: errorMessage(error) });
    }
  }
  await useAppStore.getState().loadRules();
  return { deleted, failed };
}

async function restoreMany(itemIds: number[]): Promise<void> {
  let failure = '';
  for (const itemId of itemIds) {
    try {
      await restoreDeletedItem(itemId);
    } catch (error) {
      failure ||= errorMessage(error);
    }
  }
  await useAppStore.getState().loadRules();
  if (failure) throw new Error(failure);
}

/**
 * Runs the confirmed deletion: the selection is cleared, a toast says where
 * the items went, and Ctrl+Z restores them. Redo deletes again without asking,
 * as Linear does.
 */
export async function runPendingDeletion(): Promise<void> {
  const pending = useAppStore.getState().pendingDeletion;
  if (!pending) return;
  const { kind, ids } = pending;
  const label = ids.length === 1 ? `delete ${nameOf(kind, ids[0])}` : `delete ${countOf(kind, ids.length)}`;
  const deletedName = ids.length === 1 ? nameOf(kind, ids[0]) : '';

  useAppStore.getState().cancelDeletion();
  if (kind === 'rule') useAppStore.getState().setRuleSelection([]);
  const inScope = useAppStore.getState().captureScope();
  const { deleted, failed } = await deleteMany(kind, ids);
  // Finished after the workspace was left: its history and toasts went with it.
  if (!inScope()) return;

  if (deleted.length > 0) {
    let itemIds = deleted.map((entry) => entry.itemId);
    const entityIds = deleted.map((entry) => entry.id);
    pushHistory({
      label,
      undo: () => restoreMany(itemIds),
      redo: async () => {
        const again = await deleteMany(kind, entityIds);
        itemIds = again.deleted.map((entry) => entry.itemId);
        if (again.failed.length > 0) throw new Error(again.failed[0].error);
      },
    });
  }

  if (failed.length > 0) {
    toast.show({
      tone: 'error',
      title: deleted.length > 0
        ? `Deleted ${deleted.length} of ${countOf(kind, ids.length)}`
        : `Couldn't delete ${ids.length === 1 ? deletedName || NOUNS[kind].singular : countOf(kind, ids.length)}`,
      description: failed[0].error,
    });
    return;
  }
  toast.show({
    tone: 'success',
    title: ids.length === 1 ? 'Deleted' : `Deleted ${countOf(kind, ids.length)}`,
    message: ids.length === 1 ? deletedName : undefined,
    description: `You can restore deleted ${NOUNS[kind].plural} from Recently deleted.`,
    action: {
      label: 'View recently deleted',
      onClick: () => useAppStore.getState().setRuleFilterTab('deleted'),
    },
  });
}

/**
 * Bulk pause or resume. Rules that did change stay changed and can be taken
 * back together; anything that did not is the only thing reported.
 */
export async function runBulkRulesEnabled(ids: string[], enabled: boolean): Promise<void> {
  const inScope = useAppStore.getState().captureScope();
  const outcome = await useAppStore.getState().setRulesEnabled(ids, enabled);
  if (!inScope()) return;
  if (outcome.changed.length > 0) {
    const changed = outcome.changed;
    pushHistory({
      label: `${enabled ? 'resume' : 'pause'} ${changed.length === 1 ? nameOf('rule', changed[0]) : countOf('rule', changed.length)}`,
      undo: () => applyRulesEnabled(changed, !enabled),
      redo: () => applyRulesEnabled(changed, enabled),
    });
  }
  const done = outcome.changed.length + outcome.unchanged.length;
  if (outcome.failed.length === 0 && outcome.skipped.length === 0) return;
  const parts: string[] = [];
  if (outcome.failed.length > 0) parts.push(`${outcome.failed.length} failed: ${outcome.failed[0].error}`);
  if (outcome.skipped.length > 0) {
    parts.push(`${outcome.skipped.length} skipped: re-save ${outcome.skipped.length === 1 ? 'it' : 'them'} before switching on.`);
  }
  toast.show({
    tone: 'error',
    title: `${enabled ? 'Resumed' : 'Paused'} ${done} of ${countOf('rule', ids.length)}`,
    description: parts.join(' '),
  });
}

/**
 * Restores one item from Recently deleted. It simply leaves the list; a toast
 * appears only when part of it could not come back.
 */
export async function restoreFromTrash(item: DeletedItem): Promise<boolean> {
  const inScope = useAppStore.getState().captureScope();
  try {
    const result = await restoreDeletedItem(item.id);
    if (!inScope()) return true;
    await useAppStore.getState().loadRules();
    const kind = item.kind;
    const entityId = String(result.entity_id);
    let itemId = item.id;
    pushHistory({
      label: `restore ${item.name}`,
      undo: async () => {
        itemId = await deleteOne(kind, entityId);
        await useAppStore.getState().loadRules();
      },
      redo: () => restoreMany([itemId]),
    });
    const gaps = describeRestoreGaps(result);
    if (gaps) toast.show({ tone: 'success', title: 'Restored', message: item.name, description: gaps });
    return true;
  } catch (error) {
    if (!inScope()) return false;
    toast.show({ tone: 'error', title: "Couldn't restore", message: item.name, description: errorMessage(error) });
    return false;
  }
}
