import base64
import json
import struct
import unittest
from datetime import datetime, timedelta, timezone

import httpx
from cryptography.hazmat.primitives import hashes, hmac, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.utils import encode_dss_signature
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

import api.auth as api_auth_module
import api.routes as api_routes_module
import api.server as api_server_module
import core.web_push as web_push
import database.db as database_db
import services.inbox_push as inbox_push
from api.server import create_app
from core.config import settings
from core.rate_limit import limiter
from database.models import (
    AuditEvent,
    DesktopPushSubscription,
    InboxNotificationState,
    InboxPushDelivery,
    User,
    Workspace,
    WorkspaceMember,
)
from tests.client_api_transport import client_api_transport
from tests.test_db_helper import create_test_engine, init_test_db, session_headers

OWNER = {"id": 7300000001, "first_name": "Owner", "username": "push_owner"}
BUYER = {"id": 7300000002, "first_name": "Buyer", "username": "push_buyer"}
ALL_KINDS = ["urgent", "rule_alerts", "rule_actions", "assistant", "manual", "team", "system"]


def _hmac(key, data):
    mac = hmac.HMAC(key, hashes.SHA256())
    mac.update(data)
    return mac.finalize()


class Browser:
    """A browser's side of a push subscription: its keys, and decrypting what arrives (RFC 8291)."""

    def __init__(self, endpoint="https://push.example.com/send/abc"):
        self.key = ec.generate_private_key(ec.SECP256R1())
        self.public = self.key.public_key().public_bytes(
            serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint
        )
        self.auth = b"0123456789abcdef"
        self.endpoint = endpoint

    def subscription(self):
        return {
            "endpoint": self.endpoint,
            "keys": {"p256dh": web_push.b64url_encode(self.public), "auth": web_push.b64url_encode(self.auth)},
        }

    def decrypt(self, body: bytes) -> bytes:
        salt, (record_size, id_length) = body[:16], struct.unpack("!IB", body[16:21])
        sender_public = body[21:21 + id_length]
        self.record_size = record_size
        sender = ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), sender_public)
        shared = self.key.exchange(ec.ECDH(), sender)
        ikm = _hmac(_hmac(self.auth, shared), b"WebPush: info\x00" + self.public + sender_public + b"\x01")
        prk = _hmac(salt, ikm)
        cek = _hmac(prk, b"Content-Encoding: aes128gcm\x00\x01")[:16]
        nonce = _hmac(prk, b"Content-Encoding: nonce\x00\x01")[:12]
        padded = AESGCM(cek).decrypt(nonce, body[21 + id_length:], None)
        self.assert_last_record(padded)
        return padded.rstrip(b"\x00")[:-1]

    @staticmethod
    def assert_last_record(padded: bytes):
        assert padded.rstrip(b"\x00").endswith(b"\x02"), "the only record must end with 0x02"


class FakePushService:
    """The injected sender: records what each browser would get and answers with `status`."""

    def __init__(self, status=201):
        self.sent = []
        self.status = status

    async def __call__(self, endpoint, p256dh, auth, message):
        self.sent.append({"endpoint": endpoint, "message": message})
        status = self.status(endpoint) if callable(self.status) else self.status
        return web_push.SendResult(ok=200 <= status < 300, status=status)


