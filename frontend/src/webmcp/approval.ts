import { makeStore, useStore } from '@/models/store';

export type ApprovalOutcome = 'approved' | 'declined' | 'withdrawn';

/** One change an agent asked for, as the person sees it before it happens. */
export interface ApprovalRequest {
  title: string;
  /** What will change, one plain sentence per line. */
  details: string[];
  /** The consequence to weigh before approving. */
  warning?: string;
  approveLabel: string;
  tone: 'primary' | 'danger';
}

export interface PendingApproval extends ApprovalRequest {
  id: number;
  settle: (outcome: ApprovalOutcome) => void;
}

/** Changes agents asked for, in arrival order; the first one is on screen. */
export class ApprovalStore {
  queue: PendingApproval[] = [];

  constructor() {
    makeStore(this);
  }

  enqueue(approval: PendingApproval) {
    this.queue = [...this.queue, approval];
  }

  remove(id: number) {
    this.queue = this.queue.filter((item) => item.id !== id);
  }
}

export const approvalStore = new ApprovalStore();

export const useApprovalQueue = <T,>(select: (store: ApprovalStore) => T): T => useStore(approvalStore, select);

let nextApprovalId = 1;

/**
 * Waits for the person to approve or decline in Buyerly's own dialog. The
 * agent cannot answer for them: no tool argument skips this. Requests queue in
 * arrival order, and a request is withdrawn when any of `signals` aborts —
 * the agent cancelled the call, or the workspace the tool belongs to closed.
 */
export function requestApproval(
  request: ApprovalRequest,
  signals: Array<AbortSignal | undefined>,
): Promise<ApprovalOutcome> {
  const live = signals.filter((signal): signal is AbortSignal => signal !== undefined);
  if (live.some((signal) => signal.aborted)) return Promise.resolve('withdrawn');
  return new Promise((resolve) => {
    const id = nextApprovalId++;
    let settled = false;
    const withdraw = () => settle('withdrawn');
    function settle(outcome: ApprovalOutcome) {
      if (settled) return;
      settled = true;
      for (const signal of live) signal.removeEventListener('abort', withdraw);
      approvalStore.remove(id);
      resolve(outcome);
    }
    for (const signal of live) signal.addEventListener('abort', withdraw, { once: true });
    approvalStore.enqueue({ ...request, id, settle });
  });
}
