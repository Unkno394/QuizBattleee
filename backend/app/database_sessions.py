from __future__ import annotations

import hashlib
import secrets
from typing import Any

import asyncpg


def hash_session_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


async def create_auth_session(
    pool: asyncpg.Pool,
    *,
    user_id: int,
    ttl_seconds: int,
    user_agent: str | None = None,
    ip_address: str | None = None,
) -> str:
    normalized_ttl = max(60, int(ttl_seconds))
    normalized_user_agent = (user_agent or "").strip()[:512] or None
    normalized_ip = (ip_address or "").strip()[:128] or None

    async with pool.acquire() as conn:
        for _ in range(5):
            token = secrets.token_urlsafe(32)
            token_hash = hash_session_token(token)
            status = await conn.execute(
                """
                INSERT INTO auth_sessions (
                  user_id,
                  token_hash,
                  expires_at,
                  last_seen_at,
                  user_agent,
                  ip_address
                )
                VALUES (
                  $1,
                  $2,
                  NOW() + ($3 * INTERVAL '1 second'),
                  NOW(),
                  $4,
                  $5
                )
                ON CONFLICT (token_hash) DO NOTHING
                """,
                int(user_id),
                token_hash,
                normalized_ttl,
                normalized_user_agent,
                normalized_ip,
            )
            if status.endswith("1"):
                return token

    raise RuntimeError("Failed to allocate auth session token")


async def get_auth_session_identity(
    pool: asyncpg.Pool,
    token: str | None,
    *,
    touch: bool = True,
) -> dict[str, Any] | None:
    raw = (token or "").strip()
    if not raw:
        return None

    token_hash = hash_session_token(raw)
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT
              s.id AS session_id,
              s.user_id,
              u.email
            FROM auth_sessions s
            JOIN auth_users u ON u.id = s.user_id
            WHERE s.token_hash = $1
              AND s.revoked_at IS NULL
              AND s.expires_at > NOW()
            """,
            token_hash,
        )
        if row is None:
            return None

        if touch:
            await conn.execute(
                """
                UPDATE auth_sessions
                SET last_seen_at = NOW()
                WHERE id = $1
                """,
                row["session_id"],
            )

    return {
        "session_id": int(row["session_id"]),
        "user_id": int(row["user_id"]),
        "email": str(row["email"]),
    }


async def revoke_auth_session(pool: asyncpg.Pool, token: str | None) -> bool:
    raw = (token or "").strip()
    if not raw:
        return False

    token_hash = hash_session_token(raw)
    async with pool.acquire() as conn:
        result = await conn.execute(
            """
            UPDATE auth_sessions
            SET revoked_at = NOW()
            WHERE token_hash = $1 AND revoked_at IS NULL
            """,
            token_hash,
        )

    updated_count = int(str(result).split()[-1])
    return updated_count > 0


async def revoke_all_auth_sessions(pool: asyncpg.Pool, user_id: int) -> int:
    async with pool.acquire() as conn:
        result = await conn.execute(
            """
            UPDATE auth_sessions
            SET revoked_at = NOW()
            WHERE user_id = $1 AND revoked_at IS NULL
            """,
            int(user_id),
        )

    return int(str(result).split()[-1])
