import React, { createContext, useContext } from 'react';
import type { SessionUser, Workspace } from '@/lib/types';
import type { BrowserAccount } from '@/lib/accounts';

/** The signed-in account and the workspace open at the current address. */
export interface WorkspaceSession {
  user: SessionUser;
  workspace: Workspace;
  /** Every account logged in to this browser, in the order they were added. */
  accounts: BrowserAccount[];
  /**
   * Opens a workspace at its home page, as Linear does. With another account's
   * id it opens that account's workspace without logging in again.
   */
  switchWorkspace: (slug: string, accountId?: number) => void;
  /** Linear's "Create or join a workspace…". */
  openCreateWorkspace: () => void;
  /** Linear's "Add an account…": logs in to one more account, keeping this one. */
  openAddAccount: () => void;
}

const WorkspaceSessionContext = createContext<WorkspaceSession | null>(null);

export const WorkspaceSessionProvider: React.FC<React.PropsWithChildren<{ value: WorkspaceSession }>> = ({
  value,
  children,
}) => <WorkspaceSessionContext.Provider value={value}>{children}</WorkspaceSessionContext.Provider>;

export function useWorkspaceSession(): WorkspaceSession {
  const session = useContext(WorkspaceSessionContext);
  if (!session) throw new Error('useWorkspaceSession needs a WorkspaceSessionProvider');
  return session;
}
