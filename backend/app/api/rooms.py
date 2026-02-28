from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time
from fastapi import APIRouter, HTTPException
from fastapi import Header

from app.auth_repository import claim_quick_game_reward
from app.auth_utils import extract_bearer_token
from app.config import settings
from app.database import get_auth_session_identity
from app.database import load_room_snapshot
from app.question_generation import generate_questions_payload
from app.question_generation import QuestionGenerationUnavailable
from app.runtime import runtime
from app.runtime_utils import hash_secret
from app.runtime_utils import create_topic_questions, normalize_topic
from app.runtime_utils import is_supported_topic
from app.schemas.rooms import (
    CreateRoomRequest,
    QuickGameCompleteRequest,
    QuickGameQuestionsRequest,
    VerifyRoomPasswordRequest,
)

router = APIRouter(tags=["rooms"])


def _sign_quick_game_reward_payload(payload: dict[str, object]) -> str:
    serialized = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    signature = hmac.new(
        settings.quick_game_reward_secret.encode("utf-8"),
        serialized,
        hashlib.sha256,
    ).hexdigest()
    return base64.urlsafe_b64encode(serialized).decode("utf-8") + "." + signature


def _decode_quick_game_reward_token(token: str) -> dict[str, object]:
    raw_token = str(token or "").strip()
    if "." not in raw_token:
        raise HTTPException(status_code=400, detail="Некорректный reward token")

    encoded_payload, signature = raw_token.rsplit(".", 1)
    try:
        payload_bytes = base64.urlsafe_b64decode(encoded_payload.encode("utf-8"))
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Некорректный reward token") from exc

    expected_signature = hmac.new(
        settings.quick_game_reward_secret.encode("utf-8"),
        payload_bytes,
        hashlib.sha256,
    ).hexdigest()
    if not hmac.compare_digest(signature, expected_signature):
        raise HTTPException(status_code=400, detail="Некорректный reward token")

    try:
        payload = json.loads(payload_bytes.decode("utf-8"))
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Некорректный reward token") from exc

    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Некорректный reward token")
    return payload


@router.get("/api/rooms/{room_id}")
async def room_snapshot(room_id: str) -> dict[str, object]:
    room_id_value = room_id.upper()[:8]
    snapshot = await load_room_snapshot(room_id_value)
    if snapshot is None:
        raise HTTPException(status_code=404, detail="Room not found")

    state = dict(snapshot.state_json or {})
    state.pop("hostTokenHash", None)
    has_password = bool(state.get("isPasswordProtected")) or bool(
        str(state.get("roomPasswordHash") or "").strip()
    )
    state.pop("roomPasswordHash", None)
    state.pop("isPasswordProtected", None)

    return {
        "roomId": snapshot.room_id,
        "topic": snapshot.topic,
        "difficulty": str(state.get("difficultyMode") or "medium"),
        "gameMode": str(state.get("gameMode") or "classic"),
        "questionCount": snapshot.question_count,
        "hasPassword": has_password,
        "state": state,
        "updatedAt": str(snapshot.updated_at),
    }


@router.post("/api/rooms/create")
async def create_room(payload: CreateRoomRequest) -> dict[str, object]:
    try:
        room_id, host_token = await runtime.create_room(
            payload.topic,
            payload.questionCount,
            payload.difficulty,
            payload.gameMode,
            payload.roomType,
            payload.roomPassword,
        )
    except QuestionGenerationUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return {
        "roomId": room_id,
        "hostToken": host_token,
        "hasPassword": payload.roomType == "password",
    }


@router.post("/api/rooms/{room_id}/verify-password")
async def verify_room_password(room_id: str, payload: VerifyRoomPasswordRequest) -> dict[str, object]:
    room_id_value = room_id.upper()[:8]

    live_room = runtime.rooms.get(room_id_value)
    room_password_hash = ""
    has_password = False

    if live_room is not None:
        room_password_hash = str(getattr(live_room, "room_password_hash", "") or "").strip()
        has_password = bool(getattr(live_room, "is_password_protected", False) or room_password_hash)
    else:
        snapshot = await load_room_snapshot(room_id_value)
        if snapshot is None:
            raise HTTPException(status_code=404, detail="Room not found")
        state = dict(snapshot.state_json or {})
        room_password_hash = str(state.get("roomPasswordHash") or "").strip()
        has_password = bool(state.get("isPasswordProtected")) or bool(room_password_hash)

    if not has_password:
        return {
            "roomId": room_id_value,
            "hasPassword": False,
            "valid": True,
        }

    provided_password = str(payload.password or "").strip()
    is_valid = bool(room_password_hash) and bool(provided_password) and (
        hash_secret(provided_password) == room_password_hash
    )
    return {
        "roomId": room_id_value,
        "hasPassword": True,
        "valid": is_valid,
    }


