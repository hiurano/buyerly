import { isIP } from 'node:net';
import type { EntityManager } from 'typeorm';
import { Arg, Ctx, Mutation, Query, Resolver } from 'type-graphql';
import { DesktopPushSubscriptionEntity, WorkspaceMemberEntity } from '../../../entities/index.ts';
import { INBOX_KINDS } from '../../../notifications/channels.ts';
import { field, model, str, ValueError } from '../../../notifications/model.ts';
import { b64urlDecode, vapidPublicKey } from '../../../notifications/web-push.ts';
import type { ActingMember } from '../../../workspaces/access.ts';
import { mutated, type GraphQLContext } from '../../context.ts';
import { invalidInput, RouteError } from '../../errors.ts';
import { DesktopNotificationsPayload, type Payload } from '../../payloads.ts';
import { JSONScalar } from '../../scalars.ts';
import { workspaceMember } from '../views/views.resolver.ts';
import { parseBody } from './body.ts';
import { memberChannels } from './channels.resolver.ts';

// Settings → Notifications → Desktop (api/routers/desktop_notifications.py):
// this browser's Web Push subscription, as Linear's Desktop channel. It
// belongs to the member and to the sign-in it was made in, so signing out
// of the browser ends it.

const MAX_ENDPOINT_LENGTH = 2048;

