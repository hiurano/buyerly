"""Run-scoped admission for paid provider operations."""

from __future__ import annotations

import asyncio
import inspect
import json
import math
import re
import threading
import uuid


class AdmissionError(ValueError):
    """A local cost control refused the operation."""


class DryRun:
    __slots__ = ("estimated_usd", "normalized")

    def __init__(self, estimated_usd, normalized):
        self.estimated_usd = estimated_usd
        self.normalized = normalized


class Admission:
    __slots__ = ("credential", "estimated_usd", "normalized", "reservation_id")

    def __init__(self, credential, estimated_usd, normalized, reservation_id):
        self.credential = credential
        self.estimated_usd = estimated_usd
        self.normalized = normalized
        self.reservation_id = reservation_id


def _amount(value, name):
    try:
        number = float(value)
    except (TypeError, ValueError) as exc:
        raise AdmissionError(f"{name} must be a currency amount") from exc
    if not math.isfinite(number) or number < 0:
        raise AdmissionError(f"{name} must be finite and non-negative")
    return number


class RunLedger:
    """Atomic reservations keyed by explicit run and account identities."""

    def __init__(self):
        self._lock = threading.Lock()
        self._runs = {}
        self._reservation_keys = {}
        self._balance_locks = {}

    def _state(self, key):
        return self._runs.setdefault(
            key,
            {
                "reservations": {},
                "balance_checked": False,
                "balance": None,
                "ceiling": None,
            },
        )

    @staticmethod
    def _exposure(record):
        return record["settled"] if record["status"] == "settled" else record["estimate"]

    async def balance_once(self, run_id, account, credential, reader):
        key = (str(run_id), str(account))
        with self._lock:
            state = self._state(key)
            if state["balance_checked"]:
                return state["balance"]
            gate = self._balance_locks.setdefault(key, asyncio.Lock())
        async with gate:
            with self._lock:
                state = self._state(key)
                if state["balance_checked"]:
                    return state["balance"]
            value = reader(credential)
            if inspect.isawaitable(value):
                value = await value
            balance = None if value is None else _amount(value, "provider balance")
            with self._lock:
                state = self._state(key)
                state["balance_checked"] = True
                state["balance"] = balance
            return balance

    def reserve(
        self,
        *,
        run_id,
        account,
        estimated_usd,
        ceiling_usd,
        max_in_flight,
        available_balance=None,
    ):
        if not str(run_id).strip() or not str(account).strip():
            raise AdmissionError("run_id and account are required")
        estimate = _amount(estimated_usd, "estimate")
        ceiling = _amount(ceiling_usd, "run ceiling")
        if int(max_in_flight) < 1:
            raise AdmissionError("max_in_flight must be at least one")
        balance = (
            None
            if available_balance is None
            else _amount(available_balance, "provider balance")
        )
        key = (str(run_id), str(account))
        with self._lock:
            state = self._state(key)
            if state["ceiling"] is not None and abs(state["ceiling"] - ceiling) > 1e-12:
                raise AdmissionError("run ceiling cannot change after the run is admitted")
            records = state["reservations"].values()
            exposure = sum(self._exposure(record) for record in records)
            in_flight = sum(record["status"] != "settled" for record in records)
            if in_flight >= int(max_in_flight):
                raise AdmissionError("maximum concurrent in-flight spend is already reserved")
            if exposure + estimate > ceiling + 1e-12:
                raise AdmissionError(
                    f"run ceiling {ceiling:.6f} would be exceeded by "
                    f"{exposure + estimate:.6f}"
                )
            if balance is not None and exposure + estimate > balance + 1e-12:
                raise AdmissionError(
                    f"known provider balance {balance:.6f} is below total run exposure "
                    f"{exposure + estimate:.6f}"
                )
            state["ceiling"] = ceiling
            reservation_id = uuid.uuid4().hex
            state["reservations"][reservation_id] = {
                "estimate": estimate,
                "status": "reserved",
                "task_id": None,
                "indeterminate": False,
                "settled": 0.0,
            }
            self._reservation_keys[reservation_id] = key
            return reservation_id

    def _record(self, reservation_id):
        key = self._reservation_keys.get(reservation_id)
        if key is None:
            raise AdmissionError("unknown reservation")
        return self._runs[key]["reservations"][reservation_id]

    def record_submission(self, reservation_id, *, task_id=None, indeterminate=False):
        if not indeterminate and not str(task_id or "").strip():
            raise AdmissionError("accepted submission requires a task identity")
        with self._lock:
            record = self._record(reservation_id)
            if record["status"] != "reserved":
                raise AdmissionError("reservation is not awaiting submission")
            record["status"] = "accepted"
            record["task_id"] = None if task_id is None else str(task_id)
            record["indeterminate"] = bool(indeterminate)

    def settle(self, reservation_id, reported_usd=None):
        with self._lock:
            record = self._record(reservation_id)
            if record["status"] != "accepted":
                raise AdmissionError("only an accepted submission can be settled")
            record["settled"] = (
                record["estimate"]
                if reported_usd is None
                else _amount(reported_usd, "reported cost")
            )
            record["status"] = "settled"

    def release(self, reservation_id):
        with self._lock:
            record = self._record(reservation_id)
            if record["status"] != "reserved":
                raise AdmissionError("accepted spend cannot be released")
            key = self._reservation_keys.pop(reservation_id)
            del self._runs[key]["reservations"][reservation_id]

    def snapshot(self, run_id, account):
        key = (str(run_id), str(account))
        with self._lock:
            records = list(self._state(key)["reservations"].values())
            reserved = sum(r["estimate"] for r in records if r["status"] == "reserved")
            accepted = sum(r["estimate"] for r in records if r["status"] == "accepted")
            settled = sum(r["settled"] for r in records if r["status"] == "settled")
            submissions = [
                {
                    "task_id": r["task_id"],
                    "indeterminate": r["indeterminate"],
                    "status": r["status"],
                }
                for r in records
                if r["status"] != "reserved"
            ]
            return {
                "reserved_usd": reserved,
                "accepted_estimate_usd": accepted,
                "settled_usd": settled,
                "total_exposure_usd": reserved + accepted + settled,
                "in_flight": sum(r["status"] != "settled" for r in records),
                "submissions": submissions,
            }


