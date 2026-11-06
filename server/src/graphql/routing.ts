import { Kind, OperationTypeNode, parse, type DocumentNode, type FragmentDefinitionNode, type SelectionSetNode } from 'graphql';
import { MAX_TOKENS } from './limits.ts';

// Which server answers a client API request while the areas move (#611,
// decision 55). /api/graphql is one path, so the Python API forwards all of
// it here; this server answers a document whose every root field it serves,
// and passes anything else on to the Python API unchanged (forward.ts):
// fields not moved yet, introspection (the Python schema is the whole one),
// documents that do not parse, other methods. Once every area has moved the
// forwarding goes away.

export interface ServedFields {
  query: Set<string>;
  mutation: Set<string>;
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

// Whether this server answers the request body; false sends it to Python.
export function servedHere(body: unknown, served: ServedFields): boolean {
  const document = documentOf(body);
  if (!document) return false;
  const fragments = new Map<string, FragmentDefinitionNode>();
  for (const definition of document.definitions) {
    if (definition.kind === Kind.FRAGMENT_DEFINITION) fragments.set(definition.name.value, definition);
  }
  let operations = 0;
  for (const definition of document.definitions) {
    if (definition.kind !== Kind.OPERATION_DEFINITION) continue;
    operations += 1;
    // Validation covers the whole document, so every operation in it must be ours.
    const fields = new Set<string>();
    rootFields(definition.selectionSet, fragments, fields);
    const own = definition.operation === OperationTypeNode.QUERY ? served.query : definition.operation === OperationTypeNode.MUTATION ? served.mutation : null;
    if (!own) return false;
    for (const field of fields) {
      if (field !== '__typename' && !own.has(field)) return false;
    }
  }
  return operations > 0;
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
