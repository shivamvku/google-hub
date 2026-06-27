"""
/preflight — concurrently probes every Google API for the current user.

All 6 service checks run in parallel via ThreadPoolExecutor so the endpoint
completes in ~1 network RTT instead of 6x sequential.
"""
import concurrent.futures
from typing import Any

from fastapi import APIRouter, Depends
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

from ..auth import get_current_user
from ..logger import get_logger

router = APIRouter(prefix="/preflight", tags=["Preflight"])
log    = get_logger(__name__)


def _check(label: str, fn) -> dict[str, Any]:
    """Run fn(), return {ok, error}. Catches all exceptions."""
    try:
        fn()
        log.debug("preflight_ok", extra={"service": label})
        return {"ok": True, "error": None}
    except HttpError as exc:
        msg = f"HTTP {exc.resp.status}: {exc.reason}"
        log.warning("preflight_fail", extra={"service": label, "error": msg})
        return {"ok": False, "error": msg}
    except Exception as exc:
        msg = str(exc)
        log.warning("preflight_fail", extra={"service": label, "error": msg})
        return {"ok": False, "error": msg}


# Map of service name → probe function factory (takes creds, returns callable)
def _probes(creds) -> dict[str, Any]:
    return {
        "drive": lambda: (
            build("drive", "v3", credentials=creds)
            .files().list(q="'root' in parents", pageSize=1, fields="files(id)").execute()
        ),
        "gmail": lambda: (
            build("gmail", "v1", credentials=creds)
            .users().labels().list(userId="me").execute()
        ),
        "calendar": lambda: (
            build("calendar", "v3", credentials=creds)
            .calendarList().list(maxResults=1).execute()
        ),
        "sheets": lambda: (
            build("drive", "v3", credentials=creds)
            .files().list(
                q="mimeType='application/vnd.google-apps.spreadsheet'",
                pageSize=1, fields="files(id)",
            ).execute()
        ),
        "docs": lambda: (
            build("drive", "v3", credentials=creds)
            .files().list(
                q="mimeType='application/vnd.google-apps.document'",
                pageSize=1, fields="files(id)",
            ).execute()
        ),
        "youtube": lambda: (
            build("youtube", "v3", credentials=creds)
            .channels().list(part="id", mine=True, maxResults=1).execute()
        ),
    }


@router.get("")
def preflight(current=Depends(get_current_user)):
    """
    Concurrently probe all 6 Google APIs.
    Returns per-service {ok, error} map + an all_ok summary flag.
    """
    user, creds = current
    probes = _probes(creds)

    log.info("preflight_start", extra={"email": user.email})

    # Run all probes in parallel — each is a blocking network call
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        futures = {
            name: pool.submit(_check, name, fn)
            for name, fn in probes.items()
        }
        results = {name: fut.result() for name, fut in futures.items()}

    all_ok  = all(v["ok"] for v in results.values())
    failing = [k for k, v in results.items() if not v["ok"]]

    log.info(
        "preflight_done",
        extra={"email": user.email, "all_ok": all_ok, "failing": failing},
    )

    return {"all_ok": all_ok, "services": results}
