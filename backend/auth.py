"""
OAuth2 flow + per-user credential management.

All secrets (Client ID, Client Secret, JWT key, Fernet key) are loaded
from the SQLite app_config table — no .env required from users.

Flow:
  1. /setup/status      → frontend checks if app is configured
  2. /setup/save        → user pastes Client ID + Secret → saved to DB, keys auto-generated
  3. /auth/login        → redirect to Google consent (triggers phone push for 2SV users)
  4. /auth/callback     → exchange code → upsert user+token → set httponly JWT cookie
  5. Every API request  → get_current_user() reads cookie → loads creds from DB
"""
import json
from datetime import datetime, timedelta, timezone
from functools import lru_cache

import jwt
from cryptography.fernet import Fernet
from fastapi import Cookie, Depends, HTTPException, status
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build
from sqlalchemy.orm import Session

from .db import AppConfig, User, UserToken, get_db, get_config
from .logger import get_logger

log = get_logger(__name__)

SCOPES = [
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/gmail.modify",
    "https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/documents",
    "https://www.googleapis.com/auth/youtube",
]

JWT_ALGORITHM   = "HS256"
JWT_EXPIRE_DAYS = 30


# ── Config loader (reads DB, not .env) ────────────────────────────────────────

def _require_config(db: Session) -> AppConfig:
    """Return config or raise a clear 503 if the app hasn't been set up yet."""
    cfg = get_config(db)
    if cfg is None:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "App is not configured. Please complete the setup wizard first.",
        )
    return cfg


def _client_config(cfg: AppConfig) -> dict:
    return {
        "web": {
            "client_id":     cfg.client_id,
            "client_secret": cfg.client_secret,
            "redirect_uris": [cfg.redirect_uri],
            "auth_uri":      "https://accounts.google.com/o/oauth2/auth",
            "token_uri":     "https://oauth2.googleapis.com/token",
        }
    }


# ── Fernet helpers ─────────────────────────────────────────────────────────────

def _fernet(cfg: AppConfig) -> Fernet:
    return Fernet(cfg.encryption_key.encode())


def _encrypt(cfg: AppConfig, plain: str) -> str:
    return _fernet(cfg).encrypt(plain.encode()).decode()


def _decrypt(cfg: AppConfig, cipher: str) -> str:
    return _fernet(cfg).decrypt(cipher.encode()).decode()


# ── JWT helpers ────────────────────────────────────────────────────────────────

def _create_jwt(cfg: AppConfig, google_id: str) -> str:
    exp = datetime.now(timezone.utc) + timedelta(days=JWT_EXPIRE_DAYS)
    return jwt.encode({"sub": google_id, "exp": exp}, cfg.jwt_secret, algorithm=JWT_ALGORITHM)


def _decode_jwt(cfg: AppConfig, token: str) -> str:
    """Return google_id or raise 401."""
    try:
        payload = jwt.decode(token, cfg.jwt_secret, algorithms=[JWT_ALGORITHM])
        return payload["sub"]
    except jwt.ExpiredSignatureError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session expired, please log in again")
    except jwt.PyJWTError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid session token")


# ── OAuth helpers ──────────────────────────────────────────────────────────────

def get_auth_url(db: Session) -> str:
    """
    Return Google OAuth2 consent URL.
    prompt='select_account consent' triggers Google's phone push-notification for 2SV users.

    autogenerate_code_verifier=False disables PKCE entirely — correct for
    confidential server-side clients that have a client_secret.
    PKCE is only needed for public clients (SPAs/mobile) that cannot keep a secret.
    """
    cfg  = _require_config(db)
    flow = Flow.from_client_config(
        _client_config(cfg),
        scopes=SCOPES,
        autogenerate_code_verifier=False,   # disable PKCE
    )
    flow.redirect_uri = cfg.redirect_uri
    auth_url, _ = flow.authorization_url(
        access_type="offline",
        include_granted_scopes="true",
        prompt="select_account consent",
    )
    return auth_url


def exchange_code_and_upsert(code: str, db: Session) -> tuple[User, str]:
    """
    Exchange auth code → fetch Google profile → upsert user + encrypted token.
    Returns (User, jwt_token).
    """
    cfg  = _require_config(db)
    flow = Flow.from_client_config(_client_config(cfg), scopes=SCOPES)
    flow.redirect_uri = cfg.redirect_uri
    # code_verifier must be None to match the non-PKCE auth URL
    flow.fetch_token(code=code, code_verifier=None)
    creds = flow.credentials

    svc       = build("oauth2", "v2", credentials=creds)
    info      = svc.userinfo().get().execute()
    google_id = info["id"]

    # Upsert user
    user = db.get(User, google_id)
    if user is None:
        user = User(
            google_id = google_id,
            email     = info.get("email", ""),
            name      = info.get("name", ""),
            picture   = info.get("picture"),
        )
        db.add(user)
    else:
        user.email   = info.get("email", user.email)
        user.name    = info.get("name", user.name)
        user.picture = info.get("picture", user.picture)

    # Upsert encrypted token
    enc       = _encrypt(cfg, creds.to_json())
    token_row = db.get(UserToken, google_id)
    if token_row is None:
        token_row = UserToken(google_id=google_id, encrypted_token=enc)
        db.add(token_row)
    else:
        token_row.encrypted_token = enc

    db.commit()
    db.refresh(user)
    log.info("user_upserted", extra={"email": user.email, "google_id": google_id})
    return user, _create_jwt(cfg, google_id)


# ── FastAPI dependency ─────────────────────────────────────────────────────────

def get_current_user(
    session: str | None = Cookie(default=None, alias="session"),
    db: Session = Depends(get_db),
) -> tuple[User, Credentials]:
    """
    Auth guard used by every protected route.
    Reads the httponly 'session' cookie → decodes JWT → loads + refreshes creds.
    Returns (User, Credentials).
    """
    if not session:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated")

    cfg       = _require_config(db)
    google_id = _decode_jwt(cfg, session)

    user = db.get(User, google_id)
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User not found, please log in again")

    token_row: UserToken | None = db.get(UserToken, google_id)
    if token_row is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "No credentials stored, please log in again")

    creds = Credentials.from_authorized_user_info(
        json.loads(_decrypt(cfg, token_row.encrypted_token)), SCOPES
    )

    if creds.expired and creds.refresh_token:
        creds.refresh(Request())
        token_row.encrypted_token = _encrypt(cfg, creds.to_json())
        db.commit()
        log.info("token_refreshed", extra={"google_id": google_id})

    if not creds.valid:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Credentials invalid, please log in again")

    return user, creds


def revoke_user(google_id: str, db: Session) -> None:
    """Delete the user's token row — effectively logs them out."""
    token_row = db.get(UserToken, google_id)
    if token_row:
        db.delete(token_row)
        db.commit()
