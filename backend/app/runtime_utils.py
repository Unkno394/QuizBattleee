from __future__ import annotations

import hashlib
import random
import re
import secrets
import time
import uuid
from typing import Any, cast

from .runtime_constants import (
    DEFAULT_TOPIC,
    DIFFICULTY_LEVELS,
    DIFFICULTY_MODES,
    FORBIDDEN_NAME_PARTS,
    GAME_MODES,
    QUESTION_CATALOG,
    QUESTION_TIME_MS,
    ROOM_CODE_CHARS,
    SUPPORTED_TOPICS,
)
from .runtime_types import DifficultyMode, GameMode, QuestionDifficulty, Team


def now_ms() -> int:
    return int(time.time() * 1000)


def random_id() -> str:
    return str(uuid.uuid4())


def random_room_code(length: int = 6) -> str:
    return "".join(random.choice(ROOM_CODE_CHARS) for _ in range(max(4, length)))


def hash_secret(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def generate_secret(length: int = 32) -> str:
    return secrets.token_urlsafe(length)


def sanitize_room_id(raw: str | None) -> str:
    value = (raw or "").upper()
    filtered = "".join(ch for ch in value if ch.isalnum())
    return filtered[:8]


def sanitize_team_name(raw: Any, fallback: str) -> str:
    trimmed = str(raw or "").strip()[:32]
    return trimmed or fallback


def normalize_team_name(name: str) -> str:
    return name.strip().lower()


def normalize_player_name(name: str | None) -> str:
    return str(name or "").strip().lower()


def sanitize_player_name(raw: str | None) -> str:
    value = str(raw or "").strip()
    if not value:
        return "Игрок"
    cleaned = re.sub(r"\s+", " ", value)[:24].strip()
    lowered = cleaned.lower()
    if any(part in lowered for part in FORBIDDEN_NAME_PARTS):
        return "Игрок"
    return cleaned or "Игрок"


def normalize_client_id(raw: str | None) -> str | None:
    value = str(raw or "").strip().lower()
    if not value:
        return None
    filtered = "".join(ch for ch in value if ch.isalnum() or ch in {"-", "_"})
    if len(filtered) < 8:
        return None
    return filtered[:64]


def normalize_player_token(raw: str | None) -> str | None:
    value = str(raw or "").strip()
    if not value:
        return None
    filtered = "".join(ch for ch in value if ch.isalnum() or ch in {"-", "_"})
    if len(filtered) < 12:
        return None
    return filtered[:128]


def build_guest_identity_key(client_id: str | None) -> str | None:
    normalized_client_id = normalize_client_id(client_id)
    if normalized_client_id:
        return f"guest:{normalized_client_id}"
    return None


def clamp_question_count(value: Any) -> int:
    try:
        num = int(value)
    except (TypeError, ValueError):
        return 5
    return max(5, min(7, round(num)))


def normalize_difficulty_mode(value: Any) -> DifficultyMode:
    normalized = str(value or "").strip().lower()
    if normalized in DIFFICULTY_MODES:
        return cast(DifficultyMode, normalized)
    return "mixed"


def normalize_game_mode(value: Any) -> GameMode:
    normalized = str(value or "").strip().lower()
    if normalized in GAME_MODES:
        return cast(GameMode, normalized)
    return "classic"


def is_supported_topic(value: Any) -> bool:
    raw = str(value or "").strip()[:80]
    if not raw:
        return False

    for topic in SUPPORTED_TOPICS:
        if topic.lower() == raw.lower():
            return True

    return False


def normalize_topic(value: Any, *, allow_custom: bool = False) -> str:
    raw = str(value or "").strip()[:80]
    if not raw:
        return DEFAULT_TOPIC

    for topic in SUPPORTED_TOPICS:
        if topic.lower() == raw.lower():
            return topic

    return raw if allow_custom else DEFAULT_TOPIC


def build_difficulty_plan(count: int, difficulty_mode: DifficultyMode) -> list[QuestionDifficulty]:
    if difficulty_mode in DIFFICULTY_LEVELS:
        return [cast(QuestionDifficulty, difficulty_mode)] * count

    if difficulty_mode == "progressive":
        if count <= 5:
            return ["easy", "medium", "hard", "hard", "hard"][:count]
        if count == 6:
            return ["easy", "medium", "medium", "hard", "hard", "hard"]
        return ["easy", "medium", "medium", "hard", "hard", "hard", "hard"][:count]

    cycle: tuple[QuestionDifficulty, QuestionDifficulty, QuestionDifficulty] = (
        "easy",
        "medium",
        "hard",
    )
    return [cycle[index % len(cycle)] for index in range(count)]


def _normalize_question_count(value: Any, *, minimum: int, maximum: int, default: int) -> int:
    try:
        num = int(value)
    except (TypeError, ValueError):
        return default
    return max(minimum, min(maximum, round(num)))


def _shuffle_question_options(
    template: dict[str, Any],
    *,
    desired_correct_index: int | None = None,
) -> tuple[list[str], int]:
    options = [str(option) for option in template.get("options", [])]
    correct_index = int(template.get("correctIndex", 0) or 0)
    correct_option = options[correct_index]
    distractors = [option for index, option in enumerate(options) if index != correct_index]
    random.shuffle(distractors)

    if desired_correct_index is None or desired_correct_index < 0 or desired_correct_index >= len(options):
        desired_correct_index = random.randrange(len(options))

    distractor_iter = iter(distractors)
    shuffled_options: list[str] = []
    for index in range(len(options)):
        if index == desired_correct_index:
            shuffled_options.append(correct_option)
        else:
            shuffled_options.append(next(distractor_iter))

    return shuffled_options, desired_correct_index


def create_topic_questions(topic: str, count: int, difficulty_mode: DifficultyMode) -> list[dict[str, Any]]:
    normalized_topic = normalize_topic(topic)
    normalized_count = _normalize_question_count(count, minimum=1, maximum=50, default=5)
    normalized_mode = normalize_difficulty_mode(difficulty_mode)
    plan = build_difficulty_plan(normalized_count, normalized_mode)
    cursor_by_difficulty: dict[QuestionDifficulty, int] = {"easy": 0, "medium": 0, "hard": 0}
    order_by_difficulty: dict[QuestionDifficulty, list[int]] = {"easy": [], "medium": [], "hard": []}
    answer_slot_order_by_count: dict[int, list[int]] = {}
    answer_slot_cursor_by_count: dict[int, int] = {}
    topic_catalog = QUESTION_CATALOG.get(normalized_topic) or QUESTION_CATALOG[DEFAULT_TOPIC]
    output: list[dict[str, Any]] = []

    for index, difficulty in enumerate(plan):
        bucket = topic_catalog[difficulty]
        order = order_by_difficulty[difficulty]
        if len(order) != len(bucket):
            order = list(range(len(bucket)))
            random.shuffle(order)
            order_by_difficulty[difficulty] = order

        cursor = cursor_by_difficulty[difficulty]
        if cursor > 0 and cursor % len(order) == 0:
            random.shuffle(order)

        bucket_index = order[cursor % len(order)]
        template = bucket[bucket_index]
        cursor_by_difficulty[difficulty] = cursor + 1
        option_count = len(template.get("options", []))
        answer_slot_order = answer_slot_order_by_count.get(option_count, [])
        if len(answer_slot_order) != option_count:
            answer_slot_order = list(range(option_count))
            random.shuffle(answer_slot_order)
            answer_slot_order_by_count[option_count] = answer_slot_order
            answer_slot_cursor_by_count[option_count] = 0

        answer_slot_cursor = answer_slot_cursor_by_count.get(option_count, 0)
        if answer_slot_cursor > 0 and answer_slot_cursor % option_count == 0:
            random.shuffle(answer_slot_order)

        desired_correct_index = answer_slot_order[answer_slot_cursor % option_count]
        answer_slot_cursor_by_count[option_count] = answer_slot_cursor + 1
        shuffled_options, shuffled_correct_index = _shuffle_question_options(
            template,
            desired_correct_index=desired_correct_index,
        )

        output.append(
            {
                "id": str(index + 1),
                "text": str(template["text"]),
                "options": shuffled_options,
                "correctIndex": shuffled_correct_index,
                "difficulty": difficulty,
            }
        )

    return output


def create_mock_questions(topic: str, count: int, difficulty_mode: DifficultyMode) -> list[dict[str, Any]]:
    return create_topic_questions(topic, clamp_question_count(count), difficulty_mode)


def next_team(team: Team) -> Team:
    return "B" if team == "A" else "A"


def calculate_speed_bonus(remaining_ms: int, question_time_ms: int = QUESTION_TIME_MS) -> int:
    safe_total = max(1, int(question_time_ms))
    safe_remaining = max(0, int(remaining_ms))
    ratio = safe_remaining / safe_total
    if ratio >= 0.67:
        return 2
    if ratio >= 0.34:
        return 1
    return 0
