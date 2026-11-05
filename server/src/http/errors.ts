import type { FastifyError, FastifyInstance } from 'fastify';

// Error answers in the Python API's shapes, so the browser cannot tell which
// server answered (#611). FastAPI sends
//   {"detail": "<message>"}                    for HTTPException, and
//   {"detail": [{type, loc, msg, input, …}]}   with 422 for a request body
// that fails its pydantic model. frontend/src/lib/api.ts reads both.

export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    readonly detail: string,
    readonly headers: Record<string, string> = {},
  ) {
    super(detail);
    this.name = 'HttpError';
  }
}

// A request FastAPI would refuse with 422 before the handler ran, for what
// a route checks itself (a form part, a query value).
export class ValidationFailed extends Error {
  constructor(readonly issues: ValidationIssue[]) {
    super('Request validation failed');
    this.name = 'ValidationFailed';
  }
}

// One entry of a FastAPI validation answer.
export interface ValidationIssue {
  type: string;
  loc: (string | number)[];
  msg: string;
  input: unknown;
  ctx?: Record<string, unknown>;
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

interface AjvIssue {
  keyword: string;
  instancePath: string;
  params: Record<string, unknown>;
}

function pointerPath(pointer: string): (string | number)[] {
  return pointer
    .split('/')
    .slice(1)
    .map((part) => part.replace(/~1/g, '/').replace(/~0/g, '~'))
    .map((part) => (/^\d+$/.test(part) ? Number(part) : part));
}

function valueAt(root: unknown, path: (string | number)[]): unknown {
  let value = root;
  for (const part of path) {
    if (value === null || typeof value !== 'object') return undefined;
    value = (value as Record<string | number, unknown>)[part];
  }
  return value;
}

// pydantic's type errors by the JSON Schema type the field expects.
const TYPE_MESSAGES: Record<string, [string, string]> = {
  string: ['string_type', 'Input should be a valid string'],
  boolean: ['bool_type', 'Input should be a valid boolean'],
  integer: ['int_type', 'Input should be a valid integer'],
  array: ['list_type', 'Input should be a valid list'],
  number: ['float_type', 'Input should be a valid number'],
  object: ['model_type', 'Input should be a valid dictionary or instance of Model'],
};

// Ajv's findings in pydantic's words. Only the keywords the route schemas use
// are translated; anything else still answers 422 with Ajv's keyword.
export function pydanticIssues(body: unknown, issues: AjvIssue[]): ValidationIssue[] {
  if (body === undefined || body === null) {
    return [{ type: 'missing', loc: ['body'], msg: 'Field required', input: null }];
  }
  if (typeof body !== 'object' || Array.isArray(body)) {
    return [{
      type: 'model_attributes_type',
      loc: ['body'],
      msg: 'Input should be a valid dictionary or object to extract fields from',
      input: body,
    }];
  }
  return issues.map((issue): ValidationIssue => {
    const path = pointerPath(issue.instancePath);
    const input = valueAt(body, path);
    switch (issue.keyword) {
      case 'required': {
        const field = String(issue.params.missingProperty);
        return { type: 'missing', loc: ['body', ...path, field], msg: 'Field required', input: input ?? body };
      }
      case 'additionalProperties': {
        const field = String(issue.params.additionalProperty);
        return {
          type: 'extra_forbidden',
          loc: ['body', ...path, field],
          msg: 'Extra inputs are not permitted',
          input: valueAt(body, [...path, field]),
        };
      }
      case 'minLength': {
        const limit = Number(issue.params.limit);
        return {
          type: 'string_too_short',
          loc: ['body', ...path],
          msg: `String should have at least ${plural(limit, 'character')}`,
          input,
          ctx: { min_length: limit },
        };
      }
      case 'maxLength': {
        const limit = Number(issue.params.limit);
        return {
          type: 'string_too_long',
          loc: ['body', ...path],
          msg: `String should have at most ${plural(limit, 'character')}`,
          input,
          ctx: { max_length: limit },
        };
      }
      case 'type': {
        const expected = String(issue.params.type).split(',')[0];
        const known = TYPE_MESSAGES[expected];
        if (known) return { type: known[0], loc: ['body', ...path], msg: known[1], input };
        return { type: issue.keyword, loc: ['body', ...path], msg: 'Input should be valid', input };
      }
      case 'minItems':
      case 'maxItems': {
        const limit = Number(issue.params.limit);
        const actual = Array.isArray(input) ? input.length : 0;
        const short = issue.keyword === 'minItems';
        return {
          type: short ? 'too_short' : 'too_long',
          loc: ['body', ...path],
          msg: `List should have at ${short ? 'least' : 'most'} ${plural(limit, 'item')} after validation, not ${actual}`,
          input,
          ctx: { field_type: 'List', [short ? 'min_length' : 'max_length']: limit, actual_length: actual },
        };
      }
      case 'minimum':
      case 'maximum': {
        const limit = Number(issue.params.limit);
        const low = issue.keyword === 'minimum';
        return {
          type: low ? 'greater_than_equal' : 'less_than_equal',
          loc: ['body', ...path],
          msg: `Input should be ${low ? 'greater' : 'less'} than or equal to ${limit}`,
          input,
          ctx: { [low ? 'ge' : 'le']: limit },
        };
      }
      case 'pattern': {
        const pattern = String(issue.params.pattern);
        return {
          type: 'string_pattern_mismatch',
          loc: ['body', ...path],
          msg: `String should match pattern '${pattern}'`,
          input,
          ctx: { pattern },
        };
      }
      case 'exclusiveMinimum':
      case 'exclusiveMaximum': {
        const limit = Number(issue.params.limit);
        const low = issue.keyword === 'exclusiveMinimum';
        return {
          type: low ? 'greater_than' : 'less_than',
          loc: ['body', ...path],
          msg: `Input should be ${low ? 'greater' : 'less'} than ${limit}`,
          input,
          ctx: { [low ? 'gt' : 'lt']: limit },
        };
      }
      case 'enum': {
        // A Literal: "Input should be 'a', 'b' or 'c'".
        const allowed = (issue.params.allowedValues as unknown[]).map((value) => `'${String(value)}'`);
        const expected = allowed.length > 1 ? `${allowed.slice(0, -1).join(', ')} or ${allowed[allowed.length - 1]}` : allowed[0];
        return { type: 'literal_error', loc: ['body', ...path], msg: `Input should be ${expected}`, input, ctx: { expected } };
      }
      default:
        return { type: issue.keyword, loc: ['body', ...path], msg: 'Input should be valid', input };
    }
  });
}

// Answers every error in the FastAPI shape. Routes throw HttpError for the
// answers they mean; anything else is a bug and answers 500 without details.
export function installErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler(async (error: FastifyError | HttpError | ValidationFailed, request, reply) => {
    if (error instanceof ValidationFailed) {
      reply.code(422);
      return { detail: error.issues };
    }
    if (error instanceof HttpError) {
      reply.code(error.statusCode).headers(error.headers);
      return { detail: error.detail };
    }
    if ('validation' in error && error.validation && error.validationContext === 'body') {
      reply.code(422);
      return { detail: pydanticIssues(request.body, error.validation) };
    }
    switch (error.code) {
      case 'FST_ERR_CTP_EMPTY_JSON_BODY':
      case 'FST_ERR_CTP_INVALID_MEDIA_TYPE':
        reply.code(422);
        return { detail: pydanticIssues(undefined, []) };
      case 'FST_ERR_CTP_BODY_TOO_LARGE':
        // The Python API's own cap and words (api/server.py).
        reply.code(413);
        return { detail: 'The request body exceeds the allowed size limit.' };
      default:
        break;
    }
    if (error instanceof SyntaxError && error.statusCode === 400) {
      reply.code(422);
      return {
        detail: [{ type: 'json_invalid', loc: ['body', 0], msg: 'JSON decode error', input: {}, ctx: { error: error.message } }],
      };
    }
    request.log.error({ err: error }, 'Request failed');
    reply.code(500);
    return { detail: 'Internal Server Error' };
  });
}
