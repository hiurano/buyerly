import { graphql } from './graphql';
import { transactions } from '@/models/transactions';
import type { Workspace } from './types';

/** Workspace settings, members and invites, through the client API (#509). */

export async function updateWorkspace(id: number, input: Partial<Pick<Workspace, 'name' | 'slug' | 'logo_url'>>): Promise<Workspace> {
  const { workspace } = await graphql<{ workspace: Workspace }>(
    'mutation WorkspaceUpdate($id: Int!, $input: JSON!) { workspaceUpdate(id: $id, input: $input) { success lastSyncId workspace } }',
    { id, input },
  );
  return workspace;
}

export async function deleteWorkspace(id: number): Promise<void> {
  await graphql('mutation WorkspaceDelete($id: Int!) { workspaceDelete(id: $id) { success lastSyncId } }', { id });
}

export async function leaveWorkspace(id: number): Promise<void> {
  await graphql('mutation WorkspaceLeave($id: Int!) { workspaceLeave(id: $id) { success lastSyncId } }', { id });
}

export async function transferWorkspaceOwnership(id: number, newOwnerUserId: number): Promise<void> {
  await graphql(
    'mutation WorkspaceOwnershipTransfer($id: Int!, $input: JSON!) { workspaceOwnershipTransfer(id: $id, input: $input) { success lastSyncId } }',
    { id, input: { new_owner_user_id: newOwnerUserId } },
  );
}

/** A member's role: on Members at once, written as a transaction (#508); the caller says why it failed. */
export async function updateMemberRole<T>(workspaceId: number, userId: number, role: string): Promise<T> {
  const { workspaceMember } = await transactions.commit<{ workspaceMember: T }>({
    label: "Couldn't change the role",
    mutation: `mutation WorkspaceMemberUpdate($workspaceId: Int!, $userId: Int!, $input: JSON!) {
      workspaceMemberUpdate(workspaceId: $workspaceId, userId: $userId, input: $input) { success lastSyncId workspaceMember }
    }`,
    variables: { workspaceId, userId, input: { role } },
    changes: [{ kind: 'update', type: 'member', id: String(userId), data: { role } }],
    quiet: true,
  });
  return workspaceMember;
}

/** Off Members at once; back if the server refuses. */
export async function removeMember(workspaceId: number, userId: number): Promise<void> {
  await transactions.commit({
    label: "Couldn't remove the member",
    mutation: `mutation WorkspaceMemberRemove($workspaceId: Int!, $userId: Int!) {
      workspaceMemberRemove(workspaceId: $workspaceId, userId: $userId) { success lastSyncId }
    }`,
    variables: { workspaceId, userId },
    changes: [{ kind: 'delete', type: 'member', id: String(userId) }],
    quiet: true,
  });
}

export function fetchInvites<T>(workspaceId: number): Promise<T[]> {
  return graphql<T[]>('query WorkspaceInvites($workspaceId: Int!) { workspaceInvites(workspaceId: $workspaceId) }', { workspaceId });
}

export async function createInvite(workspaceId: number, email: string, role: string): Promise<void> {
  await graphql(
    `mutation WorkspaceInviteCreate($workspaceId: Int!, $input: JSON!) {
      workspaceInviteCreate(workspaceId: $workspaceId, input: $input) { success lastSyncId }
    }`,
    { workspaceId, input: { email, role } },
  );
}

export async function resendInvite(workspaceId: number, id: number): Promise<void> {
  await graphql(
    'mutation WorkspaceInviteResend($workspaceId: Int!, $id: Int!) { workspaceInviteResend(workspaceId: $workspaceId, id: $id) { success lastSyncId } }',
    { workspaceId, id },
  );
}

export async function revokeInvite(workspaceId: number, id: number): Promise<void> {
  await graphql(
    'mutation WorkspaceInviteDelete($workspaceId: Int!, $id: Int!) { workspaceInviteDelete(workspaceId: $workspaceId, id: $id) { success lastSyncId } }',
    { workspaceId, id },
  );
}

/** The workspace's invite link (Linear's "Invite links"), null while it is off. */
export interface InviteLink {
  invite_url: string | null;
  /** An admin turned it off; a new workspace's link is on until then. */
  turned_off?: boolean;
}

export function fetchInviteLink(workspaceId: number): Promise<InviteLink> {
  return graphql<InviteLink>('query WorkspaceInviteLink($workspaceId: Int!) { workspaceInviteLink(workspaceId: $workspaceId) }', { workspaceId });
}

/** Turns the link on or off, or replaces it so the old one stops working. */
export async function changeInviteLink(workspaceId: number, change: 'enable' | 'disable' | 'reset'): Promise<InviteLink> {
  const field = { enable: 'workspaceInviteLinkEnable', disable: 'workspaceInviteLinkDisable', reset: 'workspaceInviteLinkReset' }[change];
  const name = field[0].toUpperCase() + field.slice(1);
  const { workspaceInviteLink } = await graphql<{ workspaceInviteLink: InviteLink }>(
    `mutation ${name}($workspaceId: Int!) { ${field}(workspaceId: $workspaceId) { success lastSyncId workspaceInviteLink } }`,
    { workspaceId },
  );
  return workspaceInviteLink;
}

/** Joins the workspace an invite is for, as the signed-in account. */
export async function acceptInvite<T>(token: string): Promise<T> {
  const { workspaceInvite } = await graphql<{ workspaceInvite: T }>(
    'mutation WorkspaceInviteAccept($token: String!) { workspaceInviteAccept(token: $token) { success lastSyncId workspaceInvite } }',
    { token },
  );
  return workspaceInvite;
}
