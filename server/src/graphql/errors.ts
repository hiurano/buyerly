import { GraphQLError } from 'graphql';
import { HttpError, ValidationFailed } from '../http/errors.ts';

// A field's refusal as the Python client API words it (api/client_api/bridge.py
// RouteError): the REST route's message and status code, with Linear's error
// `type`. The client reads `extensions.statusCode`.

const ERROR_TYPES: Record<number, string> = {
  400: 'invalid input',
  401: 'authentication error',
  403: 'forbidden',
  404: 'entity not found',
  409: 'conflict',
  410: 'gone',
  413: 'invalid input',
  422: 'invalid input',
  429: 'ratelimited',
};

export class RouteError extends GraphQLError {
  readonly statusCode: number;

  constructor(statusCode: number, detail: unknown, headers: Record<string, string> = {}) {
    const message = typeof detail === 'string'
      ? detail
      : detail && typeof detail === 'object' && typeof (detail as { message?: unknown }).message === 'string'
        ? (detail as { message: string }).message
        : 'Something went wrong';
    const extensions: Record<string, unknown> = {
      type: ERROR_TYPES[statusCode] ?? (statusCode >= 500 ? 'internal error' : 'invalid input'),
      statusCode,
      userPresentableMessage: message,
    };
    if (typeof detail !== 'string') extensions.detail = detail;
    const retryAfter = headers['Retry-After'] ?? headers['retry-after'];
    if (retryAfter) extensions.retryAfter = retryAfter;
    super(message, { extensions });
    this.name = 'RouteError';
    this.statusCode = statusCode;
  }
}

// pydantic's 422 as the client shows it: the messages, "Value error, " dropped
// (bridge.py _validation_error).
export function invalidInput(messages: string[]): RouteError {
  return new RouteError(422, messages.map((msg) => msg.replace(/^Value error, /, '')).join(' ') || 'Invalid input.');
}

// What a resolver threw, as the client sees it: the REST helpers' HttpError
// and ValidationFailed keep their status; anything else is a bug, logged by
// the caller and answered as REST's 500, telling the client nothing more.
export function asRouteError(error: unknown): RouteError | null {
  if (error instanceof RouteError) return error;
  if (error instanceof HttpError) return new RouteError(error.statusCode, error.detail, error.headers);
  if (error instanceof ValidationFailed) return invalidInput(error.issues.map((issue) => issue.msg));
  return null;
}

export const INTERNAL_ERROR = (): RouteError => new RouteError(500, 'Something went wrong');
