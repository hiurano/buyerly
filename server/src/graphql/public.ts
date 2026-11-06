import { requestedRootFields } from './routing.ts';

// The fields a browser asks for before anyone has signed in (decision 55):
// signing in and the invite page. A request whose every root field is one of
// these runs without a session, CSRF token or workspace; any other field in
// it makes the whole request need them. The Python API keeps the same list
// (api/client_api/__init__.py PUBLIC_FIELDS). Only JSON bodies get here, so a
// cross-site form cannot sign a browser in.
export const PUBLIC_FIELDS = new Set([
  'availableUsers',
  'workspaceInviteDetails',
  'emailUserAccountAuthChallenge',
  'emailTokenUserAccountAuth',
  'emailLinkUserAccountAuth',
]);

export function isPublicRequest(body: unknown): boolean {
  const fields = requestedRootFields(body);
  if (!fields || fields.size === 0) return false;
  for (const field of fields) {
    if (field !== '__typename' && !PUBLIC_FIELDS.has(field)) return false;
  }
  return true;
}
