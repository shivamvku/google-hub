from fastapi import APIRouter, Depends, HTTPException
from googleapiclient.discovery import build

from ..auth import get_current_user

router = APIRouter(prefix="/youtube", tags=["YouTube"])


def _svc(current=Depends(get_current_user)):
    _, creds = current
    return build("youtube", "v3", credentials=creds)


@router.get("/search")
def search_videos(q: str, max_results: int = 10, svc=Depends(_svc)):
    """Search YouTube videos."""
    res = svc.search().list(
        q=q, part="snippet", type="video", maxResults=max_results
    ).execute()
    return [
        {
            "videoId": i["id"]["videoId"],
            "title": i["snippet"]["title"],
            "channel": i["snippet"]["channelTitle"],
            "published": i["snippet"]["publishedAt"],
            "thumbnail": i["snippet"]["thumbnails"]["medium"]["url"],
            "description": i["snippet"]["description"][:200],
            "url": f"https://www.youtube.com/watch?v={i['id']['videoId']}",
        }
        for i in res.get("items", [])
    ]


@router.get("/channel")
def my_channel(svc=Depends(_svc)):
    """Get authenticated user's channel info."""
    res = svc.channels().list(part="snippet,statistics", mine=True).execute()
    items = res.get("items", [])
    if not items:
        return {"error": "No channel found"}
    ch = items[0]
    return {
        "id": ch["id"],
        "title": ch["snippet"]["title"],
        "description": ch["snippet"]["description"],
        "subscribers": ch["statistics"].get("subscriberCount", "0"),
        "views": ch["statistics"].get("viewCount", "0"),
        "videos": ch["statistics"].get("videoCount", "0"),
        "thumbnail": ch["snippet"]["thumbnails"]["default"]["url"],
    }


@router.get("/my-videos")
def my_videos(max_results: int = 20, svc=Depends(_svc)):
    """List videos uploaded by the authenticated user."""
    ch = svc.channels().list(part="contentDetails", mine=True).execute()
    if not ch.get("items"):
        return []
    uploads_id = ch["items"][0]["contentDetails"]["relatedPlaylists"]["uploads"]
    res = svc.playlistItems().list(
        part="snippet", playlistId=uploads_id, maxResults=max_results
    ).execute()
    return [
        {
            "videoId": i["snippet"]["resourceId"]["videoId"],
            "title": i["snippet"]["title"],
            "published": i["snippet"]["publishedAt"],
            "thumbnail": i["snippet"]["thumbnails"].get("medium", {}).get("url", ""),
            "url": f"https://www.youtube.com/watch?v={i['snippet']['resourceId']['videoId']}",
        }
        for i in res.get("items", [])
    ]


@router.get("/video/{video_id}/stats")
def video_stats(video_id: str, svc=Depends(_svc)):
    """Get stats for a specific video."""
    res = svc.videos().list(part="snippet,statistics", id=video_id).execute()
    if not res.get("items"):
        raise HTTPException(404, "Video not found")
    v = res["items"][0]
    return {
        "id": video_id,
        "title": v["snippet"]["title"],
        "views": v["statistics"].get("viewCount", "0"),
        "likes": v["statistics"].get("likeCount", "0"),
        "comments": v["statistics"].get("commentCount", "0"),
        "published": v["snippet"]["publishedAt"],
    }
