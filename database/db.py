from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import declarative_base

from core.config import settings

engine = create_async_engine(
    settings.DATABASE_URL,
    echo=False,
)

async_session_maker = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)

Base = declarative_base()


async def ensure_default_settings():
    from sqlalchemy import select
    from database.models import AppSettings

    async with async_session_maker() as session:
        result = await session.execute(select(AppSettings).limit(1))
        if not result.scalar_one_or_none():
            session.add(AppSettings(poll_interval_minutes=10))
            await session.commit()
