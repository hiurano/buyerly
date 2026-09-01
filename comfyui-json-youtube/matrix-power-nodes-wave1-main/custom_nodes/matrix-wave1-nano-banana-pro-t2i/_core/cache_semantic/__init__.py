"""Semantic identity and the durable paid-operation journal."""

from __future__ import annotations

import asyncio
import hashlib
import inspect
import json
import math
import os
import sqlite3
import threading
import time
import uuid
from collections.abc import Collection, Mapping
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal


_STATES = {"CLAIMED", "SUBMITTED", "TERMINAL", "MATERIALIZED", "CACHED"}
_BILLING = {"not_billed", "possibly_billed", "accepted_task", "definitely_billed"}
_ACTOR_FIELDS = {"process_boot_uuid", "prompt_id", "node_instance_id", "node_type"}
_SECRET_FIELDS = {
    "authorization", "api_key", "apikey", "credential", "headers", "password",
    "secret", "token", "access_token", "refresh_token",
}
_RESCUE_TASKS: dict[tuple[str, str], str] = {}
_RESCUE_LOCK = threading.Lock()
_FLIGHTS: dict[tuple[str, str], asyncio.Future] = {}
_FLIGHTS_LOCK = threading.Lock()


class _ClosingConnection(sqlite3.Connection):
    def __exit__(self, exc_type, exc, traceback):
        try:
            return super().__exit__(exc_type, exc, traceback)
        finally:
            self.close()


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _canonical_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False)


def _redact(value: Any) -> Any:
    if isinstance(value, Mapping):
        return {
            str(key): "[redacted]" if str(key).casefold() in _SECRET_FIELDS else _redact(item)
            for key, item in value.items()
        }
    if isinstance(value, (list, tuple)):
        return [_redact(item) for item in value]
    if value is None or isinstance(value, (bool, int, str)):
        return value
    if isinstance(value, float) and math.isfinite(value):
        return value
    return str(value)


def operation_error(kind, message, billing, safe_action, task_id=None):
    if kind not in {
        "poll_timeout", "interrupted", "download_failed", "decode_failed",
        "cache_failed", "provider_failed", "indeterminate_submit", "storage_failed",
    }:
        raise ValueError("invalid operation error kind")
    if billing not in _BILLING:
        raise ValueError("invalid operation error billing")
    if safe_action not in {"join", "requeue_same_node", "new_authorization", "required_operator"}:
        raise ValueError("invalid operation error safe_action")
    return {
        "schema": "matrix.operation-error/v1", "kind": kind, "message": str(message),
        "billing": billing, "safe_action": safe_action,
        "task_id": None if task_id is None else str(task_id),
    }


def _validate_operation_error(error):
    if not isinstance(error, Mapping):
        raise TypeError("operation error must be a mapping")
    expected = {"schema", "kind", "message", "billing", "safe_action", "task_id"}
    if set(error) != expected or error.get("schema") != "matrix.operation-error/v1":
        raise ValueError("operation error must match matrix.operation-error/v1 exactly")
    if not isinstance(error.get("message"), str) or not (
        error.get("task_id") is None or isinstance(error.get("task_id"), str)
    ):
        raise TypeError("operation error message/task_id types are invalid")
    # Reuse the constructor as the enum/type validator without changing caller text.
    operation_error(error["kind"], error["message"], error["billing"], error["safe_action"], error["task_id"])
    return _redact(dict(error))


def credential_fingerprint(provider, credential):
    if not isinstance(provider, str) or not provider.strip():
        raise ValueError("cache fingerprint requires a provider")
    if not isinstance(credential, str) or not credential:
        raise ValueError("cache fingerprint requires a credential")
    return hashlib.sha256((provider.strip() + "\0" + credential).encode()).hexdigest()


