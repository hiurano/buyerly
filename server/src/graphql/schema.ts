import 'reflect-metadata';
import { GraphQLSchema } from 'graphql';
import { buildSchemaSync, getMetadataStorage } from 'type-graphql';
import { RESOLVERS } from './areas/index.ts';
import * as payloads from './payloads.ts';
import { JSONScalar } from './scalars.ts';

// The client API's schema: TypeGraphQL classes from every area
// (areas/index.ts), field for field the contract in
// packages/shared/client-api.graphql (test/graphql/schema.test.ts).

let built: GraphQLSchema | null = null;

export function clientSchema(): GraphQLSchema {
  if (built) return built;
  // Parameter decorators run last to first, and TypeGraphQL keeps the order
  // they ran in: put each field's arguments back in the order they're
  // declared, which is Python's (only the order within a field matters).
  getMetadataStorage().params.sort((a, b) => a.index - b.index);
  built = buildSchemaSync({
    resolvers: RESOLVERS,
    // Payload types no moved field returns yet still belong to the schema.
    orphanedTypes: Object.values(payloads).filter((value) => typeof value === 'function'),
    scalarsMap: [],
    validate: false,
    // Python's schema has no directives of its own and sorts nothing.
    emitSchemaFile: false,
    nullableByDefault: false,
  });
  return built;
}

export { JSONScalar };

// Root fields this server answers, by operation type.
export function servedRootFields(schema: GraphQLSchema = clientSchema()): { query: Set<string>; mutation: Set<string> } {
  return {
    query: new Set(Object.keys(schema.getQueryType()?.getFields() ?? {})),
    mutation: new Set(Object.keys(schema.getMutationType()?.getFields() ?? {})),
  };
}
