from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .config import settings
from .runtime_types import DifficultyMode, GameMode, QuestionDifficulty, Team

MAX_PLAYERS = settings.max_players
QUESTION_TIME_MS = 30_000
REVEAL_TIME_MS = 4_000
SKIP_REVEAL_TIME_MS = 1_800
TEAM_REVEAL_TIME_MS = 6_000
CAPTAIN_VOTE_TIME_MS = 30_000
AUTO_CAPTAIN_SINGLE_MEMBER_DELAY_MS = 3_000
TEAM_NAMING_TIME_MS = 30_000
HOST_RECONNECT_WAIT_MS = 30_000
BASE_CORRECT_POINTS = 1
CHAT_BAN_STRIKES_TO_DISQUALIFY = 3
PLAYER_PRESENCE_DISCONNECT_GRACE_MS = 3500
TEAM_KEYS: tuple[Team, Team] = ("A", "B")
ROOM_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
FORBIDDEN_NAME_PARTS = ("админ", "admin", "moder", "host")
DIFFICULTY_LEVELS: tuple[QuestionDifficulty, QuestionDifficulty, QuestionDifficulty] = (
    "easy",
    "medium",
    "hard",
)
DIFFICULTY_MODES: tuple[
    DifficultyMode,
    DifficultyMode,
    DifficultyMode,
    DifficultyMode,
    DifficultyMode,
] = ("easy", "medium", "hard", "mixed", "progressive")
GAME_MODES: tuple[GameMode, GameMode, GameMode] = ("classic", "ffa", "chaos")
QUESTIONS_CATALOG_PATH = Path(__file__).resolve().parents[2] / "public" / "questions_by_difficulty.json"


def _sanitize_question_entry(raw: Any) -> dict[str, Any] | None:
    if not isinstance(raw, dict):
        return None

    text = str(raw.get("text") or "").strip()
    options_raw = raw.get("options")
    if not text or not isinstance(options_raw, list):
        return None

    options = [str(option).strip() for option in options_raw if str(option).strip()]
    if len(options) < 2:
        return None

    try:
        correct_index = int(raw.get("correctIndex", 0) or 0)
    except (TypeError, ValueError):
        return None

    if correct_index < 0 or correct_index >= len(options):
        return None

    return {
        "text": text[:300],
        "options": options[:6],
        "correctIndex": correct_index,
    }


def _load_question_catalog() -> dict[str, dict[QuestionDifficulty, list[dict[str, Any]]]]:
    payload = json.loads(QUESTIONS_CATALOG_PATH.read_text(encoding="utf-8"))
    topics_raw = payload.get("topics")
    if not isinstance(topics_raw, dict):
        raise RuntimeError("questions_by_difficulty.json must contain a 'topics' object")

    catalog: dict[str, dict[QuestionDifficulty, list[dict[str, Any]]]] = {}
    for topic_name_raw, topic_payload in topics_raw.items():
        if not isinstance(topic_name_raw, str) or not isinstance(topic_payload, dict):
            continue

        topic_name = topic_name_raw.strip()[:80]
        if not topic_name:
            continue

        difficulty_map: dict[QuestionDifficulty, list[dict[str, Any]]] = {}
        for difficulty in DIFFICULTY_LEVELS:
            entries_raw = topic_payload.get(difficulty)
            if not isinstance(entries_raw, list):
                difficulty_map[difficulty] = []
                continue

            entries = [entry for entry in (_sanitize_question_entry(item) for item in entries_raw) if entry]
            difficulty_map[difficulty] = entries

        if all(difficulty_map[difficulty] for difficulty in DIFFICULTY_LEVELS):
            catalog[topic_name] = difficulty_map

    if not catalog:
        raise RuntimeError("No valid questions were loaded from questions_by_difficulty.json")

    return catalog


QUESTION_CATALOG: dict[str, dict[QuestionDifficulty, list[dict[str, Any]]]] = _load_question_catalog()
SUPPORTED_TOPICS: tuple[str, ...] = tuple(QUESTION_CATALOG.keys())
DEFAULT_TOPIC = "Общая эрудиция" if "Общая эрудиция" in QUESTION_CATALOG else SUPPORTED_TOPICS[0]

DYNAMIC_TEAM_NAMES = [
    "Импульс",
    "Перехват",
    "Фактор X",
    "Блиц-режим",
    "Прорыв",
    "Сверхновые",
    "Форсаж",
    "Рубеж",
    "Эпицентр",
    "Нулевая ошибка",
    "Контрольная точка",
    "Финальный ход",
    "Скрытый потенциал",
    "Мозговой штурм",
    "Решающий аргумент",
    "Горизонт",
    "Точка прорыва",
    "Стратегический резерв",
    "Ускорение",
    "Предел концентрации",
    "Критическая масса",
    "Вектор",
    "Смена парадигмы",
    "Код доступа",
    "Глубокий анализ",
    "Системный подход",
    "Синхронизация",
    "Быстрая логика",
    "Тактический ход",
    "Зона влияния",
    "Интеллектуальный шторм",
    "Второе дыхание",
    "Пиковая форма",
    "Точный расчёт",
    "Момент истины",
]
