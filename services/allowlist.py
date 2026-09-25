"""Allowlist grants shared by onboarding, workspace creation and sign-in.

A grant is either an email (usable before the person registers) or an
existing account pinned by ``user_id``. Every check that asks "is this person
allowlisted" goes through here so the two kinds are honoured the same way.

Lock order: allowlist rows first, then the ``users`` row. Revocation and the
first-workspace check both follow it, so they serialise instead of deadlocking.
"""

from sqlalchemy import delete, func, or_, select

from database.models import AllowedEmail, User, WebSession


class UsernameNotFound(LookupError):
    pass


class AmbiguousUsername(LookupError):
    pass


def normalize_email(value: str | None) -> str:
    return (value or "").strip().lower()


def normalize_username(value: str | None) -> str:
    # Same identifier rule as password sign-in: trimmed, case-insensitive.
    return (value or "").strip().lower()


async def resolve_username(session, username: str) -> User:
    """Find the one existing account with this username, or refuse.

    Usernames are unique as stored, but sign-in compares them ignoring case,
    so two accounts can collide here; such a name is refused rather than
    guessed.
    """
    clean = normalize_username(username)
    if not clean:
        raise UsernameNotFound(username)
    matches = (
        await session.execute(
            select(User).where(func.lower(User.username) == clean).limit(2)
        )
    ).scalars().all()
    if not matches:
        raise UsernameNotFound(username)
    if len(matches) > 1:
        raise AmbiguousUsername(username)
    return matches[0]


def _account_grant_clause(user_id: int, email: str):
    conditions = [AllowedEmail.user_id == user_id]
    if email:
        conditions.append(func.lower(AllowedEmail.email) == email)
    return or_(*conditions)


def grant_covers(entry: AllowedEmail, user: User) -> bool:
    if entry.user_id is not None:
        return entry.user_id == user.id
    email = normalize_email(user.email)
    return bool(email) and normalize_email(entry.email) == email


async def find_account_grant(session, user: User, *, lock: bool = False) -> AllowedEmail | None:
    """Return a grant for this account, by its user id or its email."""
    query = (
        select(AllowedEmail)
        .where(_account_grant_clause(user.id, normalize_email(user.email)))
        .order_by(AllowedEmail.id)
    )
    if lock:
        query = query.with_for_update()
    entries = (await session.execute(query)).scalars().all()
    return entries[0] if entries else None


async def has_email_login_grant(session, email: str, *, lock: bool = False) -> bool:
    """Whether an email sign-in to this address is allowlisted.

    An email grant matches the address directly. An account grant matches when
    the address is that account's verified email, so a person added by
    username can still use the email sign-in their account already has.
    """
    clean = normalize_email(email)
    if not clean:
        return False
    account_ids = select(User.id).where(
        func.lower(User.email) == clean,
        User.email_verified_at.is_not(None),
    )
    query = (
        select(AllowedEmail.id)
        .where(
            or_(
                func.lower(AllowedEmail.email) == clean,
                AllowedEmail.user_id.in_(account_ids),
            )
        )
        .order_by(AllowedEmail.id)
    )
    if lock:
        query = query.with_for_update()
    return bool((await session.execute(query)).scalars().all())


async def revoke_grant(session, entry: AllowedEmail) -> tuple[list[AllowedEmail], list[User]]:
    """Remove a grant and cut off every non-admin account it covered.

    Removing a grant is an explicit revocation, so it must not be undone by a
    second grant for the same account: an email sign-in would otherwise
    re-approve the user. Every grant covering a revoked account is removed with
    it. Revoked accounts lose approval and all their web sessions.

    ``entry`` must already be locked by the caller. Returns the removed grants
    and the revoked accounts.
    """
    if entry.user_id is not None:
        covered_query = select(User).where(User.id == entry.user_id)
    else:
        covered_query = select(User).where(func.lower(User.email) == normalize_email(entry.email))
    covered = (await session.execute(covered_query)).scalars().all()
    revoked_candidates = [u for u in covered if u.role != "admin"]

    sibling_conditions = []
    for u in revoked_candidates:
        sibling_conditions.append(_account_grant_clause(u.id, normalize_email(u.email)))
    removed: dict[int, AllowedEmail] = {entry.id: entry}
    if sibling_conditions:
        siblings = (
            await session.execute(
                select(AllowedEmail)
                .where(or_(*sibling_conditions))
                .order_by(AllowedEmail.id)
                .with_for_update()
            )
        ).scalars().all()
        for sibling in siblings:
            removed.setdefault(sibling.id, sibling)

    revoked: list[User] = []
    if revoked_candidates:
        revoked = (
            await session.execute(
                select(User)
                .where(User.id.in_([u.id for u in revoked_candidates]))
                .order_by(User.id)
                .with_for_update()
            )
        ).scalars().all()
        for u in revoked:
            u.is_approved = False
        await session.execute(
            delete(WebSession).where(WebSession.user_id.in_([u.id for u in revoked]))
        )

    for grant in removed.values():
        await session.delete(grant)
    return sorted(removed.values(), key=lambda grant: grant.id), revoked