def _semantic_value(value):
    if value is None or isinstance(value, (bool, int, str)):
        return value
    if isinstance(value, float):
        if not math.isfinite(value):
            raise ValueError("semantic factors must not contain NaN or infinity")
        return value
    if isinstance(value, bytes):
        return {"bytes_sha256": hashlib.sha256(value).hexdigest()}
    if isinstance(value, Mapping):
        if any(not isinstance(key, str) for key in value):
            raise TypeError("semantic mapping keys must be strings")
        return {key: _semantic_value(value[key]) for key in sorted(value)}
    if isinstance(value, (list, tuple)):
        return [_semantic_value(item) for item in value]
    raise TypeError(f"{type(value).__name__} is not a semantic cache value; convert it at the media boundary")


def semantic_key(identity, factors, refresh_nonce=""):
    encoded = _canonical_json({
        "identity": _semantic_value(identity), "factors": _semantic_value(factors),
        "refresh_nonce": str(refresh_nonce),
    }).encode()
    return hashlib.sha256(encoded).hexdigest()


@dataclass(frozen=True)
class OperationIdentity:
    semantic_key: str
    provider: str
    route: str
    account_fingerprint: str
    node_type: str
    artifact_semantics_version: str
    payload_sha256: str


@dataclass(frozen=True)
class ArtifactRecord:
    relpath: str
    sha256: str
    bytes: int
    media_type: str


@dataclass(frozen=True)
class OperationSnapshot:
    semantic_key: str
    state: Literal["CLAIMED", "SUBMITTED", "TERMINAL", "MATERIALIZED", "CACHED"]
    version: int
    claim_token: str
    submit_started_at: str | None
    task_id: str | None
    terminal_outcome: Literal["success", "failure"] | None
    billing_state: Literal["not_billed", "possibly_billed", "accepted_task", "definitely_billed"]
    terminal: Mapping[str, Any] | None
    artifact: ArtifactRecord | None
    last_error: Mapping[str, Any] | None


@dataclass(frozen=True)
class EnterDecision:
    kind: Literal["owner", "join", "resume", "cached", "refused", "recovery_required"]
    snapshot: OperationSnapshot
    claim_token: str | None


class OperationJournalError(RuntimeError):
    pass


class OperationStorageError(OperationJournalError):
    pass


class OperationConflictError(OperationJournalError):
    pass


