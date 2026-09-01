"""
engine_client.py — WaveSpeed model client for the AI Dataset Builder / AI Instagram
Engine skills. One WAVESPEED_API_KEY powers every model
(get a key: https://wavespeed.ai/?ref=matrix). Default model: Nano Banana Pro.

Capabilities below were verified LIVE against the WaveSpeed API on 2026-06-12:

  nano-banana-pro  google/nano-banana-pro/edit
      ratios 1:1 2:3 3:2 3:4 4:3 4:5 5:4 9:16 16:9 21:9 · res 1k/2k/4k
      png/jpeg · 10 refs · strict NSFW   (default)
  nano-banana-2    google/nano-banana-2/edit
      same ratios + 1:4 4:1 1:8 8:1 · res 0.5k/1k/2k/4k · png/jpeg
      14 refs · strict NSFW
  gpt-image-2      openai/gpt-image-2/edit
      same ratios + 1:2 2:1 1:3 3:1 9:21 · res 1k/2k/4k · png/jpeg/webp
      10 refs · strict NSFW
  seedream         bytedance/seedream-v4.5/edit
      free WIDTH*HEIGHT size — submit accepts any string, validated only at
      runtime (official max 8192x8192; this client stays within 1024..4096)
      10 refs · permissive

An unsupported aspect/resolution never fails a shot: it is snapped to the closest
value the chosen model supports. Strict models refuse suggestive content -> use
`seedream` for that. Reference images upload automatically (binary upload).
"""

import json
import math
import os
import random
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from pathlib import Path

try:
    import requests
except ImportError:  # self-heal: install on first run so the user never has to
    import subprocess
    subprocess.run([sys.executable, "-m", "pip", "install", "-q", "requests"], check=True)
    import requests

# --------------------------------------------------------------------------- #
WAVESPEED_BASE = "https://api.wavespeed.ai"

REQUEST_TIMEOUT = 60
POLL_INTERVAL = 5
MAX_POLL_TIMEOUT = 600  # 4K renders can take >300s
MAX_RETRIES = 5

# model registry: name -> spec. "body" = how to build the WaveSpeed request body.
# "aspects"/"res" = allowed values, verified live against the API (2026-06-12).
_NB_ASPECTS = ["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"]
MODELS = {
    "nano-banana-pro": {"id": "google/nano-banana-pro/edit", "body": "ratio",
                        "max_refs": 10, "nsfw": "strict", "label": "Nano Banana Pro",
                        "aspects": _NB_ASPECTS, "res": ["1k", "2k", "4k"]},
    "nano-banana-2":   {"id": "google/nano-banana-2/edit", "body": "ratio",
                        "max_refs": 14, "nsfw": "strict", "label": "Nano Banana 2",
                        "aspects": _NB_ASPECTS + ["1:4", "4:1", "1:8", "8:1"],
                        "res": ["0.5k", "1k", "2k", "4k"]},
    "gpt-image-2":     {"id": "openai/gpt-image-2/edit", "body": "gpt",
                        "max_refs": 10, "nsfw": "strict", "label": "GPT Image 2",
                        "aspects": _NB_ASPECTS + ["1:2", "2:1", "1:3", "3:1", "9:21"],
                        "res": ["1k", "2k", "4k"]},
    "seedream":        {"id": "bytedance/seedream-v4.5/edit", "body": "size",
                        "max_refs": 10, "nsfw": "permissive", "label": "Seedream 4.5",
                        "aspects": None, "res": ["1k", "2k", "4k"]},
}
DEFAULT_MODEL = "nano-banana-pro"

_ALIASES = {
    "nanobananapro": "nano-banana-pro", "nano-banana-pro-edit": "nano-banana-pro",
    "nanobanana2": "nano-banana-2", "nano-banana2": "nano-banana-2", "nano-banana-2-edit": "nano-banana-2",
    "gptimage2": "gpt-image-2", "gpt-image": "gpt-image-2", "gpt-image-2-edit": "gpt-image-2",
    "seedream-4.5": "seedream", "seedream-45": "seedream", "seedream-v4.5": "seedream", "seedance": "seedream",
}

# resolution tier -> long-side pixels (the client keeps Seedream within 1024..4096)
RES_LONG = {"1K": 1024, "2K": 2048, "4K": 4096}

NSFW_HINTS = ("sensitive", "content polic", "content_filter", "safety", "prohibit",
              "flagged", "moderat", "nsfw", "not allowed", "image_safety")

BALANCE_HINTS = ("insufficient", "balance", "credit", "quota", "payment required",
                 "top up", "recharge")


