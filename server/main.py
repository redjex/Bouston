import asyncio
import logging
import os
import random
import string
import time
from contextlib import asynccontextmanager

from aiogram import Bot, Dispatcher, types
from aiogram.filters import CommandStart
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

load_dotenv()

BOT_TOKEN = os.getenv("BOT_TOKEN")

logging.basicConfig(level=logging.INFO)
log = logging.getLogger(__name__)

bot = Bot(token=BOT_TOKEN)
dp = Dispatcher()

# username → chat_id
user_chat_ids: dict[str, int] = {}

# username → {code, expires_at, ip}
pending_codes: dict[str, dict] = {}

# username → {attempts, blocked_until, block_level}
username_blocks: dict[str, dict] = {}

# ip → {attempts, blocked_until, block_level}
ip_blocks: dict[str, dict] = {}

# username → timestamp последней отправки кода
last_send: dict[str, float] = {}

# ip → username (для какого username этот IP последний раз запрашивал код)
ip_active_username: dict[str, str] = {}

SEND_COOLDOWN = 300  # 5 минут между запросами кода

CODE_TTL = 300  # 5 минут

# Эскалация блокировок в секундах
BLOCK_DURATIONS = [60, 300, 1800, 3600, 86400, 604800]


def get_block_duration(level: int) -> int:
    return BLOCK_DURATIONS[min(level, len(BLOCK_DURATIONS) - 1)]


def format_block_time(seconds: int) -> str:
    if seconds < 60:
        return f"{seconds} сек."
    if seconds < 3600:
        return f"{seconds // 60} мин."
    if seconds < 86400:
        return f"{seconds // 3600} ч."
    if seconds < 604800:
        return f"{seconds // 86400} д."
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
    cf_ip = request.headers.get("CF-Connecting-IP")
    return cf_ip or request.client.host


def generate_code(length: int = 6) -> str:
    alphabet = string.ascii_uppercase + string.digits
    return "".join(random.choices(alphabet, k=length))


def normalize(username: str) -> str:
    return username.lstrip("@").lower()


# ── Telegram bot ──────────────────────────────────────────────────────────────

@dp.message(CommandStart())
async def cmd_start(message: types.Message):
    username = message.from_user.username
    if not username:
        await message.answer(
            "У тебя не установлен username в Telegram.\n"
            "Зайди в Настройки → Имя пользователя и задай его."
        )
        return

    user_chat_ids[normalize(username)] = message.chat.id
    log.info("Registered %s → chat_id %s", username, message.chat.id)
    await message.answer(
        f"Привет, @{username}! 👋\n"
        "Теперь ты можешь авторизоваться в Bouston.\n"
        "Введи свой username в приложении и получи код подтверждения."
    )


# ── FastAPI ───────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    asyncio.create_task(dp.start_polling(bot))
    yield
    await bot.session.close()


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["POST"],
    allow_headers=["*"],
)


class SendCodeRequest(BaseModel):
    username: str


class VerifyCodeRequest(BaseModel):
    username: str
    code: str


@app.post("/send-code")
async def send_code(body: SendCodeRequest, request: Request):
    ip = get_ip(request)
    username = normalize(body.username)

    if not username:
        raise HTTPException(400, "username обязателен")

    # Проверяем блокировки
    check_block(ip_blocks, ip)
    check_block(username_blocks, username)

    # Если у этого IP уже есть активный код для другого username — блокируем
    active_for_ip = ip_active_username.get(ip)
    last = last_send.get(username, 0)
    code_still_valid = (time.time() - last) < SEND_COOLDOWN

    if active_for_ip and active_for_ip != username and code_still_valid:
        raise HTTPException(403, "Нельзя запрашивать коды для разных аккаунтов одновременно")

    # Если код для этого username уже отправлен и ещё активен — просто пускаем дальше
    if code_still_valid and username in pending_codes:
        return {"ok": True}

    chat_id = user_chat_ids.get(username)
    if not chat_id:
        raise HTTPException(404, "Сначала напиши боту /start в Telegram")

    last_send[username] = time.time()
    ip_active_username[ip] = username
    code = generate_code()
    pending_codes[username] = {"code": code, "expires_at": time.time() + CODE_TTL, "ip": ip}

    try:
        await bot.send_message(
            chat_id,
            f"🔐 Твой код для входа в Bouston:\n\n"
            f"<b>{code}</b>\n\n"
            f"Код действует 5 минут. Никому не сообщай его.",
            parse_mode="HTML",
        )
    except Exception as e:
        log.error("Не удалось отправить сообщение: %s", e)
        raise HTTPException(500, "Не удалось отправить код. Попробуй позже.")

    return {"ok": True}


@app.post("/verify-code")
async def verify_code(body: VerifyCodeRequest, request: Request):
    ip = get_ip(request)
    username = normalize(body.username)

    # Проверяем блокировки
    check_block(ip_blocks, ip)
    check_block(username_blocks, username)

    entry = pending_codes.get(username)

    if not entry:
        raise HTTPException(400, "Код не найден. Запроси новый.")

    if time.time() > entry["expires_at"]:
        pending_codes.pop(username, None)
        raise HTTPException(400, "Код истёк. Запроси новый.")

    if body.code.strip() != entry["code"]:
        # Фиксируем неудачную попытку по username и по IP
        register_fail(username_blocks, username)
        register_fail(ip_blocks, ip)
        # Проверяем не заблокировало ли только что
        check_block(username_blocks, username)
        check_block(ip_blocks, ip)
        raise HTTPException(400, "Неверный код")

    pending_codes.pop(username, None)
    register_success(username_blocks, username)
    register_success(ip_blocks, ip)
    last_send.pop(username, None)
    ip_active_username.pop(ip, None)
    return {"ok": True}
