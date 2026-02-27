from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.database import load_room_snapshot
from app.runtime import runtime
from app.schemas.rooms import CreateRoomRequest

router = APIRouter(tags=["rooms"])


@router.get("/api/rooms/{room_id}")
async def room_snapshot(room_id: str) -> dict[str, object]:
    room_id_value = room_id.upper()[:8]
    snapshot = await load_room_snapshot(room_id_value)
    if snapshot is None:
        raise HTTPException(status_code=404, detail="Room not found")

    state = dict(snapshot.state_json or {})
    state.pop("hostTokenHash", None)
    has_password = bool(str(state.get("roomPasswordHash") or "").strip())
    state.pop("roomPasswordHash", None)

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
    room_id, host_token = await runtime.create_room(
        payload.topic,
        payload.questionCount,
        payload.difficulty,
        payload.gameMode,
        payload.roomType,
        payload.roomPassword,
    )
    return {
        "roomId": room_id,
        "hostToken": host_token,
        "hasPassword": payload.roomType == "password",
    }
