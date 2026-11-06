"""What the Python worker jobs would send or decide, for cases read as JSON from stdin.

server/test/worker/delivery.test.ts sends [{"fn": name, "args": {...}}, ...]
and compares each answer with the TypeScript port's
(src/notifications/delivery.ts, web-push.ts, email/workspace-emails.ts):
titles and targets, the Telegram text, the desktop notification, the email
(subject, HTML, text) and the Web Push body for a fixed salt and sender key.
"""

import asyncio
import base64
import json
import sys
from datetime import datetime
from types import SimpleNamespace
from unittest import mock

from cryptography.hazmat.primitives.asymmetric import ec

import core.email as email
from core import web_push
from services.inbox_email import event_target, event_title
from services.inbox_push import push_message
from services.inbox_telegram import message_text
from services.worker_watchdog import cycle_status

EVENT_FIELDS = (
    "id", "event_type", "action", "category", "entity_name", "adset_name",
    "account_name", "entity_id", "adset_id", "account_id", "message",
)


def _event(fields):
    return SimpleNamespace(**{name: fields.get(name) for name in EVENT_FIELDS})


def _email(args):
    captured = {}

    async def capture(to_email, subject, html_content, text_content=None):
        captured.update(to=to_email, subject=subject, html=html_content, text=text_content)
        return True

    with mock.patch.object(email, "send_email", capture):
        asyncio.run(email.send_inbox_notification_email(**args))
    return captured


def _encrypt(args):
    sender = ec.derive_private_key(int.from_bytes(base64.b64decode(args["sender"]), "big"), ec.SECP256R1())
    body = web_push.encrypt(
        args["plaintext"].encode(),
        args["p256dh"],
        args["auth"],
        salt=base64.b64decode(args["salt"]),
        sender_key=sender,
    )
    return base64.b64encode(body).decode()


def answer(case):
    fn, args = case["fn"], case["args"]
    if fn == "title":
        event = _event(args)
        return {"title": event_title(event), "target": event_target(event)}
    if fn == "telegram":
        return message_text(SimpleNamespace(**args["workspace"]), _event(args["event"]))
    if fn == "push":
        return push_message(SimpleNamespace(**args["workspace"]), _event(args["event"]))
    if fn == "email":
        return _email(args)
    if fn == "encrypt":
        return _encrypt(args)
    if fn == "cycle":
        now = datetime.fromisoformat(args["now"].replace("Z", "+00:00"))
        return cycle_status(args["payload"], now)
    raise ValueError(fn)


if __name__ == "__main__":
    print(json.dumps([answer(case) for case in json.load(sys.stdin)]))
