from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any

from .config import settings

try:
    from redis.asyncio import Redis
    from redis.asyncio import from_url as redis_from_url
except Exception:  # pragma: no cover - optional dependency fallback
    Redis = None  # type: ignore[assignment]
    redis_from_url = None  # type: ignore[assignment]

logger = logging.getLogger(__name__)

_redis: Redis | None = None


def is_redis_configured() -> bool:
    return bool(settings.redis_url)


def is_redis_connected() -> bool:
    return _redis is not None


def _room_snapshot_key(room_id: str) -> str:
    return f"qb:room:snapshot:{room_id.upper()[:8]}"


def _normalize_iso(dt: datetime | None) -> str:
    if dt is None:
        return datetime.now(timezone.utc).isoformat()
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).isoformat()


async def init_redis() -> bool:
    global _redis
    if _redis is not None:
        return True

    if not settings.redis_url:
        logger.info("Redis URL is not configured, cache disabled")
        return False
    if Redis is None or redis_from_url is None:
        logger.warning("redis package is not installed, cache disabled")
        return False

    client = redis_from_url(
        settings.redis_url,
        encoding="utf-8",
        decode_responses=True,
    )
    try:
        await client.ping()
    except Exception:
        logger.exception("Failed to connect to Redis %s", settings.redis_url)
        try:
            await client.aclose()
        except Exception:
            pass
        return False

    _redis = client
    logger.info("Redis cache connected")
    return True


async def close_redis() -> None:
    global _redis
    if _redis is None:
        return
    try:
        await _redis.aclose()
    finally:
        _redis = None


async def ping_redis() -> bool:
    if _redis is None:
        return False
    try:
        await _redis.ping()
        return True
    except Exception:
        logger.exception("Redis ping failed")
        return False


async def get_room_snapshot(room_id: str) -> dict[str, Any] | None:
    if _redis is None:
        return None
    key = _room_snapshot_key(room_id)
    try:
        raw = await _redis.get(key)
    except Exception:
        logger.exception("Redis get failed for key %s", key)
        return None
    if not raw:
        return None
    try:
        payload = json.loads(raw)
    except Exception:
        return None
    if not isinstance(payload, dict):
        return None
    return payload


async def set_room_snapshot(
    *,
    room_id: str,
    topic: str,
    question_count: int,
    state_json: dict[str, Any],
    updated_at: datetime | None,
) -> None:
    if _redis is None:
        return
    key = _room_snapshot_key(room_id)
    payload = {
        "roomId": room_id.upper()[:8],
        "topic": str(topic or "")[:80],
        "questionCount": int(question_count),
        "stateJson": state_json if isinstance(state_json, dict) else {},
        "updatedAt": _normalize_iso(updated_at),
    }
    try:
        await _redis.set(
            key,
            json.dumps(payload, ensure_ascii=False),
            ex=max(60, int(settings.redis_room_snapshot_ttl_seconds)),
        )
    except Exception:
        logger.exception("Redis set failed for key %s", key)

