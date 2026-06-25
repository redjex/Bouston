import re

from fastapi import APIRouter, Cookie, Request
from fastapi.responses import FileResponse, RedirectResponse

from config import BASE_DIR

router = APIRouter()

WEB_DIR     = BASE_DIR / "web"
APP_IMG_DIR = BASE_DIR / "web" / "app" / "img" / "icons"
EMOJI_DIR   = BASE_DIR / "img" / "emoji"


@router.get("/")
async def root():
    return RedirectResponse(url="/app", status_code=302)


@router.get("/app")
async def app_page(bouston_token: str | None = Cookie(default=None)):
    if bouston_token:
        return FileResponse(str(WEB_DIR / "app" / "app.html"))
    return FileResponse(str(WEB_DIR / "app" / "index.html"))


@router.get("/feed")
async def feed_page(bouston_token: str | None = Cookie(default=None)):
    return await app_page(bouston_token)


@router.get("/profile")
async def profile_page(bouston_token: str | None = Cookie(default=None)):
    return await app_page(bouston_token)


@router.get("/settings")
async def settings_page(bouston_token: str | None = Cookie(default=None)):
    return await app_page(bouston_token)


@router.get("/u/{username}")
async def user_profile_page(username: str, bouston_token: str | None = Cookie(default=None)):
    return await app_page(bouston_token)


@router.get("/post/{post_id}", response_class=FileResponse)
async def post_page(post_id: int):
    return FileResponse(str(WEB_DIR / "post" / "post.html"))


@router.get("/emoji")
async def list_emoji():
    if not EMOJI_DIR.exists():
        return []
    result = []
    for f in sorted(EMOJI_DIR.iterdir()):
        if f.suffix == ".tgs":
            emoji_char = re.sub(r"^\d+_", "", f.stem)
            result.append({"file": f.name, "emoji": emoji_char})
    return result


@router.get("/api/emoji")
async def list_emoji_web():
    if not EMOJI_DIR.exists():
        return {}
    result = {}
    for f in sorted(EMOJI_DIR.iterdir()):
        if f.suffix == ".tgs":
            emoji_char = re.sub(r"^\d+_", "", f.stem)
            result[emoji_char] = f"/emoji/{f.name}"
    return result
