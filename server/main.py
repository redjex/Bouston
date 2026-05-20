import asyncio
import base64
import io
import json
import logging
import os
import re as _re
import secrets
import sqlite3
import string
import time
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

import jwt
from aiogram import Bot, Dispatcher, types
from aiogram.filters import CommandStart, Command
from aiogram.types import FSInputFile
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel

load_dotenv()

BOT_TOKEN  = os.getenv("BOT_TOKEN")
ADMIN_IDS  = {int(x) for x in os.getenv("ADMIN_IDS", "").split(",") if x.strip().isdigit()}
JWT_SECRET = os.getenv("JWT_SECRET", "")
JWT_ALGO   = "HS256"
JWT_TTL    = 86400 * 30  # 30 дней

if not JWT_SECRET:
    raise RuntimeError("JWT_SECRET не задан в .env — сервер не запустится без него")

logging.basicConfig(level=logging.INFO)
log = logging.getLogger(__name__)

bot = Bot(token=BOT_TOKEN)
dp = Dispatcher()

# ── Пути ──────────────────────────────────────────────────────────────────────

BASE_DIR      = Path(__file__).parent
IMG_DIR       = BASE_DIR / "img"
POSTS_IMG_DIR = IMG_DIR / "posts"
BANNERS_DIR   = IMG_DIR / "banners"
DB_PATH       = BASE_DIR / "bouston.db"
BANER_PATH    = BASE_DIR / "baner.png"
CODE_PATH     = BASE_DIR / "code.png"

IMG_DIR.mkdir(exist_ok=True)
POSTS_IMG_DIR.mkdir(exist_ok=True)
BANNERS_DIR.mkdir(exist_ok=True)

SERVER_BASE = "https://bouston.xyz"

# ── SSE subscribers ───────────────────────────────────────────────────────────

_sse_subscribers: list[asyncio.Queue] = []


async def broadcast_event(data: dict) -> None:
    msg = "data: " + json.dumps(data) + "\n\n"
    dead = []
    for q in _sse_subscribers:
        try:
            q.put_nowait(msg)
        except asyncio.QueueFull:
            dead.append(q)
    for q in dead:
        try:
            _sse_subscribers.remove(q)
        except ValueError:
            pass

# ── База данных ───────────────────────────────────────────────────────────────