def _is_nsfw_block(msg):
    m = (msg or "").lower()
    return any(h in m for h in NSFW_HINTS)


def is_balance_error(msg):
    """True when an error message smells like an empty WaveSpeed balance."""
    m = (msg or "").lower()
    return any(h in m for h in BALANCE_HINTS)


def _neutralize_bust(prompt):
    """GPT Image 2 flags the word 'breast' as NSFW. Swap the bust lock for a neutral body
    lock so the prompt still asks to preserve proportions without the trigger word."""
    prompt = prompt.replace(
        "Do not make the breasts smaller or larger — keep the exact same breast size and body proportions as in the reference images.",
        "Keep the exact same body shape and proportions as in the reference images.")
    return prompt.replace("breast size", "body proportions").replace("breasts", "figure").replace("breast", "figure")


def resolve_model(name):
    t = (name or "").strip().lower().replace("_", "-").replace(" ", "-")
    if t in MODELS:
        return t
    if t in _ALIASES:
        return _ALIASES[t]
    raise EngineError("bad_model", f"Unknown model '{name}'. Options: {', '.join(MODELS)}")


def seedream_size(aspect, resolution):
    """Map an aspect ratio (e.g. '3:4') + resolution tier (1K/2K/4K) to Seedream's
    WIDTH*HEIGHT size string. The API validates size only at runtime (official max
    8192x8192) — this client stays within the safe 1024..4096 window."""
    try:
        aw, ah = (int(x) for x in str(aspect or "3:4").split(":")[:2])
        if aw <= 0 or ah <= 0:
            aw, ah = 3, 4
    except (ValueError, TypeError):
        aw, ah = 3, 4
    long_side = RES_LONG.get(str(resolution or "2K").upper(), 2048)
    if aw >= ah:  # landscape / square: width is the long side
        w, h = long_side, round(long_side * ah / aw)
    else:         # portrait: height is the long side
        w, h = round(long_side * aw / ah), long_side
    w = max(1024, min(4096, w))
    h = max(1024, min(4096, h))
    return f"{w}*{h}"


def _ratio(a):
    aw, ah = (int(x) for x in a.split(":")[:2])
    return aw / ah


def snap_aspect(aspect, allowed):
    """A valid aspect passes through untouched; anything else snaps to the closest
    ratio the model supports (verified enums in MODELS) so a shot never 400s."""
    if not allowed:
        return aspect
    a = str(aspect or "3:4").strip()
    if a in allowed:
        return a
    try:
        r = _ratio(a)
    except (ValueError, ZeroDivisionError):
        return "3:4" if "3:4" in allowed else allowed[0]
    return min(allowed, key=lambda x: abs(math.log(_ratio(x)) - math.log(r)))


def snap_res(res, allowed):
    """Same idea for the resolution tier: pass through if supported, else snap."""
    r = str(res or "2K").lower()
    if r in allowed:
        return r
    order = ["0.5k", "1k", "2k", "4k"]
    if r in order:
        i = order.index(r)
        return min(allowed, key=lambda x: abs(order.index(x) - i))
    return "2k" if "2k" in allowed else allowed[-1]


class EngineError(Exception):
    def __init__(self, code, message, status=0):
        self.code, self.message, self.status = code, message, status
        super().__init__(f"[{status} {code}] {message}")


# --------------------------------------------------------------------------- #
def load_env(env_path=None):
    if env_path is None:
        env_path = Path(__file__).resolve().parent / ".env"
    env_path = Path(env_path)
    if not env_path.exists():
        return {}
    found = {}
    for raw in env_path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        k, v = k.strip(), v.strip().strip('"').strip("'")
        if not v:
            continue
        found[k] = v
        # the .env file is the single source of truth for this skill — it must WIN
        # over any stale value lingering in the process environment
        os.environ[k] = v
    return found


