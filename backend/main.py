from __future__ import annotations

import logging

from fastapi import FastAPI, HTTPException, WebSocket
from fastapi.middleware.cors import CORSMiddleware

from app.database import close_db, init_db, load_room_snapshot, ping_db
from app.runtime import runtime

logging.basicConfig(level=logging.INFO)

app = FastAPI(title="QuizBattle Backend", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def on_startup() -> None:
    await init_db()


@app.on_event("shutdown")
async def on_shutdown() -> None:
    await runtime.shutdown()
    await close_db()


@app.get("/api/health")
async def health() -> dict[str, object]:
    db_ok = await ping_db()
    return {
        "ok": db_ok,
        "database": "up" if db_ok else "down",
        "activeRooms": runtime.active_rooms_count,
    }


@app.get("/api/rooms/{room_id}")
async def room_snapshot(room_id: str) -> dict[str, object]:
    room_id_value = room_id.upper()[:8]
    snapshot = await load_room_snapshot(room_id_value)
    if snapshot is None:
        raise HTTPException(status_code=404, detail="Room not found")

    return {
        "roomId": snapshot.room_id,
        "topic": snapshot.topic,
        "questionCount": snapshot.question_count,
        "state": snapshot.state_json,
        "updatedAt": str(snapshot.updated_at),
    }


@app.websocket("/api/ws")
async def websocket_api(ws: WebSocket) -> None:
    await runtime.handle_websocket(ws)


@app.websocket("/ws")
async def websocket_compat(ws: WebSocket) -> None:
    await runtime.handle_websocket(ws)
