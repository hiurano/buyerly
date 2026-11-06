"""meta_api/ over scripted Meta answers, for the TypeScript port's parity test.

server/test/meta/client.test.ts sends a JSON list of cases on stdin and
compares each answer with src/meta/*.ts. A case is one of:

- {"kind": "client", "options": {...}, "responses": [...], "calls": [...]}:
  one MetaClient; every request it sends is answered from "responses" in
  order ({"status", "headers", "body"} or {"network_error": "text"}; an empty
  queue answers 200 "{}"). With "transport": "fake_meta" the answers come
  from scripts/fake_meta.py in-process instead, and are returned so the port
  can replay the same ones. The answer lists every request (method, URL with
  its query, form body), every call's result or error, every wait, and the
  quota snapshot at the end.
- {"kind": "oauth", ...}: the same for one MetaOAuthClient.
- {"kind": "fn", "fn": name, "args": [...]}: one pure function.

Time, jitter and waiting are pinned: time.time() and time.monotonic() read
"now", random.uniform(a, b) is its midpoint, and sleeps are recorded.
"""

import asyncio
import json
import os
import sys
import tempfile
from datetime import datetime, timezone
from types import SimpleNamespace

import httpx

import meta_api.client as client_module
import meta_api.oauth as oauth_module
from core import currency, timezones
from core.config import settings
from meta_api.client import MetaClient, MetaRateLimitDeferred, MetaTokenAuthError, classify_meta_token_error
from meta_api.oauth import MetaOAuthClient, MetaOAuthRemoteError, evaluate_meta_connection_health

_REAL_ASYNC_CLIENT = httpx.AsyncClient


