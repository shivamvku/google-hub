from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseUpload
import io

from ..auth import get_current_user

router = APIRouter(prefix="/drive", tags=["Drive"])


def _svc(current=Depends(get_current_user)):
    _, creds = current
    return build("drive", "v3", credentials=creds)


@router.get("/files")
def list_files(folder_id: str = "root", svc=Depends(_svc)):
    """List files in a folder (default: root)."""
    q = f"'{folder_id}' in parents and trashed=false"
    res = svc.files().list(
        q=q,
        fields="files(id,name,mimeType,size,modifiedTime,webViewLink,iconLink)",
        orderBy="folder,name",
        pageSize=100,
    ).execute()
    return res.get("files", [])


@router.get("/search")
def search_files(q: str, svc=Depends(_svc)):
    """Full-text search across Drive."""
    res = svc.files().list(
        q=f"fullText contains '{q}' and trashed=false",
        fields="files(id,name,mimeType,size,modifiedTime,webViewLink)",
        pageSize=20,
    ).execute()
    return res.get("files", [])


@router.post("/folder")
def create_folder(name: str = Form(...), parent_id: str = Form("root"), svc=Depends(_svc)):
    """Create a new folder."""
    meta = {
        "name": name,
        "mimeType": "application/vnd.google-apps.folder",
        "parents": [parent_id],
    }
    f = svc.files().create(body=meta, fields="id,name").execute()
    return f


@router.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    folder_id: str = Form("root"),
    svc=Depends(_svc),
):
    """Upload a file to Drive."""
    content = await file.read()
    media = MediaIoBaseUpload(
        io.BytesIO(content),
        mimetype=file.content_type or "application/octet-stream",
    )
    meta = {"name": file.filename, "parents": [folder_id]}
    f = svc.files().create(body=meta, media_body=media, fields="id,name,webViewLink").execute()
    return f


@router.delete("/files/{file_id}")
def delete_file(file_id: str, svc=Depends(_svc)):
    svc.files().delete(fileId=file_id).execute()
    return {"deleted": file_id}


@router.post("/files/{file_id}/share")
def share_file(file_id: str, svc=Depends(_svc)):
    """Make file publicly viewable and return shareable link."""
    svc.permissions().create(
        fileId=file_id,
        body={"type": "anyone", "role": "reader"},
    ).execute()
    f = svc.files().get(fileId=file_id, fields="webViewLink").execute()
    return {"link": f.get("webViewLink")}


@router.get("/storage")
def storage_quota(svc=Depends(_svc)):
    """Return Drive storage usage."""
    about = svc.about().get(fields="storageQuota").execute()
    return about.get("storageQuota", {})
