from __future__ import annotations

import uvicorn

from app.config import settings


if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=settings.ws_port,
        reload=True,
        reload_dirs=["backend"],
    )