def get_db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    with get_db() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS users (
                username    TEXT PRIMARY KEY,
                user_id     INTEGER UNIQUE,
                chat_id     INTEGER,
                first_name  TEXT,
                last_name   TEXT,
                bio         TEXT,
                is_premium  INTEGER DEFAULT 0,
                avatar_path TEXT,
                registered  INTEGER DEFAULT 0,
                created_at  REAL,
                updated_at  REAL
            )
        """)
        # миграции users
        cols = [r[1] for r in conn.execute("PRAGMA table_info(users)").fetchall()]
        if 'bio'              not in cols: conn.execute("ALTER TABLE users ADD COLUMN bio              TEXT")
        if 'display_name'     not in cols: conn.execute("ALTER TABLE users ADD COLUMN display_name     TEXT")
        if 'profile_username' not in cols: conn.execute("ALTER TABLE users ADD COLUMN profile_username TEXT")
        if 'verified'         not in cols: conn.execute("ALTER TABLE users ADD COLUMN verified         INTEGER DEFAULT 0")
        if 'banner_path'      not in cols: conn.execute("ALTER TABLE users ADD COLUMN banner_path      TEXT")

        # таблица постов
        conn.execute("""
            CREATE TABLE IF NOT EXISTS posts (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                tg_username TEXT NOT NULL,
                text        TEXT DEFAULT '',
                images      TEXT DEFAULT '[]',
                pinned      INTEGER DEFAULT 0,
                pinned_at   REAL,
                created_at  REAL NOT NULL
            )
        """)
        # миграции posts
        pcols = [r[1] for r in conn.execute("PRAGMA table_info(posts)").fetchall()]
        if 'edited_at' not in pcols: conn.execute("ALTER TABLE posts ADD COLUMN edited_at REAL")

        # таблица реакций
        conn.execute("""
            CREATE TABLE IF NOT EXISTS post_reactions (
                post_id     INTEGER NOT NULL,
                tg_username TEXT NOT NULL,
                emoji       TEXT NOT NULL,
                created_at  REAL NOT NULL,
                PRIMARY KEY (post_id, tg_username, emoji),
                FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
            )
        """)
        # таблица комментариев
        conn.execute("""
            CREATE TABLE IF NOT EXISTS comments (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                post_id     INTEGER NOT NULL,
                tg_username TEXT NOT NULL,
                text        TEXT NOT NULL,
                created_at  REAL NOT NULL,
                FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
            )
        """)
        # лайки комментариев
        conn.execute("""
            CREATE TABLE IF NOT EXISTS comment_likes (
                comment_id  INTEGER NOT NULL,
                tg_username TEXT NOT NULL,
                created_at  REAL NOT NULL,
                PRIMARY KEY (comment_id, tg_username),
                FOREIGN KEY (comment_id) REFERENCES comments(id) ON DELETE CASCADE
            )
        """)
        conn.commit()

    # Нормализуем profile_username в нижний регистр (миграция старых данных)
    with get_db() as conn:
        conn.execute("""
            UPDATE users SET profile_username = LOWER(profile_username)
            WHERE profile_username IS NOT NULL AND profile_username != LOWER(profile_username)
        """)
        conn.commit()


def db_upsert_user(
    username: str,
    user_id: int,
    chat_id: int,
    first_name: str,
    last_name: str | None,
    is_premium: bool,
) -> None:
    now = time.time()
    with get_db() as conn:
        conn.execute("""
            INSERT INTO users (username, user_id, chat_id, first_name, last_name,
                               is_premium, registered, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)
            ON CONFLICT(username) DO UPDATE SET
                user_id    = excluded.user_id,
                chat_id    = excluded.chat_id,
                first_name = excluded.first_name,
                last_name  = excluded.last_name,
                is_premium = excluded.is_premium,
                updated_at = excluded.updated_at
        """, (username, user_id, chat_id, first_name, last_name,
              int(is_premium), now, now))
        conn.commit()


def db_get_user(username: str) -> sqlite3.Row | None:
    with get_db() as conn:
        return conn.execute(
            "SELECT * FROM users WHERE username = ?", (username,)
        ).fetchone()


def db_set_registered(username: str, avatar_path: str | None, bio: str | None) -> None:
    now = time.time()
    with get_db() as conn:
        conn.execute("""
            UPDATE users SET registered = 1, avatar_path = ?, bio = ?, updated_at = ?
            WHERE username = ?
        """, (avatar_path, bio, now, username))
        conn.commit()


# ── Rate limiting (in-memory) ─────────────────────────────────────────────────

# username → {code, expires_at, ip}
pending_codes: dict[str, dict] = {}

# username → {attempts, blocked_until, block_level}
username_blocks: dict[str, dict] = {}

# ip → {attempts, blocked_until, block_level}
ip_blocks: dict[str, dict] = {}

# username → timestamp последней отправки кода
last_send: dict[str, float] = {}

# ip → username
ip_active_username: dict[str, str] = {}

SEND_COOLDOWN   = 300
CODE_TTL        = 300
BLOCK_DURATIONS = [60, 300, 1800, 3600, 86400, 604800]


def get_block_duration(level: int) -> int:
    return BLOCK_DURATIONS[min(level, len(BLOCK_DURATIONS) - 1)]


def format_block_time(seconds: int) -> str:
    if seconds < 60:    return f"{seconds} сек."
    if seconds < 3600:  return f"{seconds // 60} мин."
    if seconds < 86400: return f"{seconds // 3600} ч."
    if seconds < 604800:return f"{seconds // 86400} д."
    return f"{seconds // 604800} нед."


def check_block(store: dict, key: str) -> None:
    entry = store.get(key)
    if not entry:
        return
    if entry.get("blocked_until", 0) > time.time():
        remaining = int(entry["blocked_until"] - time.time())
        raise HTTPException(429, f"Слишком много попыток. Попробуй через {format_block_time(remaining)}")


def register_fail(store: dict, key: str) -> None:
    entry = store.setdefault(key, {"attempts": 0, "blocked_until": 0, "block_level": 0})
    entry["attempts"] += 1
    if entry["attempts"] >= 3:
        duration = get_block_duration(entry["block_level"])
        entry["blocked_until"] = time.time() + duration
        entry["block_level"] += 1
        entry["attempts"] = 0
        log.warning("Blocked %s for %s sec", key, duration)


def register_success(store: dict, key: str) -> None:
    store.pop(key, None)


def get_ip(request: Request) -> str:
    return request.headers.get("CF-Connecting-IP") or request.client.host


def generate_code(length: int = 6) -> str:
    alphabet = string.ascii_uppercase + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))


_bearer = HTTPBearer()


def require_auth(credentials: HTTPAuthorizationCredentials = Depends(_bearer)) -> str:
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALGO])
        username: str = payload.get("sub", "")
        if not username:
            raise HTTPException(401, "Недействительный токен")
        return username
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Токен истёк, войдите снова")
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Недействительный токен")


def normalize(username: str) -> str:
    return username.lstrip("@").lower()


# ── Скачивание аватарки ───────────────────────────────────────────────────────

async def fetch_and_save_avatar(user_id: int, username: str) -> str | None:
    """Скачивает аватарку пользователя и сохраняет в img/<username>.jpg.
    Возвращает путь к файлу или None если аватарки нет."""
    try:
        photos = await bot.get_user_profile_photos(user_id, limit=1)
        if photos.total_count == 0:
            return None

        file_id = photos.photos[0][-1].file_id
        file    = await bot.get_file(file_id)
        buf     = io.BytesIO()
        await bot.download_file(file.file_path, buf)

        avatar_path = IMG_DIR / f"{username}.jpg"
        avatar_path.write_bytes(buf.getvalue())
        log.info("Avatar saved: %s", avatar_path)
        return str(avatar_path)

    except Exception as e:
        log.warning("Не удалось получить аватарку для %s: %s", username, e)
        return None


# ── Telegram bot ──────────────────────────────────────────────────────────────

@dp.message(CommandStart())
async def cmd_start(message: types.Message):
    tg_user = message.from_user
    if not tg_user.username:
        await message.answer(
            "У тебя не установлен username в Telegram.\n"
            "Зайди в Настройки → Имя пользователя и задай его."
        )
        return

    username = normalize(tg_user.username)
    db_upsert_user(
        username   = username,
        user_id    = tg_user.id,
        chat_id    = message.chat.id,
        first_name = tg_user.first_name or "",
        last_name  = tg_user.last_name,
        is_premium = bool(tg_user.is_premium),
    )
    log.info("User upserted: %s (id=%s)", username, tg_user.id)

    caption = (
        f"Привет, @{tg_user.username} "
        f'<tg-emoji emoji-id="5296372434692234934">❤️</tg-emoji>\n\n'
        f"Рады видеть тебя для регистрации в Bouston. "
        f"Введи в приложении свой юзернейм из телеграм и получи код для входа "
        f'<tg-emoji emoji-id="5460980668378931880">👋</tg-emoji>'
    )
    try:
        await bot.send_photo(
            message.chat.id,
            FSInputFile(BANER_PATH),
            caption=caption,
            parse_mode="HTML",
        )
    except Exception:
        await message.answer(caption, parse_mode="HTML")


@dp.message(Command("verif"))
async def cmd_verif(message: types.Message):
    if message.from_user.id not in ADMIN_IDS:
        await message.answer("⛔ Нет доступа.")
        return

    parts = (message.text or "").split()
    if len(parts) < 2:
        await message.answer("Использование: /verif @username")
        return

    target = normalize(parts[1].lstrip("@"))
    user   = db_get_user(target)
    if not user:
        await message.answer(f"❌ Пользователь @{target} не найден в базе.")
        return

    now = time.time()
    with get_db() as conn:
        conn.execute("UPDATE users SET verified = 1, updated_at = ? WHERE username = ?", (now, target))
        conn.commit()

    await message.answer(f"✅ @{target} верифицирован.")


@dp.message(Command("unverif"))
async def cmd_unverif(message: types.Message):
    if message.from_user.id not in ADMIN_IDS:
        await message.answer("⛔ Нет доступа.")
        return

    parts = (message.text or "").split()
    if len(parts) < 2:
        await message.answer("Использование: /unverif @username")
        return

    target = normalize(parts[1].lstrip("@"))
    user   = db_get_user(target)
    if not user:
        await message.answer(f"❌ Пользователь @{target} не найден в базе.")
        return

    now = time.time()
    with get_db() as conn:
        conn.execute("UPDATE users SET verified = 0, updated_at = ? WHERE username = ?", (now, target))
        conn.commit()

    await message.answer(f"✅ Верификация @{target} снята.")


# ── FastAPI ───────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    asyncio.create_task(dp.start_polling(bot))
    yield
    await bot.session.close()


app = FastAPI(lifespan=lifespan)

from fastapi.staticfiles import StaticFiles
app.mount("/img", StaticFiles(directory=str(IMG_DIR)), name="img")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["*"],
)


class SendCodeRequest(BaseModel):
    username: str


class VerifyCodeRequest(BaseModel):
    username: str
    code: str


class UserInfoRequest(BaseModel):
    username: str


@app.post("/send-code")
async def send_code(body: SendCodeRequest, request: Request):
    ip       = get_ip(request)
    username = normalize(body.username)

    if not username:
        raise HTTPException(400, "username обязателен")

    check_block(ip_blocks, ip)
    check_block(username_blocks, username)

    active_for_ip   = ip_active_username.get(ip)
    last            = last_send.get(username, 0)
    code_still_valid = (time.time() - last) < SEND_COOLDOWN

    if active_for_ip and active_for_ip != username and code_still_valid:
        raise HTTPException(403, "Нельзя запрашивать коды для разных аккаунтов одновременно")

    if code_still_valid and username in pending_codes:
        return {"ok": True}

    user = db_get_user(username)
    if not user:
        raise HTTPException(404, "Сначала напиши боту /start в Telegram")

    last_send[username]       = time.time()
    ip_active_username[ip]    = username
    code                      = generate_code()
    pending_codes[username]   = {"code": code, "expires_at": time.time() + CODE_TTL, "ip": ip}

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
        log.error("Не удалось отправить сообщение: %s", e)
        raise HTTPException(500, "Не удалось отправить код. Попробуй позже.")

    return {"ok": True}


@app.post("/verify-code")
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

    token = jwt.encode(
        {"sub": username, "exp": int(time.time()) + JWT_TTL},
        JWT_SECRET,
        algorithm=JWT_ALGO,
    )
    return {"ok": True, "token": token}


@app.get("/users/{username}")
async def get_user_fast(username: str):
    """Быстрый профиль из БД — без обращений к Telegram API."""
    u = normalize(username)
    user = db_get_user(u)
    if not user:
        raise HTTPException(404, "Пользователь не найден")

    t = int(user["updated_at"] or 0)
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


@app.post("/user-info")
async def get_user_info(body: UserInfoRequest):
    username = normalize(body.username)
    user     = db_get_user(username)

    if not user:
        raise HTTPException(404, "Пользователь не найден")

    # Скачиваем аватарку и сохраняем на диск (если ещё не сохранена)
    avatar_path = user["avatar_path"]
    if not avatar_path or not Path(avatar_path).exists():
        avatar_path = await fetch_and_save_avatar(user["user_id"], username)

    # Получаем bio через get_chat
    bio = user["bio"]
    try:
        chat = await bot.get_chat(user["user_id"])
        bio  = chat.bio or None
    except Exception as e:
        log.warning("Не удалось получить bio для %s: %s", username, e)

    # Помечаем как зарегистрированного и сохраняем путь + bio
    db_set_registered(username, avatar_path, bio)

    # Читаем аватарку как base64 для передачи клиенту
    avatar_b64 = None
    if avatar_path and Path(avatar_path).exists():
        raw        = Path(avatar_path).read_bytes()
        avatar_b64 = "data:image/jpeg;base64," + base64.b64encode(raw).decode()

    # Возвращаем кастомные значения если есть, иначе TG-данные
    fresh = db_get_user(username)
    return {
        "username":          user["username"],
        "first_name":        user["first_name"],
        "last_name":         user["last_name"],
        "bio":               bio,
        "display_name":      fresh["display_name"]     if fresh["display_name"]     else None,
        "profile_username":  fresh["profile_username"] if fresh["profile_username"] else None,
        "is_premium":        bool(user["is_premium"]),
        "verified":          bool(fresh["verified"]),
        "registered":        True,
        "avatar_b64":        avatar_b64,
    }


USERNAME_RE    = _re.compile(r'^[a-zA-Z0-9_.]{3,20}$')

MAX_POST_TEXT    = 5_000
MAX_COMMENT_TEXT = 2_000
MAX_BIO_LEN      = 300
MAX_NAME_LEN     = 60
MAX_IMAGES       = 10
MAX_LIMIT        = 100


MAX_AVATAR_BYTES = 5 * 1024 * 1024  # 5 MB


class UpdateProfileRequest(BaseModel):
    tg_username:      str
    display_name:     str | None = None
    profile_username: str | None = None
    bio:              str | None = None
    avatar_b64:       str | None = None
    banner_b64:       str | None = None


@app.put("/profile")
async def update_profile(body: UpdateProfileRequest, username: str = Depends(require_auth)):
    tg_username = username
    user        = db_get_user(tg_username)
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

        # Проверяем уникальность: никто другой не должен использовать этот юзернейм
        if body.profile_username:
            with get_db() as conn:
                taken = conn.execute(
                    "SELECT 1 FROM users WHERE LOWER(profile_username) = ? AND LOWER(username) != ?",
                    (body.profile_username, tg_username.lower()),
                ).fetchone()
            if taken:
                raise HTTPException(400, "Этот юзернейм уже занят")

    now = time.time()

    # Сохраняем аватарку если передана
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

    # Сохраняем баннер если передан
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

    with get_db() as conn:
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
        conn.execute(f"UPDATE users SET {', '.join(fields)} WHERE username = ?", values)
        conn.commit()

    if new_avatar_path:
        avatar_url = f"{SERVER_BASE}/img/{tg_username}.jpg?t={int(now)}"
        asyncio.create_task(broadcast_event({
            "type":      "avatar_update",
            "username":  tg_username,
            "avatarUrl": avatar_url,
        }))

    return {"ok": True}


@app.get("/events")
async def sse_events(token: str, request: Request):
    try:
        payload  = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
        username = payload.get("sub")
        if not username:
            raise HTTPException(401, "Invalid token")
    except jwt.PyJWTError:
        raise HTTPException(401, "Invalid token")

    q: asyncio.Queue[str] = asyncio.Queue(maxsize=64)
    _sse_subscribers.append(q)

    async def generator():
        try:
            yield ": keepalive\n\n"
            while True:
                try:
                    msg = await asyncio.wait_for(q.get(), timeout=25)
                    yield msg
                except asyncio.TimeoutError:
                    if await request.is_disconnected():
                        break
                    yield ": keepalive\n\n"
        finally:
            try:
                _sse_subscribers.remove(q)
            except ValueError:
                pass

    return StreamingResponse(
        generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ── Posts ─────────────────────────────────────────────────────────────────────

def build_post_response(row: sqlite3.Row, viewer: str, conn: sqlite3.Connection | None = None) -> dict:
    images_filenames = json.loads(row["images"] or "[]")
    image_urls = [f"{SERVER_BASE}/img/posts/{f}" for f in images_filenames]

    avatar_url = None
    if row["author_avatar_path"] and Path(row["author_avatar_path"]).exists():
        t = int(row["updated_at"] or 0)
        avatar_url = f"{SERVER_BASE}/img/{row['tg_username']}.jpg?t={t}"

    # реакции
    reactions: dict[str, int] = {}
    my_reactions: list[str] = []
    comment_count = 0
    if conn is not None:
        rx_rows = conn.execute(
            "SELECT emoji, tg_username FROM post_reactions WHERE post_id = ?", (row["id"],)
        ).fetchall()
        for rx in rx_rows:
            reactions[rx["emoji"]] = reactions.get(rx["emoji"], 0) + 1
            if viewer and rx["tg_username"] == viewer:
                my_reactions.append(rx["emoji"])
        comment_count = conn.execute(
            "SELECT COUNT(*) FROM comments WHERE post_id = ?", (row["id"],)
        ).fetchone()[0]

    return {
        "id":          row["id"],
        "text":        row["text"] or "",
        "images":      image_urls,
        "pinned":      bool(row["pinned"]),
        "pinnedAt":    int(row["pinned_at"] * 1000) if row["pinned_at"] else None,
        "createdAt":   int(row["created_at"] * 1000),
        "editedAt":    int(row["edited_at"] * 1000) if row["edited_at"] else None,
        "isOwn":        viewer == row["tg_username"],
        "reactions":    reactions,
        "myReactions":  my_reactions,
        "commentCount": comment_count,
        "author": {
            "tgUsername":      row["tg_username"],
            "displayName":     row["display_name"] or row["first_name"] or row["tg_username"],
            "profileUsername": row["profile_username"] or row["tg_username"],
            "avatarUrl":       avatar_url,
            "isPremium":       bool(row["author_premium"]),
            "isVerified":      bool(row["author_verified"]),
        },
    }


POSTS_QUERY = """
    SELECT p.*,
           u.display_name, u.first_name, u.profile_username,
           u.avatar_path  AS author_avatar_path,
           u.is_premium   AS author_premium,
           u.verified     AS author_verified,
           u.updated_at   AS updated_at
    FROM posts p
    JOIN users u ON u.username = p.tg_username