def _tokens(expression):
    # `$max`, `$count` and array literals appear in real contracts —
    # bytedance/seedream-v5.0-pro/edit prices extra reference images with
    # `3000 * $max([0, $count(images) - 1])`. Found 2026-07-29 by building that route.
    pattern = re.compile(
        r'\s*(\$number|\$max|\$count|"(?:[^"\\]|\\.)*"|\d+(?:\.\d+)?|'
        r"[A-Za-z_]\w*|[()\[\],+\-*/?:=])"
    )
    tokens = pattern.findall(expression)
    residue = pattern.sub("", expression).strip()
    if residue:
        raise AdmissionError(f"unsupported price formula syntax: {residue!r}")
    return tokens


class _Formula:
    def __init__(self, expression, base_price, values):
        self.tokens = _tokens(expression)
        self.at = 0
        self.values = {"base_price": _amount(base_price, "base price"), **values}

    def peek(self):
        return self.tokens[self.at] if self.at < len(self.tokens) else None

    def take(self, expected=None):
        token = self.peek()
        if token is None or (expected is not None and token != expected):
            raise AdmissionError(f"invalid price formula near {token!r}")
        self.at += 1
        return token

    def parse(self):
        value = self.ternary()
        if self.peek() is not None:
            raise AdmissionError(f"trailing price formula token {self.peek()!r}")
        return _amount(value, "estimated cost")

    def ternary(self):
        condition = self.comparison()
        if self.peek() == "?":
            self.take("?")
            yes = self.ternary()
            self.take(":")
            no = self.ternary()
            return yes if condition else no
        return condition

    def comparison(self):
        left = self.additive()
        if self.peek() == "=":
            self.take("=")
            return left == self.additive()
        return left

    def additive(self):
        value = self.product()
        while self.peek() in ("+", "-"):
            op = self.take()
            right = self.product()
            value = value + right if op == "+" else value - right
        return value

    def product(self):
        value = self.atom()
        while self.peek() in ("*", "/"):
            op = self.take()
            right = self.atom()
            value = value * right if op == "*" else value / right
        return value

    def array(self):
        self.take("[")
        items = []
        if self.peek() != "]":
            items.append(self.ternary())
            while self.peek() == ",":
                self.take(",")
                items.append(self.ternary())
        self.take("]")
        return items

    def atom(self):
        token = self.peek()
        if token == "(":
            self.take("(")
            value = self.ternary()
            self.take(")")
            return value
        if token == "$number":
            self.take()
            self.take("(")
            value = self.ternary()
            self.take(")")
            return float(value)
        if token == "$count":
            self.take()
            self.take("(")
            value = self.ternary()
            self.take(")")
            # A route field that takes several items arrives as a sequence; anything else counts
            # as one. Never as zero — an absent required field is validation's job, not pricing's.
            return float(len(value)) if isinstance(value, (list, tuple)) else 1.0
        if token == "$max":
            self.take()
            self.take("(")
            items = self.array()
            self.take(")")
            return max(items)
        if token == "[":
            return self.array()
        if token == "-":
            self.take()
            return -self.atom()
        self.take()
        if token.startswith('"'):
            return json.loads(token)
        if re.fullmatch(r"\d+(?:\.\d+)?", token):
            return float(token)
        if token not in self.values:
            raise AdmissionError(f"price formula needs missing field {token!r}")
        return self.values[token]


