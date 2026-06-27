import base64
import re
import time
from pathlib import Path

import aiosqlite
import jwt
from fastapi import APIRouter, Depends, HTTPException, Request

from auth import (
    check_block, generate_code, get_ip, ip_active_username, ip_blocks,
    last_send, normalize, pending_codes, register_fail, register_success,
    require_auth, username_blocks,
)
from bot import bot, fetch_and_save_avatar
from config import (
    BANNERS_DIR, CODE_PATH, DB_PATH, IMG_DIR, JWT_ALGO, JWT_SECRET, JWT_TTL,
    MAX_AVATAR_BYTES, MAX_BIO_LEN, MAX_NAME_LEN, SEND_COOLDOWN, SERVER_BASE,
    USERNAME_RE,
)
from database import (
    POSTS_QUERY,
    build_post_response,
    avatar_urls, db_create_auth_session, db_get_user, db_list_auth_sessions, ensure_avatar_low,
    db_is_hardban_blocked, db_revoke_auth_session, db_set_registered, db_upsert_user,
    fetch_post_extras, save_avatar_image,
)
from models import SendCodeRequest, UpdateCustomizationRequest, UpdateProfileRequest, UserInfoRequest, VerifyCodeRequest
from sse import broadcast_event

router = APIRouter()

WALLPAPERS_DIR = IMG_DIR / "wallpapers"
WALLPAPERS_DIR.mkdir(parents=True, exist_ok=True)
DEFAULT_AVATAR_URL = "/appimg/default_avatar.png"
DEFAULT_BANNER_URL = "/appimg/baner.png"


def _escape_like(value: str) -> str:
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


async def _viewer_from_request(request: Request | None) -> str:
    auth_header = request.headers.get("Authorization", "") if request else ""
    if not auth_header.startswith("Bearer "):
        return ""
    try:
        payload = jwt.decode(auth_header[7:], JWT_SECRET, algorithms=[JWT_ALGO])
        candidate = payload.get("sub", "")
        session_id = payload.get("jti", "")
        if candidate and session_id:
            from database import db_touch_auth_session
            if await db_touch_auth_session(session_id, candidate):
                return candidate
    except jwt.PyJWTError:
        return ""
    return ""


async def _get_user_by_public_username(username: str):
    u = normalize(username)
    if not u:
        return None
    user = await db_get_user(u)
    if user:
        return user
    async with aiosqlite.connect(DB_PATH) as conn:
        conn.row_factory = aiosqlite.Row
        cursor = await conn.execute(
            "SELECT * FROM users WHERE LOWER(profile_username) = ?",
            (u,),
        )
        return await cursor.fetchone()


def _public_asset_key(user, fallback: str) -> str:
    return (user["profile_username"] if user and user["profile_username"] else fallback)


def _banner_url(user, fallback: str, updated_at: int) -> str:
    if not user or not user["banner_path"]:
        return DEFAULT_BANNER_URL
    source_path = Path(user["banner_path"])
    if not source_path.exists():
        return DEFAULT_BANNER_URL
    banner_key = _public_asset_key(user, fallback)
    target_path = BANNERS_DIR / f"{banner_key}.jpg"
    if source_path != target_path:
        try:
            if not target_path.exists() or target_path.stat().st_mtime < source_path.stat().st_mtime:
                target_path.write_bytes(source_path.read_bytes())
        except Exception:
            pass
    return f"{SERVER_BASE}/img/banners/{banner_key}.jpg?t={updated_at}"


def _customization_payload(user, username: str) -> dict:
    t = int(user["updated_at"] or 0)
    wallpaper_url = None
    if "wallpaper_path" in user.keys() and user["wallpaper_path"] and Path(user["wallpaper_path"]).exists():
        wallpaper_url = f"{SERVER_BASE}/img/wallpapers/{username}.jpg?t={t}"
    return {
        "gradients_enabled": bool(user["gradients_enabled"]) if "gradients_enabled" in user.keys() and user["gradients_enabled"] is not None else True,
        "gradient_color_1": user["gradient_color_1"] if "gradient_color_1" in user.keys() and user["gradient_color_1"] else "#4E7ADF",
        "gradient_color_2": user["gradient_color_2"] if "gradient_color_2" in user.keys() and user["gradient_color_2"] else "#144CCC",
        "wallpaper_url": wallpaper_url,
    }


