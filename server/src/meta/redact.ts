// core/logging_config.py redact_secrets: credentials removed from a message
// before it is logged or stored (a Meta error kept on a connection or shown
// as an import error).

const PATTERNS: Array<[RegExp, string]> = [
  [/(access_token(?:=|%3D))([^&\s"']+)/gi, '$1[REDACTED]'],
  [/(appsecret_proof(?:=|%3D))([^&\s"']+)/gi, '$1[REDACTED]'],
  [/(\bBearer\s+)([A-Za-z0-9._~+/=-]+)/gi, '$1[REDACTED]'],
  // Also inside Bot API URLs, where the token follows "/bot" with no word break.
  [/(?<![0-9])([0-9]{8,12}):[A-Za-z0-9_-]{30,}/g, '$1:[REDACTED]'],
  [/\bgithub_pat_[A-Za-z0-9_]{20,}\b/g, '[REDACTED_GITHUB_TOKEN]'],
  [/\bgh[pousr]_[A-Za-z0-9]{20,}\b/g, '[REDACTED_GITHUB_TOKEN]'],
  [/\bre_[A-Za-z0-9_]{20,}\b/g, '[REDACTED_RESEND_KEY]'],
  [/(password(?:=|%3D|:\s*)["']?)([^&"'\s]+)/gi, '$1[REDACTED]'],
];

export function redactSecrets(message: string): string {
  return PATTERNS.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), String(message));
}
