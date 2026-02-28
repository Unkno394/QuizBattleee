from __future__ import annotations

import asyncio
import json
import logging
import random
import re
from pathlib import Path
from typing import Any
from urllib import error, request

from .config import settings
from .config import AIQuestionProviderConfig
from .runtime_types import DifficultyMode, QuestionDifficulty
from .runtime_utils import build_difficulty_plan

logger = logging.getLogger(__name__)

GENERATED_QUESTIONS_DIR = Path("/tmp/quizbattle_generated_questions")


class QuestionGenerationError(RuntimeError):
    pass


class QuestionGenerationUnavailable(QuestionGenerationError):
    pass


def _strip_json_fence(raw: str) -> str:
    text = raw.strip()
    if text.startswith("```"):
        text = re.sub(r"^```[a-zA-Z0-9_-]*\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    start = text.find("{")
    end = text.rfind("}")
    if start >= 0 and end > start:
        return text[start : end + 1]
    return text


def _extract_message_content(payload: dict[str, Any]) -> str:
    choices = payload.get("choices")
    if not isinstance(choices, list) or not choices:
        raise QuestionGenerationError("Model response does not contain choices")
    message = choices[0].get("message")
    if not isinstance(message, dict):
        raise QuestionGenerationError("Model response does not contain message")
    content = message.get("content")
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for item in content:
            if isinstance(item, dict) and item.get("type") == "text":
                parts.append(str(item.get("text") or ""))
        if parts:
            return "\n".join(parts)
    raise QuestionGenerationError("Model response does not contain text content")


def _shuffle_options(options: list[str], correct_index: int) -> tuple[list[str], int]:
    indexed = list(enumerate(options))
    random.shuffle(indexed)
    shuffled_options = [text for _, text in indexed]
    shuffled_correct_index = next(
        index for index, (source_index, _) in enumerate(indexed) if source_index == correct_index
    )
    return shuffled_options, shuffled_correct_index


def _validate_generated_questions(
    payload: dict[str, Any],
    *,
    topic: str,
    count: int,
    difficulty_plan: list[QuestionDifficulty],
) -> list[dict[str, Any]]:
    questions_raw = payload.get("questions")
    if not isinstance(questions_raw, list):
        raise QuestionGenerationError("Model JSON does not contain questions[]")

    sanitized: list[dict[str, Any]] = []
    for index, difficulty in enumerate(difficulty_plan):
        if index >= len(questions_raw):
            raise QuestionGenerationError("Model returned fewer questions than requested")
        raw_question = questions_raw[index]
        if not isinstance(raw_question, dict):
            raise QuestionGenerationError("Question entry is not an object")

        text = str(raw_question.get("text") or "").strip()
        options_raw = raw_question.get("options")
        if not text or not isinstance(options_raw, list):
            raise QuestionGenerationError("Question is missing text/options")

        options = [str(option or "").strip()[:80] for option in options_raw]
        options = [option for option in options if option]
        if len(options) != 4:
            raise QuestionGenerationError("Each generated question must contain exactly 4 answers")

        try:
            correct_index = int(raw_question.get("correctIndex"))
        except (TypeError, ValueError):
            raise QuestionGenerationError("Question is missing valid correctIndex") from None

        if correct_index < 0 or correct_index >= len(options):
            raise QuestionGenerationError("correctIndex is out of range")

        shuffled_options, shuffled_correct_index = _shuffle_options(options, correct_index)
        sanitized.append(
            {
                "id": str(index + 1),
                "text": text[:220],
                "options": shuffled_options,
                "correctIndex": shuffled_correct_index,
                "difficulty": difficulty,
                "topic": topic,
            }
        )

    return sanitized


def _build_prompt(topic: str, count: int, difficulty_plan: list[QuestionDifficulty]) -> str:
    numbered_difficulties = ", ".join(difficulty_plan)
    return (
        "Верни только валидный JSON. Без markdown и без комментариев.\n"
        f"Тема: {topic}\n"
        f"Количество вопросов: {count}\n"
        f"Сложности по порядку: {numbered_difficulties}\n"
        "Правила:\n"
        "- вопросы и ответы только на русском языке;\n"
        "- вопросы и ответы должны быть короткими;\n"
        "- у каждого вопроса ровно 4 варианта ответа;\n"
        "- ровно 1 вариант правильный;\n"
        "- вопросы должны соответствовать теме;\n"
        '- Формат JSON: {"topic":"...","questions":[{"text":"...","options":["...","...","...","..."],"correctIndex":0}]}\n'
    )


def _request_generated_questions(
    provider: AIQuestionProviderConfig,
    topic: str,
    count: int,
    difficulty_mode: DifficultyMode,
) -> dict[str, Any]:
    difficulty_plan = build_difficulty_plan(count, difficulty_mode)
    body = {
        "model": provider.model,
        "temperature": settings.ai_question_temperature,
        "max_tokens": max(500, count * 220),
        "messages": [
            {
                "role": "system",
                "content": "Ты генерируешь короткие вопросы для квиза на русском языке и отвечаешь только JSON.",
            },
            {
                "role": "user",
                "content": _build_prompt(topic, count, difficulty_plan),
            },
        ],
    }
    provider_url = provider.url.lower()
    if "openrouter.ai" in provider_url:
        body["response_format"] = {"type": "json_object"}

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {provider.api_key}",
        "Accept": "application/json",
        "User-Agent": (
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
        ),
        "Accept-Language": "ru,en;q=0.9",
        "Connection": "keep-alive",
    }
    if provider.referer:
        headers["HTTP-Referer"] = provider.referer
    if provider.title:
        headers["X-Title"] = provider.title

    raw_request = request.Request(
        provider.url,
        data=json.dumps(body).encode("utf-8"),
        headers=headers,
        method="POST",
    )
    try:
        with request.urlopen(raw_request, timeout=settings.ai_question_timeout_seconds) as response:
            response_payload = json.loads(response.read().decode("utf-8"))
    except error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="ignore")
        raise QuestionGenerationError(f"HTTP {exc.code}: {detail[:300]}") from exc
    except Exception as exc:
        raise QuestionGenerationError(str(exc)) from exc

    if isinstance(response_payload, dict) and "error" in response_payload:
        raise QuestionGenerationError(
            f"Provider returned error: {str(response_payload['error'])[:300]}"
        )

    content = _extract_message_content(response_payload)
    try:
        generated_payload = json.loads(_strip_json_fence(content))
    except Exception as exc:
        raise QuestionGenerationError(
            f"Failed to parse JSON. content_head={content[:200]!r}"
        ) from exc
    if not isinstance(generated_payload, dict):
        raise QuestionGenerationError("Model JSON root is not an object")

    return {
        "topic": topic,
        "difficultyMode": difficulty_mode,
        "questionCount": count,
        "questions": _validate_generated_questions(
            generated_payload,
            topic=topic,
            count=count,
            difficulty_plan=difficulty_plan,
        ),
    }


