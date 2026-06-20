import base64
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
    db_create_auth_session, db_get_user, db_list_auth_sessions,
    db_revoke_auth_session, db_set_registered, db_upsert_user,
)
from models import SendCodeRequest, UpdateProfileRequest, UserInfoRequest, VerifyCodeRequest
from sse import broadcast_event

router = APIRouter()


@router.post("/send-code")
async def send_code(body: SendCodeRequest, request: Request):
    ip       = get_ip(request)
    username = normalize(body.username)

    if not username:
        raise HTTPException(400, "username обязателен")

    check_block(ip_blocks, ip)
    check_block(username_blocks, username)

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

    session_id = await db_create_auth_session(
        username,
        request.headers.get("User-Agent", ""),
        get_ip(request),
    )
    token = jwt.encode(
        {"sub": username, "jti": session_id, "exp": int(time.time()) + JWT_TTL},
        JWT_SECRET,
        algorithm=JWT_ALGO,
    )

    user = await db_get_user(username)
    t = int(user["updated_at"] or 0) if user else 0
    avatar_url = f"{SERVER_BASE}/img/{username}.jpg?t={t}" if (user and user["avatar_path"] and Path(user["avatar_path"]).exists()) else None
    banner_url = f"{SERVER_BASE}/img/banners/{username}.jpg?t={t}" if (user and user["banner_path"] and Path(user["banner_path"]).exists()) else None

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


@router.get("/users/{username}")
async def get_user_fast(username: str):
    u    = normalize(username)
    user = await db_get_user(u)
    if not user:
        raise HTTPException(404, "Пользователь не найден")

    t          = int(user["updated_at"] or 0)
    avatar_url = f"{SERVER_BASE}/img/{u}.jpg?t={t}" if (user["avatar_path"] and Path(user["avatar_path"]).exists()) else None
    banner_url = f"{SERVER_BASE}/img/banners/{u}.jpg?t={t}" if (user["banner_path"] and Path(user["banner_path"]).exists()) else None

    return {
        "username":         user["username"],
        "display_name":     user["display_name"] or user["first_name"] or user["username"],
        "profile_username": user["profile_username"] or user["username"],
        "bio":              user["bio"],
        "verified":         bool(user["verified"]),
        "avatar_url":       avatar_url,
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
            raise HTTPException(400, "Юзернейм: от 3 до 20 символов, только буквы, цифры, _ и .")
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
        avatar_file = IMG_DIR / f"{tg_username}.jpg"
        avatar_file.write_bytes(img_bytes)
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
        banner_file = BANNERS_DIR / f"{tg_username}.jpg"
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
        avatar_url = f"{SERVER_BASE}/img/{tg_username}.jpg?t={int(now)}"
        asyncio.create_task(broadcast_event({
            "type":      "avatar_update",
            "username":  tg_username,
            "avatarUrl": avatar_url,
        }))

    return {"ok": True}
