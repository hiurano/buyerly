"""Give a fresh local database a user and a workspace to open.

`compose.dev.yaml` runs this after the migrations, so a new local stack (or a
per-branch preview from `scripts/preview.sh`) has the user dev@buyerly.localhost
and opens straight into the "Dev" workspace instead of onboarding. Sign-in is
by email, as everywhere: the local stack writes the email, code and link
included, to the API log (DEV_EMAIL_LOG).

With the fake Meta (compose.dev.yaml) it also connects that fake's ad
accounts, so Ads Manager has campaigns and numbers.

It only adds what is missing, so it is safe on every start, and it refuses to
run without BUYERLY_DEV_SEED=1, which only the local compose file sets.
"""

import asyncio
import logging
import os
import sys
from datetime import datetime, timezone

from sqlalchemy import select

from core.config import settings
from database.db import async_session_maker
from database.models import Account, User, Workspace, WorkspaceMember

logger = logging.getLogger("buyerly.dev_seed")

USERNAME = "dev"
EMAIL = "dev@buyerly.localhost"
WORKSPACE_NAME = "Dev"
WORKSPACE_SLUG = "dev"


async def seed() -> None:
    async with async_session_maker() as session:
        user = (
            await session.execute(select(User).where(User.username.ilike(USERNAME)))
        ).scalar_one_or_none()
        if user is None:
            user = User(username=USERNAME, full_name=USERNAME, role="admin", is_approved=True)
            session.add(user)
        if not user.email:
            # Also a local database from before email-only sign-in: its dev user had no email.
            user.email = EMAIL
            user.email_verified_at = datetime.now(timezone.utc)
        await session.flush()

        workspace = (
            await session.execute(select(Workspace).where(Workspace.slug == WORKSPACE_SLUG))
        ).scalar_one_or_none()
        if workspace is None:
            workspace = Workspace(
                name=WORKSPACE_NAME,
                slug=WORKSPACE_SLUG,
                badge_text=WORKSPACE_NAME[:1],
                owner_user_id=user.id,
            )
            session.add(workspace)
            await session.flush()

        if (
            await session.execute(
                select(WorkspaceMember.id).where(
                    WorkspaceMember.workspace_id == workspace.id,
                    WorkspaceMember.user_id == user.id,
                )
            )
        ).scalar_one_or_none() is None:
            session.add(WorkspaceMember(workspace_id=workspace.id, user_id=user.id, role="owner"))

        if user.active_workspace_id is None:
            user.active_workspace_id = workspace.id
        user.onboarding_completed = True
        user.onboarding_step = "completed"

        added = await _add_fake_meta_accounts(session, workspace, user)
        await session.commit()

    logger.info("dev_seed: %s owns workspace %r (/%s)", user.email, WORKSPACE_NAME, WORKSPACE_SLUG)
    if added:
        logger.info("dev_seed: added fake Meta ad accounts %s", ", ".join(added))


async def _add_fake_meta_accounts(session, workspace: Workspace, user: User) -> list[str]:
    """Connect the fake Meta's ad accounts, the way batch-add would.

    Only when MetaClient talks to the local fake (compose.dev.yaml), never to
    Meta itself: these accounts exist nowhere else.
    """
    if settings.META_GRAPH_BASE_URL.rstrip("/") == "https://graph.facebook.com":
        return []

    from core.meta_tokens import encrypt_meta_token
    from scripts.fake_meta import WORLD

    added = []
    for account in WORLD.accounts.values():
        exists = (
            await session.execute(select(Account.id).where(Account.account_id == account.id))
        ).scalar_one_or_none()
        if exists is not None:
            continue
        session.add(
            Account(
                workspace_id=workspace.id,
                account_id=account.id,
                name=account.name,
                access_token="",
                access_token_encrypted=encrypt_meta_token("fake-meta-token"),
                owner_user_id=user.id,
                timezone_name=account.timezone,
                currency=account.currency,
                account_status=1,
                status_label="Active (ACTIVE)",
                rules_enabled=False,
                is_active=True,
            )
        )
        added.append(account.id)
    return added


def main() -> None:
    if os.environ.get("BUYERLY_DEV_SEED") != "1":
        sys.exit("dev_seed: refusing to run without BUYERLY_DEV_SEED=1 (local development only)")
    logging.basicConfig(level=logging.INFO)
    asyncio.run(seed())


if __name__ == "__main__":
    main()
