from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

import asyncpg

from .config import settings
from .database_rooms import RoomSnapshotRecord
from .database_rooms import (
    load_room_snapshot as load_room_snapshot_impl,
    save_game_result as save_game_result_impl,
    save_room_snapshot as save_room_snapshot_impl,
)
from .database_sessions import (
    create_auth_session as create_auth_session_impl,
    get_auth_session_identity as get_auth_session_identity_impl,
    revoke_all_auth_sessions as revoke_all_auth_sessions_impl,
    revoke_auth_session as revoke_auth_session_impl,
)
from .redis_cache import get_room_snapshot as get_cached_room_snapshot
from .redis_cache import set_room_snapshot as set_cached_room_snapshot

logger = logging.getLogger(__name__)

_pool: asyncpg.Pool | None = None


def _normalized_database_url() -> str:
    url = settings.database_url.strip()
    if url.startswith("postgresql+asyncpg://"):
        return "postgresql://" + url[len("postgresql+asyncpg://") :]
    return url


async def _get_pool() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        _pool = await asyncpg.create_pool(dsn=_normalized_database_url(), min_size=1, max_size=10)
    return _pool


async def get_db_pool() -> asyncpg.Pool:
    return await _get_pool()


async def init_db() -> None:
    pool = await _get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            """
            CREATE TABLE IF NOT EXISTS room_snapshots (
              id BIGSERIAL PRIMARY KEY,
              room_id VARCHAR(8) UNIQUE NOT NULL,
              topic VARCHAR(80) NOT NULL,
              question_count INTEGER NOT NULL,
              state_json TEXT NOT NULL DEFAULT '{}',
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
            """
        )
        await conn.execute(
            """
            CREATE TABLE IF NOT EXISTS game_results (
              id BIGSERIAL PRIMARY KEY,
              room_id VARCHAR(8) NOT NULL,
              team_a_name VARCHAR(32) NOT NULL,
              team_b_name VARCHAR(32) NOT NULL,
              score_a INTEGER NOT NULL,
              score_b INTEGER NOT NULL,
              winner_team VARCHAR(1),
              payload_json TEXT NOT NULL DEFAULT '{}',
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
            """
        )
        await conn.execute(
            """
            CREATE TABLE IF NOT EXISTS user_profiles (
              id VARCHAR(64) PRIMARY KEY,
              display_name VARCHAR(64) NOT NULL,
              email VARCHAR(255),
              avatar_url TEXT,
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
            """
        )
        await conn.execute(
            """
            CREATE TABLE IF NOT EXISTS auth_users (
              id BIGSERIAL PRIMARY KEY,
              email VARCHAR(255) UNIQUE NOT NULL,
              display_name VARCHAR(64) NOT NULL,
              password_hash VARCHAR(255) NOT NULL,
              avatar_url TEXT,
              coins INTEGER NOT NULL DEFAULT 0,
              profile_frame VARCHAR(64),
              equipped_cat_skin VARCHAR(64),
              equipped_dog_skin VARCHAR(64),
              preferred_mascot VARCHAR(8),
              equipped_victory_front_effect VARCHAR(64),
              equipped_victory_back_effect VARCHAR(64),
              is_email_verified BOOLEAN NOT NULL DEFAULT FALSE,
              last_login_at TIMESTAMPTZ,
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
            """
        )
        await conn.execute(
            "ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS avatar_url TEXT"
        )
        await conn.execute(
            "ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ"
        )
        await conn.execute(
            "ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS coins INTEGER NOT NULL DEFAULT 0"
        )
        await conn.execute(
            "ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS profile_frame VARCHAR(64)"
        )
        await conn.execute(
            "ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS equipped_cat_skin VARCHAR(64)"
        )
        await conn.execute(
            "ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS equipped_dog_skin VARCHAR(64)"
        )
        await conn.execute(
            "ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS preferred_mascot VARCHAR(8)"
        )
        await conn.execute(
            "ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS equipped_victory_front_effect VARCHAR(64)"
        )
        await conn.execute(
            "ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS equipped_victory_back_effect VARCHAR(64)"
        )
        await conn.execute(
            """
            CREATE TABLE IF NOT EXISTS auth_email_codes (
              email VARCHAR(255) NOT NULL,
              purpose VARCHAR(32) NOT NULL,
              code VARCHAR(16) NOT NULL,
              expires_at TIMESTAMPTZ NOT NULL,
              last_sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              consumed_at TIMESTAMPTZ,
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              PRIMARY KEY (email, purpose)
            )
            """
        )
        await conn.execute(
            """
            CREATE TABLE IF NOT EXISTS auth_sessions (
              id BIGSERIAL PRIMARY KEY,
              user_id BIGINT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
              token_hash VARCHAR(64) UNIQUE NOT NULL,
              expires_at TIMESTAMPTZ NOT NULL,
              revoked_at TIMESTAMPTZ,
              last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              user_agent TEXT,
              ip_address TEXT,
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
            """
        )
        await conn.execute(
            """
            CREATE TABLE IF NOT EXISTS auth_user_inventory (
              id BIGSERIAL PRIMARY KEY,
              user_id BIGINT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
              item_id VARCHAR(64) NOT NULL,
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              UNIQUE (user_id, item_id)
            )
            """
        )
        await conn.execute(
            """
            CREATE TABLE IF NOT EXISTS auth_friendships (
              id BIGSERIAL PRIMARY KEY,
              requester_id BIGINT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
              addressee_id BIGINT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
              status VARCHAR(16) NOT NULL DEFAULT 'accepted',
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              UNIQUE (requester_id, addressee_id),
              CHECK (requester_id <> addressee_id)
            )
            """
        )
        await conn.execute(
            """
            CREATE TABLE IF NOT EXISTS room_invitations (
              id BIGSERIAL PRIMARY KEY,
              room_id VARCHAR(8) NOT NULL,
              inviter_id BIGINT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
              invitee_id BIGINT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
              status VARCHAR(16) NOT NULL DEFAULT 'pending',
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              UNIQUE (room_id, inviter_id, invitee_id),
              CHECK (inviter_id <> invitee_id)
            )
            """
        )
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_auth_users_email ON auth_users(email)"
        )
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_auth_email_codes_expires ON auth_email_codes(expires_at)"
        )
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_id ON auth_sessions(user_id)"
        )
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires_at ON auth_sessions(expires_at)"
        )
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_auth_sessions_revoked_at ON auth_sessions(revoked_at)"
        )
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_auth_user_inventory_user_id ON auth_user_inventory(user_id)"
        )
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_auth_friendships_requester ON auth_friendships(requester_id)"
        )
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_auth_friendships_addressee ON auth_friendships(addressee_id)"
        )
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_auth_friendships_status ON auth_friendships(status)"
        )
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_room_invitations_room_id ON room_invitations(room_id)"
        )
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_room_invitations_invitee_id ON room_invitations(invitee_id)"
        )
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_room_invitations_inviter_id ON room_invitations(inviter_id)"
        )
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_room_invitations_status ON room_invitations(status)"
        )
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_game_results_room_id ON game_results(room_id)"
        )
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_game_results_created_at ON game_results(created_at)"
        )


