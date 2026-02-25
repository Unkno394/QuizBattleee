from __future__ import annotations

import os


class Settings:
    def __init__(self) -> None:
        self.database_url = os.getenv(
            "DATABASE_URL",
            "postgresql+asyncpg://postgres:postgres@localhost:5432/quizbattle",
        )
        self.ws_port = int(os.getenv("WS_PORT", "3001"))
        self.max_players = int(os.getenv("MAX_PLAYERS", "20"))


settings = Settings()
