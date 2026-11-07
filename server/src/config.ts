import { fileURLToPath } from 'node:url';

// Settings from the environment, read once at start. The names match the
// Python services' (core/config.py), since both run from the same .env while
// the server moves to TypeScript (#611).

export interface Config {
  port: number;
  host: string;
  // The release sha, or "local" outside a release build.
  version: string;
  // A node-postgres URL; empty means "no database" (the ready check fails).
  databaseUrl: string;
  logLevel: string;

  // Who may report the browser's address (core/rate_limit.py): proxies in
  // TRUSTED_PROXY_CIDRS may send X-Forwarded-For; only Cloudflare (its edge
  // networks, or our tunnel's address) may send CF-Connecting-IP and the
  // visitor location headers.
  trustedProxyCidrs: string;
  // Empty means Cloudflare's published list; "off" ignores Cloudflare headers.
  cloudflareIpCidrs: string;
  cloudflareTunnelCidrs: string;

  // Public URL of the web app; the login email links back to it.
  webappUrl: string;
  // Comma-separated origins allowed besides WEBAPP_URL (the sync socket checks them).
  corsOrigins: string;
  // The Python API, for client API documents this server does not answer yet (graphql/routing.ts).
  apiUrl: string;
  // A browser session ends after this many days without use.
  webSessionIdleDays: number;
  sessionCookieSecure: boolean;

  // Email: Resend when the key is set, otherwise the log (DEV_EMAIL_LOG adds
  // the message itself, code and link included, on the local stack only).
  resendApiKey: string;
  emailFrom: string;
  devEmailLog: boolean;
  // Cloudflare Turnstile on sign-up; empty turns the check off.
  turnstileSecretKey: string;
  // HMAC secret for stored OTP codes and link tokens; the same value as the
  // Python API's, so a code issued by one server verifies on the other.
  otpPepper: string;

  // The Telegram bot (core/telegram.py); empty means no Telegram channel.
  telegramBotToken: string;
  // The VAPID key desktop notifications are signed with (core/web_push.py):
  // a raw P-256 scalar in base64url, or a PEM or DER key; empty means none.
  vapidPrivateKey: string;
  // The contact push services see with each desktop notification.
  vapidSubject: string;

  // User images (avatars, workspace logos): the Python API's directory,
  // <repository>/uploads (services/image_uploads.py UPLOADS_ROOT), which
  // Compose mounts as the buyerly-uploads volume for both services.
  // SERVER_UPLOADS_DIR replaces it; the tests use a directory of their own.
  uploadsRoot: string;

  // The built React app and public pages (frontend/dist), served by this
  // server with SERVE_STATIC (default on); SERVICE_WORKER off serves the
  // service worker's kill switch instead (#499). FRONTEND_DIST replaces the
  // directory.
  frontendDir: string;
  serveStatic: boolean;
  serviceWorker: boolean;

  // Redis (decision 54): the worker's BullMQ queues (worker/), and the sync
  // bus between processes. Empty means none: the worker refuses to start.
  redisUrl: string;
  // Background jobs the TypeScript worker owns (#611 stage 4); the Python
  // worker skips them (core/worker_jobs.py). Comma-separated job ids.
  tsWorkerJobs: string;
  // Where Python's monitoring cycle leaves the rules engine's captures for
  // the shadow run (rules/shadow.py, rules/shadow.ts); both workers mount it.
  rulesShadowDir: string;
  // RULES_SHADOW_REPLAY_DIR: where the rule cycle leaves its decision inputs
  // for the Python worker to decide on (the reverse shadow run).
  rulesShadowReplayDir: string;
  // Meta (core/config.py): the pinned Graph API version and origin (the fake
  // Meta on the local stack), the app and its Facebook Login for Business
  // configuration, and the Fernet keys stored Meta tokens are encrypted with
  // ("primary[,older decrypt-only keys]"), the same as the Python API's.
  metaGraphVersion: string;
  metaGraphBaseUrl: string;
  metaAppId: string;
  metaAppSecret: string;
  metaLoginConfigId: string;
  metaOauthRedirectUri: string;
  metaTokenEncryptionKey: string;
}

// <repository>/uploads, from server/src/config.ts and server/dist/config.js alike.
export const DEFAULT_UPLOADS_ROOT = fileURLToPath(new URL('../../uploads', import.meta.url));
// <repository>/frontend/dist, the React build.
export const DEFAULT_FRONTEND_DIR = fileURLToPath(new URL('../../frontend/dist', import.meta.url));

