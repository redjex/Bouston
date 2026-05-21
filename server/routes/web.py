import re

from fastapi import APIRouter
from fastapi.responses import FileResponse

from config import BASE_DIR

router = APIRouter()

WEB_DIR     = BASE_DIR / "web"
APP_IMG_DIR = BASE_DIR / "img"


@router.get("/post/{post_id}", response_class=FileResponse)
async def post_page(post_id: int):
    return FileResponse(str(WEB_DIR / "post.html"))


@router.get("/api/emoji")
async def list_emoji_web():
    emoji_dir = APP_IMG_DIR / "emoji"
    if not emoji_dir.exists():
        return {}
    result = {}
    for f in sorted(emoji_dir.iterdir()):
        if f.suffix == ".tgs":
            emoji_char = re.sub(r"^\d+_", "", f.stem)
            result[emoji_char] = f"/appimg/emoji/{f.name}"
    return result