async def close_db() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None


async def ping_db() -> bool:
    try:
        pool = await _get_pool()
        async with pool.acquire() as conn:
            await conn.fetchval("SELECT 1")
        return True
    except Exception:  # pragma: no cover
        logger.exception("Database ping failed")
        return False


def _parse_cached_snapshot(cached: dict[str, Any]) -> RoomSnapshotRecord | None:
    try:
        room_id = str(cached.get("roomId") or "").upper()[:8]
        topic = str(cached.get("topic") or "")[:80]
        question_count = int(cached.get("questionCount") or 5)
        state_json = cached.get("stateJson")
        if not isinstance(state_json, dict):
            state_json = {}
        updated_raw = cached.get("updatedAt")
        if isinstance(updated_raw, str) and updated_raw.strip():
            updated_at = datetime.fromisoformat(updated_raw.replace("Z", "+00:00"))
            if updated_at.tzinfo is None:
                updated_at = updated_at.replace(tzinfo=timezone.utc)
        else:
            updated_at = datetime.now(timezone.utc)
    except Exception:
        return None

    if not room_id or not topic:
        return None

    return RoomSnapshotRecord(
        room_id=room_id,
        topic=topic,
        question_count=question_count,
        state_json=state_json,
        updated_at=updated_at,
    )


async def load_room_snapshot(room_id: str) -> RoomSnapshotRecord | None:
    cached = await get_cached_room_snapshot(room_id)
    if isinstance(cached, dict):
        cached_snapshot = _parse_cached_snapshot(cached)
        if cached_snapshot is not None:
            return cached_snapshot

    pool = await _get_pool()
    snapshot = await load_room_snapshot_impl(pool, room_id)
    if snapshot is not None:
        await set_cached_room_snapshot(
            room_id=snapshot.room_id,
            topic=snapshot.topic,
            question_count=snapshot.question_count,
            state_json=snapshot.state_json,
            updated_at=snapshot.updated_at,
        )
    return snapshot


async def save_room_snapshot(
    room_id: str,
    topic: str,
    question_count: int,
    state_json: dict[str, Any],
) -> None:
    pool = await _get_pool()
    await save_room_snapshot_impl(
        pool,
        room_id=room_id,
        topic=topic,
        question_count=question_count,
        state_json=state_json,
    )
    await set_cached_room_snapshot(
        room_id=room_id,
        topic=topic,
        question_count=question_count,
        state_json=state_json,
        updated_at=datetime.now(timezone.utc),
    )


async def save_game_result(
    room_id: str,
    team_a_name: str,
    team_b_name: str,
    score_a: int,
    score_b: int,
    winner_team: str | None,
    payload_json: dict[str, Any],
) -> None:
    pool = await _get_pool()
    await save_game_result_impl(
        pool,
        room_id=room_id,
        team_a_name=team_a_name,
        team_b_name=team_b_name,
        score_a=score_a,
        score_b=score_b,
        winner_team=winner_team,
        payload_json=payload_json,
    )


async def create_auth_session(
    user_id: int,
    ttl_seconds: int,
    user_agent: str | None = None,
    ip_address: str | None = None,
) -> str:
    pool = await _get_pool()
    return await create_auth_session_impl(
        pool,
        user_id=user_id,
        ttl_seconds=ttl_seconds,
        user_agent=user_agent,
        ip_address=ip_address,
    )


async def get_auth_session_identity(
    token: str | None,
    *,
    touch: bool = True,
) -> dict[str, Any] | None:
    pool = await _get_pool()
    return await get_auth_session_identity_impl(pool, token, touch=touch)


async def revoke_auth_session(token: str | None) -> bool:
    pool = await _get_pool()
    return await revoke_auth_session_impl(pool, token)


async def revoke_all_auth_sessions(user_id: int) -> int:
    pool = await _get_pool()
    return await revoke_all_auth_sessions_impl(pool, user_id)