class OperationJournal:
    """SQLite current-state rows plus append-only events; one connection per operation."""

    def __init__(self, root, *, lease_seconds=30.0, busy_timeout_ms=5000, clock=time.time):
        self.root = Path(root)
        self.database_path = self.root / "operations.sqlite3"
        self.artifacts_root = self.root / "artifacts"
        self.lease_seconds = float(lease_seconds)
        self.busy_timeout_ms = int(busy_timeout_ms)
        self.clock = clock
        self._initialize()

    def _connect(self):
        connection = sqlite3.connect(
            self.database_path, timeout=self.busy_timeout_ms / 1000,
            factory=_ClosingConnection,
        )
        try:
            connection.row_factory = sqlite3.Row
            connection.execute(f"PRAGMA busy_timeout={self.busy_timeout_ms}")
            connection.execute("PRAGMA foreign_keys=ON")
            connection.execute("PRAGMA synchronous=FULL")
            mode = connection.execute("PRAGMA journal_mode=DELETE").fetchone()[0]
            if str(mode).casefold() != "delete":
                raise OperationStorageError("operation journal requires SQLite rollback journal mode")
            return connection
        except BaseException:
            connection.close()
            raise

    def _initialize(self):
        try:
            self.root.mkdir(parents=True, exist_ok=True)
            with self._connect() as db:
                schema_version = db.execute("PRAGMA user_version").fetchone()[0]
                if schema_version not in (0, 1):
                    raise OperationStorageError(
                        f"unsupported operation journal schema {schema_version}"
                    )
                db.executescript("""
                CREATE TABLE IF NOT EXISTS operations (
                  semantic_key TEXT PRIMARY KEY, provider TEXT NOT NULL, route TEXT NOT NULL,
                  account_fingerprint TEXT NOT NULL, node_type TEXT NOT NULL,
                  artifact_semantics_version TEXT NOT NULL, payload_sha256 TEXT NOT NULL,
                  state TEXT NOT NULL CHECK (state IN ('CLAIMED','SUBMITTED','TERMINAL','MATERIALIZED','CACHED')),
                  version INTEGER NOT NULL, attempt INTEGER NOT NULL, claim_token TEXT NOT NULL,
                  claim_owner TEXT NOT NULL, claim_expires_at REAL, submit_started_at TEXT,
                  estimate_microusd INTEGER, task_id TEXT,
                  terminal_outcome TEXT CHECK (terminal_outcome IS NULL OR terminal_outcome IN ('success','failure')),
                  billing_state TEXT NOT NULL CHECK (billing_state IN ('not_billed','possibly_billed','accepted_task','definitely_billed')),
                  terminal_json TEXT, artifact_relpath TEXT, artifact_sha256 TEXT,
                  artifact_bytes INTEGER, media_type TEXT, cache_envelope_version INTEGER,
                  last_error_json TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS operation_events (
                  seq INTEGER PRIMARY KEY AUTOINCREMENT, semantic_key TEXT NOT NULL,
                  from_state TEXT NOT NULL, to_state TEXT NOT NULL, event_kind TEXT NOT NULL,
                  version INTEGER NOT NULL, actor_json TEXT NOT NULL, detail_json TEXT NOT NULL,
                  created_at TEXT NOT NULL, FOREIGN KEY (semantic_key) REFERENCES operations(semantic_key)
                );
                CREATE INDEX IF NOT EXISTS operation_events_by_key ON operation_events(semantic_key, seq);
                """)
                if schema_version == 0:
                    db.execute("PRAGMA user_version=1")
                if db.execute("PRAGMA user_version").fetchone()[0] != 1:
                    raise OperationStorageError("unsupported operation journal schema")
        except OperationJournalError:
            raise
        except (OSError, sqlite3.Error) as exc:
            raise OperationStorageError("operation journal storage is unavailable") from exc

    @staticmethod
    def _actor(actor):
        if not isinstance(actor, Mapping):
            raise TypeError("operation actor must be a mapping")
        return {name: str(actor.get(name, "")) for name in sorted(_ACTOR_FIELDS)}

    @staticmethod
    def _validate_identity(identity):
        if not isinstance(identity, OperationIdentity):
            raise TypeError("identity must be OperationIdentity")
        if len(identity.semantic_key) != 64 or any(c not in "0123456789abcdef" for c in identity.semantic_key):
            raise ValueError("semantic key must be a sha256 digest")
        if len(identity.payload_sha256) != 64 or any(c not in "0123456789abcdef" for c in identity.payload_sha256):
            raise ValueError("payload_sha256 must be a sha256 digest")
        if any(not str(getattr(identity, f)).strip() for f in (
            "provider", "route", "account_fingerprint", "node_type", "artifact_semantics_version"
        )):
            raise ValueError("operation identity fields must be non-empty")

    @staticmethod
    def _snapshot(row):
        artifact = None
        if row["artifact_relpath"] is not None:
            artifact = ArtifactRecord(row["artifact_relpath"], row["artifact_sha256"], row["artifact_bytes"], row["media_type"])
        return OperationSnapshot(
            row["semantic_key"], row["state"], row["version"], row["claim_token"],
            row["submit_started_at"], row["task_id"], row["terminal_outcome"],
            row["billing_state"], json.loads(row["terminal_json"]) if row["terminal_json"] else None,
            artifact, json.loads(row["last_error_json"]) if row["last_error_json"] else None,
        )

    def _event(self, db, key, old, new, kind, version, actor=None, detail=None):
        db.execute(
            "INSERT INTO operation_events(semantic_key,from_state,to_state,event_kind,version,actor_json,detail_json,created_at) VALUES(?,?,?,?,?,?,?,?)",
            (key, old, new, kind, version, _canonical_json(actor or {}), _canonical_json(_redact(detail or {})), _utc_now()),
        )

    def _flight_key(self, key):
        return str(self.database_path), key

    def _register_flight(self, key):
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            return
        with _FLIGHTS_LOCK:
            current = _FLIGHTS.get(self._flight_key(key))
            if current is None or current.done() or current.get_loop() is not loop:
                _FLIGHTS[self._flight_key(key)] = loop.create_future()

    def _notify_flight(self, key, snapshot):
        with _FLIGHTS_LOCK:
            future = _FLIGHTS.pop(self._flight_key(key), None)
        if future is not None and not future.done():
            try:
                future.get_loop().call_soon_threadsafe(future.set_result, snapshot)
            except RuntimeError:
                pass

    def _read_db(self, db, key):
        row = db.execute("SELECT * FROM operations WHERE semantic_key=?", (key,)).fetchone()
        return self._snapshot(row) if row else None

    def read(self, key):
        try:
            with self._connect() as db:
                return self._read_db(db, key)
        except (OSError, sqlite3.Error) as exc:
            raise OperationStorageError("operation journal read failed") from exc

    def enter(self, identity, actor):
        self._validate_identity(identity)
        safe_actor = self._actor(actor)
        token = uuid.uuid4().hex
        now, stamp = self.clock(), _utc_now()
        try:
            db = self._connect()
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT * FROM operations WHERE semantic_key=?", (identity.semantic_key,)).fetchone()
            if row is None:
                db.execute("""INSERT INTO operations(
                    semantic_key,provider,route,account_fingerprint,node_type,artifact_semantics_version,payload_sha256,
                    state,version,attempt,claim_token,claim_owner,claim_expires_at,billing_state,created_at,updated_at
                    ) VALUES(?,?,?,?,?,?,?,'CLAIMED',1,1,?,?,?,'not_billed',?,?)""",
                    (identity.semantic_key, identity.provider, identity.route, identity.account_fingerprint,
                     identity.node_type, identity.artifact_semantics_version, identity.payload_sha256,
                     token, _canonical_json(safe_actor), now + self.lease_seconds, stamp, stamp))
                self._event(db, identity.semantic_key, "NEW", "CLAIMED", "claim_acquired", 1, safe_actor)
                db.commit()
                db.close()
                snapshot = self.read(identity.semantic_key)
                self._register_flight(identity.semantic_key)
                return EnterDecision("owner", snapshot, token)
            for field in ("provider", "route", "account_fingerprint", "node_type", "artifact_semantics_version", "payload_sha256"):
                if row[field] != getattr(identity, field):
                    raise OperationConflictError(f"semantic key identity mismatch for {field}")
            snapshot = self._snapshot(row)
            if snapshot.state == "CLAIMED" and snapshot.submit_started_at is None and row["claim_expires_at"] is not None and row["claim_expires_at"] < now:
                version = snapshot.version + 1
                changed = db.execute("""UPDATE operations SET version=?,attempt=attempt+1,claim_token=?,claim_owner=?,claim_expires_at=?,updated_at=?
                    WHERE semantic_key=? AND version=? AND state='CLAIMED' AND submit_started_at IS NULL AND claim_expires_at<?""",
                    (version, token, _canonical_json(safe_actor), now + self.lease_seconds, stamp,
                     identity.semantic_key, snapshot.version, now)).rowcount
                if changed == 1:
                    self._event(db, identity.semantic_key, "CLAIMED", "CLAIMED", "stale_claim_taken_over", version, safe_actor)
                    db.commit()
                    db.close()
                    snapshot = self.read(identity.semantic_key)
                    self._register_flight(identity.semantic_key)
                    return EnterDecision("owner", snapshot, token)
            if snapshot.state == "TERMINAL" and snapshot.terminal_outcome == "failure" and snapshot.billing_state == "not_billed":
                version = snapshot.version + 1
                changed = db.execute("""UPDATE operations SET state='CLAIMED',version=?,attempt=attempt+1,claim_token=?,claim_owner=?,claim_expires_at=?,submit_started_at=NULL,estimate_microusd=NULL,task_id=NULL,terminal_outcome=NULL,terminal_json=NULL,artifact_relpath=NULL,artifact_sha256=NULL,artifact_bytes=NULL,media_type=NULL,cache_envelope_version=NULL,last_error_json=NULL,updated_at=? WHERE semantic_key=? AND version=? AND state='TERMINAL' AND terminal_outcome='failure' AND billing_state='not_billed'""",
                    (version, token, _canonical_json(safe_actor), now + self.lease_seconds, stamp, identity.semantic_key, snapshot.version)).rowcount
                if changed == 1:
                    self._event(db, identity.semantic_key, "TERMINAL", "CLAIMED", "not_billed_rearmed", version, safe_actor)
                    db.commit()
                    db.close()
                    snapshot = self.read(identity.semantic_key)
                    self._register_flight(identity.semantic_key)
                    return EnterDecision("owner", snapshot, token)
            db.commit()
            db.close()
            if snapshot.state == "CACHED":
                return EnterDecision("cached" if self._artifact_valid(snapshot.artifact) else "refused", snapshot, None)
            if snapshot.state in {"SUBMITTED", "MATERIALIZED"} or (snapshot.state == "TERMINAL" and snapshot.terminal_outcome == "success"):
                return EnterDecision("resume", snapshot, None)
            if snapshot.state == "TERMINAL":
                return EnterDecision("refused", snapshot, None)
            if snapshot.submit_started_at is not None:
                with _RESCUE_LOCK:
                    rescued = _RESCUE_TASKS.get((str(self.database_path), identity.semantic_key))
                if rescued:
                    try:
                        snapshot = self.record_submitted(identity.semantic_key, snapshot.claim_token, task_id=rescued, response_digest="process-rescue")
                        return EnterDecision("resume", snapshot, None)
                    except OperationJournalError:
                        pass
                with _FLIGHTS_LOCK:
                    active = _FLIGHTS.get(self._flight_key(identity.semantic_key))
                if active is not None and not active.done():
                    return EnterDecision("join", snapshot, None)
                return EnterDecision("recovery_required", snapshot, None)
            return EnterDecision("join", snapshot, None)
        except OperationJournalError:
            try: db.rollback(); db.close()
            except Exception: pass
            raise
        except (OSError, sqlite3.Error) as exc:
            try: db.rollback(); db.close()
            except Exception: pass
            raise OperationStorageError("operation journal enter failed closed") from exc

    def _transition(self, key, expected_states, assignments, kind, *, token=None, detail=None):
        try:
            db = self._connect(); db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT * FROM operations WHERE semantic_key=?", (key,)).fetchone()
            if row is None or row["state"] not in set(expected_states) or (token is not None and row["claim_token"] != token):
                raise OperationConflictError("operation transition precondition failed")
            old, version = row["state"], row["version"] + 1
            values = dict(assignments); values.update(version=version, updated_at=_utc_now())
            columns = ",".join(f"{name}=?" for name in values)
            params = list(values.values()) + [key, row["version"], old]
            changed = db.execute(f"UPDATE operations SET {columns} WHERE semantic_key=? AND version=? AND state=?", params).rowcount
            if changed != 1:
                raise OperationConflictError("operation compare-and-swap failed")
            new = values.get("state", old)
            self._event(db, key, old, new, kind, version, detail=detail)
            db.commit(); db.close(); snapshot = self.read(key)
            if kind not in {"claim_renewed", "submit_started"}:
                self._notify_flight(key, snapshot)
            return snapshot
        except OperationJournalError:
            try: db.rollback(); db.close()
            except Exception: pass
            raise
        except (OSError, sqlite3.Error) as exc:
            try: db.rollback(); db.close()
            except Exception: pass
            raise OperationStorageError(f"operation transition {kind} failed closed") from exc

    def renew_pre_submit_claim(self, key, claim_token):
        return self._transition(key, {"CLAIMED"}, {"claim_expires_at": self.clock() + self.lease_seconds}, "claim_renewed", token=claim_token)

    def record_definite_not_billed(self, key, claim_token, error):
        error = _validate_operation_error(error)
        return self._transition(key, {"CLAIMED"}, {
            "state": "TERMINAL", "terminal_outcome": "failure", "billing_state": "not_billed",
            "claim_expires_at": None, "last_error_json": _canonical_json(_redact(error)),
        }, "definite_not_billed", token=claim_token, detail=error)

    def mark_submit_started(self, key, claim_token, *, attempt, estimate_microusd):
        snapshot = self.read(key)
        if snapshot is None or snapshot.submit_started_at is not None:
            raise OperationConflictError("submit-start may be marked exactly once")
        return self._transition(key, {"CLAIMED"}, {
            "submit_started_at": _utc_now(), "billing_state": "possibly_billed",
            "estimate_microusd": int(estimate_microusd), "claim_expires_at": None,
        }, "submit_started", token=claim_token, detail={"attempt": int(attempt), "estimate_microusd": int(estimate_microusd)})

    def rescue_task(self, key, task_id):
        if not task_id:
            raise ValueError("rescue task id must be non-empty")
        with _RESCUE_LOCK:
            _RESCUE_TASKS[(str(self.database_path), key)] = str(task_id)

    def record_submitted(self, key, claim_token, *, task_id, response_digest):
        if not isinstance(task_id, str) or not task_id.strip():
            raise ValueError("accepted task id must be non-empty")
        self.rescue_task(key, task_id)
        snapshot = self._transition(key, {"CLAIMED"}, {
            "state": "SUBMITTED", "task_id": task_id, "billing_state": "accepted_task",
            "claim_expires_at": None, "last_error_json": None,
        }, "task_accepted", token=claim_token, detail={"task_id": task_id, "response_digest": response_digest})
        with _RESCUE_LOCK:
            _RESCUE_TASKS.pop((str(self.database_path), key), None)
        return snapshot

    def record_terminal(self, key, *, task_id, outcome, billing_state, terminal):
        if outcome not in {"success", "failure"} or billing_state not in _BILLING:
            raise ValueError("invalid terminal outcome or billing state")
        current = self.read(key)
        if current is None or current.task_id != task_id:
            raise OperationConflictError("terminal task id does not match recorded task")
        clean = _redact(terminal)
        return self._transition(key, {"SUBMITTED"}, {
            "state": "TERMINAL", "terminal_outcome": outcome, "billing_state": billing_state,
            "terminal_json": _canonical_json(clean), "last_error_json": None,
        }, "terminal_observed", detail={"task_id": task_id, "outcome": outcome})

    def record_error(self, key, expected_states: Collection[str], error):
        if not expected_states or not set(expected_states) <= _STATES:
            raise ValueError("expected_states must contain valid states")
        error = _validate_operation_error(error)
        return self._transition(key, expected_states, {"last_error_json": _canonical_json(error)}, "error_recorded", detail=error)

    def _artifact_path(self, relpath):
        path = (self.artifacts_root / relpath).resolve()
        if self.artifacts_root.resolve() not in path.parents:
            raise OperationConflictError("artifact path escapes journal root")
        return path

    @staticmethod
    def _media_magic(body, media_type):
        media = str(media_type or "").split(";", 1)[0].strip().casefold()
        return ((media == "image/png" and body.startswith(b"\x89PNG\r\n\x1a\n")) or
                (media in {"image/jpeg", "image/jpg"} and body.startswith(b"\xff\xd8")) or
                (media == "image/webp" and body[:4] == b"RIFF" and body[8:12] == b"WEBP"))

    @classmethod
    def _media_valid(cls, body, media_type):
        if not cls._media_magic(body, media_type):
            return False
        try:
            import io
            from PIL import Image
            with Image.open(io.BytesIO(body)) as image:
                image.verify()
            return True
        except Exception:
            return False

    def _artifact_valid(self, artifact):
        if artifact is None:
            return False
        try:
            body = self._artifact_path(artifact.relpath).read_bytes()
            return len(body) == artifact.bytes and hashlib.sha256(body).hexdigest() == artifact.sha256 and self._media_valid(body, artifact.media_type)
        except (OSError, OperationJournalError):
            return False

    def read_artifact(self, snapshot):
        if snapshot.artifact is None or not self._artifact_valid(snapshot.artifact):
            raise OperationStorageError("retained operation artifact is missing or corrupt; replacement submit refused")
        return self._artifact_path(snapshot.artifact.relpath).read_bytes()

    def record_materialized(self, key, *, task_id, body: bytes, media_type: str):
        if not isinstance(body, bytes) or not body or not self._media_valid(body, media_type):
            raise OperationStorageError("materialized artifact failed media integrity checks")
        current = self.read(key)
        if current is None or current.state != "TERMINAL" or current.terminal_outcome != "success" or current.task_id != task_id:
            raise OperationConflictError("materialization requires matching terminal success")
        digest = hashlib.sha256(body).hexdigest()
        task_digest = hashlib.sha256(task_id.encode()).hexdigest()
        relpath = str(Path(current.semantic_key) / f"{task_digest}.media")
        # Prefix provider/account without exposing them through ArtifactRecord traversal.
        with self._connect() as db:
            row = db.execute("SELECT provider,account_fingerprint FROM operations WHERE semantic_key=?", (key,)).fetchone()
        relpath = str(Path(row["provider"]) / row["account_fingerprint"] / relpath)
        target = self._artifact_path(relpath)
        try:
            target.parent.mkdir(parents=True, exist_ok=True)
            if target.exists():
                existing = target.read_bytes()
                if hashlib.sha256(existing).hexdigest() != digest or not self._media_valid(existing, media_type):
                    raise OperationStorageError("deterministic orphan artifact conflicts with terminal task")
            else:
                temporary = target.with_name(target.name + f".{uuid.uuid4().hex}.tmp")
                try:
                    with temporary.open("xb") as stream:
                        stream.write(body); stream.flush(); os.fsync(stream.fileno())
                    os.replace(temporary, target)
                finally:
                    try: temporary.unlink()
                    except FileNotFoundError: pass
        except OperationJournalError:
            raise
        except OSError as exc:
            raise OperationStorageError("artifact write failed; retained task will not be replaced") from exc
        return self._transition(key, {"TERMINAL"}, {
            "state": "MATERIALIZED", "artifact_relpath": relpath, "artifact_sha256": digest,
            "artifact_bytes": len(body), "media_type": media_type,
        }, "artifact_materialized", detail={"task_id": task_id, "artifact_sha256": digest, "artifact_bytes": len(body)})

    def commit_cached(self, key, *, envelope_version=1):
        current = self.read(key)
        if current is None or not self._artifact_valid(current.artifact):
            raise OperationStorageError("artifact read-back failed; operation retained and replacement refused")
        return self._transition(key, {"MATERIALIZED"}, {"state": "CACHED", "cache_envelope_version": int(envelope_version)}, "cache_committed")

    async def wait_for_change(self, key, after_version, timeout):
        deadline = time.monotonic() + float(timeout)
        while True:
            snapshot = self.read(key)
            if snapshot is None:
                raise OperationConflictError("operation disappeared")
            if snapshot.version > after_version:
                return snapshot
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                return snapshot
            with _FLIGHTS_LOCK:
                future = _FLIGHTS.get(self._flight_key(key))
            if future is not None and future.get_loop() is asyncio.get_running_loop():
                try:
                    await asyncio.wait_for(asyncio.shield(future), min(remaining, 0.25))
                except TimeoutError:
                    pass
            else:
                await asyncio.sleep(min(0.05, remaining))


class SemanticCache:
    """Compatibility byte cache for non-billable callers during migration."""
    def __init__(self, root): self.root = Path(root)
    def _path(self, key):
        if not key or any(c not in "0123456789abcdef" for c in key):
            raise ValueError("cache key must be a lowercase hexadecimal digest")
        return self.root / f"{key}.bin"
    def read(self, key):
        try: return self._path(key).read_bytes()
        except FileNotFoundError: return None
    def write(self, key, value):
        if not isinstance(value, bytes): raise TypeError("semantic cache stores bytes")
        self.root.mkdir(parents=True, exist_ok=True); target = self._path(key)
        temporary = target.with_suffix(".tmp"); temporary.write_bytes(value); temporary.replace(target)
    async def get_or_create(self, key, create):
        cached = self.read(key)
        if cached is not None: return cached, True
        value = create(); value = await value if inspect.isawaitable(value) else value
        self.write(key, value); return value, False


__all__ = [
    "ArtifactRecord", "EnterDecision", "OperationConflictError", "OperationIdentity",
    "OperationJournal", "OperationJournalError", "OperationSnapshot", "OperationStorageError",
    "SemanticCache", "credential_fingerprint", "operation_error", "semantic_key",
]
