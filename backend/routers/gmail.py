import base64
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

from fastapi import APIRouter, Depends
from googleapiclient.discovery import build
from pydantic import BaseModel

from ..auth import get_current_user

router = APIRouter(prefix="/gmail", tags=["Gmail"])


def _svc(current=Depends(get_current_user)):
    _, creds = current
    return build("gmail", "v1", credentials=creds)


class SendRequest(BaseModel):
    to: str
    subject: str
    body: str
    html: bool = False


@router.get("/inbox")
def list_inbox(max_results: int = 20, q: str = "in:inbox", svc=Depends(_svc)):
    """List inbox messages with snippet."""
    res = svc.users().messages().list(
        userId="me", q=q, maxResults=max_results
    ).execute()
    messages = res.get("messages", [])
    result = []
    for m in messages:
        detail = svc.users().messages().get(
            userId="me", id=m["id"],
            format="metadata",
            metadataHeaders=["From", "Subject", "Date"],
        ).execute()
        headers = {h["name"]: h["value"] for h in detail.get("payload", {}).get("headers", [])}
        result.append({
            "id": m["id"],
            "from": headers.get("From", ""),
            "subject": headers.get("Subject", ""),
            "date": headers.get("Date", ""),
            "snippet": detail.get("snippet", ""),
            "labelIds": detail.get("labelIds", []),
        })
    return result


@router.get("/messages/{msg_id}")
def get_message(msg_id: str, svc=Depends(_svc)):
    """Get full message body."""
    detail = svc.users().messages().get(userId="me", id=msg_id, format="full").execute()
    headers = {h["name"]: h["value"] for h in detail.get("payload", {}).get("headers", [])}

    def _decode_body(payload):
        if "body" in payload and payload["body"].get("data"):
            return base64.urlsafe_b64decode(payload["body"]["data"]).decode("utf-8", errors="replace")
        for part in payload.get("parts", []):
            result = _decode_body(part)
            if result:
                return result
        return ""

    return {
        "id": msg_id,
        "from": headers.get("From", ""),
        "to": headers.get("To", ""),
        "subject": headers.get("Subject", ""),
        "date": headers.get("Date", ""),
        "body": _decode_body(detail.get("payload", {})),
        "labelIds": detail.get("labelIds", []),
    }


@router.post("/send")
def send_email(req: SendRequest, svc=Depends(_svc)):
    """Send an email."""
    if req.html:
        msg = MIMEMultipart("alternative")
        msg.attach(MIMEText(req.body, "html"))
    else:
        msg = MIMEText(req.body, "plain")
    msg["To"] = req.to
    msg["Subject"] = req.subject
    raw = base64.urlsafe_b64encode(msg.as_bytes()).decode()
    result = svc.users().messages().send(userId="me", body={"raw": raw}).execute()
    return {"id": result["id"], "status": "sent"}


@router.delete("/messages/{msg_id}")
def trash_message(msg_id: str, svc=Depends(_svc)):
    svc.users().messages().trash(userId="me", id=msg_id).execute()
    return {"trashed": msg_id}


@router.get("/labels")
def list_labels(svc=Depends(_svc)):
    res = svc.users().labels().list(userId="me").execute()
    return res.get("labels", [])
