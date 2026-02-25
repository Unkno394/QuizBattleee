from __future__ import annotations

import logging
from typing import Any

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine

from .config import settings
from .models import Base, GameResult, RoomSnapshot

logger = logging.getLogger(__name__)

engine: AsyncEngine = create_async_engine(settings.database_url, future=True, pool_pre_ping=True)
SessionLocal = async_sessionmaker(bind=engine, expire_on_commit=False, class_=AsyncSession)


async def init_db() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def close_db() -> None:
    await engine.dispose()


async def ping_db() -> bool:
    try:
        async with SessionLocal() as session:
            await session.execute(text("SELECT 1"))
        return True
    except Exception:  # pragma: no cover
        logger.exception("Database ping failed")
        return False


async def load_room_snapshot(room_id: str) -> RoomSnapshot | None:
    async with SessionLocal() as session:
        result = await session.execute(
            select(RoomSnapshot).where(RoomSnapshot.room_id == room_id)
        )
        return result.scalar_one_or_none()


async def save_room_snapshot(
    room_id: str,
    topic: str,
    question_count: int,
    state_json: dict[str, Any],
) -> None:
    async with SessionLocal() as session:
        result = await session.execute(
            select(RoomSnapshot).where(RoomSnapshot.room_id == room_id)
        )
        snapshot = result.scalar_one_or_none()
        if snapshot is None:
            snapshot = RoomSnapshot(
                room_id=room_id,
                topic=topic,
                question_count=question_count,
                state_json=state_json,
            )
            session.add(snapshot)
        else:
            snapshot.topic = topic
            snapshot.question_count = question_count
            snapshot.state_json = state_json

        await session.commit()


async def save_game_result(
    room_id: str,
    team_a_name: str,
    team_b_name: str,
    score_a: int,
    score_b: int,
    winner_team: str | None,
    payload_json: dict[str, Any],
) -> None:
    async with SessionLocal() as session:
        session.add(
            GameResult(
                room_id=room_id,
                team_a_name=team_a_name,
                team_b_name=team_b_name,
                score_a=score_a,
                score_b=score_b,
                winner_team=winner_team,
                payload_json=payload_json,
            )
        )
        await session.commit()