def _user_search_payload(user) -> dict:
    t = int(user["updated_at"] or 0)
    public_username = user["profile_username"] or user["username"]
    avatar_url, avatar_preview_url = avatar_urls(public_username, user["avatar_path"], t)
    avatar_url = avatar_url or DEFAULT_AVATAR_URL
    avatar_preview_url = avatar_preview_url or avatar_url
    return {
        "username": user["username"],
        "display_name": user["display_name"] or user["first_name"] or user["username"],
        "profile_username": public_username,
        "bio": user["bio"],
        "verified": bool(user["verified"]),
        "avatar_url": avatar_url,
        "avatar_preview_url": avatar_preview_url,
    }


async def _ensure_customization_schema() -> None:
    async with aiosqlite.connect(DB_PATH) as conn:
        cursor = await conn.execute("PRAGMA table_info(users)")
        cols = [r[1] for r in await cursor.fetchall()]
        if 'wallpaper_path' not in cols:
            await conn.execute("ALTER TABLE users ADD COLUMN wallpaper_path TEXT")
        if 'gradients_enabled' not in cols:
            await conn.execute("ALTER TABLE users ADD COLUMN gradients_enabled INTEGER DEFAULT 1")
        if 'gradient_color_1' not in cols:
            await conn.execute("ALTER TABLE users ADD COLUMN gradient_color_1 TEXT DEFAULT '#4E7ADF'")
        if 'gradient_color_2' not in cols:
            await conn.execute("ALTER TABLE users ADD COLUMN gradient_color_2 TEXT DEFAULT '#144CCC'")
        await conn.commit()


@router.post("/send-code")
async def send_code(body: SendCodeRequest, request: Request):
    ip       = get_ip(request)
    username = normalize(body.username)

    if not username:
        raise HTTPException(400, "username обязателен")

    check_block(ip_blocks, ip)
    check_block(username_blocks, username)
    if await db_is_hardban_blocked(ip, body.gpu_renderer, body.timezone):
        raise HTTPException(403, "Device blocked")

    active_for_ip    = ip_active_username.get(ip)
    last             = last_send.get(username, 0)
    code_still_valid = (time.time() - last) < SEND_COOLDOWN

    if active_for_ip and active_for_ip != username and code_still_valid:
        raise HTTPException(403, "Нельзя запрашивать коды для разных аккаунтов одновременно")

    if code_still_valid and username in pending_codes:
        return {"ok": True}

    user = await db_get_user(username)
    if not user:
        raise HTTPException(404, "Сначала напиши боту /start в Telegram")

    if "banned" in user.keys() and bool(user["banned"]):
        raise HTTPException(403, "Account banned")

    from aiogram.types import FSInputFile
    last_send[username]     = time.time()
    ip_active_username[ip]  = username
    code                    = generate_code()
    pending_codes[username] = {"code": code, "expires_at": time.time() + 300, "ip": ip}

    code_caption = (
        f'<tg-emoji emoji-id="5301173701323028420">🔐</tg-emoji> '
        f"Твой код для входа в Bouston:\n\n"
        f"<b>{code}</b>\n\n"
        f"Код действует 5 минут. Никому не сообщай его. "
        f'<tg-emoji emoji-id="5296482716567495148">🤫</tg-emoji>'
    )
    try:
        await bot.send_photo(
            user["chat_id"],
            FSInputFile(CODE_PATH),
            caption=code_caption,
            parse_mode="HTML",
        )
    except Exception as e:
        import logging
        logging.getLogger(__name__).error("Не удалось отправить сообщение: %s", e)
        raise HTTPException(500, "Не удалось отправить код. Попробуй позже.")

    return {"ok": True}


