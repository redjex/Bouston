import time

import aiosqlite
import jwt
from fastapi import APIRouter, Depends, HTTPException, Request

from auth import normalize, require_auth
from config import DB_PATH, JWT_ALGO, JWT_SECRET, MAX_COMMENT_TEXT
from database import (
    COMMENTS_QUERY, build_comment_response, db_get_user, db_touch_auth_session,
    fetch_comment_extras,
)
from models import CreateCommentRequest

router = APIRouter()


@router.get("/posts/{post_id}/comments")
async def get_comments(post_id: int, request: Request):
    viewer = ""
    auth_header = request.headers.get("Authorization", "")
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
        cursor = await conn.execute("SELECT id FROM posts WHERE id = ?", (post_id,))
        if not await cursor.fetchone():
            raise HTTPException(404, "Пост не найден")
        cursor = await conn.execute(
            COMMENTS_QUERY + "WHERE c.post_id = ? ORDER BY c.created_at ASC", (post_id,)
        )
        rows = await cursor.fetchall()
        result = []
        for r in rows:
            likes_count, my_like = await fetch_comment_extras(conn, r["id"], viewer)
            result.append(build_comment_response(r, viewer, likes_count, my_like))
        return result


@router.post("/posts/{post_id}/comments")
async def create_comment(post_id: int, body: CreateCommentRequest, username: str = Depends(require_auth)):
    text = body.text.strip()
    if not text:
        raise HTTPException(400, "Текст не может быть пустым")
    if len(text) > MAX_COMMENT_TEXT:
        raise HTTPException(400, f"Комментарий не может быть длиннее {MAX_COMMENT_TEXT} символов")

    user = await db_get_user(username)
    if not user:
        raise HTTPException(404, "Пользователь не найден")

    async with aiosqlite.connect(DB_PATH) as conn:
        conn.row_factory = aiosqlite.Row
        cursor = await conn.execute("SELECT id FROM posts WHERE id = ?", (post_id,))
        if not await cursor.fetchone():
            raise HTTPException(404, "Пост не найден")
        cursor = await conn.execute(
            "INSERT INTO comments (post_id, tg_username, text, created_at) VALUES (?, ?, ?, ?)",
            (post_id, username, text, time.time()),
        )
        comment_id = cursor.lastrowid
        await conn.commit()
        cursor = await conn.execute(COMMENTS_QUERY + "WHERE c.id = ?", (comment_id,))
        row = await cursor.fetchone()
        likes_count, my_like = await fetch_comment_extras(conn, comment_id, username)
        return build_comment_response(row, username, likes_count, my_like)


@router.delete("/posts/{post_id}/comments/{comment_id}")
async def delete_comment_endpoint(post_id: int, comment_id: int, username: str = Depends(require_auth)):
    async with aiosqlite.connect(DB_PATH) as conn:
        conn.row_factory = aiosqlite.Row
        cursor = await conn.execute(
            "SELECT * FROM comments WHERE id = ? AND post_id = ?", (comment_id, post_id)
        )
        row = await cursor.fetchone()
        if not row:
            raise HTTPException(404, "Комментарий не найден")
        if row["tg_username"] != username:
            raise HTTPException(403, "Нет доступа")
        await conn.execute("DELETE FROM comments WHERE id = ?", (comment_id,))
        await conn.commit()
    return {"ok": True}


@router.post("/posts/{post_id}/comments/{comment_id}/like")
async def like_comment(post_id: int, comment_id: int, username: str = Depends(require_auth)):
    user = await db_get_user(username)
    if not user:
        raise HTTPException(404, "Пользователь не найден")

    async with aiosqlite.connect(DB_PATH) as conn:
        conn.row_factory = aiosqlite.Row
        cursor = await conn.execute(
            "SELECT id FROM comments WHERE id = ? AND post_id = ?", (comment_id, post_id)
        )
        if not await cursor.fetchone():
            raise HTTPException(404, "Комментарий не найден")

        cursor = await conn.execute(
            "SELECT 1 FROM comment_likes WHERE comment_id = ? AND tg_username = ?",
            (comment_id, username),
        )
        existing = await cursor.fetchone()

        if existing:
            await conn.execute(
                "DELETE FROM comment_likes WHERE comment_id = ? AND tg_username = ?",
                (comment_id, username),
            )
        else:
            await conn.execute(
                "INSERT INTO comment_likes (comment_id, tg_username, created_at) VALUES (?, ?, ?)",
                (comment_id, username, time.time()),
            )
        await conn.commit()

        cursor = await conn.execute(
            "SELECT COUNT(*) FROM comment_likes WHERE comment_id = ?", (comment_id,)
        )
        count_row = await cursor.fetchone()
        likes_count = count_row[0]
        my_like = not existing

    return {"likesCount": likes_count, "myLike": my_like}
