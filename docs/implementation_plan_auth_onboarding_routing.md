# Auth, onboarding, and workspace routing implementation plan

## Goal

Replace the legacy entry experience with the approved React prototype and a
single passwordless Buyerly flow. Access remains closed: a user may authenticate
only when their email is allow-listed or when a valid workspace invitation
authorizes that email.

## Canonical routes

### Public and authentication

- `/` — state-aware entry redirect.
- `/login` — all interactive email login states.
- `/auth/email/verify?token=...` — one-time email-link callback; the client
  exchanges the token and immediately removes it from browser history.
- `/invite/:token` — invitation landing and invitation-scoped login.
- `/create-workspace` — first workspace creation for allow-listed users.
- `/privacy`, `/terms`, `/data-deletion` — public legal documents.

There are no registration routes and no legacy frontend aliases.

### Workspace application

- `/:workspace/inbox`
- `/:workspace/inbox/:itemId`
- `/:workspace/ads/campaigns`
- `/:workspace/ads/adsets`
- `/:workspace/ads/ads`
- `/:workspace/ads/:entityType/:entityId`
- `/:workspace/rules`
- `/:workspace/rules/:ruleId`
- `/:workspace/statistics`
- `/:workspace/settings`
- `/:workspace/welcome` — resumable profile and teammate-invite wizard.

Shareable filters use query parameters. Ephemeral UI such as popovers and
selection drawers remains in client state.

## User flows

### Allow-listed first login

1. `/login` requests an email.
2. Buyerly sends both a one-time link and a six-digit code.
3. The link or code creates a web session only after access is re-authorized.
4. A user without a workspace continues to `/create-workspace`.
5. Workspace creation accepts a unique name/slug. A collision is returned to
   the form; Buyerly does not silently append a number.
6. The user completes profile name and optional teammate invitations at
   `/:workspace/welcome`, then enters `/:workspace/inbox`.

### Invitation login

1. `/invite/:token` validates the invitation before requesting an email.
2. A targeted invite permits only its normalized target email. A public invite
   permits the email only while that invite remains valid.
3. After authentication the invitation is accepted atomically.
4. A new invitee completes only the profile step at `/:workspace/welcome` and
   never creates another workspace or sees the invite-team owner step.
5. An existing user enters `/:workspace/inbox` immediately.

## Backend work

- Add hashed, one-time email-link tokens to login OTP records.
- Send the link and code in the same Resend message.
- Add an atomic email-link verification endpoint.
- Authorize OTP requests through an explicit valid invitation token, including
  public links; revoked, expired, consumed, or mismatched invitations fail.
- Make workspace slug allocation reject collisions with `409` instead of
  generating numeric suffixes.
- Change onboarding progression to workspace -> profile -> invites for owners,
  while preserving the shorter invited-member flow.

## Frontend work

- Import only the approved `frontend/` prototype into this clean branch.
- Add route parsing, protected-route resolution, browser history handling, and
  return-route restoration.
- Build Buyerly login, create-workspace, welcome, and invitation screens from
  the supplied UX references without copying Linear assets.
- Connect those screens to the existing cookie-session, CSRF, workspace,
  onboarding, and invitation APIs.
- Build the React app in the production web image while retaining legal pages,
  API proxying, uploads, and SPA fallback behavior.

## Definition of Done

- All canonical URLs open the correct screen on refresh and support Back/Forward.
- No `/w/`, `/signup`, `/register`, or legacy application aliases exist.
- Email login supports both an atomic one-time link and six-digit code.
- Login tokens are stored only as hashes, expire, are single-use, and are never
  logged by Buyerly application code.
- Whitelist and invite authorization are rechecked at verification time.
- Duplicate and reserved workspace slugs produce an actionable form error.
- Invitees cannot create an owner workspace accidentally.
- The React production image serves legal pages and proxies API/health/uploads.
- Relevant CI contracts are updated and pass only in GitHub Actions.

## Verification

- Do not run local pytest, unittest, or test packages.
- Inspect the final diff locally and run compilation/build-only checks when
  necessary.
- Push the isolated branch and use GitHub Actions as the sole test quality gate.
