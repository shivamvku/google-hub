"""
/setup — first-run configuration wizard.

GET   /setup/status          → is the app configured?
POST  /setup/save            → save credentials (manual entry or JSON upload)
PUT   /setup/save            → update credentials
PATCH /setup/urls            → update redirect_uri + cors_origin only (no secrets needed)
POST  /setup/parse-json      → parse a downloaded client_secrets JSON file
GET   /setup/automate        → SSE stream: create GCP project + enable APIs
POST  /setup/automate/auth   → upload a management credentials JSON to unlock automation
"""
import json
import tempfile
import os

from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, field_validator
from sqlalchemy.orm import Session

from ..db import get_db, get_config, save_config
from ..gcp_setup import run_setup, _ADC_TOKEN_FILE, _save_creds
from ..logger import get_logger

log    = get_logger(__name__)
router = APIRouter(prefix="/setup", tags=["Setup"])


# ── Models ─────────────────────────────────────────────────────────────────────

class SetupPayload(BaseModel):
    client_id:     str
    client_secret: str
    redirect_uri:  str = "http://localhost:8001/auth/callback"
    cors_origin:   str = "http://localhost:5174"

    @field_validator("client_id")
    @classmethod
    def _cid(cls, v: str) -> str:
        v = v.strip()
        if not v or "placeholder" in v.lower() or v == "your_client_id_here":
            raise ValueError("Client ID cannot be empty")
        return v

    @field_validator("client_secret")
    @classmethod
    def _csecret(cls, v: str) -> str:
        v = v.strip()
        if not v or "placeholder" in v.lower() or v == "your_client_secret_here":
            raise ValueError("Client Secret cannot be empty")
        return v


class AutomateRequest(BaseModel):
    project_name: str = "google-hub"


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.get("/status")
def setup_status(db: Session = Depends(get_db)):
    """Returns whether the app has been configured."""
    cfg = get_config(db)
    if cfg is None:
        return {
            "configured":      False,
            "automation_ready": os.path.exists(_ADC_TOKEN_FILE),
        }
    return {
        "configured":       True,
        "redirect_uri":     cfg.redirect_uri,
        "cors_origin":      cfg.cors_origin,
        "automation_ready": os.path.exists(_ADC_TOKEN_FILE),
    }


@router.post("/save")
@router.put("/save")
def setup_save(payload: SetupPayload, db: Session = Depends(get_db)):
    """Save credentials manually (typed or pasted)."""
    try:
        cfg = save_config(
            db,
            client_id     = payload.client_id,
            client_secret = payload.client_secret,
            redirect_uri  = payload.redirect_uri,
            cors_origin   = payload.cors_origin,
        )
    except Exception as e:
        log.error("setup_save_failed", extra={"error": str(e)})
        raise HTTPException(500, f"Failed to save config: {e}")

    log.info("app_configured", extra={"redirect_uri": cfg.redirect_uri})
    return {"status": "saved", "redirect_uri": cfg.redirect_uri}


class UrlsPayload(BaseModel):
    redirect_uri: str
    cors_origin:  str


@router.patch("/urls")
def update_urls(payload: UrlsPayload, db: Session = Depends(get_db)):
    """
    Update redirect_uri and cors_origin without touching credentials.
    Useful after deploying to a new domain.
    """
    cfg = get_config(db)
    if cfg is None:
        raise HTTPException(404, "App not configured yet — run setup first")
    cfg.redirect_uri = payload.redirect_uri.strip()
    cfg.cors_origin  = payload.cors_origin.strip()
    db.commit()
    log.info("urls_updated", extra={"redirect_uri": cfg.redirect_uri, "cors_origin": cfg.cors_origin})
    return {"status": "updated", "redirect_uri": cfg.redirect_uri, "cors_origin": cfg.cors_origin}


