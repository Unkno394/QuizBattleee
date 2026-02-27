from __future__ import annotations

from fastapi import APIRouter, WebSocket

from app.runtime import runtime

router = APIRouter(tags=["websocket"])


@router.websocket("/api/ws")
async def websocket_api(ws: WebSocket) -> None:
    await runtime.handle_websocket(ws)


@router.websocket("/ws")
async def websocket_compat(ws: WebSocket) -> None:
    await runtime.handle_websocket(ws)