class TestWebPushProtocol(unittest.IsolatedAsyncioTestCase):
    """The request a push service gets: an aes128gcm body only the browser can read, signed with VAPID."""

    def setUp(self):
        self.saved = settings.VAPID_PRIVATE_KEY, settings.VAPID_SUBJECT
        settings.VAPID_PRIVATE_KEY = web_push.generate_private_key()
        settings.VAPID_SUBJECT = "mailto:team@example.test"

    def tearDown(self):
        settings.VAPID_PRIVATE_KEY, settings.VAPID_SUBJECT = self.saved

    async def test_push_service_gets_an_encrypted_signed_message(self):
        browser = Browser()
        requests = []

        def handler(request: httpx.Request):
            requests.append(request)
            return httpx.Response(201)

        result = await web_push.send(
            browser.endpoint, *browser.subscription()["keys"].values(), {"title": "Hi", "url": "/acme/inbox/1"},
            transport=httpx.MockTransport(handler),
        )
        self.assertTrue(result.ok)
        request = requests[0]
        self.assertEqual(str(request.url), browser.endpoint)
        self.assertEqual(request.headers["content-encoding"], "aes128gcm")
        self.assertEqual(request.headers["ttl"], str(web_push.TTL_SECONDS))
        self.assertEqual(json.loads(browser.decrypt(request.content)), {"title": "Hi", "url": "/acme/inbox/1"})

        # Authorization: vapid t=<ES256 JWT for the push service's origin>, k=<our public key>.
        scheme, params = request.headers["authorization"].split(" ", 1)
        self.assertEqual(scheme, "vapid")
        fields = dict(part.strip().split("=", 1) for part in params.split(","))
        self.assertEqual(fields["k"], web_push.public_key())
        header, claims, signature = fields["t"].split(".")
        self.assertEqual(json.loads(web_push.b64url_decode(header)), {"typ": "JWT", "alg": "ES256"})
        claims = json.loads(web_push.b64url_decode(claims))
        self.assertEqual(claims["aud"], "https://push.example.com")
        self.assertEqual(claims["sub"], "mailto:team@example.test")
        self.assertGreater(claims["exp"], datetime.now(timezone.utc).timestamp())
        raw = web_push.b64url_decode(signature)
        public = ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), web_push.b64url_decode(fields["k"]))
        public.verify(
            encode_dss_signature(int.from_bytes(raw[:32], "big"), int.from_bytes(raw[32:], "big")),
            f"{header}.{fields['t'].split('.')[1]}".encode(),
            ec.ECDSA(hashes.SHA256()),
        )

    async def test_expired_subscription_and_outage_are_told_apart(self):
        browser = Browser()
        for status, ok, gone in ((410, False, True), (404, False, True), (429, False, False), (500, False, False)):
            result = await web_push.send(
                browser.endpoint, *browser.subscription()["keys"].values(), {"title": "Hi"},
                transport=httpx.MockTransport(lambda request, status=status: httpx.Response(status)),
            )
            self.assertEqual((result.ok, result.gone), (ok, gone), status)

    def test_key_formats_deploy_and_dev_write(self):
        raw = web_push.generate_private_key()
        key = ec.derive_private_key(int.from_bytes(web_push.b64url_decode(raw), "big"), ec.SECP256R1())
        # scripts/deploy.sh: `openssl ecparam -genkey -outform DER`, base64url.
        der = key.private_bytes(
            serialization.Encoding.DER, serialization.PrivateFormat.TraditionalOpenSSL, serialization.NoEncryption()
        )
        for value in (raw, web_push.b64url_encode(der), base64.b64encode(der).decode()):
            settings.VAPID_PRIVATE_KEY = value
            self.assertEqual(len(web_push.b64url_decode(web_push.public_key())), 65)
        settings.VAPID_PRIVATE_KEY = "not a key"
        self.assertFalse(web_push.is_configured())
        settings.VAPID_PRIVATE_KEY = ""
        self.assertIsNone(web_push.public_key())