async def generate_questions_payload(
    topic: str,
    count: int,
    difficulty_mode: DifficultyMode,
) -> dict[str, Any]:
    providers = list(settings.ai_question_providers)
    if not providers:
        raise QuestionGenerationUnavailable(
            "Нейросеть сейчас недоступна. Выберите тему из готового списка."
        )

    last_error = "Unknown question generation error"
    for index, provider in enumerate(providers, start=1):
        try:
            logger.warning(
                "question_generation attempt=%s provider=%s model=%s topic=%s count=%s difficulty=%s",
                index,
                provider.name,
                provider.model,
                topic,
                count,
                difficulty_mode,
            )
            return await asyncio.to_thread(
                _request_generated_questions,
                provider,
                topic,
                count,
                difficulty_mode,
            )
        except Exception as exc:
            last_error = str(exc)
            logger.warning(
                "question_generation failed attempt=%s provider=%s model=%s topic=%s reason=%s",
                index,
                provider.name,
                provider.model,
                topic,
                last_error,
            )

    raise QuestionGenerationUnavailable(
        "Нейросеть не ответила. Выберите тему из готового списка."
    ) from None


def write_generated_questions_file(room_id: str, payload: dict[str, Any]) -> str:
    GENERATED_QUESTIONS_DIR.mkdir(parents=True, exist_ok=True)
    target = GENERATED_QUESTIONS_DIR / f"{str(room_id).upper()[:8]}.json"
    target.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return str(target)


def delete_generated_questions_file(path_value: str | None) -> None:
    if not path_value:
        return
    path = Path(path_value)
    try:
        path.unlink(missing_ok=True)
    except Exception:
        logger.exception("Failed to delete generated questions file %s", path)
