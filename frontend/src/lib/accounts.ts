import type { SessionUser, Workspace } from './types';

/**
 * Linear's "Add an account…": one browser stays logged in to several accounts.
 * Each has its own session cookie pair on the server; every API request names
 * the account it acts as (`X-Buyerly-Account`) and carries that account's CSRF
 * token. The account a tab works in lives in the tab (sessionStorage), so two
 * tabs can work in two accounts; a new tab starts from the last one used.
 */
export interface BrowserAccount {
  id: number;
  username: string;
  full_name: string;
  email: string | null;
  avatar_url: string;
  /** Cookie pair of this account: buyerly_csrf for 0, buyerly_csrf_<slot> otherwise. */
  slot: number;
  onboarding_completed: boolean;
  workspaces: Workspace[];
}

const TAB_ACCOUNT_KEY = 'buyerly-account';
const LAST_ACCOUNT_KEY = 'buyerly-last-account';

let knownAccounts: BrowserAccount[] = [];
let currentAccountId: number | null = readStoredId(() => window.sessionStorage, TAB_ACCOUNT_KEY);

function readStoredId(storage: () => Storage, key: string): number | null {
  try {
    const value = Number(storage().getItem(key));
    return Number.isInteger(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

function store(storage: () => Storage, key: string, value: number | null): void {
  try {
    if (value === null) storage().removeItem(key);
    else storage().setItem(key, String(value));
  } catch {
    // Storage can be unavailable (private mode); the in-memory choice still holds.
  }
}

export function getKnownAccounts(): BrowserAccount[] {
  return knownAccounts;
}

/** The accounts the server reports; a current account that left them is dropped. */
export function setKnownAccounts(accounts: BrowserAccount[]): void {
  knownAccounts = Array.isArray(accounts)
    ? accounts.filter((account) => Number.isInteger(account?.id) && Array.isArray(account.workspaces))
    : [];
  if (currentAccountId !== null && !knownAccounts.some((account) => account.id === currentAccountId)) {
    setCurrentAccountId(null);
  }
}

export function getCurrentAccountId(): number | null {
  return currentAccountId;
}

export function setCurrentAccountId(id: number | null): void {
  currentAccountId = id;
  store(() => window.sessionStorage, TAB_ACCOUNT_KEY, id);
  if (id !== null) store(() => window.localStorage, LAST_ACCOUNT_KEY, id);
}

/**
 * The account a request acts as and the cookie holding its CSRF token.
 * Without a known current account nothing is named, and the server uses the
 * browser's newest sign-in (the one-account case).
 */
export function requestAccount(): { id: number; csrfCookie: string } | null {
  const account = knownAccounts.find((item) => item.id === currentAccountId);
  if (!account) return null;
  return { id: account.id, csrfCookie: account.slot === 0 ? 'buyerly_csrf' : `buyerly_csrf_${account.slot}` };
}

/**
 * Which account opens a tab: the one this tab used, else the one that owns the
 * workspace in the address, else the last one used in this browser, else the first.
 * A workspace both accounts belong to opens in the tab's account when it can.
 */
export function chooseAccount(accounts: BrowserAccount[], workspaceSlug?: string | null): BrowserAccount | null {
  if (accounts.length === 0) return null;
  const tab = accounts.find((account) => account.id === currentAccountId);
  const last = accounts.find((account) => account.id === readStoredId(() => window.localStorage, LAST_ACCOUNT_KEY));
  const preferred = [tab, last, ...accounts].filter((account): account is BrowserAccount => Boolean(account));
  if (workspaceSlug) {
    const owner = preferred.find((account) => account.workspaces.some((workspace) => workspace.slug === workspaceSlug));
    if (owner) return owner;
  }
  return preferred[0];
}

export interface AccountBlock {
  /** Undefined only without any known account (local dev sign-in). */
  accountId?: number;
  label: string;
  workspaces: Array<{ workspace: Workspace; number: number }>;
}

/**
 * Switch workspace as Linear groups it: a block per account headed by its
 * email, numbered 1…N straight through all blocks. The open account's block
 * uses its freshest profile.
 */
export function accountBlocks(accounts: BrowserAccount[], user: SessionUser): AccountBlock[] {
  const sources: Array<{ id?: number; email: string | null; username: string; workspaces: Workspace[] }> = accounts.some((account) => account.id === user.id)
    ? accounts.map((account) => (account.id === user.id ? { ...account, workspaces: user.workspaces } : account))
    : [{ id: user.id ?? undefined, email: user.email, username: user.username, workspaces: user.workspaces }, ...accounts];
  let number = 0;
  return sources.map((account) => ({
    accountId: account.id,
    label: account.email || account.username,
    workspaces: account.workspaces.map((workspace) => ({ workspace, number: ++number })),
  }));
}

/** The workspace an account opens on: its active one, else its first. */
export function homeWorkspace(account: BrowserAccount): Workspace | null {
  return account.workspaces.find((workspace) => workspace.is_active) || account.workspaces[0] || null;
}
