import asyncio
import base64
import io
import json
import shutil
import subprocess
import time
import uuid
from pathlib import Path

import aiosqlite
import jwt
from fastapi import APIRouter, Depends, HTTPException, Request

from auth import check_post_rate, normalize, require_auth
from config import DB_PATH, JWT_ALGO, JWT_SECRET, MAX_IMAGES, MAX_LIMIT, MAX_POST_TEXT, POSTS_IMG_DIR
from database import (
    POSTS_QUERY, build_post_response, db_get_user, db_touch_auth_session,
    fetch_post_extras,
)
from models import CreatePostRequest, EditPostRequest, ReactRequest
from sse import broadcast_event

router = APIRouter()

try:
    from PIL import Image, ImageOps
except Exception:
    Image = None
    ImageOps = None


IMAGE_EXTS = {"jpg", "jpeg", "png", "webp"}
VIDEO_EXTS = {"mp4", "webm", "mov"}
PREVIEW_DIR = POSTS_IMG_DIR / "previews"
PREVIEW_DIR.mkdir(parents=True, exist_ok=True)


def _media_ext_from_header(header: str) -> str:
    if "gif" in header: return "gif"
    if "png" in header: return "png"
    if "webp" in header: return "webp"
    if "mp4" in header: return "mp4"
    if "webm" in header: return "webm"
    if "quicktime" in header or "mov" in header: return "mov"
    return "jpg"


def _save_image_preview(raw: bytes, stem: str, ext: str) -> str | None:
    if Image is None or ImageOps is None or ext.lower() not in IMAGE_EXTS:
        return None
    try:
        with Image.open(io.BytesIO(raw)) as img:
            img = ImageOps.exif_transpose(img).convert("RGB")
            img = ImageOps.fit(img, (320, 320), Image.Resampling.LANCZOS, centering=(0.5, 0.5))
            preview_name = f"{stem}.preview.jpg"
            img.save(PREVIEW_DIR / preview_name, "JPEG", quality=72, optimize=True, progressive=True)
            return f"previews/{preview_name}"
    except Exception:
        return None


def _save_video_preview(video_path: Path, stem: str) -> str | None:
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        return None
    preview_name = f"{stem}.preview.jpg"
    preview_path = PREVIEW_DIR / preview_name
    try:
        subprocess.run(
            [
                ffmpeg, "-y",
                "-ss", "00:00:00.250",
                "-i", str(video_path),
                "-frames:v", "1",
                "-vf", "scale=320:320:force_original_aspect_ratio=increase,crop=320:320",
                "-q:v", "8",
                str(preview_path),
            ],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=8,
            check=True,
        )
        return f"previews/{preview_name}" if preview_path.exists() else None
    except Exception:
        return None


@router.get("/posts")
async def get_posts(
    author: str = "",
    page: int = 1,
    limit: int = 20,
    request: Request = None,
):
    viewer = ""
    auth_header = request.headers.get("Authorization", "") if request else ""
    if auth_header.startswith("Bearer "):
        try:
            payload = jwt.decode(auth_header[7:], JWT_SECRET, algorithms=[JWT_ALGO])
            candidate = payload.get("sub", "")
            session_id = payload.get("jti", "")
            if candidate and session_id and await db_touch_auth_session(session_id, candidate):
                viewer = candidate
        except jwt.PyJWTError:
            pass

    page   = max(1, page)
    limit  = max(1, min(limit, MAX_LIMIT))
    offset = (page - 1) * limit

    async with aiosqlite.connect(DB_PATH) as conn:
        conn.row_factory = aiosqlite.Row
        if author:
            cursor = await conn.execute(
                POSTS_QUERY + "WHERE LOWER(p.tg_username) = ? OR LOWER(u.profile_username) = ? ORDER BY p.pinned DESC, p.pinned_at DESC, p.created_at DESC LIMIT ? OFFSET ?",
                (normalize(author), normalize(author), limit, offset),
            )
        else:
            cursor = await conn.execute(
                POSTS_QUERY + "ORDER BY p.created_at DESC LIMIT ? OFFSET ?",
                (limit, offset),
            )
        rows = await cursor.fetchall()
        result = []
        for r in rows:
            reactions, my_reactions, comment_count = await fetch_post_extras(conn, r["id"], viewer)
            result.append(build_post_response(r, viewer, reactions, my_reactions, comment_count))
        return result


@router.get("/posts/{post_id}")
async def get_post(post_id: int, request: Request = None):
    viewer = ""
    auth_header = request.headers.get("Authorization", "") if request else ""
    if auth_header.startswith("Bearer "):
        try:
            payload = jwt.decode(auth_header[7:], JWT_SECRET, algorithms=[JWT_ALGO])
            candidate = payload.get("sub", "")
            session_id = payload.get("jti", "")
            if candidate and session_id and await db_touch_auth_session(session_id, candidate):
                viewer = candidate
        except jwt.PyJWTError:
            pass

    async with aiosqlite.connect(DB_PATH) as conn:
        conn.row_factory = aiosqlite.Row
        cursor = await conn.execute(POSTS_QUERY + "WHERE p.id = ?", (post_id,))
        row = await cursor.fetchone()
        if not row:
            raise HTTPException(404, "Пост не найден")
        reactions, my_reactions, comment_count = await fetch_post_extras(conn, row["id"], viewer)
        return build_post_response(row, viewer, reactions, my_reactions, comment_count)


