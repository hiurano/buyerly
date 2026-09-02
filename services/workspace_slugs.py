"""Transactional validation of globally unique workspace slugs."""

from sqlalchemy import select, text

from core.workspace_slugs import (
    RESERVED_WORKSPACE_SLUGS,
    normalize_workspace_slug,
)
from database.models import Workspace


class WorkspaceSlugUnavailable(ValueError):
    """The requested workspace URL is reserved or already allocated."""


async def allocate_workspace_slug(session, value: str) -> str:
    """Return the requested normalized slug only when it is available."""
    base = normalize_workspace_slug(value)
    if base in RESERVED_WORKSPACE_SLUGS:
        raise WorkspaceSlugUnavailable("Этот адрес воркспейса недоступен")
    bind = session.get_bind()
    if bind.dialect.name == "postgresql":
        await session.execute(
            text("SELECT pg_advisory_xact_lock(hashtext(:lock_key))"),
            {"lock_key": f"buyerly-workspace-slug:{base}"},
        )

    base_exists = (
        await session.execute(select(Workspace.id).where(Workspace.slug == base))
    ).scalar_one_or_none()
    if base_exists is None:
        return base
    raise WorkspaceSlugUnavailable("Это имя воркспейса уже занято")