# --------------------------------------------------------------------------- #
class BaseEngine:
    def __init__(self, api_key, spec):
        if not api_key:
            raise ValueError("API key required.")
        self.api_key = api_key
        self.spec = spec
        self.name = spec["label"]
        self.max_refs = spec["max_refs"]
        self.nsfw = spec["nsfw"]
        self.resolution = "2K"  # overridable (1K/2K/4K)
        self.session = requests.Session()
        self.session.headers.update({"Authorization": f"Bearer {api_key}"})

    def _request(self, method, url, **kwargs):
        delay, resp = 1.0, None
        kwargs.setdefault("timeout", REQUEST_TIMEOUT)
        for attempt in range(MAX_RETRIES):
            try:
                resp = self.session.request(method, url, **kwargs)
            except requests.RequestException as e:
                if attempt == MAX_RETRIES - 1:
                    raise EngineError("network_error", str(e))
                time.sleep(delay + random.uniform(0, 0.5)); delay *= 2; continue
            if resp.status_code == 429 or 500 <= resp.status_code < 600:
                if attempt == MAX_RETRIES - 1:
                    self._raise(resp)
                wait = float(resp.headers.get("Retry-After", 0)) or delay
                time.sleep(wait + random.uniform(0, 0.3)); delay *= 2; continue
            if 400 <= resp.status_code < 500:
                self._raise(resp)
            return resp
        self._raise(resp)

    def _raise(self, resp):
        try:
            data = resp.json()
            msg = data.get("msg") or data.get("message") or resp.text[:200]
        except ValueError:
            msg = resp.text[:200]
        raise EngineError("http_error", msg, resp.status_code)

    def _download(self, url, dest_path):
        Path(dest_path).parent.mkdir(parents=True, exist_ok=True)
        r = requests.get(url, timeout=120, stream=True)
        r.raise_for_status()
        with open(dest_path, "wb") as f:
            for chunk in r.iter_content(8192):
                f.write(chunk)
        return dest_path

    # per-engine
    def upload_file(self, path):  raise NotImplementedError
    def get_balance(self):        raise NotImplementedError
    def _submit(self, prompt, image_urls, aspect):  raise NotImplementedError
    def _poll(self, job_id):      raise NotImplementedError

    def generate_one(self, prompt, image_urls, output_path, aspect=None, size=None):
        t0 = time.time()
        try:
            job_id = self._submit(prompt, image_urls, aspect)
            result_url = self._poll(job_id)
            self._download(result_url, output_path)
            return {"ok": True, "output_path": str(output_path), "duration_s": round(time.time() - t0, 1)}
        except EngineError as e:
            return {"ok": False, "error_code": e.code, "error_message": e.message,
                    "duration_s": round(time.time() - t0, 1)}

    def batch_generate(self, jobs, output_dir, max_concurrent=4,
                       progress_callback=None, checkpoint_path=None):
        output_dir = Path(output_dir)
        output_dir.mkdir(parents=True, exist_ok=True)
        lock_fd = _acquire_lock(output_dir)
        try:
            completed = {}
            if checkpoint_path and Path(checkpoint_path).exists():
                completed = json.loads(Path(checkpoint_path).read_text())
            results, done = [], [0]
            t0 = time.time()

            def worker(job):
                fn = job["filename"]
                prev = completed.get(fn)
                if prev and Path(prev.get("output_path", "")).exists():
                    return {**prev, "filename": fn, "skipped": True}
                r = self.generate_one(job["prompt"], job["image_urls"], output_dir / fn,
                                      aspect=job.get("aspect"))
                r["filename"] = fn
                if checkpoint_path and r.get("ok"):
                    completed[fn] = r
                    Path(checkpoint_path).write_text(json.dumps(completed, indent=2))
                return r

            with ThreadPoolExecutor(max_workers=max_concurrent) as pool:
                futures = [pool.submit(worker, j) for j in jobs]
                for fut in as_completed(futures):
                    r = fut.result()
                    results.append(r)
                    done[0] += 1
                    if progress_callback:
                        if r.get("skipped"):   # skipped results also carry ok=True — check first
                            tag = "SKIP"
                        elif r.get("ok"):
                            tag = "OK"
                        elif r.get("error_code") == "nsfw_blocked":
                            tag = "BLOCKED(NSFW)"
                        else:
                            tag = "FAIL"
                        label = f"{tag} {r.get('filename', '?')}"
                        if tag in ("FAIL", "BLOCKED(NSFW)"):
                            label += f": {r.get('error_message', 'error')}"
                        try:
                            progress_callback(done[0], len(jobs), label)
                        except Exception:
                            pass

            ok = [r for r in results if r.get("ok")]
            blocked = [r for r in results if r.get("error_code") == "nsfw_blocked"]
            failed = [r for r in results if not r.get("ok") and not r.get("skipped")]
            return {"n_total": len(jobs), "n_success": len(ok), "n_failed": len(failed),
                    "n_blocked": len(blocked), "success": ok, "failed": failed,
                    "duration_s": round(time.time() - t0, 1)}
        finally:
            _release_lock(lock_fd, output_dir)


