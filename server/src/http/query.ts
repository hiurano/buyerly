import type { FastifyRequest } from 'fastify';
import { ValidationFailed, type ValidationIssue } from './errors.ts';

// Query parameters as FastAPI reads `name: int = Query(...)`: the string is
// parsed the way pydantic parses an int (whitespace, a sign, `_` between
// digits and a `.0` tail allowed), bounds are checked, and every problem of
// the request is reported at once as FastAPI's 422.

export interface IntegerParameter {
  // Required when absent.
  default?: number;
  ge?: number;
  le?: number;
}

const PYDANTIC_INT = /^\s*([+-]?\d+(?:_\d+)*)(?:\.0+)?\s*$/;

export function integerQuery<T extends Record<string, IntegerParameter>>(
  request: FastifyRequest,
  parameters: T,
): { [K in keyof T]: number } {
  const query = request.query as Record<string, string | string[] | undefined>;
  const issues: ValidationIssue[] = [];
  const values: Record<string, number> = {};
  for (const [name, spec] of Object.entries(parameters)) {
    const given = query[name];
    // FastAPI reads the last of repeated parameters.
    const raw = Array.isArray(given) ? given[given.length - 1] : given;
    const loc = ['query', name];
    if (raw === undefined) {
      if (spec.default === undefined) issues.push({ type: 'missing', loc, msg: 'Field required', input: null });
      else values[name] = spec.default;
      continue;
    }
    const match = PYDANTIC_INT.exec(raw);
    if (!match) {
      issues.push({ type: 'int_parsing', loc, msg: 'Input should be a valid integer, unable to parse string as an integer', input: raw });
      continue;
    }
    const value = Number(match[1].replace(/_/g, ''));
    if (spec.ge !== undefined && value < spec.ge) {
      issues.push({ type: 'greater_than_equal', loc, msg: `Input should be greater than or equal to ${spec.ge}`, input: raw, ctx: { ge: spec.ge } });
    } else if (spec.le !== undefined && value > spec.le) {
      issues.push({ type: 'less_than_equal', loc, msg: `Input should be less than or equal to ${spec.le}`, input: raw, ctx: { le: spec.le } });
    } else {
      values[name] = value;
    }
  }
  if (issues.length) throw new ValidationFailed(issues);
  return values as { [K in keyof T]: number };
}