@router.post("/verify-code")
async def verify_code(body: VerifyCodeRequest, request: Request):
    ip       = get_ip(request)
    username = normalize(body.username)

    check_block(ip_blocks, ip)
    check_block(username_blocks, username)
    if await db_is_hardban_blocked(ip, body.gpu_renderer, body.timezone):
        raise HTTPException(403, "Device blocked")

    entry = pending_codes.get(username)
    if not entry:
        raise HTTPException(400, "Код не найден. Запроси новый.")

    if time.time() > entry["expires_at"]:
        pending_codes.pop(username, None)
        raise HTTPException(400, "Код истёк. Запроси новый.")

    if body.code.strip() != entry["code"]:
        register_fail(username_blocks, username)
        register_fail(ip_blocks, ip)
        check_block(username_blocks, username)
        check_block(ip_blocks, ip)
        raise HTTPException(400, "Неверный код")

    pending_codes.pop(username, None)
    register_success(username_blocks, username)
    register_success(ip_blocks, ip)
    last_send.pop(username, None)
    ip_active_username.pop(ip, None)

    user = await db_get_user(username)
    if user and "banned" in user.keys() and bool(user["banned"]):
        raise HTTPException(403, "Account banned")
    session_id = await db_create_auth_session(
        username,
        request.headers.get("User-Agent", ""),
        get_ip(request),
        body.gpu_renderer,
        body.timezone,
    )
    token = jwt.encode(
        {"sub": username, "jti": session_id, "exp": int(time.time()) + JWT_TTL},
        JWT_SECRET,
        algorithm=JWT_ALGO,
    )
    t = int(user["updated_at"] or 0) if user else 0
    avatar_url, avatar_preview_url = avatar_urls(user["profile_username"] or username, user["avatar_path"], t) if user else (None, None)
    avatar_url = avatar_url or DEFAULT_AVATAR_URL
    avatar_preview_url = avatar_preview_url or avatar_url
    banner_url = _banner_url(user, username, t)

    return {
        "ok": True,
        "token": token,
        "session_id": session_id,
        "user": {
            "username":         username,
            "profile_username": user["profile_username"] or username if user else username,
            "first_name":       user["first_name"] if user else None,
            "bio":              user["bio"] if user else None,
            "verified":         bool(user["verified"]) if user else False,
            "avatar_url":       avatar_url,
            "avatar_preview_url": avatar_preview_url,
            "banner_url":       banner_url,
        },
    }


@router.get("/auth/sessions")
async def list_auth_sessions(request: Request, username: str = Depends(require_auth)):
    auth_header = request.headers.get("Authorization", "")
    current_id = ""
    if auth_header.startswith("Bearer "):
        try:
            payload = jwt.decode(auth_header[7:], JWT_SECRET, algorithms=[JWT_ALGO])
            current_id = payload.get("jti", "")
        except jwt.PyJWTError:
            current_id = ""

    sessions = await db_list_auth_sessions(username)
    return {
        "sessions": [
            {
                "id": s["id"],
                "device": s["device"] or "Устройство",
                "ip": s["ip"],
                "createdAt": int(s["created_at"] * 1000),
                "lastSeenAt": int(s["last_seen_at"] * 1000),
                "revokedAt": int(s["revoked_at"] * 1000) if s["revoked_at"] else None,
                "active": s["revoked_at"] is None,
                "current": s["id"] == current_id,
            }
            for s in sessions
        ]
    }


@router.delete("/auth/sessions/{session_id}")
async def revoke_auth_session(session_id: str, username: str = Depends(require_auth)):
    if not await db_revoke_auth_session(username, session_id):
        raise HTTPException(404, "Сессия не найдена")
    return {"ok": True}


