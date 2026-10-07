import { toast } from '@/ui/toast';
import { apiRequest } from './api';
import { chooseAccount, getKnownAccounts, homeWorkspace, setCurrentAccountId, setKnownAccounts, type BrowserAccount } from './accounts';

/** One signed-in browser, as `GET /api/auth/sessions` returns it. */
export interface WebSession {
  id: string;
  user_agent: string;
  ip_address: string;
  /** "Helsinki, 18, FI" where it was last seen (from Cloudflare); empty when unknown. */
  location?: string;
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

/**
 * Logs this browser out of the open account only, as Linear does: when another
 * account is still logged in here, its workspace opens; otherwise the login
 * screen. Reloads either way, dropping all in-memory workspace state.
 * Resolves false when the server refused.
 */
export async function logOut(): Promise<boolean> {
  try {
    await apiRequest('/api/auth/logout', { method: 'POST', body: JSON.stringify({}) });
  } catch (error) {
    toast.error("Couldn't log out", error instanceof Error ? error.message : undefined);
    return false;
  }
  let destination = '/login';
  try {
    setKnownAccounts(await apiRequest<BrowserAccount[]>('/api/auth/accounts'));
    const next = chooseAccount(getKnownAccounts());
    if (next) {
      setCurrentAccountId(next.id);
      const workspace = homeWorkspace(next);
      destination = workspace ? `/${workspace.slug}/inbox` : '/';
    }
  } catch {
    // The logout itself succeeded; the login screen is a safe place to land.
  }
  window.location.assign(destination);
  return true;
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

export function browserOf(userAgent: string): string {
  return BROWSERS.find(([pattern]) => pattern.test(userAgent))?.[1] || '';
}

/** "Chrome on Linux", as Linear names a session; whatever part is unknown is left out. */
export function describeUserAgent(userAgent: string): string {
  const browser = browserOf(userAgent);
  const system = SYSTEMS.find(([pattern]) => pattern.test(userAgent))?.[1];
  if (browser && system) return `${browser} on ${system}`;
  return browser || system || 'Unknown device';
}

const MINUTES_IN_HOUR = 60;
const MINUTES_IN_DAY = 1440;
const MINUTES_IN_MONTH = 43_200;

function count(value: number, unit: string): string {
  return `${value} ${unit}${value === 1 ? '' : 's'}`;
}

/**
 * "Last seen about 14 hours ago": Linear's wording, which is date-fns
 * formatDistance (minutes rounded, "about" for hours and months).
 */
export function formatLastSeen(isoTimestamp: string, now: number = Date.now()): string {
  const elapsed = now - Date.parse(isoTimestamp);
  const minutes = Number.isNaN(elapsed) ? 0 : Math.max(0, Math.round(elapsed / 60_000));
  let distance: string;
  if (minutes < 1) distance = 'less than a minute';
  else if (minutes < 45) distance = count(minutes, 'minute');
  else if (minutes < 90) distance = 'about 1 hour';
  else if (minutes < MINUTES_IN_DAY) distance = `about ${count(Math.round(minutes / MINUTES_IN_HOUR), 'hour')}`;
  else if (minutes < 2520) distance = '1 day';
  else if (minutes < MINUTES_IN_MONTH) distance = count(Math.round(minutes / MINUTES_IN_DAY), 'day');
  else if (minutes < 2 * MINUTES_IN_MONTH) distance = `about ${count(Math.round(minutes / MINUTES_IN_MONTH), 'month')}`;
  else distance = count(Math.round(minutes / MINUTES_IN_MONTH), 'month');
  return `Last seen ${distance} ago`;
}

/** "Sep 25, 2026": Original sign in in Linear's session details, the date alone. */
export function formatSignedIn(isoTimestamp: string): string {
  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Linear dims a session not seen for more than a month. */
export function isStale(session: WebSession, now: number = Date.now()): boolean {
  const seen = Date.parse(session.last_seen_at);
  return !Number.isNaN(seen) && now - seen > MINUTES_IN_MONTH * 60_000;
}

/** Other sessions as Linear orders them: the most recently seen first. */
export function byLastSeen(a: WebSession, b: WebSession): number {
  return (Date.parse(b.last_seen_at) || 0) - (Date.parse(a.last_seen_at) || 0);
}