@router.post("/posts")
async def create_post(body: CreatePostRequest, username: str = Depends(require_auth)):
    check_post_rate(username)
    if len(body.text) > MAX_POST_TEXT:
        raise HTTPException(400, f"Текст не может быть длиннее {MAX_POST_TEXT} символов")
    if len(body.images) > MAX_IMAGES:
        raise HTTPException(400, f"Максимум {MAX_IMAGES} изображений на пост")

    user = await db_get_user(username)
    if not user:
        raise HTTPException(404, "Пользователь не найден")

    reply_to_id = body.replyToPostId
    if reply_to_id is not None:
        async with aiosqlite.connect(DB_PATH) as conn:
            cursor = await conn.execute("SELECT id FROM posts WHERE id = ?", (reply_to_id,))
            if not await cursor.fetchone():
                raise HTTPException(404, "Пост для ответа не найден")

    saved = []
    for raw in body.images:
        try:
            if "," in raw:
                header, data = raw.split(",", 1)
                ext = _media_ext_from_header(header)
            else:
                data, ext = raw, "jpg"
            stem = uuid.uuid4().hex
            filename = f"{stem}.{ext}"
            media_bytes = base64.b64decode(data)
            media_path = POSTS_IMG_DIR / filename
            media_path.write_bytes(media_bytes)
            media_type = "video" if ext.lower() in VIDEO_EXTS else "image"
            preview = (
                _save_video_preview(media_path, stem)
                if media_type == "video"
                else _save_image_preview(media_bytes, stem, ext)
            )
            saved.append({
                "file": filename,
                "preview": preview,
                "type": media_type,
                "mime": header.split(";", 1)[0].replace("data:", "") if "," in raw else "",
            })
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning("Failed to save post image: %s", e)

    now = time.time()
    async with aiosqlite.connect(DB_PATH) as conn:
        conn.row_factory = aiosqlite.Row
        cursor = await conn.execute(
            "INSERT INTO posts (tg_username, text, images, reply_to_id, created_at) VALUES (?, ?, ?, ?, ?)",
            (username, body.text, json.dumps(saved), reply_to_id, now),
        )
        post_id = cursor.lastrowid
        await conn.commit()

        cursor = await conn.execute(POSTS_QUERY + "WHERE p.id = ?", (post_id,))
        row = await cursor.fetchone()
        reactions, my_reactions, comment_count = await fetch_post_extras(conn, post_id, username)
        post_data = build_post_response(row, username, reactions, my_reactions, comment_count)

    asyncio.create_task(broadcast_event({"type": "new_post", "post": post_data}))
    return post_data


@router.put("/posts/{post_id}")
async def edit_post_endpoint(post_id: int, body: EditPostRequest, username: str = Depends(require_auth)):
    text = body.text.strip()
    if not text:
        raise HTTPException(400, "Текст не может быть пустым")
    if len(text) > MAX_POST_TEXT:
        raise HTTPException(400, f"Текст не может быть длиннее {MAX_POST_TEXT} символов")

    async with aiosqlite.connect(DB_PATH) as conn:
        conn.row_factory = aiosqlite.Row
        cursor = await conn.execute("SELECT * FROM posts WHERE id = ?", (post_id,))
        row = await cursor.fetchone()
        if not row:
            raise HTTPException(404, "Пост не найден")
        if row["tg_username"] != username:
            raise HTTPException(403, "Нет доступа")
        await conn.execute(
            "UPDATE posts SET text = ?, edited_at = ? WHERE id = ?",
            (text, time.time(), post_id),
        )
        await conn.commit()
        cursor = await conn.execute(POSTS_QUERY + "WHERE p.id = ?", (post_id,))
        row = await cursor.fetchone()
        reactions, my_reactions, comment_count = await fetch_post_extras(conn, post_id, username)
        return build_post_response(row, username, reactions, my_reactions, comment_count)


@router.delete("/posts/{post_id}")
async def delete_post_endpoint(post_id: int, username: str = Depends(require_auth)):
    async with aiosqlite.connect(DB_PATH) as conn:
        conn.row_factory = aiosqlite.Row
        cursor = await conn.execute("SELECT * FROM posts WHERE id = ?", (post_id,))
        row = await cursor.fetchone()
        if not row:
            raise HTTPException(404, "Пост не найден")
        if row["tg_username"] != username:
            raise HTTPException(403, "Нет доступа")
        for item in json.loads(row["images"] or "[]"):
            filename = item if isinstance(item, str) else item.get("file")
            preview = None if isinstance(item, str) else item.get("preview")
            try:
                if filename:
                    (POSTS_IMG_DIR / filename).unlink(missing_ok=True)
                if preview:
                    (POSTS_IMG_DIR / preview).unlink(missing_ok=True)
            except Exception:
                pass
        await conn.execute("DELETE FROM posts WHERE id = ?", (post_id,))
        await conn.commit()
    asyncio.create_task(broadcast_event({"type": "post_deleted", "postId": post_id}))
    return {"ok": True}


