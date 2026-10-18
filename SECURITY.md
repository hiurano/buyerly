# Security

## Reporting a vulnerability

Please report security issues privately through GitHub: open the repository's
**Security** tab and choose **Report a vulnerability**. Do not open a public
issue for a vulnerability.

We aim to acknowledge a report within three days and to tell you what happens
next. Please give us reasonable time to fix the issue before disclosing it.

## How Buyerly handles your Meta access

- Meta access tokens are encrypted before they are stored, with Fernet
  (`cryptography`, AES-128 in CBC mode with an HMAC-SHA256 signature). The key
  lives only in the server's environment (`META_TOKEN_ENCRYPTION_KEY`), never in
  the database or this repository, and can be rotated without losing access
  (`MultiFernet`). See [`core/meta_tokens.py`](core/meta_tokens.py).
- Tokens are decrypted only on the server, when Buyerly calls the Meta API for
  you; they are never sent to the browser.
- Secrets in logs (bot tokens, API keys) are redacted before they are written.