@router.get("/api/search")
async def search_app(q: str = "", page: int = 1, limit: int = 10, request: Request = None):
    query = q.strip().lstrip("@")[:80]
    if not query:
        return {"users": [], "posts": [], "page": max(1, page), "hasMore": False}

    page = max(1, page)
    limit = max(1, min(limit, 20))
    offset = (page - 1) * limit
    lowered = query.lower()
    like_any = f"%{_escape_like(lowered)}%"
    like_prefix = f"{_escape_like(lowered)}%"
    viewer = await _viewer_from_request(request)

    async with aiosqlite.connect(DB_PATH) as conn:
        conn.row_factory = aiosqlite.Row
        users_cursor = await conn.execute(
            """
            SELECT *
            FROM users
            WHERE COALESCE(banned, 0) = 0
              AND (
                LOWER(COALESCE(profile_username, '')) LIKE ? ESCAPE '\\'
                OR LOWER(COALESCE(display_name, first_name, '')) LIKE ? ESCAPE '\\'
              )
            ORDER BY
              CASE
                WHEN LOWER(COALESCE(profile_username, '')) = ? THEN 0
                WHEN LOWER(COALESCE(display_name, first_name, '')) = ? THEN 1
                WHEN LOWER(COALESCE(profile_username, '')) LIKE ? ESCAPE '\\' THEN 2
                WHEN LOWER(COALESCE(display_name, first_name, '')) LIKE ? ESCAPE '\\' THEN 3
                ELSE 4
              END,
              updated_at DESC
            LIMIT 5
            """,
            (like_any, like_any, lowered, lowered, like_prefix, like_prefix),
        )
        user_rows = await users_cursor.fetchall()

        posts_cursor = await conn.execute(
            POSTS_QUERY + """
            WHERE LOWER(p.text) LIKE ? ESCAPE '\\'
            ORDER BY p.created_at DESC
            LIMIT ? OFFSET ?
            """,
            (like_any, limit, offset),
        )
        post_rows = await posts_cursor.fetchall()
        posts = []
        for row in post_rows:
            reactions, my_reactions, comment_count = await fetch_post_extras(conn, row["id"], viewer)
            posts.append(build_post_response(row, viewer, reactions, my_reactions, comment_count))

    return {
        "users": [_user_search_payload(user) for user in user_rows],
        "posts": posts,
        "page": page,
        "hasMore": len(posts) == limit,
    }


@router.get("/users/{username}")
async def get_user_fast(username: str):
    u    = normalize(username)
    user = await _get_user_by_public_username(u)
    if not user:
        raise HTTPException(404, "Пользователь не найден")

    t          = int(user["updated_at"] or 0)
    avatar_url, avatar_preview_url = avatar_urls(user["profile_username"] or user["username"], user["avatar_path"], t)
    avatar_url = avatar_url or DEFAULT_AVATAR_URL
    avatar_preview_url = avatar_preview_url or avatar_url
    banner_url = _banner_url(user, user["username"], t)

    return {
        "username":         user["username"],
        "display_name":     user["display_name"] or user["first_name"] or user["username"],
        "profile_username": user["profile_username"] or user["username"],
        "bio":              user["bio"],
        "verified":         bool(user["verified"]),
        "avatar_url":       avatar_url,
        "avatar_preview_url": avatar_preview_url,
        "banner_url":       banner_url,
    }


