"""Sign in the way people do: an emailed code, with the mailer stubbed.

Buyerly has no passwords, so a test that needs a browser session asks for a
code and enters it, through the real endpoints.
"""

from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch

import httpx
from sqlalchemy import select

from core.rate_limit import limiter
from database.models import User


async def confirm_email(sessions, username: str, email: str) -> None:
    """Give an existing test user a confirmed email to sign in with."""
    async with sessions() as session:
        user = (await session.execute(select(User).where(User.username == username))).scalar_one()
        user.email = email
        user.email_verified_at = datetime.now(timezone.utc)
        await session.commit()


async def sign_in(client: httpx.AsyncClient, email: str, headers: dict | None = None) -> httpx.Response:
    """Request a code for the email and enter it; returns the verify response."""
    # Sign-in is the setup here, not what is tested: its rate limits stay out of the way.
    with patch("api.routers.auth.send_otp_verification_email", new=AsyncMock(return_value=True)) as send, \
         patch.object(limiter, "is_allowed", new=AsyncMock(return_value=(True, 0))):
        requested = await client.post(
            "/api/auth/request-temporary-password", headers=headers, json={"email": email}
        )
        assert requested.status_code == 200, requested.text
        code = send.call_args.args[1]
        return await client.post(
            "/api/auth/verify-temporary-password", headers=headers, json={"email": email, "code": code}
        )