// urlsplit(value).hostname: the host of "scheme://[user@]host[:port]/…", lowercased.
function hostname(value: string): { scheme: string; host: string } {
  const scheme = /^([A-Za-z][A-Za-z0-9+.-]*):/.exec(value);
  const rest = scheme ? value.slice(scheme[0].length) : value;
  if (!rest.startsWith('//')) return { scheme: scheme?.[1].toLowerCase() ?? '', host: '' };
  const netloc = rest.slice(2).split(/[/?#]/, 1)[0];
  const hostPort = netloc.slice(netloc.lastIndexOf('@') + 1);
  let host: string;
  if (hostPort.startsWith('[')) {
    const end = hostPort.indexOf(']');
    if (end < 0) throw new ValueError('Invalid IPv6 URL');
    host = hostPort.slice(1, end);
  } else {
    host = hostPort.split(':', 1)[0];
  }
  return { scheme: scheme?.[1].toLowerCase() ?? '', host: host.toLowerCase() };
}

// A push service is a public https host, never an address or this server's network.
function validEndpoint(raw: string): string {
  const value = raw.trim();
  const { scheme, host } = hostname(value);
  if (scheme !== 'https' || !host || [...value].length > MAX_ENDPOINT_LENGTH) throw new ValueError('Not a push service address');
  if (isIP(host) || host === 'localhost' || ['.localhost', '.local', '.internal'].some((end) => host.endsWith(end))) {
    throw new ValueError('Not a push service address');
  }
  return value;
}

function decodedLength(value: string, message: string, check: (raw: Buffer) => boolean): string {
  let raw: Buffer;
  try {
    raw = b64urlDecode(value);
  } catch {
    throw new ValueError(message);
  }
  if (!check(raw)) throw new ValueError(message);
  return value;
}

// PushSubscription.toJSON() from the browser.
const PUSH_SUBSCRIPTION = model('PushSubscriptionIn', {
  endpoint: field(str(undefined, validEndpoint)),
  keys: field(model('PushKeys', {
    p256dh: field(str(200, (value) => decodedLength(value, 'Not a P-256 public key', (raw) => raw.length === 65 && raw[0] === 4))),
    auth: field(str(100, (value) => decodedLength(value, 'Not an auth secret', (raw) => raw.length === 16))),
  })),
});

const PUSH_ENDPOINT = model('PushEndpoint', { endpoint: field(str(MAX_ENDPOINT_LENGTH)) });

const publicKeys = new Map<string, string | null>();

function publicKey(context: GraphQLContext): string | null {
  const value = context.app.config.vapidPrivateKey;
  if (!publicKeys.has(value)) publicKeys.set(value, vapidPublicKey(value, context.app.log));
  return publicKeys.get(value)!;
}

async function subscription(tx: EntityManager, member: ActingMember, endpoint: string | null): Promise<DesktopPushSubscriptionEntity | null> {
  if (member.id === null || !endpoint) return null;
  return tx.findOneBy(DesktopPushSubscriptionEntity, { memberId: member.id, endpoint });
}

function payload(context: GraphQLContext, found: DesktopPushSubscriptionEntity | null, extra: Record<string, unknown> = {}): Record<string, unknown> {
  const key = publicKey(context);
  return {
    available: key !== null,
    public_key: key,
    // A subscription made in another sign-in of this browser (since signed out) does not count.
    subscribed: found !== null && found.webSessionId === context.webSessionId,
    ...extra,
  };
}

function ownMember(member: ActingMember): number {
  if (member.id === null) throw new RouteError(403, 'Support access cannot change these settings.');
  return member.id;
}

@Resolver()
export class DesktopNotificationsResolver {
  @Query(() => JSONScalar, { description: 'Whether desktop notifications work here and reach this browser.' })
  async desktopNotifications(
    @Arg('endpoint', () => String, { nullable: true, defaultValue: null }) endpoint: string | null,
    @Ctx() context: GraphQLContext,
  ): Promise<unknown> {
    if (endpoint !== null && [...endpoint].length > MAX_ENDPOINT_LENGTH) {
      throw invalidInput([`String should have at most ${MAX_ENDPOINT_LENGTH} characters`]);
    }
    return context.app.db.transaction(async (tx) => {
      const { member } = await workspaceMember(tx, context.user);
      return payload(context, await subscription(tx, member, endpoint));
    });
  }

  @Mutation(() => DesktopNotificationsPayload, { nullable: true, description: "This browser gets the member's desktop notifications." })
  async desktopNotificationsSubscribe(@Arg('input', () => JSONScalar) input: unknown, @Ctx() context: GraphQLContext): Promise<Payload> {
    const body = parseBody(PUSH_SUBSCRIPTION, input);
    if (publicKey(context) === null) throw new RouteError(409, 'Desktop notifications are not available.');
    const userAgent = [...(context.http.headers['user-agent'] ?? '')].slice(0, 500).join('');
    const result = await context.app.db.transaction(async (tx) => {
      const { member } = await workspaceMember(tx, context.user);
      const memberId = ownMember(member);
      await tx.query(
        `INSERT INTO desktop_push_subscriptions (member_id, endpoint, web_session_id, p256dh, auth, user_agent, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, now())
         ON CONFLICT ON CONSTRAINT uq_desktop_push_member_endpoint DO UPDATE SET web_session_id = EXCLUDED.web_session_id,
           p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth, user_agent = EXCLUDED.user_agent`,
        [memberId, body.endpoint, context.webSessionId, body.keys.p256dh, body.keys.auth, userAgent],
      );
      const channels = await memberChannels(tx, member);
      channels.desktop.enabled = true;
      // As in Linear: switching a channel on with every type off switches every type on.
      if (!channels.desktop.kinds.length && !channels.desktop.priority_only) channels.desktop.kinds = [...INBOX_KINDS];
      await tx.update(WorkspaceMemberEntity, { id: memberId }, { notificationChannels: channels });
      return payload(context, await subscription(tx, member, body.endpoint));
    });
    return mutated(context, DesktopNotificationsPayload, result);
  }

  @Mutation(() => DesktopNotificationsPayload, { nullable: true, description: "This browser stops getting the member's desktop notifications." })
  async desktopNotificationsUnsubscribe(@Arg('input', () => JSONScalar) input: unknown, @Ctx() context: GraphQLContext): Promise<Payload> {
    const { endpoint } = parseBody(PUSH_ENDPOINT, input);
    const result = await context.app.db.transaction(async (tx) => {
      const { member } = await workspaceMember(tx, context.user);
      const memberId = ownMember(member);
      await tx.delete(DesktopPushSubscriptionEntity, { memberId, endpoint });
      // With no browser left the channel is off.
      if (!(await tx.countBy(DesktopPushSubscriptionEntity, { memberId }))) {
        const channels = await memberChannels(tx, member);
        if (channels.desktop.enabled) {
          channels.desktop.enabled = false;
          await tx.update(WorkspaceMemberEntity, { id: memberId }, { notificationChannels: channels });
        }
      }
      // Whether another account here still uses the browser's push subscription,
      // so the page ends that subscription only when nobody does.
      const inUse = await tx.countBy(DesktopPushSubscriptionEntity, { endpoint });
      return payload(context, null, { browser_in_use: inUse > 0 });
    });
    return mutated(context, DesktopNotificationsPayload, result);
  }
}
