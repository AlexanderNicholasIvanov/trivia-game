from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.solo import router as solo_router
from app.websockets import router as ws_router

app = FastAPI(title="Trivia Game API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(ws_router)
app.include_router(solo_router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


# Serve the built frontend if it was bundled into the image. The Dockerfile
# copies `frontend/dist/` to `<repo>/frontend_dist/`; in local dev that
# directory does not exist and the frontend runs on Vite separately.
DIST_PATH = Path(__file__).resolve().parent.parent.parent / "frontend_dist"
if DIST_PATH.is_dir():
    assets_dir = DIST_PATH / "assets"
    if assets_dir.is_dir():
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    # Mount large/streamable static directories explicitly so Starlette's
    # StaticFiles handles HTTP Range requests (required for audio playback
    # to start before the full file is downloaded).
    audio_dir = DIST_PATH / "audio"
    if audio_dir.is_dir():
        app.mount("/audio", StaticFiles(directory=audio_dir), name="audio")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def spa_fallback(full_path: str) -> FileResponse:
        # Serve a real file if one exists at that path (e.g. /vite.svg).
        candidate = DIST_PATH / full_path
        if full_path and candidate.is_file():
            return FileResponse(candidate)
        # Otherwise serve the SPA shell so client-side routing works.
        return FileResponse(DIST_PATH / "index.html")