#: A provider price formula is denominated in micro-USD: 1_000_000 units == $1.00.
#: Proven 2026-07-29 against the live WaveSpeed contracts — `bytedance/seedream-v5.0-pro/edit`
#: evaluates to 45000 at 1k while its `price` field reads 0.045. `base_price` carries the same
#: unit inside a formula, so substituting the dollar value is wrong wherever the expression also
#: contains a bare constant.
#:
#: The framework was built entirely against `google/nano-banana-pro/edit`, whose formula is a pure
#: `base_price * ratio` with no bare constant — which is precisely why the unit stayed invisible.
#: Before this, `nano-banana-2/edit` with both searches estimated $28,000.14 and
#: `seedream-v5.0-pro/edit` at 2k with three images estimated $96,000.00.
#:
#: Scaling in and out is an identity for pure-multiplier formulas, so those keep their old values.
MICRO_USD = 1_000_000


def estimate_price(formula, base_price, values):
    if formula is None or not str(formula).strip():
        # A route may ship no formula at all (bytedance/seedream-v4.5/edit). Its flat `price`
        # IS the estimate; refusing here would make such a route unbuildable.
        return _amount(base_price, "base price")
    raw = str(formula).strip()
    if not raw.startswith("{") or ":" not in raw or not raw.endswith("}"):
        raise AdmissionError("route price formula is not a total_price object")
    expression = raw.split(":", 1)[1].rsplit("}", 1)[0].strip()
    micro = _Formula(expression, _amount(base_price, "base price") * MICRO_USD, values).parse()
    return micro / MICRO_USD


async def admit(
    *,
    validate,
    resolve_credential,
    formula,
    base_price,
    live,
    per_operation_ceiling,
    run_ceiling,
    run_id,
    account,
    ledger,
    max_in_flight,
    read_balance=None,
):
    """Validate and reserve before any upload or billable submission."""
    normalized = validate()
    if not isinstance(normalized, dict):
        raise AdmissionError("local validation must return normalized input values")
    estimate = estimate_price(formula, base_price, normalized)
    if not live:
        return DryRun(estimate, normalized)
    operation_ceiling = _amount(per_operation_ceiling, "per-operation ceiling")
    if estimate > operation_ceiling + 1e-12:
        raise AdmissionError(
            f"per-operation ceiling {operation_ceiling:.6f} is below estimate {estimate:.6f}"
        )
    credential = str(resolve_credential()).strip()
    if not credential:
        raise AdmissionError("credential resolution returned empty")
    balance = None
    if read_balance is not None:
        balance = await ledger.balance_once(
            run_id, account, credential, read_balance
        )
    reservation_id = ledger.reserve(
        run_id=run_id,
        account=account,
        estimated_usd=estimate,
        ceiling_usd=run_ceiling,
        max_in_flight=max_in_flight,
        available_balance=balance,
    )
    return Admission(credential, estimate, normalized, reservation_id)
