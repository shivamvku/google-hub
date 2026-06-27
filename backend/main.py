"""
Google Hub — FastAPI backend
Multi-user, DB-driven config. No .env secrets required from users.
"""
import os
import time
import uuid
from pathlib import Path

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from .auth import exchange_code_and_upsert, get_auth_url, get_current_user, revoke_user
from .db import get_config, get_db, init_db
from .logger import get_logger
from .routers import calendar, docs, drive, gmail, preflight, setup as setup_router, sheets, youtube

load_dotenv()  # optional — only used for COOKIE_SECURE / COOKIE_SAMESITE overrides

log = get_logger(__name__)

# ── Config ────────────────────────────────────────────────────────────────────
# These two can still be overridden via env for deployment (HTTPS, cross-origin).
# Everything else (Client ID, secrets) lives in the DB.
COOKIE_SECURE   = os.getenv("COOKIE_SECURE",  "false").lower() == "true"
COOKIE_SAMESITE = os.getenv("COOKIE_SAMESITE", "lax")

# Origins allowed before DB config exists (setup wizard phase)
_BOOTSTRAP_ORIGINS = [
    "http://localhost:5173",
    "http://localhost:5174",
]

# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="Google Hub API",
    version="2.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
)


@app.on_event("startup")
def on_startup() -> None:
    init_db()
    log.info("database initialised")


# ── CORS ──────────────────────────────────────────────────────────────────────
# We use a single middleware with a wildcard placeholder, then override the
# Allow-Origin header dynamically so we can read the configured origin from DB.
app.add_middleware(
    CORSMiddleware,
    allow_origins=_BOOTSTRAP_ORIGINS,   # seed — overridden below per-request
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def dynamic_origin(request: Request, call_next):
    """
    Expand allowed CORS origins once DB config is available.
    Falls back to bootstrap list before first-run setup completes.
    """
    db = next(get_db())
    try:
        cfg = get_config(db)
        allowed = list({*_BOOTSTRAP_ORIGINS, cfg.cors_origin}) if cfg else _BOOTSTRAP_ORIGINS
    finally:
        db.close()

    response = await call_next(request)
    origin = request.headers.get("origin", "")
    if origin in allowed:
        response.headers["Access-Control-Allow-Origin"]      = origin
        response.headers["Access-Control-Allow-Credentials"] = "true"
        response.headers["Vary"]                             = "Origin"
    return response


# ── Request logging ───────────────────────────────────────────────────────────
@app.middleware("http")
async def request_logger(request: Request, call_next):
    req_id = str(uuid.uuid4())[:8]
    start  = time.perf_counter()
    response = await call_next(request)
    duration_ms = round((time.perf_counter() - start) * 1000, 1)
    log.info(
        "request",
        extra={
            "req_id":  req_id,
            "method":  request.method,
            "path":    request.url.path,
            "status":  response.status_code,
            "ms":      duration_ms,
        },
    )
    return response


# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(setup_router.router)   # /setup/*  — public, no auth
app.include_router(drive.router)
app.include_router(gmail.router)
app.include_router(calendar.router)
app.include_router(sheets.router)
app.include_router(docs.router)
app.include_router(youtube.router)
app.include_router(preflight.router)


# ── Auth endpoints ────────────────────────────────────────────────────────────
@app.get("/auth/login", include_in_schema=False)
def login(db: Session = Depends(get_db)):
    """Redirect to Google consent page. Triggers phone push for 2SV users."""
    url = get_auth_url(db)
    log.info("oauth_login_redirect")
    return RedirectResponse(url)


@app.get("/auth/callback", include_in_schema=False)
def auth_callback(
    request: Request,
    db: Session = Depends(get_db),
    code: str | None = None,
    error: str | None = None,
    error_description: str | None = None,
):
    """
    Google redirects here after consent.
    Handles both success (code=...) and failure (error=access_denied etc.)
    """
    cfg      = get_config(db)
    frontend = cfg.cors_origin if cfg else _BOOTSTRAP_ORIGINS[-1]

    # Google returned an error (e.g. access_denied = not a test user)
    if error:
        log.warning("auth_callback_error", extra={"error": error, "description": error_description})
        msg = error_description or error
        return RedirectResponse(f"{frontend}?auth_error={error}&auth_error_msg={msg}")

    if not code:
        return RedirectResponse(f"{frontend}?auth_error=no_code")

    try:
        user, jwt_token = exchange_code_and_upsert(code, db)
    except Exception as exc:
        log.error("auth_callback_failed", extra={"error": str(exc)})
        raise HTTPException(400, f"Auth failed: {exc}")

    log.info("user_logged_in", extra={"email": user.email, "google_id": user.google_id})

    response = RedirectResponse(f"{frontend}?auth=success")
    response.set_cookie(
        key      = "session",
        value    = jwt_token,
        httponly = True,
        secure   = COOKIE_SECURE,
        samesite = COOKIE_SAMESITE,
        max_age  = 60 * 60 * 24 * 30,
        path     = "/",
    )
    return response


@app.post("/auth/logout")
def logout(current=Depends(get_current_user), db: Session = Depends(get_db)):
    user, _ = current
    revoke_user(user.google_id, db)
    log.info("user_logged_out", extra={"email": user.email})
    response = JSONResponse({"status": "logged out"})
    response.delete_cookie("session", path="/")
    return response


@app.get("/auth/status")
def auth_status(current=Depends(get_current_user)):
    """Returns the authenticated user's profile from DB (no Google API call)."""
    user, _ = current
    return {
        "authenticated": True,
        "email":         user.email,
        "name":          user.name,
        "picture":       user.picture,
    }


@app.get("/health")
def health():
    return {"status": "ok"}


# ── Static files (production) ─────────────────────────────────────────────────
# Serve the compiled Vite frontend. Must be registered LAST so API routes
# take priority. Falls back to index.html for client-side routing (SPA).
_STATIC_DIR = Path(__file__).parent.parent / "frontend" / "dist"

if _STATIC_DIR.exists():
    app.mount("/assets", StaticFiles(directory=str(_STATIC_DIR / "assets")), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def serve_spa(full_path: str):
        """Catch-all: serve index.html for any non-API path (React Router)."""
        file = _STATIC_DIR / full_path
        if file.exists() and file.is_file():
            return FileResponse(str(file))
        return FileResponse(str(_STATIC_DIR / "index.html"))