def _jsonable(value):
    if isinstance(value, datetime):
        return {"$ts": value.timestamp()}
    if isinstance(value, dict):
        return {str(key): _jsonable(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_jsonable(item) for item in value]
    return value


def _failure(error):
    if isinstance(error, MetaTokenAuthError):
        return {
            "fail": "MetaTokenAuthError",
            "message": str(error),
            "details": {
                "code": error.code,
                "subcode": error.subcode,
                "subcodeKey": error.subcode_key,
                "title": error.title,
                "description": error.description,
                "actionHint": error.action_hint,
                "errorUserTitle": error.error_user_title,
                "errorUserMsg": error.error_user_msg,
                "fbtraceId": error.fbtrace_id,
            },
        }
    if isinstance(error, MetaRateLimitDeferred):
        return {"fail": "MetaRateLimitDeferred", "message": str(error)}
    if isinstance(error, MetaOAuthRemoteError):
        return {"fail": "MetaOAuthRemoteError", "message": str(error)}
    if type(error) is RuntimeError:
        return {"fail": "MetaApiError", "message": str(error)}
    if type(error) is ValueError:
        return {"fail": "MetaValueError", "message": str(error)}
    # Anything else is Python failing on the payload; only the failing is compared.
    return {"fail": "crash", "message": type(error).__name__}


class _Clock:
    def __init__(self, now):
        self.now = now

    def time(self):
        return self.now

    def monotonic(self):
        return self.now


def _pin(now, sleeps):
    clock = _Clock(now)

    async def sleep(seconds):
        sleeps.append(seconds)

    client_module.time = clock
    client_module.random = SimpleNamespace(uniform=lambda low, high: low + (high - low) * 0.5)
    client_module.asyncio = SimpleNamespace(sleep=sleep)


def _scripted_transport(responses, requests, recorded):
    queue = list(responses)

    def handler(request: httpx.Request):
        requests.append({
            "method": request.method,
            "url": str(request.url),
            "body": request.content.decode("utf-8") if request.content else None,
            "contentType": request.headers.get("content-type"),
        })
        answer = queue.pop(0) if queue else {"status": 200, "headers": {}, "body": "{}"}
        if "network_error" in answer:
            raise httpx.ConnectError(answer["network_error"], request=request)
        return httpx.Response(answer["status"], headers=answer.get("headers") or {}, content=answer["body"].encode("utf-8"))

    return httpx.MockTransport(handler)


def _fake_meta_transport(requests, recorded):
    from scripts import fake_meta

    inner = httpx.ASGITransport(app=fake_meta.app)

    class Recording(httpx.AsyncBaseTransport):
        async def handle_async_request(self, request):
            requests.append({
                "method": request.method,
                "url": str(request.url),
                "body": request.content.decode("utf-8") if request.content else None,
                "contentType": request.headers.get("content-type"),
            })
            response = await inner.handle_async_request(request)
            body = await response.aread()
            headers = {key: value for key, value in response.headers.items() if key.lower().startswith("x-") or key.lower() == "retry-after"}
            recorded.append({"status": response.status_code, "headers": headers, "body": body.decode("utf-8")})
            return httpx.Response(response.status_code, headers=response.headers, content=body)

    return Recording()


async def _run_client(case):
    options = case.get("options") or {}
    settings.META_APP_SECRET = options.get("app_secret", "")
    settings.META_GRAPH_BASE_URL = options.get("base_url", "https://graph.facebook.com")
    sleeps, requests, recorded = [], [], []
    _pin(case.get("now", 1_790_000_000.0), sleeps)
    if case.get("transport") == "fake_meta":
        transport = _fake_meta_transport(requests, recorded)
    else:
        transport = _scripted_transport(case.get("responses") or [], requests, recorded)

    try:
        client = MetaClient(graph_version=options.get("graph_version", "v26.0"))
    except ValueError as error:
        return {"construct": _failure(error)}
    if options.get("automation"):
        client.configure_automation(**options["automation"])
    client._client = _REAL_ASYNC_CLIENT(transport=transport, timeout=15.0)

    results = []
    for call in case["calls"]:
        try:
            value = await getattr(client, call["fn"])(**call.get("args", {}))
            results.append({"ok": _jsonable(value)})
        except Exception as error:  # noqa: BLE001 - every failure is part of the answer
            results.append(_failure(error))
    await client.aclose()
    return {
        "requests": requests,
        "results": results,
        "sleeps": sleeps,
        "usage": _jsonable(client.get_usage_snapshot()),
        "recorded": recorded,
    }


async def _run_oauth(case):
    requests, recorded = [], []
    transport = _scripted_transport(case.get("responses") or [], requests, recorded)

    class Scripted(_REAL_ASYNC_CLIENT):
        def __init__(self, *args, **kwargs):
            kwargs["transport"] = transport
            super().__init__(*args, **kwargs)

    oauth_module.httpx = SimpleNamespace(AsyncClient=Scripted, HTTPError=httpx.HTTPError)
    client = MetaOAuthClient(**case["options"])
    results = []
    for call in case["calls"]:
        try:
            value = getattr(client, call["fn"])(**call.get("args", {}))
            if asyncio.iscoroutine(value):
                value = await value
            results.append({"ok": _jsonable(value)})
        except Exception as error:  # noqa: BLE001
            results.append(_failure(error))
    oauth_module.httpx = httpx
    return {"requests": requests, "results": results}


FUNCTIONS = {
    "classify": lambda error_data, fallback: classify_meta_token_error(error_data, fallback),
    "normalize_basic_insight": lambda insight: MetaClient._normalize_basic_insight(insight),
    "from_meta_budget_units": currency.from_meta_budget_units,
    "to_meta_budget_units": currency.to_meta_budget_units,
    "canonical_timezone_name": timezones.canonical_timezone_name,
    "connection_health": lambda debug, now: evaluate_meta_connection_health(
        debug, datetime.fromtimestamp(now, tz=timezone.utc)
    ),
    "period_params": MetaClient._period_params,
}


def _run_fn(case):
    try:
        value = FUNCTIONS[case["fn"]](*case["args"])
    except Exception as error:  # noqa: BLE001
        return _failure(error)
    if isinstance(value, MetaTokenAuthError):
        return {"ok": _failure(value)}
    return {"ok": _jsonable(value)}


async def main():
    cases = json.load(sys.stdin)
    answers = []
    for case in cases:
        if case["kind"] == "client":
            answers.append(await _run_client(case))
        elif case["kind"] == "oauth":
            answers.append(await _run_oauth(case))
        else:
            answers.append(_run_fn(case))
    json.dump(answers, sys.stdout)


if __name__ == "__main__":
    # The fake Meta keeps status and budget changes in this file; a fresh one per run.
    os.environ.setdefault("FAKE_META_STATE", os.path.join(tempfile.mkdtemp(), "fake-meta.json"))
    asyncio.run(main())
