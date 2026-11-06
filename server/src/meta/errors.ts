import { pyInt } from '../rules/engine.ts';
import { pyStr, pyStrip } from '../rules/validation.ts';
import { or, strOr } from './python.ts';

// meta_api/client.py's exceptions and its classification of token and
// permission errors, with the same codes, keys and texts.

// subcode: [subcode key, title, description, action hint]
export const META_TOKEN_SUBCODE_MAP: ReadonlyMap<number, readonly [string, string, string, string]> = new Map([
  [458, ['APP_REVOKED', '🚫 Access revoked', 'The app was removed from Facebook business integrations', 'Reconnect the integration in Business Manager settings']],
  [459, ['CHECKPOINT', '🔒 Checkpoint / profile ban', 'The Facebook profile was sent for a security review (selfie / documents)', 'Open the profile in an antidetect browser and clear the checkpoint']],
  [460, ['PASSWORD_CHANGED', '🔑 Password changed', 'The account password was changed; all sessions were reset', 'Sign in again with the new password']],
  [463, ['SESSION_EXPIRED', '⏳ Token expired', 'The 60-day lifetime of the long-lived token has expired', "Refresh the token via the bot (the '➕ Add ad accounts' button)"]],
  [464, ['UNCONFIRMED_USER', '📧 Account not confirmed', 'The user has not confirmed their email or phone in Facebook', 'Confirm the contact details in the FB profile']],
  [467, ['ACCESS_TOKEN_INVALIDATED', '🚪 Session ended', 'Signed out on all devices, or the token was reset', 'Issue a new access token']],
  [490, ['LOGIN_APPROVAL_NEEDED', '🛡 2FA required', 'Meta requested two-factor authentication confirmation', 'Confirm the sign-in in your authenticator app']],
  [492, ['DEVICE_SESSION_EXPIRED', '📱 Device session is stale', 'The mobile/web device session is stale', 'Sign in to the account again']],
  [1348001, ['ACCOUNT_PERMISSION_DENIED', '🚫 No permissions on the ad account', 'The user has no admin/advertiser role on the ad account', 'Grant the user permissions in Business Manager']],
]);

// Python's RuntimeError from the client: a Meta error that is not about the
// token, exhausted retries, broken pagination.
export class MetaApiError extends Error {
  override name = 'MetaApiError';
}

// MetaRateLimitDeferred: a non-critical request postponed to protect the quota.
export class MetaRateLimitDeferred extends Error {
  override name = 'MetaRateLimitDeferred';
}

// ValueError: the caller asked for something the client refuses before any request.
export class MetaValueError extends Error {
  override name = 'MetaValueError';
}

export interface MetaTokenErrorDetails {
  code: number;
  subcode: number | null;
  subcodeKey: string;
  title: string;
  description: string;
  actionHint: string;
  errorUserTitle: string;
  errorUserMsg: string;
  fbtraceId: string;
}

// MetaTokenAuthError (a PermissionError in Python).
export class MetaTokenAuthError extends Error implements MetaTokenErrorDetails {
  override name = 'MetaTokenAuthError';
  readonly code: number;
  readonly subcode: number | null;
  readonly subcodeKey: string;
  readonly title: string;
  readonly description: string;
  readonly actionHint: string;
  readonly errorUserTitle: string;
  readonly errorUserMsg: string;
  readonly fbtraceId: string;

  constructor(message: string, details: MetaTokenErrorDetails) {
    super(message);
    this.code = details.code;
    this.subcode = details.subcode;
    this.subcodeKey = details.subcodeKey;
    this.title = details.title;
    this.description = details.description;
    this.actionHint = details.actionHint;
    this.errorUserTitle = details.errorUserTitle;
    this.errorUserMsg = details.errorUserMsg;
    this.fbtraceId = details.fbtraceId;
  }

  details(): MetaTokenErrorDetails {
    const { code, subcode, subcodeKey, title, description, actionHint, errorUserTitle, errorUserMsg, fbtraceId } = this;
    return { code, subcode, subcodeKey, title, description, actionHint, errorUserTitle, errorUserMsg, fbtraceId };
  }
}

// int(x) inside `try: … except (TypeError, ValueError)`: the fallback for
// both; an OverflowError (int of infinity) still escapes, as in Python.
function intOr<T>(value: unknown, fallback: T): number | T {
  try {
    return pyInt(value);
  } catch (error) {
    if ((error as Error).name === 'OverflowError') throw error;
    return fallback;
  }
}

const textOf = (value: unknown): string => pyStrip(strOr(value, ''));

// classify_meta_token_error
export function classifyMetaTokenError(errorData: Record<string, unknown>, fallbackMessage: unknown = ''): MetaTokenAuthError {
  const rawCode = errorData.code;
  const code = rawCode === null || rawCode === undefined ? 190 : intOr(rawCode, 190);
  const rawSubcode = errorData.error_subcode;
  const subcode = rawSubcode === null || rawSubcode === undefined ? null : intOr(rawSubcode, null);

  const errorUserTitle = textOf(errorData.error_user_title);
  const errorUserMsg = textOf(errorData.error_user_msg);
  const fbtraceId = textOf(errorData.fbtrace_id);
  const message = pyStrip(pyStr(or(errorData.message, or(fallbackMessage, 'Meta token expired or invalid'))));

  let subcodeKey: string;
  let title: string;
  let description: string;
  let actionHint: string;
  const known = subcode !== null ? META_TOKEN_SUBCODE_MAP.get(subcode) : undefined;
  if (known) {
    [subcodeKey, title, description, actionHint] = known;
  } else if (code === 10 || code === 200) {
    subcodeKey = 'ACCOUNT_PERMISSION_DENIED';
    title = '🚫 No permissions on the ad account';
    description = 'Insufficient permissions to manage this ad account in Meta';
    actionHint = "Check the user's permissions in Business Manager";
  } else if (code === 102) {
    subcodeKey = 'API_SESSION_INVALID';
    title = '🔌 API session is invalid';
    description = 'The Meta API session ended or was reset';
    actionHint = 'Reconnect the account via OAuth';
  } else {
    subcodeKey = 'TOKEN_INVALID';
    title = '🔑 Token is invalid';
    description = 'The Meta API access token became invalid or expired';
    actionHint = "Refresh the token via the bot (the '➕ Add ad accounts' button)";
  }

  return new MetaTokenAuthError(`Token expired or invalid: ${message}`, {
    code,
    subcode,
    subcodeKey,
    title,
    description,
    actionHint,
    errorUserTitle,
    errorUserMsg,
    fbtraceId,
  });
}
