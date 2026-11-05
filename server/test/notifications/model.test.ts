import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { NOTIFICATION_CHANNELS, storedNotificationChannels } from '../../src/notifications/channels.ts';
import { validate } from '../../src/notifications/model.ts';
import { vapidPublicKey } from '../../src/notifications/web-push.ts';
import { TEST_VAPID_PRIVATE_KEY, TEST_VAPID_PUBLIC_KEY } from '../support/target.ts';

// The area's pydantic models and VAPID key, without a database. The
// messages are pydantic 2's for the same inputs (api/routers/audit.py
// NotificationChannels, core/web_push.py).

const ALL = ['urgent', 'rule_alerts', 'rule_actions', 'assistant', 'manual', 'team', 'system'];
const LITERAL = "Input should be 'urgent', 'rule_alerts', 'rule_actions', 'assistant', 'manual', 'team' or 'system'";
const issues = (value: unknown): string[] => validate(NOTIFICATION_CHANNELS, value).issues;

describe('notification channels', () => {
  it('fills Linear defaults and keeps kinds in order without repeats', () => {
    expect(validate(NOTIFICATION_CHANNELS, { email: { kinds: ['team', 'urgent', 'team'] }, invite_accepted: 'no', extra: 1 }).value).toEqual({
      email: { enabled: true, priority_only: false, kinds: ['urgent', 'team'] },
      telegram: { enabled: false, priority_only: false, kinds: ALL },
      desktop: { enabled: false, priority_only: false, kinds: ALL },
      invite_accepted: false,
    });
  });

  it("words problems as pydantic does", () => {
    expect(issues([1])).toEqual(['Input should be a valid dictionary or instance of NotificationChannels']);
    expect(issues({ email: 1 })).toEqual(['Input should be a valid dictionary or instance of EmailNotifications']);
    expect(issues({ email: { enabled: 'maybe', kinds: ['x', 3] } })).toEqual([
      'Input should be a valid boolean, unable to interpret input', LITERAL, LITERAL,
    ]);
    expect(issues({ email: { kinds: Array(8).fill('x') } })).toEqual(['List should have at most 7 items after validation, not 8']);
    expect(issues({ email: { enabled: 2, priority_only: null, kinds: 'urgent' } })).toEqual([
      'Input should be a valid boolean, unable to interpret input', 'Input should be a valid boolean', 'Input should be a valid list',
    ]);
    expect(issues({ telegram: { enabled: 1.5 } })).toEqual(['Input should be a valid boolean']);
  });

  it('reads anything stored that the model refuses as the defaults', () => {
    expect(storedNotificationChannels({ email: { enabled: 'maybe' } }).email.enabled).toBe(true);
    expect(storedNotificationChannels(null).desktop.enabled).toBe(false);
    expect(storedNotificationChannels({ desktop: { enabled: true } }).desktop.enabled).toBe(true);
  });
});

describe('VAPID key', () => {
  it('takes a raw scalar, PEM and DER, and nothing else', () => {
    expect(vapidPublicKey(TEST_VAPID_PRIVATE_KEY)).toBe(TEST_VAPID_PUBLIC_KEY);
    const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const point = publicKey.export({ format: 'der', type: 'spki' }).subarray(-65).toString('base64url');
    const pem = privateKey.export({ format: 'pem', type: 'sec1' }) as string;
    expect(vapidPublicKey(pem.replace(/\n/g, '\\n'))).toBe(point);
    expect(vapidPublicKey((privateKey.export({ format: 'der', type: 'sec1' })).toString('base64'))).toBe(point);
    expect(vapidPublicKey((privateKey.export({ format: 'der', type: 'pkcs8' })).toString('base64url'))).toBe(point);
    expect(vapidPublicKey('')).toBeNull();
    expect(vapidPublicKey('not a key')).toBeNull();
    const rsa = generateKeyPairSync('rsa', { modulusLength: 1024 }).privateKey.export({ format: 'pem', type: 'pkcs8' }) as string;
    expect(vapidPublicKey(rsa)).toBeNull();
  });
});
