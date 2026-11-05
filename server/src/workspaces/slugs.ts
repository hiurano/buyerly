import type { EntityManager } from 'typeorm';
import { rows } from '../database.ts';

// Workspace URL slugs (core/workspace_slugs.py, services/workspace_slugs.py):
// the same ASCII slug for the same name on every host, globally unique.

export const MAX_WORKSPACE_SLUG_LENGTH = 60;

// Root segments the server itself serves. Nothing else is reserved.
export const RESERVED_WORKSPACE_SLUGS: ReadonlySet<string> = new Set([
  'about', 'api', 'assets', 'auth', 'changelog', 'connect', 'create-workspace', 'data-deletion', 'docs', 'health',
  'invite', 'login', 'privacy', 'redoc', 'signup', 'static', 'terms', 'uploads',
]);

// 32-bit FNV-1a over the UTF-8 bytes, as eight hex digits.
function fallbackHash(value: string): string {
  let hash = 0x811c9dc5;
  for (const byte of Buffer.from(value, 'utf8')) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

export function normalizeWorkspaceSlug(value: string | null | undefined): string {
  const normalized = (value ?? '').normalize('NFKC').trim().toLowerCase();
  // NFKD, then only the ASCII left: "Crème" → "creme"; Cyrillic drops out.
  const ascii = normalized.normalize('NFKD').replace(/[\u0080-￿]/g, '');
  let slug = ascii.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  slug = slug.slice(0, MAX_WORKSPACE_SLUG_LENGTH).replace(/-+$/, '');
  if (slug) return slug;
  if (normalized) return `workspace-${fallbackHash(normalized)}`;
  return 'workspace';
}

export class WorkspaceSlugUnavailable extends Error {}

// The requested slug, normalized, when it is free. The advisory lock makes
// two allocations of one slug serial until the transaction ends.
export async function allocateWorkspaceSlug(tx: EntityManager, value: string): Promise<string> {
  const base = normalizeWorkspaceSlug(value);
  if (RESERVED_WORKSPACE_SLUGS.has(base)) throw new WorkspaceSlugUnavailable('That workspace address is unavailable');
  await rows(tx, 'SELECT pg_advisory_xact_lock(hashtext($1))', [`buyerly-workspace-slug:${base}`]);
  const taken = await rows(tx, 'SELECT id FROM workspaces WHERE slug = $1', [base]);
  if (!taken.length) return base;
  throw new WorkspaceSlugUnavailable('That workspace name is already taken');
}
