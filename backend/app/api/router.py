from __future__ import annotations

from fastapi import APIRouter

from app.api.rooms import router as rooms_router
from app.api.system import router as system_router
from app.api.ws import router as ws_router
from app.api.friends import router as friends_router

api_router = APIRouter()
api_router.include_router(system_router)
api_router.include_router(friends_router)
api_router.include_router(rooms_router)
api_router.include_router(ws_router)