// Compose gives the Python services SQLAlchemy URLs
// ("postgresql+asyncpg://…"); node-postgres wants the plain scheme.
export function postgresUrl(url: string): string {
  return url.replace(/^postgres(?:ql)?\+[a-z0-9]+:\/\//, 'postgresql://');
}

// LOG_LEVEL is shared with the Python services, which name two levels
// differently; anything unknown falls back to info rather than failing start.
const LOG_LEVELS: Record<string, string> = {
  trace: 'trace', debug: 'debug', info: 'info', warn: 'warn', warning: 'warn',
  error: 'error', fatal: 'fatal', critical: 'fatal', silent: 'silent',
};

export function logLevel(value: string | undefined): string {
  return LOG_LEVELS[(value ?? '').trim().toLowerCase()] ?? 'info';
}

// pydantic's reading of a bool, which the Python services apply to the same
// variables: 1/true/yes/on and 0/false/no/off, in any case.
export function envBool(value: string | undefined, fallback: boolean): boolean {
  const clean = (value ?? '').trim().toLowerCase();
  if (['1', 'true', 't', 'yes', 'y', 'on'].includes(clean)) return true;
  if (['0', 'false', 'f', 'no', 'n', 'off'].includes(clean)) return false;
  return fallback;
}

function envInt(name: string, value: string | undefined, fallback: number, min: number, max: number): number {
  if (value === undefined || value.trim() === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${name} must be an integer from ${min} to ${max}: ${value}`);
  }
  return parsed;
}

export function readConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const port = Number(env.SERVER_PORT ?? 8090);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`SERVER_PORT is not a port: ${env.SERVER_PORT}`);
  }
  return {
    port,
    host: env.SERVER_HOST ?? '0.0.0.0',
    version: env.APP_VERSION || 'local',
    databaseUrl: postgresUrl(env.DATABASE_URL ?? ''),
    logLevel: logLevel(env.LOG_LEVEL),
    trustedProxyCidrs: env.TRUSTED_PROXY_CIDRS ?? '',
    cloudflareIpCidrs: env.CLOUDFLARE_IP_CIDRS ?? '',
    cloudflareTunnelCidrs: env.CLOUDFLARE_TUNNEL_CIDRS ?? '',
    webappUrl: env.WEBAPP_URL ?? '',
    corsOrigins: env.CORS_ORIGINS ?? '',
    apiUrl: env.API_URL ?? '',
    webSessionIdleDays: envInt('WEB_SESSION_IDLE_DAYS', env.WEB_SESSION_IDLE_DAYS, 90, 1, 365),
    sessionCookieSecure: envBool(env.SESSION_COOKIE_SECURE, true),
    resendApiKey: env.RESEND_API_KEY ?? '',
    emailFrom: env.EMAIL_FROM || 'Buyerly <team@buyerly.app>',
    devEmailLog: envBool(env.DEV_EMAIL_LOG, false),
    turnstileSecretKey: env.TURNSTILE_SECRET_KEY ?? '',
    otpPepper: env.OTP_PEPPER ?? '',
    // .env files sometimes keep the quotes around a pasted token.
    telegramBotToken: (env.TELEGRAM_BOT_TOKEN ?? '').replace(/^["' \t\r\n]+|["' \t\r\n]+$/g, ''),
    vapidPrivateKey: (env.VAPID_PRIVATE_KEY ?? '').trim(),
    vapidSubject: env.VAPID_SUBJECT || 'mailto:team@buyerly.app',
    uploadsRoot: env.SERVER_UPLOADS_DIR || DEFAULT_UPLOADS_ROOT,
    frontendDir: env.FRONTEND_DIST || DEFAULT_FRONTEND_DIR,
    serveStatic: envBool(env.SERVE_STATIC, true),
    serviceWorker: envBool(env.SERVICE_WORKER, true),
    redisUrl: (env.REDIS_URL ?? '').trim(),
    tsWorkerJobs: env.TS_WORKER_JOBS ?? '',
    rulesShadowDir: (env.RULES_SHADOW_DIR ?? '').trim(),
    rulesShadowReplayDir: (env.RULES_SHADOW_REPLAY_DIR ?? '').trim(),
    metaGraphVersion: env.META_GRAPH_VERSION || 'v26.0',
    metaGraphBaseUrl: env.META_GRAPH_BASE_URL || 'https://graph.facebook.com',
    metaAppId: env.META_APP_ID ?? '',
    metaAppSecret: env.META_APP_SECRET ?? '',
    metaLoginConfigId: env.META_LOGIN_CONFIG_ID ?? '',
    metaOauthRedirectUri: env.META_OAUTH_REDIRECT_URI ?? '',
    metaTokenEncryptionKey: env.META_TOKEN_ENCRYPTION_KEY ?? '',
  };
}
