import React, { createContext, useContext } from 'react';
import type { SessionUser, Workspace } from '@/lib/types';

/** The signed-in account and the workspace open at the current address. */
export interface WorkspaceSession {
  user: SessionUser;
  workspace: Workspace;
  /** Opens another workspace of this account at its home page, as Linear does. */
  switchWorkspace: (slug: string) => void;
  /** Linear's "Create or join a workspace…". */
  openCreateWorkspace: () => void;
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