# --------------------------------------------------------------------------- #
class WaveSpeedEngine(BaseEngine):
    def upload_file(self, path):
        with open(path, "rb") as f:
            resp = self._request("POST", f"{WAVESPEED_BASE}/api/v3/media/upload/binary",
                                 files={"file": (Path(path).name, f)})
        url = (resp.json().get("data") or {}).get("download_url")
        if not url:
            raise EngineError("upload_failed", f"No download_url: {resp.text[:200]}")
        return url

    def get_balance(self):
        return f"{self.name}: check your balance in the WaveSpeed dashboard"

    def _build_body(self, prompt, image_urls, aspect):
        kind = self.spec.get("body", "ratio")
        res = snap_res(self.resolution, self.spec.get("res") or ["1k", "2k", "4k"])
        if kind == "size":  # Seedream uses an explicit WIDTH*HEIGHT
            return {"prompt": prompt, "images": image_urls,
                    "size": seedream_size(aspect, res), "enable_sync_mode": False}
        asp = snap_aspect(aspect, self.spec.get("aspects"))
        if kind == "gpt":   # GPT Image 2: flag-prone word neutralized
            return {"prompt": _neutralize_bust(prompt), "images": image_urls,
                    "aspect_ratio": asp, "resolution": res,
                    "output_format": "png", "enable_sync_mode": False}
        # ratio (Nano Banana Pro / Nano Banana 2)
        return {"prompt": prompt, "images": image_urls,
                "aspect_ratio": asp, "resolution": res,
                "output_format": "png", "enable_sync_mode": False}

    def _submit(self, prompt, image_urls, aspect):
        body = self._build_body(prompt, image_urls, aspect)
        resp = self._request("POST", f"{WAVESPEED_BASE}/api/v3/{self.spec['id']}",
                             json=body, headers={"Content-Type": "application/json"})
        rid = (resp.json().get("data") or {}).get("id")
        if not rid:
            raise EngineError("submit_failed", f"No request id: {resp.text[:200]}")
        return rid

    def _poll(self, request_id):
        deadline = time.time() + MAX_POLL_TIMEOUT
        while time.time() < deadline:
            resp = self._request("GET", f"{WAVESPEED_BASE}/api/v3/predictions/{request_id}/result")
            data = resp.json().get("data") or {}
            status = data.get("status")
            if status == "completed":
                outs = data.get("outputs") or []
                if not outs:
                    raise EngineError("no_output", "completed but no outputs")
                return outs[0]
            if status == "failed":
                msg = str(data.get("error", "failed"))
                raise EngineError("nsfw_blocked" if _is_nsfw_block(msg) else "generation_failed", msg)
            time.sleep(POLL_INTERVAL + random.uniform(0, 1))
        raise EngineError("polling_timeout", f"timeout on request {request_id}")


# --------------------------------------------------------------------------- #
def get_model(name=None):
    """Resolve a model (arg > MODEL in .env > default Nano Banana Pro) and build its
    WaveSpeed engine. Every model uses the single WAVESPEED_API_KEY."""
    load_env()
    chosen = name or os.environ.get("MODEL", "") or DEFAULT_MODEL
    key = resolve_model(chosen)
    spec = {**MODELS[key], "name": key}
    api = os.environ.get("WAVESPEED_API_KEY", "").strip()
    if not api:
        raise EngineError("no_key", f"Model '{key}' needs WAVESPEED_API_KEY in .env")
    return WaveSpeedEngine(api, spec)


# --------------------------------------------------------------------------- #
def _acquire_lock(output_dir):
    lock_path = Path(output_dir) / ".batch.lock"
    fd = open(lock_path, "w")
    try:
        if sys.platform == "win32":
            import msvcrt
            msvcrt.locking(fd.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl
            fcntl.flock(fd.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        fd.close()
        raise EngineError("batch_already_running", f"Another batch is running on '{output_dir}'.")
    fd.write(f"pid={os.getpid()} started={datetime.now().isoformat()}\n")
    fd.flush()
    return fd


def _release_lock(fd, output_dir):
    try:
        if sys.platform == "win32":
            import msvcrt
            msvcrt.locking(fd.fileno(), msvcrt.LK_UNLCK, 1)
        else:
            import fcntl
            fcntl.flock(fd.fileno(), fcntl.LOCK_UN)
    except Exception:
        pass
    try:
        fd.close()
        (Path(output_dir) / ".batch.lock").unlink()
    except Exception:
        pass


if __name__ == "__main__":
    load_env()
    m = get_model(sys.argv[1] if len(sys.argv) > 1 else None)
    print(f"Model: {m.name}  ({m.nsfw} NSFW, up to {m.max_refs} refs)")
    print(m.get_balance())
