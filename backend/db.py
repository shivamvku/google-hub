"""
Database setup — SQLAlchemy ORM.

Local dev  : SQLite  (DB_FILE env var, default google_hub.db)
Production : Postgres (DATABASE_URL env var, set by Render automatically)

SQLAlchemy handles both transparently — same models, same queries.
"""
import os
import secrets
from pathlib import Path

from cryptography.fernet import Fernet
from sqlalchemy import Column, String, Text, DateTime, ForeignKey, create_engine, func
from sqlalchemy.orm import DeclarativeBase, sessionmaker, relationship, Session

# ── Connection string ──────────────────────────────────────────────────────────
# Render injects DATABASE_URL as postgres://... but SQLAlchemy needs postgresql://
_RAW_URL = os.getenv("DATABASE_URL", "")

if _RAW_URL:
    # Fix Render's legacy postgres:// scheme
    DATABASE_URL = _RAW_URL.replace("postgres://", "postgresql://", 1)
    _CONNECT_ARGS = {}
else:
    # Local dev: SQLite
    DB_PATH      = Path(os.getenv("DB_FILE", "google_hub.db"))
    DATABASE_URL = f"sqlite:///{DB_PATH}"
    _CONNECT_ARGS = {"check_same_thread": False}

engine       = create_engine(DATABASE_URL, connect_args=_CONNECT_ARGS)
SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)


class Base(DeclarativeBase):
    pass


# ── Tables ─────────────────────────────────────────────────────────────────────

class AppConfig(Base):
    """
    Singleton config row — stores OAuth credentials + auto-generated crypto keys.
    No .env required from users; saved via the first-run setup wizard.
    """
    __tablename__ = "app_config"

    id              = Column(String, primary_key=True, default="singleton")
    client_id       = Column(String, nullable=False)
    client_secret   = Column(String, nullable=False)
    redirect_uri    = Column(String, nullable=False,
                             default="http://localhost:8001/auth/callback")
    jwt_secret      = Column(String, nullable=False)
    encryption_key  = Column(String, nullable=False)
    cors_origin     = Column(String, nullable=False,
                             default="http://localhost:5174")
    created_at      = Column(DateTime, server_default=func.now())


class User(Base):
    __tablename__ = "users"

    google_id  = Column(String, primary_key=True, index=True)
    email      = Column(String, unique=True, index=True, nullable=False)
    name       = Column(String, nullable=False)
    picture    = Column(String, nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    token = relationship("UserToken", back_populates="user", uselist=False,
                         cascade="all, delete-orphan")


class UserToken(Base):
    __tablename__ = "user_tokens"

    google_id       = Column(String, ForeignKey("users.google_id", ondelete="CASCADE"),
                             primary_key=True)
    encrypted_token = Column(Text, nullable=False)
    updated_at      = Column(DateTime, server_default=func.now(), onupdate=func.now())

    user = relationship("User", back_populates="token")


# ── Helpers ────────────────────────────────────────────────────────────────────

def init_db() -> None:
    """Create all tables if they don't exist."""
    Base.metadata.create_all(bind=engine)


def get_db():
    """FastAPI dependency — yields a scoped DB session."""
    db: Session = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_config(db: Session) -> AppConfig | None:
    return db.get(AppConfig, "singleton")


def save_config(
    db: Session,
    client_id: str,
    client_secret: str,
    redirect_uri: str = "http://localhost:8001/auth/callback",
    cors_origin: str  = "http://localhost:5174",
) -> AppConfig:
    """
    Create or update the singleton config row.
    Crypto keys are auto-generated on first save and preserved on updates.
    """
    existing = db.get(AppConfig, "singleton")

    jwt_secret     = existing.jwt_secret     if existing else secrets.token_hex(32)
    encryption_key = existing.encryption_key if existing else Fernet.generate_key().decode()

    if existing is None:
        cfg = AppConfig(
            id             = "singleton",
            client_id      = client_id,
            client_secret  = client_secret,
            redirect_uri   = redirect_uri,
            jwt_secret     = jwt_secret,
            encryption_key = encryption_key,
            cors_origin    = cors_origin,
        )
        db.add(cfg)
    else:
        existing.client_id     = client_id
        existing.client_secret = client_secret
        existing.redirect_uri  = redirect_uri
        existing.cors_origin   = cors_origin
        cfg = existing

    db.commit()
    db.refresh(cfg)
    return cfg
