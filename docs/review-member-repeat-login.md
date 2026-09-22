# Repeat sign-in for invited members

Previously, sign-in required an allowlist entry or a pending invitation even
after the user joined a workspace. A consumed single-use invitation therefore
locked the member out after logout or session expiry.

Direct email sign-in now also permits approved users with a verified email and
an existing workspace membership. Code and magic-link redemption recheck that
access. Explicit invitation logins retain their invitation binding and revocation
checks; membership does not add an allowlist entry or bypass approval revocation.