"""


@app.get("/posts")
async def get_posts(viewer: str = "", author: str = "", page: int = 1, limit: int = 20):
    page   = max(1, page)
    limit  = max(1, min(limit, MAX_LIMIT))
    viewer = normalize(viewer) if viewer else ""
    offset = (page - 1) * limit
    with get_db() as conn:
        if author:
            rows = conn.execute(
                POSTS_QUERY + "WHERE p.tg_username = ? ORDER BY p.pinned DESC, p.pinned_at DESC, p.created_at DESC LIMIT ? OFFSET ?",
                (normalize(author), limit, offset),
            ).fetchall()
        else:
            rows = conn.execute(
                POSTS_QUERY + "ORDER BY p.created_at DESC LIMIT ? OFFSET ?",
                (limit, offset),
            ).fetchall()
        return [build_post_response(r, viewer, conn) for r in rows]


class CreatePostRequest(BaseModel):
    tg_username: str
    text:        str       = ""
    images:      list[str] = []


@app.post("/posts")
async def create_post(body: CreatePostRequest, username: str = Depends(require_auth)):
    if len(body.text) > MAX_POST_TEXT:
        raise HTTPException(400, f"Текст не может быть длиннее {MAX_POST_TEXT} символов")
    if len(body.images) > MAX_IMAGES:
        raise HTTPException(400, f"Максимум {MAX_IMAGES} изображений на пост")

    user = db_get_user(username)
    if not user:
        raise HTTPException(404, "Пользователь не найден")

    saved = []
    for raw in body.images:
        try:
            if "," in raw:
                header, data = raw.split(",", 1)
                ext = "jpg"
                if "gif"  in header: ext = "gif"
                elif "png"  in header: ext = "png"
                elif "webp" in header: ext = "webp"
                elif "mp4"  in header: ext = "mp4"
                elif "webm" in header: ext = "webm"
            else:
                data, ext = raw, "jpg"
            filename = f"{uuid.uuid4().hex}.{ext}"
            (POSTS_IMG_DIR / filename).write_bytes(base64.b64decode(data))
            saved.append(filename)
        except Exception as e:
            log.warning("Failed to save post image: %s", e)

    now = time.time()
    with get_db() as conn:
        cur = conn.execute(
            "INSERT INTO posts (tg_username, text, images, created_at) VALUES (?, ?, ?, ?)",
            (username, body.text, json.dumps(saved), now),
        )
        post_id = cur.lastrowid
        conn.commit()

    with get_db() as conn:
        row = conn.execute(POSTS_QUERY + "WHERE p.id = ?", (post_id,)).fetchone()
        post_data = build_post_response(row, username, conn)

    asyncio.create_task(broadcast_event({"type": "new_post", "post": post_data}))
    return post_data


class EditPostRequest(BaseModel):
    tg_username: str
    text: str


@app.put("/posts/{post_id}")
async def edit_post_endpoint(post_id: int, body: EditPostRequest, username: str = Depends(require_auth)):
    text = body.text.strip()
    if not text:
        raise HTTPException(400, "Текст не может быть пустым")
    if len(text) > MAX_POST_TEXT:
        raise HTTPException(400, f"Текст не может быть длиннее {MAX_POST_TEXT} символов")
    with get_db() as conn:
        row = conn.execute("SELECT * FROM posts WHERE id = ?", (post_id,)).fetchone()
        if not row:
            raise HTTPException(404, "Пост не найден")
        if row["tg_username"] != username:
            raise HTTPException(403, "Нет доступа")
        conn.execute(
            "UPDATE posts SET text = ?, edited_at = ? WHERE id = ?",
            (text, time.time(), post_id),
        )
        conn.commit()
        row = conn.execute(POSTS_QUERY + "WHERE p.id = ?", (post_id,)).fetchone()
        return build_post_response(row, username, conn)


@app.delete("/posts/{post_id}")
async def delete_post_endpoint(post_id: int, username: str = Depends(require_auth)):
    with get_db() as conn:
        row = conn.execute("SELECT * FROM posts WHERE id = ?", (post_id,)).fetchone()
        if not row:
            raise HTTPException(404, "Пост не найден")
        if row["tg_username"] != username:
            raise HTTPException(403, "Нет доступа")
        for filename in json.loads(row["images"] or "[]"):
            try: (POSTS_IMG_DIR / filename).unlink(missing_ok=True)
            except: pass
        conn.execute("DELETE FROM posts WHERE id = ?", (post_id,))
        conn.commit()
    return {"ok": True}


@app.put("/posts/{post_id}/pin")
async def pin_post_endpoint(post_id: int, username: str = Depends(require_auth)):
    with get_db() as conn:
        row = conn.execute("SELECT * FROM posts WHERE id = ?", (post_id,)).fetchone()
        if not row:
            raise HTTPException(404, "Пост не найден")
        if row["tg_username"] != username:
            raise HTTPException(403, "Нет доступа")
        new_pinned = 0 if row["pinned"] else 1
        conn.execute(
            "UPDATE posts SET pinned = ?, pinned_at = ? WHERE id = ?",
            (new_pinned, time.time() if new_pinned else None, post_id),
        )
        conn.commit()
    return {"ok": True, "pinned": bool(new_pinned)}


class ReactRequest(BaseModel):
    tg_username: str
    emoji:       str


@app.post("/posts/{post_id}/react")
async def react_to_post(post_id: int, body: ReactRequest, username: str = Depends(require_auth)):
    emoji    = body.emoji.strip()
    if not emoji:
        raise HTTPException(400, "emoji обязателен")

    user = db_get_user(username)
    if not user:
        raise HTTPException(404, "Пользователь не найден")
    max_reactions = 3 if bool(user["verified"]) else 1

    with get_db() as conn:
        post_row = conn.execute("SELECT id FROM posts WHERE id = ?", (post_id,)).fetchone()
        if not post_row:
            raise HTTPException(404, "Пост не найден")

        existing = conn.execute(
            "SELECT emoji FROM post_reactions WHERE post_id = ? AND tg_username = ? ORDER BY created_at ASC",
            (post_id, username),
        ).fetchall()
        my_emojis = [r["emoji"] for r in existing]

        if emoji in my_emojis:
            # toggle off
            conn.execute(
                "DELETE FROM post_reactions WHERE post_id = ? AND tg_username = ? AND emoji = ?",
                (post_id, username, emoji),
            )
        else:
            # проверяем глобальный лимит уникальных emoji на пост (макс. 6)
            all_unique = conn.execute(
                "SELECT DISTINCT emoji FROM post_reactions WHERE post_id = ?", (post_id,)
            ).fetchall()
            unique_emojis = {r["emoji"] for r in all_unique}
            if emoji not in unique_emojis:
                if len(unique_emojis) >= 6:
                    raise HTTPException(400, "На этом посту уже 6 уникальных реакций")
                # если добавляем 6-ю уникальную реакцию (не ❤️) и ❤️ уже есть — вытесняем ❤️
                HEART = "❤️"
                if len(unique_emojis) == 5 and emoji != HEART and HEART in unique_emojis:
                    conn.execute(
                        "DELETE FROM post_reactions WHERE post_id = ? AND emoji = ?",
                        (post_id, HEART),
                    )

            if len(my_emojis) >= max_reactions:
                # remove oldest
                oldest = my_emojis[0]
                conn.execute(
                    "DELETE FROM post_reactions WHERE post_id = ? AND tg_username = ? AND emoji = ?",
                    (post_id, username, oldest),
                )
            conn.execute(
                "INSERT INTO post_reactions (post_id, tg_username, emoji, created_at) VALUES (?, ?, ?, ?)",
                (post_id, username, emoji, time.time()),
            )
        conn.commit()

        # build updated reactions
        rx_rows = conn.execute(
            "SELECT emoji, tg_username FROM post_reactions WHERE post_id = ?", (post_id,)
        ).fetchall()

    reactions: dict[str, int] = {}
    my_reactions: list[str] = []
    for rx in rx_rows:
        reactions[rx["emoji"]] = reactions.get(rx["emoji"], 0) + 1
        if rx["tg_username"] == username:
            my_reactions.append(rx["emoji"])

    return {"reactions": reactions, "myReactions": my_reactions}


# ── Comments ──────────────────────────────────────────────────────────────────

COMMENTS_QUERY = """
    SELECT c.*,
           u.display_name, u.first_name, u.profile_username,
           u.avatar_path  AS author_avatar_path,
           u.verified     AS author_verified,
           u.updated_at   AS updated_at
    FROM comments c
    JOIN users u ON u.username = c.tg_username
