from typing import Optional

from fastapi import APIRouter, Depends
from googleapiclient.discovery import build
from pydantic import BaseModel

from ..auth import get_current_user

router = APIRouter(prefix="/docs", tags=["Docs"])


def _creds(current=Depends(get_current_user)):
    _, creds = current
    return creds


def _svc(current=Depends(get_current_user)):
    _, creds = current
    return build("docs", "v1", credentials=creds)


class CreateDoc(BaseModel):
    title: str
    content: Optional[str] = ""


class InsertText(BaseModel):
    text: str
    index: int = 1   # 1 = start of document


@router.get("/list")
def list_docs(creds=Depends(_creds)):
    """List all Google Docs in Drive."""
    drive = build("drive", "v3", credentials=creds)
    res = drive.files().list(
        q="mimeType='application/vnd.google-apps.document' and trashed=false",
        fields="files(id,name,modifiedTime,webViewLink)",
        orderBy="modifiedTime desc",
        pageSize=30,
    ).execute()
    return res.get("files", [])


@router.post("/create")
def create_doc(req: CreateDoc, svc=Depends(_svc)):
    """Create a new Google Doc with optional initial content."""
    doc = svc.documents().create(body={"title": req.title}).execute()
    doc_id = doc["documentId"]
    if req.content:
        svc.documents().batchUpdate(
            documentId=doc_id,
            body={"requests": [{"insertText": {"location": {"index": 1}, "text": req.content}}]},
        ).execute()
    return {
        "id": doc_id,
        "title": req.title,
        "link": f"https://docs.google.com/document/d/{doc_id}/edit",
    }


@router.get("/{doc_id}")
def get_doc(doc_id: str, svc=Depends(_svc)):
    """Get document content as plain text."""
    doc = svc.documents().get(documentId=doc_id).execute()
    text = ""
    for el in doc.get("body", {}).get("content", []):
        for para_el in el.get("paragraph", {}).get("elements", []):
            text += para_el.get("textRun", {}).get("content", "")
    return {
        "id": doc_id,
        "title": doc.get("title"),
        "text": text,
        "link": f"https://docs.google.com/document/d/{doc_id}/edit",
    }


@router.post("/{doc_id}/insert")
def insert_text(doc_id: str, req: InsertText, svc=Depends(_svc)):
    """Insert text at a given index."""
    svc.documents().batchUpdate(
        documentId=doc_id,
        body={"requests": [{"insertText": {"location": {"index": req.index}, "text": req.text}}]},
    ).execute()
    return {"status": "inserted", "index": req.index}
