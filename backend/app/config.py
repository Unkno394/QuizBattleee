from __future__ import annotations

import os
from dataclasses import dataclass

from dotenv import load_dotenv

load_dotenv()


@dataclass(frozen=True)
class AIQuestionProviderConfig:
    name: str
    url: str
    model: str
    api_key: str
    referer: str | None = None
    title: str | None = None


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
        self.ai_question_api_url = os.getenv(
            "AI_QUESTION_API_URL",
            "https://api.openai.com/v1/chat/completions",
        ).strip()
        self.ai_question_model = os.getenv("AI_QUESTION_MODEL", "gpt-4.1-mini").strip()
        self.ai_question_timeout_seconds = max(
            5,
            int(os.getenv("AI_QUESTION_TIMEOUT_SECONDS", "60")),
        )
        self.ai_question_temperature = min(
            1.5,
            max(0.0, float(os.getenv("AI_QUESTION_TEMPERATURE", "0.8"))),
        )
        self.quick_game_reward_secret = os.getenv(
            "QUICK_GAME_REWARD_SECRET",
            "dev-quick-game-reward-secret",
        ).strip()
        provider_configs: list[AIQuestionProviderConfig] = []
        for index in range(1, 7):
            api_key = os.getenv(f"AI_QUESTION_PROVIDER_{index}_KEY", "").strip()
            model = os.getenv(f"AI_QUESTION_PROVIDER_{index}_MODEL", "").strip()
            url = os.getenv(f"AI_QUESTION_PROVIDER_{index}_URL", "").strip()
            if not api_key or not model or not url:
                continue
            provider_configs.append(
                AIQuestionProviderConfig(
                    name=os.getenv(f"AI_QUESTION_PROVIDER_{index}_NAME", f"provider-{index}").strip()
                    or f"provider-{index}",
                    url=url,
                    model=model,
                    api_key=api_key,
                    referer=os.getenv(f"AI_QUESTION_PROVIDER_{index}_REFERER", "").strip() or None,
                    title=os.getenv(f"AI_QUESTION_PROVIDER_{index}_TITLE", "").strip() or None,
                )
            )

        if provider_configs:
            self.ai_question_providers = tuple(provider_configs)
        else:
            raw_ai_keys: list[str] = []
            csv_keys = os.getenv("AI_QUESTION_API_KEYS", "").strip()
            if csv_keys:
                raw_ai_keys.extend(part.strip() for part in csv_keys.split(","))
            for index in range(1, 7):
                env_key = os.getenv(f"AI_QUESTION_API_KEY_{index}", "").strip()
                if env_key:
                    raw_ai_keys.append(env_key)
            self.ai_question_providers = tuple(
                AIQuestionProviderConfig(
                    name=f"legacy-{index + 1}",
                    url=self.ai_question_api_url,
                    model=self.ai_question_model,
                    api_key=key,
                )
                for index, key in enumerate(dict.fromkeys(raw_ai_keys))
                if key
            )


settings = Settings()
