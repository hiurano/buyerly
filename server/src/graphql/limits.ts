import {
  GraphQLError,
  Kind,
  type ASTNode,
  type DocumentNode,
  type FragmentDefinitionNode,
  type SelectionSetNode,
  type ValidationContext,
  type ValidationRule,
} from 'graphql';

// The Python client API's document limits (api/client_api: strawberry's
// QueryDepthLimiter(4), MaxAliasesLimiter(10), MaxTokensLimiter(2000)) with
// their messages. Records are JSON, so no document needs to go deep, and
// aliases would repeat a field's work.

export const MAX_DEPTH = 4;
export const MAX_ALIASES = 10;
export const MAX_TOKENS = 2000;

function fragmentsOf(document: DocumentNode): Map<string, FragmentDefinitionNode> {
  const fragments = new Map<string, FragmentDefinitionNode>();
  for (const definition of document.definitions) {
    if (definition.kind === Kind.FRAGMENT_DEFINITION) fragments.set(definition.name.value, definition);
  }
  return fragments;
}

function aliases(selectionSet: SelectionSetNode | undefined, fragments: Map<string, FragmentDefinitionNode>, visited: Set<string>): number {
  let count = 0;
  for (const selection of selectionSet?.selections ?? []) {
    if (selection.kind === Kind.FIELD) {
      if (selection.alias) count += 1;
      count += aliases(selection.selectionSet, fragments, visited);
    } else if (selection.kind === Kind.INLINE_FRAGMENT) {
      count += aliases(selection.selectionSet, fragments, visited);
    } else {
      const name = selection.name.value;
      const fragment = fragments.get(name);
      if (fragment && !visited.has(name)) count += aliases(fragment.selectionSet, fragments, new Set([...visited, name]));
    }
  }
  return count;
}

export const maxAliases: ValidationRule = (context: ValidationContext) => {
  const document = context.getDocument();
  const fragments = fragmentsOf(document);
  let total = 0;
  for (const definition of document.definitions) {
    if (definition.kind === Kind.OPERATION_DEFINITION) total += aliases(definition.selectionSet, fragments, new Set());
  }
  if (total > MAX_ALIASES) context.reportError(new GraphQLError(`${total} aliases found. Allowed: ${MAX_ALIASES}`));
  return {};
};

// strawberry's determine_depth: a field with a selection set is one level,
// introspection fields are not counted, fragments are followed once.
function depth(
  node: SelectionSetNode['selections'][number] | FragmentDefinitionNode,
  fragments: Map<string, FragmentDefinitionNode>,
  soFar: number,
  report: (node: ASTNode) => void,
  visited: Set<string>,
): number {
  if (soFar > MAX_DEPTH) {
    report(node);
    return soFar;
  }
  if (node.kind === Kind.FIELD) {
    if (node.name.value.startsWith('__') || !node.selectionSet) return 0;
    return 1 + Math.max(...node.selectionSet.selections.map((child) => depth(child, fragments, soFar + 1, report, visited)));
  }
  if (node.kind === Kind.FRAGMENT_SPREAD) {
    const name = node.name.value;
    const fragment = fragments.get(name);
    if (!fragment || visited.has(name)) return 0;
    return depth(fragment, fragments, soFar, report, new Set([...visited, name]));
  }
  return Math.max(...node.selectionSet.selections.map((child) => depth(child, fragments, soFar, report, visited)));
}

export const maxDepth: ValidationRule = (context: ValidationContext) => {
  const document = context.getDocument();
  const fragments = fragmentsOf(document);
  for (const definition of document.definitions) {
    if (definition.kind !== Kind.OPERATION_DEFINITION) continue;
    const name = definition.name?.value ?? 'anonymous';
    let reported = false;
    const report = (node: ASTNode) => {
      if (reported) return;
      reported = true;
      context.reportError(new GraphQLError(`'${name}' exceeds maximum operation depth of ${MAX_DEPTH}`, { nodes: [node] }));
    };
    for (const selection of definition.selectionSet.selections) depth(selection, fragments, 0, report, new Set());
  }
  return {};
};
