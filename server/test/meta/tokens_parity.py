"""core/meta_tokens.py over operations read as JSON from stdin, for
server/test/meta/tokens.test.ts: [{"op": "encrypt"|"decrypt"|"rotate",
"key": META_TOKEN_ENCRYPTION_KEY, "token": text}] answered with
{"ok": text} or {"fail": message} (MetaTokenError's text)."""

import json
import sys

from core import meta_tokens
from core.config import settings

OPS = {
    "encrypt": meta_tokens.encrypt_meta_token,
    "decrypt": meta_tokens.decrypt_meta_token,
    "rotate": meta_tokens.rotate_meta_token,
}

answers = []
for case in json.load(sys.stdin):
    settings.META_TOKEN_ENCRYPTION_KEY = case["key"]
    try:
        answers.append({"ok": OPS[case["op"]](case["token"])})
    except meta_tokens.MetaTokenError as error:
        answers.append({"fail": str(error)})
json.dump(answers, sys.stdout)