@router.post("/parse-json")
async def parse_client_secrets(
    request:  Request,
    file:     UploadFile = File(...),
    db:       Session    = Depends(get_db),
):
    """
    Parse a downloaded client_secret_*.json file from Google Cloud Console.
    Auto-detects the redirect URI from the incoming request origin.
    """
    try:
        raw  = await file.read()
        data = json.loads(raw)
    except Exception:
        raise HTTPException(400, "Invalid JSON file")

    inner = data.get("web") or data.get("installed")
    if not inner:
        raise HTTPException(
            400,
            'Invalid client secrets file. Expected a JSON with a "web" or "installed" key. '
            'Download it from Google Cloud Console → Credentials → ⬇ Download JSON.',
        )

    client_id     = inner.get("client_id", "").strip()
    client_secret = inner.get("client_secret", "").strip()

    if not client_id or not client_secret:
        raise HTTPException(400, "client_id or client_secret missing from JSON")

    # Auto-detect the correct redirect URI from the request origin
    origin       = request.headers.get("origin", "").rstrip("/")
    our_uri      = f"{origin}/auth/callback" if origin else "http://localhost:8001/auth/callback"
    cors_origin  = origin or "http://localhost:5174"

    redirect_uris = inner.get("redirect_uris", [])
    mismatch_warning = None
    if redirect_uris and our_uri not in redirect_uris:
        log.warning("redirect_uri_mismatch", extra={"found": redirect_uris, "expected": our_uri})
        mismatch_warning = (
            f"The redirect URI '{our_uri}' was not found in the downloaded file "
            f"({redirect_uris}). Add it in Google Cloud Console → Credentials → Edit client."
        )

    try:
        cfg = save_config(
            db,
            client_id     = client_id,
            client_secret = client_secret,
            redirect_uri  = our_uri,
            cors_origin   = cors_origin,
        )
    except Exception as e:
        log.error("setup_parse_json_save_failed", extra={"error": str(e)})
        raise HTTPException(500, f"Failed to save: {e}")

    log.info("app_configured_via_json", extra={"client_id": client_id[:12] + "...", "redirect_uri": our_uri})
    return {
        "status":       "saved",
        "client_id":    client_id,
        "redirect_uri": cfg.redirect_uri,
        "warning":      mismatch_warning,
    }


@router.get("/automate")
def automate_stream(project_name: str = "google-hub"):
    """
    SSE stream: creates GCP project and enables all APIs automatically.
    Yields one 'data:' line per step so the frontend can show a live log.
    """
    log.info("automation_started", extra={"project_name": project_name})

    def event_stream():
        adc = _ADC_TOKEN_FILE if os.path.exists(_ADC_TOKEN_FILE) else None
        yield from run_setup(
            project_name        = project_name,
            client_secrets_path = adc,
        )

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control":   "no-cache",
            "X-Accel-Buffering": "no",   # disable nginx buffering
        },
    )


@router.post("/automate/upload-auth")
async def upload_auth_json(file: UploadFile = File(...)):
    """
    Upload a client_secret JSON that will be used for management API auth
    (project creation, API enabling). This is separate from the app's OAuth
    client — it just authenticates the setup script.
    After this call the browser-based consent is triggered automatically.
    """
    try:
        raw  = await file.read()
        data = json.loads(raw)
    except Exception:
        raise HTTPException(400, "Invalid JSON file")

    inner = data.get("web") or data.get("installed")
    if not inner:
        raise HTTPException(400, "Not a valid client secrets file")

    # Save it to a temp file for the setup script to use
    tmp = tempfile.NamedTemporaryFile(
        mode="w", suffix=".json", delete=False,
        dir=os.path.dirname(_ADC_TOKEN_FILE),
    )
    json.dump(data, tmp)
    tmp.flush()
    tmp.close()

    log.info("auth_json_uploaded", extra={"path": tmp.name})
    return {"status": "uploaded", "path": tmp.name, "next": "GET /setup/automate"}
