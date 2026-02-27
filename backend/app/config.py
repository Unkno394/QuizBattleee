from __future__ import annotations

import os

from dotenv import load_dotenv

load_dotenv()


class Settings:
    def __init__(self) -> None:
        self.database_url = os.getenv(
            "DATABASE_URL",
            "postgresql+asyncpg://postgres:postgres@localhost:5432/quizbattle",
        )
        self.redis_url = os.getenv("REDIS_URL", "redis://localhost:6379/0").strip()
        self.redis_room_snapshot_ttl_seconds = int(
            os.getenv("REDIS_ROOM_SNAPSHOT_TTL_SECONDS", "43200")
        )
        self.redis_hot_snapshot_interval_ms = max(
            100,
            int(os.getenv("REDIS_HOT_SNAPSHOT_INTERVAL_MS", "750")),
        )
        self.db_room_snapshot_interval_ms = max(
            500,
            int(os.getenv("DB_ROOM_SNAPSHOT_INTERVAL_MS", "3500")),
        )
        self.ws_port = int(os.getenv("WS_PORT", "3001"))
        self.max_players = int(os.getenv("MAX_PLAYERS", "20"))


settings = Settings()
