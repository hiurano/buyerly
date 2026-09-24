#!/usr/bin/env python3
"""Create a password-login user or set the username and password of an existing one.

Usage inside the API container:
    python -m scripts.set_user_password <username>
    python -m scripts.set_user_password <username> --email <existing account email>

With --email the existing account with that email is renamed to <username>, so
its workspaces and data are kept. Without it the user is found by username or
created. The password is always read interactively and never passed as an
argument, so it does not reach shell history or process listings.
"""

import argparse
import asyncio
import getpass
import re
import sys

from sqlalchemy import func, select

from database.db import async_session_maker, hash_password
from database.models import User

USERNAME_PATTERN = re.compile(r"^[A-Za-z0-9_.-]{3,64}$")
MIN_PASSWORD_LENGTH = 8


def read_password() -> str:
    password = getpass.getpass("New password: ")
    if len(password) < MIN_PASSWORD_LENGTH:
        raise SystemExit(f"The password must be at least {MIN_PASSWORD_LENGTH} characters")
    if password != getpass.getpass("Repeat password: "):
        raise SystemExit("Passwords do not match")
    return password


async def set_user_password(username: str, email: str | None, password: str) -> str:
    async with async_session_maker() as session:
        if email:
            user = (
                await session.execute(
                    select(User).where(func.lower(User.email) == email.strip().lower())
                )
            ).scalar_one_or_none()
            if user is None:
                raise SystemExit(f"No user with email {email}")
        else:
            user = (
                await session.execute(
                    select(User).where(func.lower(User.username) == username.lower())
                )
            ).scalar_one_or_none()

        # The login form accepts a username or an email, so the new username
        # must not match another account's username or email.
        conflict_query = select(User.id).where(
            (func.lower(User.username) == username.lower())
            | (func.lower(User.email) == username.lower())
        )
        if user is not None:
            conflict_query = conflict_query.where(User.id != user.id)
        if (await session.execute(conflict_query.limit(1))).scalar_one_or_none() is not None:
            raise SystemExit(f"Username {username} is already used by another account")

        if user is None:
            user = User(
                username=username,
                full_name=username,
                role="buyer",
                is_approved=True,
                onboarding_completed=False,
                onboarding_step="workspace",
            )
            session.add(user)
            action = "Created"
        else:
            action = "Updated"

        user.username = username
        user.password_hash = hash_password(password)
        user.is_approved = True
        await session.commit()
        return f"{action} user {username} (id={user.id})"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("username")
    parser.add_argument("--email", help="rename the existing account with this email")
    args = parser.parse_args()

    if not USERNAME_PATTERN.match(args.username):
        print("Username must be 3-64 characters: letters, digits, '_', '.', '-'", file=sys.stderr)
        return 2

    password = read_password()
    print(asyncio.run(set_user_password(args.username, args.email, password)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
