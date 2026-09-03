import type { AppTab, AdsManagerEntity } from '@/store/useAppStore';

export type Route =
  | { kind: 'root' }
  | { kind: 'login' }
  | { kind: 'verify-email-link'; token: string }
  | { kind: 'create-workspace' }
  | { kind: 'invite'; token: string }
  | { kind: 'meta-connect-invite'; token: string }
  | { kind: 'meta-connect-success' }
  | { kind: 'welcome'; workspace: string }
  | { kind: 'workspace'; workspace: string; tab: AppTab | 'preferences'; entity?: AdsManagerEntity; recordId?: string }
  | { kind: 'unknown' };

const SYSTEM_ROOTS = new Set([
  'api',
  'admin',
  'app',
  'accounts',
  'action-history',
  'add',
  'add-accounts',
  'automations',
  'auth',
  'collection',
  'connections',
  'create-workspace',
  'data-deletion',
  'dashboard',
  'docs',
  'efficiency',
  'facebook-accounts',
  'facebook-groups',
  'fb-accounts',
  'fb_accounts',
  'groups',
  'health',
  'home',
  'invite',
  'invites',
  'lists',
  'login',
  'logs',
  'main',
  'null',
  'openapi',
  'openapi-json',
  'openapi.json',
  'onboarding',
  'privacy',
  'redoc',
  'rule-groups',
  'rules',
  'settings',
  'sign-in',
  'sign-up',
  'signup',
  'static',
  'summary',
  'terms',
  'today',
  'uploads',
  'undefined',
  'w',
  'welcome',
  'workspace',
  'register',
]);

export function parseRoute(location: Location = window.location): Route {
  const parts = location.pathname.split('/').filter(Boolean);
  if (parts.length === 0) return { kind: 'root' };
  if (parts.length === 1 && parts[0] === 'login') return { kind: 'login' };
  if (parts.length === 1 && parts[0] === 'create-workspace') return { kind: 'create-workspace' };
  if (parts.length === 3 && parts[0] === 'auth' && parts[1] === 'email' && parts[2] === 'verify') {
    return { kind: 'verify-email-link', token: new URLSearchParams(location.search).get('token') || '' };
  }
  if (parts[0] === 'invite' && parts.length === 2) {
    return { kind: 'invite', token: parts[1] };
  }
  if (parts[0] === 'connect' && parts[1] === 'meta' && parts.length === 3 && parts[2] === 'success') {
    return { kind: 'meta-connect-success' };
  }
  if (parts[0] === 'connect' && parts[1] === 'meta' && parts.length === 3) {
    return { kind: 'meta-connect-invite', token: parts[2] };
  }
  if (SYSTEM_ROOTS.has(parts[0])) return { kind: 'unknown' };

  const workspace = parts[0];
  if (parts.length === 1) {
    return { kind: 'workspace', workspace, tab: 'inbox' };
  }
  if (parts[1] === 'welcome' && parts.length === 2) {
    return { kind: 'welcome', workspace };
  }
  if (parts[1] === 'inbox' && parts.length <= 3) {
    return { kind: 'workspace', workspace, tab: 'inbox', recordId: parts[2] };
  }
  if (
    parts[1] === 'ads'
    && parts.length >= 3
    && parts.length <= 4
    && ['campaigns', 'adsets', 'ads'].includes(parts[2])
  ) {
    return {
      kind: 'workspace',
      workspace,
      tab: 'campaigns',
      entity: parts[2] as AdsManagerEntity,
      recordId: parts[3],
    };
  }
  if (parts[1] === 'rules' && parts.length <= 3) {
    return { kind: 'workspace', workspace, tab: 'rules', recordId: parts[2] };
  }
  if (parts[1] === 'statistics' && parts.length === 2) {
    return { kind: 'workspace', workspace, tab: 'statistics' };
  }
  if (parts[1] === 'settings' && parts.length === 2) {
    return { kind: 'workspace', workspace, tab: 'preferences' };
  }
  return { kind: 'unknown' };
}

export function pathForTab(
  workspace: string,
  tab: AppTab | 'preferences',
  entity: AdsManagerEntity = 'campaigns',
): string {
  if (tab === 'campaigns') return `/${workspace}/ads/${entity}`;
  if (tab === 'preferences') return `/${workspace}/settings`;
  return `/${workspace}/${tab}`;
}

export function isWorkspaceReturnRoute(route: Route): boolean {
  return route.kind === 'workspace' || route.kind === 'welcome';
}
