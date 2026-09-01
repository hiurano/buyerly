#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "MANIFEST.json"
EXPECTED_PACKS = 10
KEY_BLOCK_VERSION = "0.9.0"
SHARED_BLOCK_SHA256 = "7944009b65e42fe89631cee3838a6129c6d6e5a0ceb1d605e9a8c66f1bfe6730"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> int:
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    problems: list[str] = []
    for item in manifest["files"]:
        path = ROOT / item["path"]
        if not path.is_file():
            problems.append(f"missing file: {item['path']}")
        elif path.stat().st_size != item["size"] or sha256(path) != item["sha256"]:
            problems.append(f"hash mismatch: {item['path']}")

    packs = sorted(path for path in (ROOT / "custom_nodes").iterdir() if path.is_dir())
    if len(packs) != EXPECTED_PACKS:
        problems.append(f"expected {EXPECTED_PACKS} packs, found {len(packs)}")
    declaration_ids: set[str] = set()
    for pack in packs:
        pack_manifest = json.loads((pack / "MANIFEST.json").read_text(encoding="utf-8"))
        declarations = pack_manifest.get("declaration_hashes") or {}
        if len(declarations) != 1:
            problems.append(f"{pack.name}: expected one declaration")
        declaration_ids.update(declarations)
        key_blocks = [item for item in pack_manifest.get("blocks", []) if item.get("id") == "ui.key-mask"]
        if len(key_blocks) != 1 or key_blocks[0].get("version") != KEY_BLOCK_VERSION or key_blocks[0].get("content_hash") != SHARED_BLOCK_SHA256:
            problems.append(f"{pack.name}: shared key-mask identity mismatch")
        for json_path in pack.rglob("*.json"):
            text = json_path.read_text(encoding="utf-8")
            if re.search(r'"api_key"\s*:', text, re.IGNORECASE):
                problems.append(f"{json_path.relative_to(ROOT)}: serialized api_key field")
        for js_path in (pack / "web").glob("key_mask.*.js"):
            text = js_path.read_text(encoding="utf-8")
            if "globalThis.prompt" in text:
                problems.append(f"{js_path.relative_to(ROOT)}: unsupported browser prompt")
            if 'type = "password"' not in text or "No API Key entered" not in text:
                problems.append(f"{js_path.relative_to(ROOT)}: secure key dialog contract missing")

    if len(declaration_ids) != EXPECTED_PACKS:
        problems.append(f"expected {EXPECTED_PACKS} unique declarations, found {len(declaration_ids)}")
    workflow_text = (ROOT / "workflows" / "matrix-power-nodes-wave1-all-nodes-safe.json").read_text(encoding="utf-8")
    if re.search(r'"api_key"\s*:', workflow_text, re.IGNORECASE):
        problems.append("showcase workflow serializes an API key field")

    if problems:
        print("Verification failed:", file=sys.stderr)
        for problem in problems:
            print(f"- {problem}", file=sys.stderr)
        return 1
    print(f"Verified {len(packs)} packs, {len(declaration_ids)} declarations, and all release file hashes.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
