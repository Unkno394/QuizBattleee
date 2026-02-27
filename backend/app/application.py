from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.auth_api import router as auth_router
from app.database import close_db, init_db
from app.redis_cache import close_redis, init_redis
from app.runtime import runtime


def create_app() -> FastAPI:
    app = FastAPI(title="QuizBattle Backend", version="1.0.0")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(auth_router)
    app.include_router(api_router)

    @app.on_event("startup")
    async def on_startup() -> None:
        await init_db()
        await init_redis()

    @app.on_event("shutdown")
    async def on_shutdown() -> None:
        await runtime.shutdown()
        await close_redis()
        await close_db()

    return app


app = create_app()