"""


def build_comment_response(row: sqlite3.Row, viewer: str, conn: sqlite3.Connection) -> dict:
    likes_count = conn.execute(
        "SELECT COUNT(*) FROM comment_likes WHERE comment_id = ?", (row["id"],)
    ).fetchone()[0]
    my_like = False
    if viewer:
        my_like = conn.execute(
            "SELECT 1 FROM comment_likes WHERE comment_id = ? AND tg_username = ?",
            (row["id"], viewer),
        ).fetchone() is not None

    avatar_url = None
    if row["author_avatar_path"] and Path(row["author_avatar_path"]).exists():
        t = int(row["updated_at"] or 0)
        avatar_url = f"{SERVER_BASE}/img/{row['tg_username']}.jpg?t={t}"

    return {
        "id":         row["id"],
        "text":       row["text"],
        "createdAt":  int(row["created_at"] * 1000),
        "isOwn":      viewer == row["tg_username"],
        "likesCount": likes_count,
        "myLike":     my_like,
        "author": {
            "tgUsername":   row["tg_username"],
            "displayName":  row["display_name"] or row["first_name"] or row["tg_username"],
            "avatarUrl":    avatar_url,
            "isVerified":   bool(row["author_verified"]),
        },
    }


@app.get("/posts/{post_id}/comments")
async def get_comments(post_id: int, viewer: str = ""):
    viewer = normalize(viewer) if viewer else ""
    with get_db() as conn:
        post_row = conn.execute("SELECT id FROM posts WHERE id = ?", (post_id,)).fetchone()
        if not post_row:
            raise HTTPException(404, "Пост не найден")
        rows = conn.execute(
            COMMENTS_QUERY + "WHERE c.post_id = ? ORDER BY c.created_at ASC", (post_id,)
        ).fetchall()
        return [build_comment_response(r, viewer, conn) for r in rows]


class CreateCommentRequest(BaseModel):
    tg_username: str
    text: str


@app.post("/posts/{post_id}/comments")
async def create_comment(post_id: int, body: CreateCommentRequest, username: str = Depends(require_auth)):
    text = body.text.strip()
    if not text:
        raise HTTPException(400, "Текст не может быть пустым")
    if len(text) > MAX_COMMENT_TEXT:
        raise HTTPException(400, f"Комментарий не может быть длиннее {MAX_COMMENT_TEXT} символов")
    user = db_get_user(username)
    if not user:
        raise HTTPException(404, "Пользователь не найден")
    with get_db() as conn:
        post_row = conn.execute("SELECT id FROM posts WHERE id = ?", (post_id,)).fetchone()
        if not post_row:
            raise HTTPException(404, "Пост не найден")
        cur = conn.execute(
            "INSERT INTO comments (post_id, tg_username, text, created_at) VALUES (?, ?, ?, ?)",
            (post_id, username, text, time.time()),
        )
        comment_id = cur.lastrowid
        conn.commit()
        row = conn.execute(COMMENTS_QUERY + "WHERE c.id = ?", (comment_id,)).fetchone()
        return build_comment_response(row, username, conn)


@app.delete("/posts/{post_id}/comments/{comment_id}")
async def delete_comment_endpoint(post_id: int, comment_id: int, username: str = Depends(require_auth)):
    with get_db() as conn:
        row = conn.execute("SELECT * FROM comments WHERE id = ? AND post_id = ?", (comment_id, post_id)).fetchone()
        if not row:
            raise HTTPException(404, "Комментарий не найден")
        if row["tg_username"] != username:
            raise HTTPException(403, "Нет доступа")
        conn.execute("DELETE FROM comments WHERE id = ?", (comment_id,))
        conn.commit()
    return {"ok": True}


@app.post("/posts/{post_id}/comments/{comment_id}/like")
async def like_comment(post_id: int, comment_id: int, username: str = Depends(require_auth)):
    user = db_get_user(username)
    if not user:
        raise HTTPException(404, "Пользователь не найден")
    with get_db() as conn:
        row = conn.execute("SELECT id FROM comments WHERE id = ? AND post_id = ?", (comment_id, post_id)).fetchone()
        if not row:
            raise HTTPException(404, "Комментарий не найден")
        existing = conn.execute(
            "SELECT 1 FROM comment_likes WHERE comment_id = ? AND tg_username = ?", (comment_id, username)
        ).fetchone()
        if existing:
            conn.execute(
                "DELETE FROM comment_likes WHERE comment_id = ? AND tg_username = ?", (comment_id, username)
            )
        else:
            conn.execute(
                "INSERT INTO comment_likes (comment_id, tg_username, created_at) VALUES (?, ?, ?)",
                (comment_id, username, time.time()),
            )
        conn.commit()
        likes_count = conn.execute(
            "SELECT COUNT(*) FROM comment_likes WHERE comment_id = ?", (comment_id,)
        ).fetchone()[0]
        my_like = not existing
    return {"likesCount": likes_count, "myLike": my_like}
