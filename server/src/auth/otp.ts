import { createHmac, randomBytes, randomInt } from 'node:crypto';
import type { EntityManager } from 'typeorm';
import { rows } from '../database.ts';
import { EmailVerificationCodeEntity } from '../entities/index.ts';

// One-time codes and email links (services/otp.py). Rows hold only HMACs of
// the code and the link token, keyed with OTP_PEPPER, which both servers
// share: a code one server mailed verifies on the other.

export const OTP_LOGIN = 'login';
export const OTP_EMAIL_CHANGE = 'email_change';
export const OTP_EMAIL_VERIFICATION = 'email_verification';

// Like Linear's: ten capital letters, typed or pasted in any case and spacing.
const OTP_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const OTP_LENGTH = 10;
const OTP_LIFETIME_MS = 5 * 60_000;
const MAX_FAILED_ATTEMPTS = 5;

export interface IssuedOtp {
  recordId: number;
  code: string;
  linkToken: string;
}

export interface ConsumedOtp {
  status: 'consumed' | 'invalid' | 'locked';
  email?: string;
  purpose?: string;
  inviteId?: number | null;
}

export function loginScope(email: string): string {
  return `login:${email.trim().toLowerCase()}`;
}

export function emailScope(userId: number): string {
  return `email:${userId}`;
}

export function normalizeOtp(code: string): string {
  return code.replace(/\s+/g, '').toUpperCase();
}

// Python's secrets.token_urlsafe(32).
export function urlSafeToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export class Otp {
  constructor(private readonly pepper: string) {}

  hash(value: string): string {
    if (!this.pepper) throw new Error('OTP_PEPPER must be configured');
    return createHmac('sha256', this.pepper).update(value, 'utf8').digest('hex');
  }

  // Whether the scope has an unused code from the last minute. Takes the
  // scope's advisory lock first (the same key as the Python API's), so two
  // requests, on either server, cannot both issue a code.
  async hasRecentActive(tx: EntityManager, scope: string, seconds = 60): Promise<boolean> {
    await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`buyerly-otp-scope:${scope}`]);
    const found = await rows(tx,
      `SELECT id FROM email_verification_codes
        WHERE scope = $1 AND is_used = false AND created_at > $2
        LIMIT 1`,
      [scope, new Date(Date.now() - seconds * 1000)],
    );
    return found.length > 0;
  }

  // A new code for the scope; any earlier unused one stops working.
  async create(
    tx: EntityManager,
    options: { email: string; purpose: string; scope: string; inviteId?: number | null },
  ): Promise<IssuedOtp> {
    const now = new Date();
    await tx.update(
      EmailVerificationCodeEntity,
      { scope: options.scope, isUsed: false },
      { isUsed: true },
    );
    const code = Array.from({ length: OTP_LENGTH }, () => OTP_ALPHABET[randomInt(OTP_ALPHABET.length)]).join('');
    const linkToken = urlSafeToken();
    const record = tx.create(EmailVerificationCodeEntity, {
      email: options.email.trim().toLowerCase(),
      code: '',
      codeHash: this.hash(code),
      linkTokenHash: this.hash(linkToken),
      inviteId: options.inviteId ?? null,
      purpose: options.purpose,
      scope: options.scope,
      expiresAt: new Date(now.getTime() + OTP_LIFETIME_MS),
      isUsed: false,
      failedAttempts: 0,
      deliveredAt: null,
      createdAt: now,
    });
    await tx.save(record);
    return { recordId: record.id, code, linkToken };
  }

  // Delivered codes only can be entered; false when a newer request replaced it.
  async markDelivered(tx: EntityManager, recordId: number): Promise<boolean> {
    const marked = await rows(tx,
      `UPDATE email_verification_codes SET delivered_at = $2
        WHERE id = $1 AND is_used = false AND delivered_at IS NULL
        RETURNING id`,
      [recordId, new Date()],
    );
    return marked.length > 0;
  }

  async invalidate(tx: EntityManager, recordId: number): Promise<void> {
    await tx.update(EmailVerificationCodeEntity, { id: recordId }, { isUsed: true });
  }

  // Atomically consume the scope's delivered code, or count one failed
  // attempt; the fifth failure spends the code ("locked").
  async consume(tx: EntityManager, scope: string, enteredCode: string): Promise<ConsumedOtp> {
    const now = new Date();
    const live = `is_used = false AND delivered_at IS NOT NULL AND expires_at > $2 AND failed_attempts < ${MAX_FAILED_ATTEMPTS}`;
    const found = await rows<{ id: number }>(tx,
      `SELECT id FROM email_verification_codes
        WHERE scope = $1 AND ${live}
        ORDER BY id DESC LIMIT 1`,
      [scope, now],
    );
    const recordId = found[0]?.id;
    if (recordId === undefined) return { status: 'invalid' };

    const consumed = await rows<ConsumedRow>(tx,
      `UPDATE email_verification_codes SET is_used = true
        WHERE id = $1 AND ${live} AND code_hash = $3
        RETURNING email, purpose, invite_id`,
      [recordId, now, this.hash(normalizeOtp(enteredCode))],
    );
    if (consumed[0]) return consumedFrom(consumed[0]);

    const failed = await rows<{ is_used: boolean }>(tx,
      `UPDATE email_verification_codes
          SET failed_attempts = failed_attempts + 1,
              is_used = (failed_attempts + 1 >= ${MAX_FAILED_ATTEMPTS})
        WHERE id = $1 AND ${live}
        RETURNING is_used`,
      [recordId, now],
    );
    if (!failed[0]) return { status: 'invalid' };
    return { status: failed[0].is_used ? 'locked' : 'invalid' };
  }

  // Atomically consume a delivered, unexpired email-link token.
  async consumeMagicLink(tx: EntityManager, rawToken: string): Promise<ConsumedOtp> {
    const token = rawToken.trim();
    if (!token) return { status: 'invalid' };
    const consumed = await rows<ConsumedRow>(tx,
      `UPDATE email_verification_codes SET is_used = true
        WHERE link_token_hash = $1 AND is_used = false
          AND delivered_at IS NOT NULL AND expires_at > $2
        RETURNING email, purpose, invite_id`,
      [this.hash(token), new Date()],
    );
    return consumed[0] ? consumedFrom(consumed[0]) : { status: 'invalid' };
  }
}

interface ConsumedRow {
  email: string;
  purpose: string;
  invite_id: number | null;
}

function consumedFrom(row: ConsumedRow): ConsumedOtp {
  return { status: 'consumed', email: row.email, purpose: row.purpose, inviteId: row.invite_id };
}