@router.post("/api/quick-game/questions")
async def build_quick_game_questions(payload: QuickGameQuestionsRequest) -> dict[str, object]:
    topic_value = normalize_topic(payload.topic, allow_custom=True)
    difficulty = str(payload.difficulty or "medium").lower()
    question_count = max(5, min(7, int(payload.questionCount or 7)))
    if difficulty not in {"easy", "medium", "hard", "progressive"}:
        raise HTTPException(status_code=400, detail="Unsupported difficulty")

    try:
        if is_supported_topic(topic_value):
            questions = create_topic_questions(topic_value, question_count, difficulty)
            resolved_topic = topic_value
        else:
            generated = await generate_questions_payload(topic_value, question_count, difficulty)
            resolved_topic = str(generated.get("topic") or topic_value)
            questions = list(generated.get("questions") or [])
    except QuestionGenerationUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    reward_payload = {
        "topic": resolved_topic,
        "difficulty": difficulty,
        "questionCount": question_count,
        "issuedAt": int(time.time()),
        "questions": [
            {
                "id": str(question.get("id") or ""),
                "correctIndex": int(question.get("correctIndex", 0) or 0),
                "difficulty": str(question.get("difficulty") or "medium"),
            }
            for question in questions
        ],
    }

    return {
        "topic": resolved_topic,
        "difficulty": difficulty,
        "questionCount": question_count,
        "questions": questions,
        "rewardToken": _sign_quick_game_reward_payload(reward_payload),
    }


@router.post("/api/quick-game/complete")
async def complete_quick_game(
    payload: QuickGameCompleteRequest,
    authorization: str | None = Header(default=None),
) -> dict[str, object]:
    reward_payload = _decode_quick_game_reward_token(payload.rewardToken)
    issued_at = int(reward_payload.get("issuedAt") or 0)
    if issued_at <= 0 or int(time.time()) - issued_at > 60 * 60 * 6:
        raise HTTPException(status_code=400, detail="Награда за эту быструю игру уже недоступна")

    questions_raw = reward_payload.get("questions")
    if not isinstance(questions_raw, list) or not questions_raw:
        raise HTTPException(status_code=400, detail="Некорректный reward token")

    submitted_answers = {
        str(item.questionId): item.selectedIndex
        for item in payload.answers
    }
    score_by_difficulty = {"easy": 1, "medium": 2, "hard": 3}
    total_points = 0
    correct_count = 0
    for item in questions_raw:
        if not isinstance(item, dict):
            continue
        question_id = str(item.get("id") or "")
        difficulty = str(item.get("difficulty") or "medium").lower()
        correct_index = int(item.get("correctIndex", 0) or 0)
        selected_index = submitted_answers.get(question_id)
        if selected_index is None:
            continue
        if int(selected_index) == correct_index:
            correct_count += 1
            total_points += score_by_difficulty.get(difficulty, 2)

    token = extract_bearer_token(authorization)
    identity = await get_auth_session_identity(token, touch=True) if token else None
    if identity is None:
        return {
            "ok": True,
            "awarded": False,
            "awardedCoins": 0,
            "balance": None,
            "totalPoints": total_points,
            "correctAnswers": correct_count,
        }

    token_hash = hashlib.sha256(str(payload.rewardToken).encode("utf-8")).hexdigest()
    claim = await claim_quick_game_reward(int(identity["user_id"]), token_hash, total_points)
    return {
        "ok": True,
        "awarded": bool(claim.get("ok")),
        "awardedCoins": int(claim.get("awarded") or 0),
        "balance": int(claim.get("coins") or 0),
        "totalPoints": total_points,
        "correctAnswers": correct_count,
    }
