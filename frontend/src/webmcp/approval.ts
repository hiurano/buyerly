import { create } from 'zustand';

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

export const useApprovalQueue = create<{ queue: PendingApproval[] }>(() => ({ queue: [] }));

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
      useApprovalQueue.setState((state) => ({ queue: state.queue.filter((item) => item.id !== id) }));
      resolve(outcome);
    }
    for (const signal of live) signal.addEventListener('abort', withdraw, { once: true });
    useApprovalQueue.setState((state) => ({ queue: [...state.queue, { ...request, id, settle }] }));
  });
}
