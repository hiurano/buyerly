import { readFileSync } from 'node:fs';
import {
  buildSchema,
  isObjectType,
  printSchema,
  printType,
  type GraphQLField,
  type GraphQLObjectType,
  type GraphQLSchema,
} from 'graphql';
import { describe, expect, it } from 'vitest';
import { clientSchema } from '../../src/graphql/schema.ts';

// This server's client API against the Python one (decision 55): every type
// it declares and every root field it serves must read exactly as in
// packages/shared/client-api.graphql, the Python schema printed
// (tests/test_client_api_sdl.py keeps that file current). Fields not moved
// yet are simply absent here; the routing forwards them.

const PYTHON = buildSchema(readFileSync(new URL('../../../packages/shared/client-api.graphql', import.meta.url), 'utf8'));
const OURS = clientSchema();

// One field as SDL: description, arguments with defaults, type.
function fieldSdl(field: GraphQLField<unknown, unknown>): string {
  const args = field.args.map((arg) => `${arg.name}: ${String(arg.type)}${arg.defaultValue !== undefined ? ` = ${JSON.stringify(arg.defaultValue)}` : ''}${arg.description ? ` "${arg.description}"` : ''}`);
  return `${field.description ?? ''}|${field.name}(${args.join(', ')}): ${String(field.type)}`;
}

function rootFields(schema: GraphQLSchema, root: 'Query' | 'Mutation'): GraphQLObjectType | undefined {
  return (root === 'Query' ? schema.getQueryType() : schema.getMutationType()) ?? undefined;
}

describe('client API schema', () => {
  it('declares every type as the Python schema does', () => {
    for (const type of Object.values(OURS.getTypeMap())) {
      if (type.name.startsWith('__') || ['Query', 'Mutation', 'String', 'Boolean', 'Int', 'Float', 'ID'].includes(type.name)) continue;
      const theirs = PYTHON.getType(type.name);
      expect(theirs, `${type.name} is not in the Python schema`).toBeDefined();
      expect(printType(type), type.name).toBe(printType(theirs!));
    }
  });

  it('declares every Python type, so a payload has one name on both servers', () => {
    for (const type of Object.values(PYTHON.getTypeMap())) {
      if (type.name.startsWith('__') || !isObjectType(type) || ['Query', 'Mutation'].includes(type.name)) continue;
      expect(OURS.getType(type.name), type.name).toBeDefined();
    }
  });

  for (const root of ['Query', 'Mutation'] as const) {
    it(`serves each ${root} field with the Python field's arguments, type and description`, () => {
      const ours = rootFields(OURS, root);
      const theirs = rootFields(PYTHON, root)!;
      for (const field of Object.values(ours?.getFields() ?? {})) {
        const python = theirs.getFields()[field.name];
        expect(python, `${root}.${field.name} is not in the Python schema`).toBeDefined();
        expect(fieldSdl(field), `${root}.${field.name}`).toBe(fieldSdl(python));
      }
    });
  }

  it('prints', () => {
    // A schema that prints is one graphql-js accepts as a whole.
    expect(printSchema(OURS)).toContain('scalar JSON');
  });
});
