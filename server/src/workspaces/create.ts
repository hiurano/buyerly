import type { WorkspaceItem } from '@buyerly/shared';
import type { EntityManager } from 'typeorm';
import { rows } from '../database.ts';
import { RouteError, invalidInput } from '../graphql/errors.ts';
import { inputSchema } from '../graphql/input.ts';
import { ImageStorage } from '../uploads/images.ts';
import { createDefaultTeam, joinDefaultTeam } from './default-team.ts';
import { allocateWorkspaceSlug, WorkspaceSlugUnavailable } from './slugs.ts';
import { isUniqueViolation } from './sql.ts';

// A new workspace (api/routers/workspaces.py create_workspace and
// onboarding.py submit_onboarding_workspace share it).

export interface WorkspaceInput {
  name?: string | null;
  slug?: string | null;
  badge_color?: string | null;
  badge_text?: string | null;
  logo_url?: string | null;
}

const text = (maxLength: number, minLength = 0) => ({ type: ['string', 'null'], maxLength, ...(minLength ? { minLength } : {}) });

// api/schemas/workspaces.py CreateWorkspaceRequest (onboarding's is the same).
export const CREATE_WORKSPACE = inputSchema<WorkspaceInput>({
  type: 'object',
  required: ['name'],
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 60 },
    slug: text(60),
    badge_color: text(30),
    badge_text: text(5),
    logo_url: text(500),
  },
});

// UpdateWorkspaceRequest.
export const UPDATE_WORKSPACE = inputSchema<WorkspaceInput>({
  type: 'object',
  properties: {
    name: text(60, 1),
    slug: text(60, 1),
    badge_color: text(30),
    badge_text: text(5),
    logo_url: text(500),
  },
});

// validate_workspace_logo_url_value.
export function workspaceLogoUrl(value: string | null | undefined): string | null | undefined {
  if (value === null || value === undefined) return value;
  const cleaned = value.trim();
  if (!cleaned) return '';
  if (/[<>"'\r\n\t\0]/.test(cleaned)) throw invalidInput(['Value error, logo_url contains invalid characters']);
  if (cleaned.startsWith('//') || cleaned.includes('/../') || cleaned.endsWith('/..')) throw invalidInput(['Value error, Invalid logo_url path']);
  if (cleaned.startsWith('/uploads/workspaces/') || cleaned.startsWith('http://') || cleaned.startsWith('https://')) return cleaned;
  throw invalidInput(['Value error, logo_url must start with https://, http:// or /uploads/workspaces/']);
}

// An uploaded logo may be attached only by whoever uploaded it.
export async function checkLogoOwner(images: ImageStorage, logoUrl: string, userId: number): Promise<void> {
  if (logoUrl.startsWith('/uploads/workspaces/') && !(await images.isOwned(logoUrl, 'workspaces', userId))) {
    throw new RouteError(400, 'Logo not found, or it belongs to another user');
  }
}

// delete_workspace_logo_if_unreferenced, once the change has committed.
export async function dropLogoIfUnreferenced(tx: EntityManager, images: ImageStorage, logoUrl: string): Promise<void> {
  if (!images.localPath(logoUrl, 'workspaces')) return;
  const [reference] = await rows(tx, 'SELECT id FROM workspaces WHERE logo_url = $1 LIMIT 1', [logoUrl]);
  if (!reference) await images.delete(logoUrl, 'workspaces');
}

export interface NewWorkspace {
  name: string;
  requestedSlug: string;
  badgeText: string;
  badgeColor: string;
  logoUrl: string;
}

// The request's fields, cleaned as both handlers clean them.
export async function newWorkspace(req: WorkspaceInput, images: ImageStorage, userId: number): Promise<NewWorkspace> {
  const name = (req.name ?? '').trim();
  if (!name) throw new RouteError(400, 'A workspace name is required');
  const logoUrl = (workspaceLogoUrl(req.logo_url) || '').trim();
  const fields = {
    name,
    requestedSlug: req.slug ? req.slug.trim() : name,
    badgeColor: req.badge_color || '#F5A300',
    // Python's name[:1].upper().
    badgeText: req.badge_text ? req.badge_text.trim() : Array.from(name).slice(0, 1).join('').toUpperCase(),
    logoUrl,
  };
  await checkLogoOwner(images, logoUrl, userId);
  return fields;
}

// The workspace, its owner's membership and default team, in the caller's transaction.
export async function insertWorkspace(tx: EntityManager, fields: NewWorkspace, userId: number): Promise<WorkspaceItem> {
  let slug: string;
  try {
    slug = await allocateWorkspaceSlug(tx, fields.requestedSlug);
  } catch (error) {
    if (error instanceof WorkspaceSlugUnavailable) throw new RouteError(409, error.message);
    throw error;
  }
  let workspace: { id: number };
  try {
    [workspace] = await rows<{ id: number }>(
      tx,
      `INSERT INTO workspaces (name, slug, badge_text, badge_color, logo_url, owner_user_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, now(), now()) RETURNING id`,
      [fields.name, slug, fields.badgeText, fields.badgeColor, fields.logoUrl, userId],
    );
  } catch (error) {
    if (isUniqueViolation(error)) throw new RouteError(409, 'That workspace name is already taken');
    throw error;
  }
  const [member] = await rows<{ id: number }>(
    tx,
    "INSERT INTO workspace_members (workspace_id, user_id, role, joined_at) VALUES ($1, $2, 'owner', now()) RETURNING id",
    [workspace.id, userId],
  );
  // Linear's workspace starts with a team named after it.
  await createDefaultTeam(tx, workspace.id, fields.name, userId);
  await joinDefaultTeam(tx, workspace.id, { memberId: member.id, asOwner: true });
  return {
    id: workspace.id,
    name: fields.name,
    slug,
    badge_text: fields.badgeText,
    badge_color: fields.badgeColor,
    logo_url: fields.logoUrl,
    role: 'owner',
    is_active: true,
    accounts_count: 0,
    members_count: 1,
  };
}