@router.post("/user-info")
async def get_user_info(body: UserInfoRequest):
    username = normalize(body.username)
    user     = await db_get_user(username)

    if not user:
        raise HTTPException(404, "Пользователь не найден")

    avatar_path = user["avatar_path"]
    if not avatar_path or not Path(avatar_path).exists():
        avatar_path = await fetch_and_save_avatar(user["user_id"], username)

    bio = user["bio"]
    try:
        chat = await bot.get_chat(user["user_id"])
        bio  = chat.bio or None
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning("Не удалось получить bio для %s: %s", username, e)

    await db_set_registered(username, avatar_path, bio)

    avatar_b64 = None
    if avatar_path and Path(avatar_path).exists():
        raw        = Path(avatar_path).read_bytes()
        avatar_b64 = "data:image/jpeg;base64," + base64.b64encode(raw).decode()

    fresh = await db_get_user(username)
    return {
        "username":         user["username"],
        "first_name":       user["first_name"],
        "last_name":        user["last_name"],
        "bio":              bio,
        "display_name":     fresh["display_name"]     if fresh["display_name"]     else None,
        "profile_username": fresh["profile_username"] if fresh["profile_username"] else None,
        "is_premium":       bool(user["is_premium"]),
        "verified":         bool(fresh["verified"]),
        "registered":       True,
        "avatar_b64":       avatar_b64,
    }


@router.get("/profile/customization")
async def get_profile_customization(username: str = Depends(require_auth)):
    await _ensure_customization_schema()
    user = await db_get_user(username)
    if not user:
        raise HTTPException(404, "Пользователь не найден")
    return _customization_payload(user, username)


@router.put("/profile/customization")
async def update_profile_customization(body: UpdateCustomizationRequest, username: str = Depends(require_auth)):
    await _ensure_customization_schema()
    user = await db_get_user(username)
    if not user:
        raise HTTPException(404, "Пользователь не найден")
    if not bool(user["verified"]):
        raise HTTPException(403, "Синхронизация кастомизации доступна только verified")

    def normalize_color(value: str | None, fallback: str) -> str:
        if value is None:
            return fallback
        value = value.strip()
        if not re.match(r"^#[0-9a-fA-F]{6}$", value):
            raise HTTPException(400, "Цвет должен быть в формате #RRGGBB")
        return value.upper()

    now = time.time()
    fields = ["updated_at = ?"]
    values: list = [now]

    if body.gradients_enabled is not None:
        fields.append("gradients_enabled = ?")
        values.append(1 if body.gradients_enabled else 0)
    if body.gradient_color_1 is not None:
        fields.append("gradient_color_1 = ?")
        values.append(normalize_color(body.gradient_color_1, "#4E7ADF"))
    if body.gradient_color_2 is not None:
        fields.append("gradient_color_2 = ?")
        values.append(normalize_color(body.gradient_color_2, "#144CCC"))

    wallpaper_path = None
    if body.clear_wallpaper:
        old_path = user["wallpaper_path"] if "wallpaper_path" in user.keys() else None
        if old_path and Path(old_path).exists():
            Path(old_path).unlink(missing_ok=True)
        fields.append("wallpaper_path = ?")
        values.append(None)
    elif body.wallpaper_b64:
        raw_b64 = body.wallpaper_b64
        if "," in raw_b64:
            raw_b64 = raw_b64.split(",", 1)[1]
        try:
            img_bytes = base64.b64decode(raw_b64)
        except Exception:
            raise HTTPException(400, "Неверный формат обоев")
        if len(img_bytes) > MAX_AVATAR_BYTES:
            raise HTTPException(400, "Обои слишком большие (макс 5 МБ)")
        wallpaper_file = WALLPAPERS_DIR / f"{username}.jpg"
        wallpaper_file.write_bytes(img_bytes)
        wallpaper_path = str(wallpaper_file)
        fields.append("wallpaper_path = ?")
        values.append(wallpaper_path)

    values.append(username)
    async with aiosqlite.connect(DB_PATH) as conn:
        await conn.execute(f"UPDATE users SET {', '.join(fields)} WHERE username = ?", values)
        await conn.commit()

    fresh = await db_get_user(username)
    return {"ok": True, **_customization_payload(fresh, username)}


