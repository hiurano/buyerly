import { toast } from '@/ui/toast';
import { apiRequest } from './api';

/** One signed-in browser, as `GET /api/auth/sessions` returns it. */
export interface WebSession {
  id: string;
  user_agent: string;
  ip_address: string;
  created_at: string;
  expires_at: string;
  last_seen_at: string;
  current: boolean;
}

export function fetchSessions(): Promise<WebSession[]> {
  return apiRequest<WebSession[]>('/api/auth/sessions');
}

export async function revokeSession(id: string): Promise<void> {
  await apiRequest(`/api/auth/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

/** Linear's Revoke all: every other session ends, this one stays. */
export async function revokeOtherSessions(): Promise<void> {
  await apiRequest('/api/auth/logout-all?keep_current=true', { method: 'POST', body: JSON.stringify({}) });
}

/** Ends this browser's session and reloads into the login screen, dropping all in-memory workspace state. */
export async function logOut(): Promise<void> {
  try {
    await apiRequest('/api/auth/logout', { method: 'POST', body: JSON.stringify({}) });
  } catch (error) {
    toast.error("Couldn't log out", error instanceof Error ? error.message : undefined);
    return;
  }
  window.location.assign('/login');
}

// Order matters: Edge and Opera also say Chrome, Chrome also says Safari.
const BROWSERS: Array<[RegExp, string]> = [
  [/\bEdg(?:e|A|iOS)?\//, 'Edge'],
  [/\b(?:OPR|Opera)\//, 'Opera'],
  [/\bYaBrowser\//, 'Yandex Browser'],
  [/\bSamsungBrowser\//, 'Samsung Internet'],
  [/\b(?:Firefox|FxiOS)\//, 'Firefox'],
  [/\b(?:Chrome|CriOS|Chromium)\//, 'Chrome'],
  [/\bSafari\//, 'Safari'],
];

// Order matters: Android says Linux, iOS says Mac OS X.
const SYSTEMS: Array<[RegExp, string]> = [
  [/\biPhone\b/, 'iPhone'],
  [/\biPad\b/, 'iPad'],
  [/\bAndroid\b/, 'Android'],
  [/\bCrOS\b/, 'ChromeOS'],
  [/\bWindows\b/, 'Windows'],
  [/\bMac OS X\b|\bMacintosh\b/, 'macOS'],
  [/\bLinux\b/, 'Linux'],
];

/** "Chrome on Linux", as Linear names a session; whatever part is unknown is left out. */
export function describeUserAgent(userAgent: string): string {
  const browser = BROWSERS.find(([pattern]) => pattern.test(userAgent))?.[1];
  const system = SYSTEMS.find(([pattern]) => pattern.test(userAgent))?.[1];
  if (browser && system) return `${browser} on ${system}`;
  return browser || system || 'Unknown device';
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function plural(count: number, unit: string): string {
  return `${count} ${unit}${count === 1 ? '' : 's'} ago`;
}

/** "Last seen 2 days ago". */
export function formatLastSeen(isoTimestamp: string, now: number = Date.now()): string {
  const elapsed = now - Date.parse(isoTimestamp);
  if (Number.isNaN(elapsed) || elapsed < MINUTE) return 'Last seen just now';
  if (elapsed < HOUR) return `Last seen ${plural(Math.floor(elapsed / MINUTE), 'minute')}`;
  if (elapsed < DAY) return `Last seen ${plural(Math.floor(elapsed / HOUR), 'hour')}`;
  return `Last seen ${plural(Math.floor(elapsed / DAY), 'day')}`;
}

/** "Sep 29, 2026, 8:48 PM" for the details under a session. */
export function formatSignedIn(isoTimestamp: string): string {
  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}
