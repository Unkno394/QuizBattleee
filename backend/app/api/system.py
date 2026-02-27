from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Header, HTTPException, Query

from app.auth_repository import get_friend_user_ids, get_user_wins_leaderboard
from app.database import get_auth_session_identity
from app.runtime import runtime
from app.redis_cache import is_redis_configured, ping_redis

router = APIRouter(tags=["system"])


@router.get("/api/health")
async def health() -> dict[str, object]:
    from app.database import ping_db

    db_ok = await ping_db()
    redis_ok = await ping_redis() if is_redis_configured() else False
    redis_status = "disabled" if not is_redis_configured() else ("up" if redis_ok else "down")
    ws_stats = await runtime.get_ws_stats()
    ws_summary = {
        "activeConnections": ws_stats["stats"].get("activeConnections", 0),
        "peakConnections": ws_stats["stats"].get("peakConnections", 0),
        "connectAttempts": ws_stats["stats"].get("connectAttempts", 0),
        "connectRejected": ws_stats["stats"].get("connectRejected", 0),
    }
    return {
        "ok": db_ok,
        "database": "up" if db_ok else "down",
        "redis": redis_status,
        "activeRooms": runtime.active_rooms_count,
        "websocket": ws_summary,
    }


@router.get("/api/ws-stats")
async def websocket_stats() -> dict[str, object]:
    return await runtime.get_ws_stats()


def _optional_bearer_token(authorization: str | None) -> str | None:
    if authorization is None:
        return None
    value = authorization.strip()
    if not value:
        return None
    if value.lower().startswith("bearer "):
        value = value[7:].strip()
    return value or None


@router.get("/api/leaderboard")
async def leaderboard(
    scope: str = Query(default="all", pattern="^(all|friends)$"),
    limit: int = Query(default=50, ge=1, le=200),
    authorization: str | None = Header(default=None),
) -> dict[str, object]:
    normalized_scope = "friends" if scope == "friends" else "all"
    token = _optional_bearer_token(authorization)
    viewer_user_id: int | None = None
    if token:
        identity = await get_auth_session_identity(token, touch=False)
        if identity is not None:
            viewer_user_id = int(identity["user_id"])

    scope_user_ids: list[int] | None = None
    friends_count = 0
    if normalized_scope == "friends":
        if viewer_user_id is None:
            raise HTTPException(status_code=401, detail="Для вкладки друзей требуется авторизация")
        friend_ids = await get_friend_user_ids(viewer_user_id)
        friends_count = len(friend_ids)
        scope_user_ids = sorted({viewer_user_id, *friend_ids})

    rows = await get_user_wins_leaderboard(limit=limit, only_user_ids=scope_user_ids)

    entries: list[dict[str, object]] = []
    rank = 0
    prev_wins: int | None = None
    for index, row in enumerate(rows):
        wins = max(0, int(row["wins"] or 0))
        if prev_wins != wins:
            rank = index + 1
            prev_wins = wins
        user_id = int(row["id"])
        entries.append(
            {
                "rank": rank,
                "userId": user_id,
                "displayName": str(row["display_name"] or "Игрок"),
                "avatarUrl": row["avatar_url"],
                "profileFrame": row["profile_frame"],
                "wins": wins,
                "isMe": viewer_user_id is not None and user_id == viewer_user_id,
            }
        )

    return {
        "ok": True,
        "scope": normalized_scope,
        "entries": entries,
        "friendsCount": friends_count if normalized_scope == "friends" else None,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
    }
