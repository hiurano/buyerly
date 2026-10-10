"""Give a fresh local database a workspace to open.

`compose.dev.yaml` runs this after the migrations and the bootstrap admin, so a
new local stack (or a per-branch preview from `scripts/preview.sh`) opens
straight into the "Dev" workspace instead of onboarding, which a fresh
database cannot finish: creating a workspace needs an allowlist grant.

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
from database.models import AllowedEmail, User, Workspace, WorkspaceMember

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

        if (
            await session.execute(select(AllowedEmail.id).where(AllowedEmail.user_id == user.id))
        ).scalar_one_or_none() is None:
            session.add(AllowedEmail(user_id=user.id, added_by="dev_seed", comment="Local development"))

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
        await session.commit()

    logger.info("dev_seed: %s owns workspace %r (/%s)", username, WORKSPACE_NAME, WORKSPACE_SLUG)


def main() -> None:
    if os.environ.get("BUYERLY_DEV_SEED") != "1":
        sys.exit("dev_seed: refusing to run without BUYERLY_DEV_SEED=1 (local development only)")
    logging.basicConfig(level=logging.INFO)
    asyncio.run(seed())


if __name__ == "__main__":
    main()
