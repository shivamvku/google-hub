"""
GCP Setup Automation — google-hub

Uses only google-api-python-client (already installed).
Automates everything that Google's API allows:
  1. ADC login (one browser consent)
  2. Create or reuse a GCP project
  3. Enable all 6 required APIs in one batch call
  4. Return the direct Credentials page URL for that project

What it CANNOT automate (Google blocks programmatic creation):
  - OAuth consent screen configuration
  - OAuth 2.0 client ID creation
  - Adding test users
  → User does those in one browser tab, downloads the JSON, drops it into the app.

Usage (standalone CLI):
    python -m backend.gcp_setup

Usage (called from FastAPI streaming endpoint):
    from .gcp_setup import run_setup
    for line in run_setup(project_id="my-project"):
        yield line
"""

import json
import os
import subprocess
import sys
import time
import webbrowser
from typing import Generator

from google.auth.exceptions import DefaultCredentialsError
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

from .logger import get_logger

log = get_logger(__name__)

# Scopes needed for project management (separate from the app's user scopes)
_MGMT_SCOPES = [
    "https://www.googleapis.com/auth/cloud-platform",
    "https://www.googleapis.com/auth/cloudplatformprojects",
]

# All APIs the app needs — passed as service names to Service Usage API
REQUIRED_SERVICES = [
    "drive.googleapis.com",
    "gmail.googleapis.com",
    "calendar-json.googleapis.com",
    "sheets.googleapis.com",
    "docs.googleapis.com",
    "youtube.googleapis.com",
]

_ADC_TOKEN_FILE = os.path.join(os.path.dirname(__file__), ".setup_adc.json")


# ── Helpers ────────────────────────────────────────────────────────────────────

def _emit(msg: str) -> str:
    """Return a Server-Sent Event line and also log it."""
    log.info("setup_step", extra={"step_msg": msg})
    return f"data: {msg}\n\n"


def _get_mgmt_creds(client_secrets_path: str | None = None) -> Credentials:
    """
    Get credentials for GCP management APIs.
    Tries cached ADC first, then browser OAuth flow as fallback.
    client_secrets_path: path to a downloaded client_secret JSON if available.
    """
    # Try cached token
    if os.path.exists(_ADC_TOKEN_FILE):
        try:
            creds = Credentials.from_authorized_user_file(_ADC_TOKEN_FILE, _MGMT_SCOPES)
            if creds.valid:
                return creds
            if creds.expired and creds.refresh_token:
                creds.refresh(Request())
                _save_creds(creds)
                return creds
        except Exception:
            pass  # stale — re-auth below

    if not client_secrets_path:
        raise RuntimeError("no_adc_cached")

    flow = InstalledAppFlow.from_client_secrets_file(client_secrets_path, _MGMT_SCOPES)
    creds = flow.run_local_server(port=0, open_browser=True)
    _save_creds(creds)
    return creds


def _save_creds(creds: Credentials) -> None:
    with open(_ADC_TOKEN_FILE, "w") as f:
        f.write(creds.to_json())


def _safe_project_id(name: str) -> str:
    """Turn a display name into a valid project ID (lowercase, hyphens, max 30 chars)."""
    pid = name.lower().replace(" ", "-").replace("_", "-")
    pid = "".join(c for c in pid if c.isalnum() or c == "-")
    return pid[:28]  # leave room for suffix


# ── Core automation ────────────────────────────────────────────────────────────