@router.put("/posts/{post_id}/pin")
async def pin_post_endpoint(post_id: int, username: str = Depends(require_auth)):
    async with aiosqlite.connect(DB_PATH) as conn:
        conn.row_factory = aiosqlite.Row
        cursor = await conn.execute("SELECT * FROM posts WHERE id = ?", (post_id,))
        row = await cursor.fetchone()
        if not row:
            raise HTTPException(404, "Пост не найден")
        if row["tg_username"] != username:
            raise HTTPException(403, "Нет доступа")
        new_pinned = 0 if row["pinned"] else 1
        await conn.execute(
            "UPDATE posts SET pinned = ?, pinned_at = ? WHERE id = ?",
            (new_pinned, time.time() if new_pinned else None, post_id),
        )
        await conn.commit()
    return {"ok": True, "pinned": bool(new_pinned)}


@router.post("/posts/{post_id}/react")
async def react_to_post(post_id: int, body: ReactRequest, username: str = Depends(require_auth)):
    emoji = body.emoji.strip()
    if not emoji:
        raise HTTPException(400, "emoji обязателен")

    user = await db_get_user(username)
    if not user:
        raise HTTPException(404, "Пользователь не найден")
    max_reactions = 3 if bool(user["verified"]) else 1

    async with aiosqlite.connect(DB_PATH) as conn:
        conn.row_factory = aiosqlite.Row
        cursor = await conn.execute("SELECT id FROM posts WHERE id = ?", (post_id,))
        if not await cursor.fetchone():
            raise HTTPException(404, "Пост не найден")

        cursor = await conn.execute(
            "SELECT emoji FROM post_reactions WHERE post_id = ? AND tg_username = ? ORDER BY created_at ASC",
            (post_id, username),
        )
        existing = await cursor.fetchall()
        my_emojis = [r["emoji"] for r in existing]

        if emoji in my_emojis:
            await conn.execute(
                "DELETE FROM post_reactions WHERE post_id = ? AND tg_username = ? AND emoji = ?",
                (post_id, username, emoji),
            )
        else:
            cursor = await conn.execute(
                "SELECT DISTINCT emoji FROM post_reactions WHERE post_id = ?", (post_id,)
            )
            all_unique = await cursor.fetchall()
            unique_emojis = {r["emoji"] for r in all_unique}
            if emoji not in unique_emojis:
                if len(unique_emojis) >= 6:
                    raise HTTPException(400, "На этом посту уже 6 уникальных реакций")
                HEART = "❤️"
                if len(unique_emojis) == 5 and emoji != HEART and HEART in unique_emojis:
                    await conn.execute(
                        "DELETE FROM post_reactions WHERE post_id = ? AND emoji = ?",
                        (post_id, HEART),
                    )

            if len(my_emojis) >= max_reactions:
                oldest = my_emojis[0]
                await conn.execute(
                    "DELETE FROM post_reactions WHERE post_id = ? AND tg_username = ? AND emoji = ?",
                    (post_id, username, oldest),
                )
            await conn.execute(
                "INSERT INTO post_reactions (post_id, tg_username, emoji, created_at) VALUES (?, ?, ?, ?)",
                (post_id, username, emoji, time.time()),
            )
        await conn.commit()

        cursor = await conn.execute(
            "SELECT emoji, tg_username FROM post_reactions WHERE post_id = ?", (post_id,)
        )
        rx_rows = await cursor.fetchall()

    reactions: dict[str, int] = {}
    for rx in rx_rows:
        reactions[rx["emoji"]] = reactions.get(rx["emoji"], 0) + 1
    my_reactions = [rx["emoji"] for rx in rx_rows if rx["tg_username"] == username]

    asyncio.create_task(broadcast_event({
        "type":      "reaction_update",
        "postId":    post_id,
        "reactions": reactions,
    }))

    return {"reactions": reactions, "myReactions": my_reactions}


@router.get("/api/posts/{post_id}")
async def get_single_post(post_id: int):
    async with aiosqlite.connect(DB_PATH) as conn:
        conn.row_factory = aiosqlite.Row
        cursor = await conn.execute(POSTS_QUERY + "WHERE p.id = ?", (post_id,))
        row = await cursor.fetchone()
        if not row:
            raise HTTPException(404, "Пост не найден")
        reactions, my_reactions, comment_count = await fetch_post_extras(conn, post_id, "")
        return build_post_response(row, "", reactions, my_reactions, comment_count)
