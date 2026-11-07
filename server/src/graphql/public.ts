import { Kind, parse, type DocumentNode, type FragmentDefinitionNode, type SelectionSetNode } from 'graphql';
import { MAX_TOKENS } from './limits.ts';

// The fields a browser asks for before anyone has signed in (decision 55):
// signing in and the invite page. A request whose every root field is one of
// these runs without a session, CSRF token or workspace; any other field in
// it makes the whole request need them. Only JSON bodies get here, so a
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

// The root fields a selection set asks for, through fragments.
function rootFields(
  selectionSet: SelectionSetNode,
  fragments: Map<string, FragmentDefinitionNode>,
  into: Set<string>,
  visited: Set<string> = new Set(),
): void {
  for (const selection of selectionSet.selections) {
    if (selection.kind === Kind.FIELD) {
      into.add(selection.name.value);
    } else if (selection.kind === Kind.INLINE_FRAGMENT) {
      rootFields(selection.selectionSet, fragments, into, visited);
    } else {
      const name = selection.name.value;
      const fragment = fragments.get(name);
      if (!fragment || visited.has(name)) {
        into.add(`...${name}`);
        continue;
      }
      visited.add(name);
      rootFields(fragment.selectionSet, fragments, into, visited);
    }
  }
}

function documentOf(body: unknown): DocumentNode | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const query = (body as { query?: unknown }).query;
  if (typeof query !== 'string') return null;
  try {
    return parse(query, { maxTokens: MAX_TOKENS });
  } catch {
    return null;
  }
}

// Every root field of every operation in the request body (fragments
// followed), or null when it does not parse.
export function requestedRootFields(body: unknown): Set<string> | null {
  const document = documentOf(body);
  if (!document) return null;
  const fragments = new Map<string, FragmentDefinitionNode>();
  for (const definition of document.definitions) {
    if (definition.kind === Kind.FRAGMENT_DEFINITION) fragments.set(definition.name.value, definition);
  }
  const fields = new Set<string>();
  for (const definition of document.definitions) {
    if (definition.kind === Kind.OPERATION_DEFINITION) rootFields(definition.selectionSet, fragments, fields);
  }
  return fields;
}