def run_setup(
    project_name: str = "google-hub",
    client_secrets_path: str | None = None,
) -> Generator[str, None, None]:
    """
    Generator that yields SSE lines describing each automation step.
    Designed to be consumed by a FastAPI StreamingResponse.

    Steps:
      1. Authenticate with Google Cloud management APIs
      2. Create (or reuse) a GCP project
      3. Enable all 6 required APIs
      4. Return the direct Credentials page URL
    """
    project_id = _safe_project_id(project_name)

    yield _emit(f"🚀 Starting Google Cloud setup for project: {project_id}")
    yield _emit("─" * 55)

    # ── Step 1: Auth ──────────────────────────────────────────────────────
    yield _emit("🔑 Step 1/3 — Authenticating with Google Cloud...")
    try:
        creds = _get_mgmt_creds(client_secrets_path)
        yield _emit("   ✅ Authenticated")
    except RuntimeError as e:
        if "no_adc_cached" in str(e):
            yield _emit("   ⚠️  No cached credentials. Open the URL below in your browser,")
            yield _emit("   sign in with your Google account, then re-run setup:")
            yield _emit(f"   NEEDS_AUTH")
            return
        yield _emit(f"   ❌ Auth failed: {e}")
        return
    except Exception as e:
        yield _emit(f"   ❌ Auth error: {e}")
        return

    # ── Step 2: Create / reuse project ────────────────────────────────────
    yield _emit(f"📁 Step 2/3 — Creating GCP project '{project_id}'...")
    try:
        rm = build("cloudresourcemanager", "v3", credentials=creds)

        # Check if it already exists
        existing = None
        try:
            existing = rm.projects().get(name=f"projects/{project_id}").execute()
        except HttpError as e:
            if e.resp.status != 404:
                raise

        if existing:
            state = existing.get("state", "")
            if state == "ACTIVE":
                yield _emit(f"   ℹ️  Project '{project_id}' already exists — reusing it")
            else:
                yield _emit(f"   ⚠️  Project exists but state is '{state}'")
        else:
            op = rm.projects().create(body={
                "projectId": project_id,
                "displayName": project_name,
            }).execute()

            # Wait for the long-running operation to complete
            yield _emit("   ⏳ Waiting for project creation...")
            ops = build("cloudresourcemanager", "v3", credentials=creds)
            for _ in range(30):
                op_result = ops.operations().get(name=op["name"]).execute()
                if op_result.get("done"):
                    if "error" in op_result:
                        err = op_result["error"].get("message", "unknown error")
                        yield _emit(f"   ❌ Project creation failed: {err}")
                        return
                    break
                time.sleep(2)
            else:
                yield _emit("   ❌ Project creation timed out")
                return

            yield _emit(f"   ✅ Project '{project_id}' created")

    except HttpError as e:
        yield _emit(f"   ❌ GCP error: {e.reason}")
        return
    except Exception as e:
        yield _emit(f"   ❌ Unexpected error: {e}")
        return

    # ── Step 3: Enable APIs ───────────────────────────────────────────────
    yield _emit("⚡ Step 3/3 — Enabling required APIs (batch)...")
    try:
        su = build("serviceusage", "v1", credentials=creds)
        parent = f"projects/{project_id}"

        # Batch enable all services in one API call
        op = su.services().batchEnable(
            parent=parent,
            body={"serviceIds": REQUIRED_SERVICES},
        ).execute()

        # Poll until done
        yield _emit("   ⏳ Waiting for APIs to activate...")
        for _ in range(40):
            op_status = su.operations().get(name=op["name"]).execute()
            if op_status.get("done"):
                if "error" in op_status:
                    err = op_status["error"].get("message", "unknown")
                    yield _emit(f"   ❌ API enable failed: {err}")
                    return
                break
            time.sleep(3)
        else:
            yield _emit("   ❌ API activation timed out — check Cloud Console")
            return

        for svc in REQUIRED_SERVICES:
            yield _emit(f"   ✅ {svc}")

    except HttpError as e:
        yield _emit(f"   ❌ Service Usage API error: {e.reason}")
        return
    except Exception as e:
        yield _emit(f"   ❌ Unexpected error: {e}")
        return

    # ── Done — emit the direct Credentials page URL ───────────────────────
    creds_url = (
        f"https://console.cloud.google.com/apis/credentials"
        f"?project={project_id}"
    )
    consent_url = (
        f"https://console.cloud.google.com/apis/credentials/consent"
        f"?project={project_id}"
    )

    yield _emit("─" * 55)
    yield _emit("✅ Automation complete! Two manual steps remain:")
    yield _emit("")
    yield _emit("📋 STEP A — Configure OAuth Consent Screen (one time):")
    yield _emit(f"   CONSENT_URL:{consent_url}")
    yield _emit("")
    yield _emit("📋 STEP B — Create OAuth Client ID + Download JSON:")
    yield _emit(f"   CREDENTIALS_URL:{creds_url}")
    yield _emit("")
    yield _emit('   In Credentials: Create → OAuth client ID → Web application')
    yield _emit(f'   Redirect URI: http://localhost:8001/auth/callback')
    yield _emit("   Then click ⬇ Download JSON and drop it into the app below.")
    yield _emit("DONE")


# ── CLI entry point ────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Google Hub — GCP setup automation")
    parser.add_argument("--project", default="google-hub", help="GCP project display name")
    parser.add_argument("--secrets", default=None, help="Path to client_secrets.json for auth")
    args = parser.parse_args()

    for line in run_setup(project_name=args.project, client_secrets_path=args.secrets):
        # Strip SSE prefix for CLI output
        if line.startswith("data: "):
            print(line[6:].rstrip())
