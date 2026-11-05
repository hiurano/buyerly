import { Ajv, type ErrorObject, type JSONSchemaType, type ValidateFunction } from 'ajv';
import { pydanticIssues } from '../http/errors.ts';
import { invalidInput } from './errors.ts';

// A field's `input: JSON!` checked as the REST route checks its body: the
// same JSON Schema keywords and options as Fastify's routes (app.ts), and a
// failure in pydantic's words, joined as the Python bridge joins them.
//
//   const UPDATE = inputSchema<UpdateProfile>({ type: 'object', additionalProperties: false, properties: { … } });
//   const req = UPDATE.parse(input);

const ajv = new Ajv({ removeAdditional: false, coerceTypes: false, allErrors: true, useDefaults: false });

export interface InputSchema<T> {
  parse(value: unknown): T;
}

export function inputSchema<T>(schema: JSONSchemaType<T> | Record<string, unknown>): InputSchema<T> {
  const validate = ajv.compile(schema) as ValidateFunction<T>;
  return {
    parse(value) {
      // A missing input is an empty body, as bridge.py validates None as {}.
      const body = value ?? {};
      if (validate(body)) return body;
      const issues = pydanticIssues(body, (validate.errors ?? []) as ErrorObject[]);
      throw invalidInput(issues.map((issue) => issue.msg));
    },
  };
}
