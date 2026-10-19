"""Give a fresh local database a workspace to open.

`compose.dev.yaml` runs this after the migrations and the bootstrap admin, so a
new local stack (or a per-branch preview from `scripts/preview.sh`) opens
straight into the "Dev" workspace instead of onboarding.

With the fake Meta (compose.dev.yaml) it also connects that fake's ad
accounts, so Ads Manager has campaigns and numbers.

It only adds what is missing, so it is safe on every start, and it refuses to
run without BUYERLY_DEV_SEED=1, which only the local compose file sets.
"""

import asyncio
import logging
import os
import sys

from sqlalchemy import select

from core.config import settings
from database.db import async_session_maker
from database.models import Account, User, Workspace, WorkspaceMember

logger = logging.getLogger("buyerly.dev_seed")

WORKSPACE_NAME = "Dev"
WORKSPACE_SLUG = "dev"


async def seed() -> None:
    username = settings.BOOTSTRAP_ADMIN_USERNAME
    if not username:
        raise SystemExit("dev_seed: BOOTSTRAP_ADMIN_USERNAME is not set")

    async with async_session_maker() as session:
        user = (
            await session.execute(select(User).where(User.username.ilike(username)))
        ).scalar_one_or_none()
        if user is None:
            raise SystemExit(f"dev_seed: the bootstrap user {username!r} does not exist yet")

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

    logger.info("dev_seed: %s owns workspace %r (/%s)", username, WORKSPACE_NAME, WORKSPACE_SLUG)
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