class TestDesktopNotifications(unittest.IsolatedAsyncioTestCase):
    """Turn Desktop on in a browser, get unread Inbox notifications there until it is off or signed out."""

    async def asyncSetUp(self):
        api_routes_module._summary_cache.clear()
        await limiter.reset()
        self.engine = create_test_engine()
        self.session_maker = async_sessionmaker(self.engine, class_=AsyncSession, expire_on_commit=False)
        await init_test_db(self.engine)
        api_routes_module.async_session_maker = self.session_maker
        api_auth_module.async_session_maker = self.session_maker
        api_server_module.async_session_maker = self.session_maker
        settings.ADMIN_CHAT_ID = "1"
        self.saved = settings.VAPID_PRIVATE_KEY
        settings.VAPID_PRIVATE_KEY = web_push.generate_private_key()

        self.owner_headers = await session_headers(self.session_maker, OWNER)
        self.buyer_headers = await session_headers(self.session_maker, BUYER)
        self.now = datetime.now(timezone.utc)
        async with self.session_maker() as session:
            users = {user.username: user for user in (await session.execute(select(User))).scalars().all()}
            self.owner, self.buyer = users["push_owner"], users["push_buyer"]
            self.workspace = Workspace(name="Acme", slug="acme", owner_user_id=self.owner.id)
            session.add(self.workspace)
            await session.flush()
            old_mark = self.now - timedelta(days=1)
            session.add_all([
                WorkspaceMember(
                    workspace_id=self.workspace.id, user_id=self.owner.id, role="owner", inbox_read_before=old_mark
                ),
                WorkspaceMember(
                    workspace_id=self.workspace.id, user_id=self.buyer.id, role="buyer", inbox_read_before=old_mark
                ),
            ])
            for user in (self.owner, self.buyer):
                user.active_workspace_id = self.workspace.id
                user.is_approved = True
            await session.commit()
        self.client = httpx.AsyncClient(transport=client_api_transport(app=create_app()), base_url="http://test")

    async def asyncTearDown(self):
        settings.VAPID_PRIVATE_KEY = self.saved
        await self.client.aclose()
        await self.engine.dispose()
        await database_db.engine.dispose()

    async def state(self, browser=None, headers=None):
        params = {"endpoint": browser.endpoint} if browser else {}
        response = await self.client.get(
            "/api/notifications/desktop", params=params, headers=headers or self.owner_headers
        )
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    async def subscribe(self, browser, headers=None):
        response = await self.client.post(
            "/api/notifications/desktop/subscribe", json=browser.subscription(), headers=headers or self.owner_headers
        )
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    async def unsubscribe(self, browser, headers=None):
        response = await self.client.post(
            "/api/notifications/desktop/unsubscribe", json={"endpoint": browser.endpoint},
            headers=headers or self.owner_headers,
        )
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    async def channel(self, headers=None):
        response = await self.client.get("/api/notifications/channels", headers=headers or self.owner_headers)
        return response.json()["desktop"]

    async def add_event(self, minutes_ago=1, **values):
        async with self.session_maker() as session:
            event = AuditEvent(
                workspace_id=self.workspace.id,
                event_type=values.pop("event_type", "NOTIFY_ONLY"),
                account_id="act_1",
                account_name="Main",
                entity_name="Ad set 7",
                message=values.pop("message", "CPL above 3"),
                created_at=self.now - timedelta(minutes=minutes_ago),
                **values,
            )
            session.add(event)
            await session.commit()
            return event

    async def deliver(self, status=201):
        fake = FakePushService(status)
        await inbox_push.deliver_inbox_push(session_maker=self.session_maker, send=fake)
        return fake

    async def test_turning_on_subscribes_this_browser_and_turns_the_channel_on(self):
        self.assertEqual(await self.channel(), {"enabled": False, "priority_only": False, "kinds": ALL_KINDS})
        state = await self.state(Browser())
        self.assertEqual((state["available"], state["subscribed"]), (True, False))
        self.assertEqual(state["public_key"], web_push.public_key())

        browser = Browser()
        self.assertTrue((await self.subscribe(browser))["subscribed"])
        self.assertTrue((await self.state(browser))["subscribed"])
        self.assertTrue((await self.channel())["enabled"])
        # Another browser of the same member is not subscribed; nor is this browser for the buyer.
        self.assertFalse((await self.state(Browser("https://push.example.com/send/other")))["subscribed"])
        self.assertFalse((await self.state(browser, self.buyer_headers))["subscribed"])

    async def test_refuses_what_is_not_a_push_subscription(self):
        browser = Browser()
        for endpoint in ("http://push.example.com/x", "https://127.0.0.1/x", "https://localhost/x", "https:///x"):
            body = {**browser.subscription(), "endpoint": endpoint}
            response = await self.client.post(
                "/api/notifications/desktop/subscribe", json=body, headers=self.owner_headers
            )
            self.assertEqual(response.status_code, 422, endpoint)
        body = browser.subscription()
        body["keys"]["p256dh"] = web_push.b64url_encode(b"\x04" + b"1" * 10)
        response = await self.client.post("/api/notifications/desktop/subscribe", json=body, headers=self.owner_headers)
        self.assertEqual(response.status_code, 422)

    async def test_without_a_vapid_key_there_is_no_desktop_channel(self):
        settings.VAPID_PRIVATE_KEY = ""
        state = await self.state()
        self.assertEqual((state["available"], state["public_key"]), (False, None))
        response = await self.client.post(
            "/api/notifications/desktop/subscribe", json=Browser().subscription(), headers=self.owner_headers
        )
        self.assertEqual(response.status_code, 409)

    async def test_unread_notification_goes_to_each_browser_once(self):
        laptop, desktop = Browser(), Browser("https://fcm.example.com/send/desk")
        await self.subscribe(laptop)
        await self.subscribe(desktop)
        event = await self.add_event(minutes_ago=0)
        fake = await self.deliver()
        self.assertEqual(sorted(item["endpoint"] for item in fake.sent), sorted([laptop.endpoint, desktop.endpoint]))
        self.assertEqual(
            fake.sent[0]["message"],
            {
                "title": "Rule alert · Ad set 7",
                "body": "CPL above 3\nMain · Acme",
                "url": f"/acme/inbox/{event.id}",
                "tag": f"inbox-{event.id}",
                "id": event.id,
            },
        )
        self.assertEqual((await self.deliver()).sent, [])
        async with self.session_maker() as session:
            row = (await session.execute(select(InboxPushDelivery))).scalar_one()
        self.assertIsNotNone(row.sent_at)

    async def test_follows_the_desktop_settings_and_read_state(self):
        await self.subscribe(Browser())
        await self.client.put(
            "/api/notifications/channels", headers=self.owner_headers,
            json={"desktop": {"enabled": True, "kinds": ["urgent"]}},
        )
        await self.add_event(event_type="NOTIFY_ONLY", message="alert is off")
        await self.add_event(event_type="TOKEN_EXPIRED", message="urgent")
        read = await self.add_event(event_type="TOKEN_EXPIRED", message="already read")
        await self.add_event(event_type="TOKEN_EXPIRED", message="stale", minutes_ago=60)
        async with self.session_maker() as session:
            session.add(InboxNotificationState(user_id=self.owner.id, audit_event_id=read.id, is_read=True))
            await session.commit()
        fake = await self.deliver()
        self.assertEqual([item["message"]["body"].split("\n")[0] for item in fake.sent], ["urgent"])

    async def test_turning_off_stops_this_browser_only(self):
        laptop, desktop = Browser(), Browser("https://fcm.example.com/send/desk")
        await self.subscribe(laptop)
        await self.subscribe(desktop)
        self.assertEqual((await self.unsubscribe(laptop))["browser_in_use"], False)
        self.assertTrue((await self.channel())["enabled"])
        await self.add_event(message="after laptop off")
        self.assertEqual([item["endpoint"] for item in (await self.deliver()).sent], [desktop.endpoint])

        # The last browser off turns the channel off.
        await self.unsubscribe(desktop)
        self.assertFalse((await self.channel())["enabled"])
        await self.add_event(message="all off")
        self.assertEqual((await self.deliver()).sent, [])

    async def test_another_account_in_the_browser_keeps_its_subscription(self):
        browser = Browser()
        await self.subscribe(browser)
        await self.subscribe(browser, self.buyer_headers)
        self.assertTrue((await self.unsubscribe(browser))["browser_in_use"])
        self.assertTrue((await self.state(browser, self.buyer_headers))["subscribed"])

    async def test_signing_out_stops_notifications_for_that_browser(self):
        browser = Browser()
        await self.subscribe(browser)
        response = await self.client.post("/api/auth/logout", headers=self.owner_headers)
        self.assertEqual(response.status_code, 200, response.text)
        await self.add_event(message="after sign-out")
        self.assertEqual((await self.deliver()).sent, [])
        async with self.session_maker() as session:
            self.assertEqual((await session.execute(select(DesktopPushSubscription))).all(), [])

        # Signed in again: the browser's old subscription does not count until turned on again.
        self.owner_headers = await session_headers(self.session_maker, OWNER)
        self.assertFalse((await self.state(browser))["subscribed"])

    async def test_expired_subscription_is_removed_and_failures_retried(self):
        gone, alive = Browser("https://push.example.com/gone"), Browser("https://push.example.com/alive")
        await self.subscribe(gone)
        await self.subscribe(alive)
        await self.add_event(message="first")
        fake = await self.deliver(lambda endpoint: 410 if endpoint == gone.endpoint else 201)
        self.assertEqual(len(fake.sent), 2)
        async with self.session_maker() as session:
            endpoints = (await session.execute(select(DesktopPushSubscription.endpoint))).scalars().all()
        self.assertEqual(endpoints, [alive.endpoint])

        await self.add_event(message="second")
        self.assertEqual(len((await self.deliver(503)).sent), 1)
        # Not sent anywhere: kept for the next run.
        self.assertEqual([item["message"]["body"].split("\n")[0] for item in (await self.deliver()).sent], ["second"])


if __name__ == "__main__":
    unittest.main()