@router.put("/profile")
async def update_profile(body: UpdateProfileRequest, username: str = Depends(require_auth)):
    tg_username = username
    user        = await db_get_user(tg_username)
    if not user:
        raise HTTPException(404, "Пользователь не найден")

    if body.display_name is not None and len(body.display_name) > MAX_NAME_LEN:
        raise HTTPException(400, f"Имя не может быть длиннее {MAX_NAME_LEN} символов")
    if body.bio is not None and len(body.bio) > MAX_BIO_LEN:
        raise HTTPException(400, f"Bio не может быть длиннее {MAX_BIO_LEN} символов")

    if body.profile_username is not None:
        u = body.profile_username.strip().lstrip("@").lower()
        if u and not USERNAME_RE.match(u):
            raise HTTPException(400, "Юзернейм: от 3 до 20 символов, только буквы, цифры и _")
        body.profile_username = u or None

        if body.profile_username:
            async with aiosqlite.connect(DB_PATH) as conn:
                cursor = await conn.execute(
                    "SELECT 1 FROM users WHERE LOWER(profile_username) = ? AND LOWER(username) != ?",
                    (body.profile_username, tg_username.lower()),
                )
                if await cursor.fetchone():
                    raise HTTPException(400, "Этот юзернейм уже занят")

    now = time.time()

    new_avatar_path: str | None = None
    if body.avatar_b64:
        raw_b64 = body.avatar_b64
        if "," in raw_b64:
            raw_b64 = raw_b64.split(",", 1)[1]
        try:
            img_bytes = base64.b64decode(raw_b64)
        except Exception:
            raise HTTPException(400, "Неверный формат аватарки")
        if len(img_bytes) > MAX_AVATAR_BYTES:
            raise HTTPException(400, "Аватарка слишком большая (макс 5 МБ)")
        avatar_key = body.profile_username if body.profile_username is not None else user["profile_username"]
        avatar_key = avatar_key or tg_username
        avatar_file = IMG_DIR / f"{avatar_key}.jpg"
        save_avatar_image(img_bytes, avatar_file, size=640)
        ensure_avatar_low(avatar_key, avatar_file)
        new_avatar_path = str(avatar_file)

    new_banner_path: str | None = None
    if body.banner_b64:
        raw_b64 = body.banner_b64
        if "," in raw_b64:
            raw_b64 = raw_b64.split(",", 1)[1]
        try:
            img_bytes = base64.b64decode(raw_b64)
        except Exception:
            raise HTTPException(400, "Неверный формат баннера")
        if len(img_bytes) > MAX_AVATAR_BYTES:
            raise HTTPException(400, "Баннер слишком большой (макс 5 МБ)")
        banner_key = body.profile_username if body.profile_username is not None else user["profile_username"]
        banner_key = banner_key or tg_username
        banner_file = BANNERS_DIR / f"{banner_key}.jpg"
        banner_file.write_bytes(img_bytes)
        new_banner_path = str(banner_file)

    async with aiosqlite.connect(DB_PATH) as conn:
        fields = ["display_name = ?", "bio = ?", "updated_at = ?"]
        values = [body.display_name, body.bio, now]
        if body.profile_username is not None:
            fields.append("profile_username = ?")
            values.append(body.profile_username)
        if new_avatar_path:
            fields.append("avatar_path = ?")
            values.append(new_avatar_path)
        if new_banner_path:
            fields.append("banner_path = ?")
            values.append(new_banner_path)
        values.append(tg_username)
        await conn.execute(f"UPDATE users SET {', '.join(fields)} WHERE username = ?", values)
        await conn.commit()

    if new_avatar_path:
        import asyncio
        avatar_key = body.profile_username if body.profile_username is not None else user["profile_username"]
        avatar_key = avatar_key or tg_username
        avatar_url, avatar_preview_url = avatar_urls(avatar_key, new_avatar_path, now)
        avatar_url = avatar_url or f"{SERVER_BASE}/img/{avatar_key}.jpg?t={int(now)}"
        avatar_preview_url = avatar_preview_url or avatar_url
        asyncio.create_task(broadcast_event({
            "type":      "avatar_update",
            "username":  tg_username,
            "avatarUrl": avatar_url,
            "avatarPreviewUrl": avatar_preview_url,
        }))

    return {"ok": True}
