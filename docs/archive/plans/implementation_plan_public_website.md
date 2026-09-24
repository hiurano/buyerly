# Public Buyerly website and legal content

## Objective
Make `/` a public, server-rendered HTML landing page that clearly identifies the
operator. Replace the existing Privacy and Terms with concise documents matching
the current service, using the registry extract's exact business details.

## Scope
- Header: Buyerly, Contact, Log in; text-only hero; shared footer with Contact and
  Legal (Privacy, Terms). Light Buyerly palette, Linear-inspired typography/grid.
- Public legal documents with readable article layout and linked contents.
- Retain `/data-deletion` and link to it from Privacy, not from the global footer.
- Keep business name, Identification Number and legal address consistent.
- Describe email authentication, workspaces, Meta OAuth, optional Telegram,
  cookies/storage, actual disconnect behavior and manual deletion requests.
- No changes to access controls, registration, advertising actions or APIs.

## Implementation
1. Keep canonical HTML in `frontend/public/`. Use a small Vite plugin to serve
   clean public routes in development/preview and emit public HTML with a
   fingerprinted stylesheet built from canonical tokens and public composition CSS.
2. Route `/` to the landing page in nginx and FastAPI; retain SPA routes for login
   and workspaces. Serve the same built public pages in the FastAPI fallback.
3. Update legal/build route tests and document the public typography exception
   (marketing headings and long-form text differ from dense product UI).
4. Build, run focused DB-free checks, inspect all public routes at
   390/768/1024/1440px, review the full diff, open a PR and monitor CI.

## Definition of done
Public pages work without authentication or JavaScript; exact business identity
is in visible HTML; only Privacy and Terms appear in footer Legal; deletion URL
remains usable; no broken assets/links or horizontal overflow; CI passes.
Production merge requires the user's confirmation.

## Evidence and limits
- Registry extract supplied by the user: exact firm name, business identification
  number and legal address only. Do not add the PDF or personal identity fields.
- `api/auth.py`, `api/routers/`, `database/models.py`: email accounts, workspace
  membership, cookies and security metadata.
- `api/meta_oauth.py:delete_connection`: deletes encrypted credentials, attempts
  permission revocation, disables linked accounts, retains an audit event.
- `core/email.py`: Resend email delivery; existing bot integration: optional Telegram.
- Existing deletion policy: manually verified requests; no automatic account
  erasure or fixed backup expiry proven by code. Avoid unsupported guarantees.
- Design references: https://linear.app/, /privacy and /terms inspected in browser.
- Privacy notice scope checked against Georgia's data protection law, articles
  13–24: https://www.matsne.gov.ge/en/document/view/5827307?publication=7.
  Provider locations and contractual transfer arrangements cannot be established
  from repository code; do not invent named hosting locations or certifications.
