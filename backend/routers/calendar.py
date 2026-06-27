from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends
from googleapiclient.discovery import build
from pydantic import BaseModel

from ..auth import get_current_user

router = APIRouter(prefix="/calendar", tags=["Calendar"])


def _svc(current=Depends(get_current_user)):
    _, creds = current
    return build("calendar", "v3", credentials=creds)


class EventCreate(BaseModel):
    title: str
    start: str           # ISO datetime e.g. "2024-12-25T10:00:00"
    end: str
    description: Optional[str] = ""
    location: Optional[str] = ""
    attendees: Optional[list[str]] = []
    timezone: Optional[str] = "Asia/Kolkata"


@router.get("/events")
def list_events(days: int = 30, calendar_id: str = "primary", svc=Depends(_svc)):
    """List upcoming events."""
    now = datetime.now(timezone.utc).isoformat()
    res = svc.events().list(
        calendarId=calendar_id,
        timeMin=now,
        maxResults=50,
        singleEvents=True,
        orderBy="startTime",
    ).execute()
    events = []
    for e in res.get("items", []):
        events.append({
            "id": e["id"],
            "title": e.get("summary", "(no title)"),
            "start": e["start"].get("dateTime", e["start"].get("date")),
            "end": e["end"].get("dateTime", e["end"].get("date")),
            "description": e.get("description", ""),
            "location": e.get("location", ""),
            "link": e.get("htmlLink", ""),
        })
    return events


@router.post("/events")
def create_event(req: EventCreate, calendar_id: str = "primary", svc=Depends(_svc)):
    """Create a calendar event."""
    body = {
        "summary": req.title,
        "description": req.description,
        "location": req.location,
        "start": {"dateTime": req.start, "timeZone": req.timezone},
        "end":   {"dateTime": req.end,   "timeZone": req.timezone},
        "attendees": [{"email": a} for a in req.attendees],
    }
    event = svc.events().insert(calendarId=calendar_id, body=body).execute()
    return {"id": event["id"], "link": event.get("htmlLink")}


@router.delete("/events/{event_id}")
def delete_event(event_id: str, calendar_id: str = "primary", svc=Depends(_svc)):
    svc.events().delete(calendarId=calendar_id, eventId=event_id).execute()
    return {"deleted": event_id}


@router.get("/calendars")
def list_calendars(svc=Depends(_svc)):
    res = svc.calendarList().list().execute()
    return [
        {"id": c["id"], "name": c.get("summary"), "primary": c.get("primary", False)}
        for c in res.get("items", [])
    ]
