from typing import Any, Optional

from fastapi import APIRouter, Depends
from googleapiclient.discovery import build
from pydantic import BaseModel

from ..auth import get_current_user

router = APIRouter(prefix="/sheets", tags=["Sheets"])


def _creds(current=Depends(get_current_user)):
    _, creds = current
    return creds


def _svc(current=Depends(get_current_user)):
    _, creds = current
    return build("sheets", "v4", credentials=creds)


class CreateSheet(BaseModel):
    title: str


class WriteRange(BaseModel):
    range: str           # e.g. "Sheet1!A1:C3"
    values: list[list[Any]]


@router.get("/list")
def list_sheets(creds=Depends(_creds)):
    """List all spreadsheets in Drive."""
    drive = build("drive", "v3", credentials=creds)
    res = drive.files().list(
        q="mimeType='application/vnd.google-apps.spreadsheet' and trashed=false",
        fields="files(id,name,modifiedTime)",
        orderBy="modifiedTime desc",
        pageSize=30,
    ).execute()
    return res.get("files", [])


@router.post("/create")
def create_sheet(req: CreateSheet, svc=Depends(_svc)):
    spreadsheet = svc.spreadsheets().create(
        body={"properties": {"title": req.title}}
    ).execute()
    return {"id": spreadsheet["spreadsheetId"], "title": req.title}


@router.get("/{sheet_id}/values")
def read_sheet(sheet_id: str, range: str = "Sheet1", svc=Depends(_svc)):
    """Read values from a range."""
    res = svc.spreadsheets().values().get(
        spreadsheetId=sheet_id, range=range
    ).execute()
    return {"range": res.get("range"), "values": res.get("values", [])}


@router.post("/{sheet_id}/values")
def write_sheet(sheet_id: str, req: WriteRange, svc=Depends(_svc)):
    """Write values to a range."""
    res = svc.spreadsheets().values().update(
        spreadsheetId=sheet_id,
        range=req.range,
        valueInputOption="USER_ENTERED",
        body={"values": req.values},
    ).execute()
    return {"updated_cells": res.get("updatedCells")}


@router.post("/{sheet_id}/append")
def append_sheet(sheet_id: str, req: WriteRange, svc=Depends(_svc)):
    """Append rows to a sheet."""
    res = svc.spreadsheets().values().append(
        spreadsheetId=sheet_id,
        range=req.range,
        valueInputOption="USER_ENTERED",
        insertDataOption="INSERT_ROWS",
        body={"values": req.values},
    ).execute()
    return {"updates": res.get("updates")}


@router.get("/{sheet_id}/meta")
def sheet_meta(sheet_id: str, svc=Depends(_svc)):
    """Get spreadsheet metadata (title, sheet names)."""
    res = svc.spreadsheets().get(spreadsheetId=sheet_id).execute()
    return {
        "title": res["properties"]["title"],
        "sheets": [s["properties"]["title"] for s in res.get("sheets", [])],
    }
