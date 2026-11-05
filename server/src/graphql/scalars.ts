import { GraphQLScalarType, Kind, type ValueNode } from 'graphql';

// The client API's one scalar (api/client_api: strawberry.scalars.JSON):
// records travel as JSON in the REST routes' own shapes, as Linear's
// client-api sends its models.

function literal(node: ValueNode, variables?: Record<string, unknown> | null): unknown {
  switch (node.kind) {
    case Kind.STRING:
    case Kind.BOOLEAN:
      return node.value;
    case Kind.INT:
    case Kind.FLOAT:
      return Number(node.value);
    case Kind.NULL:
      return null;
    case Kind.LIST:
      return node.values.map((item) => literal(item, variables));
    case Kind.OBJECT:
      return Object.fromEntries(node.fields.map((field) => [field.name.value, literal(field.value, variables)]));
    case Kind.VARIABLE:
      return variables?.[node.name.value];
    default:
      return undefined;
  }
}

export const JSONScalar = new GraphQLScalarType({
  name: 'JSON',
  description: 'The `JSON` scalar type represents JSON values as specified by [ECMA-404](https://ecma-international.org/wp-content/uploads/ECMA-404_2nd_edition_december_2017.pdf).',
  specifiedByURL: 'https://ecma-international.org/wp-content/uploads/ECMA-404_2nd_edition_december_2017.pdf',
  serialize: (value) => value,
  parseValue: (value) => value,
  parseLiteral: literal,
});
