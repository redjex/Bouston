import io
import logging
import time

from aiogram import Bot, Dispatcher, types
from aiogram.filters import Command, CommandStart
from aiogram.types import FSInputFile

from auth import normalize
from config import ADMIN_IDS, BANER_PATH, BOT_TOKEN, IMG_DIR
from database import db_get_user, db_upsert_user, ensure_avatar_low, save_avatar_image

log = logging.getLogger(__name__)

bot = Bot(token=BOT_TOKEN)
dp  = Dispatcher()


async def fetch_and_save_avatar(user_id: int, username: str) -> str | None:
    try:
        photos = await bot.get_user_profile_photos(user_id, limit=1)
        if photos.total_count == 0:
            return None

        file_id = photos.photos[0][-1].file_id
        file    = await bot.get_file(file_id)
        buf     = io.BytesIO()
        await bot.download_file(file.file_path, buf)

        avatar_path = IMG_DIR / f"{username}.jpg"
        save_avatar_image(buf.getvalue(), avatar_path, size=640)
        ensure_avatar_low(username, avatar_path)
        log.info("Avatar saved: %s", avatar_path)
        return str(avatar_path)

    except Exception as e:
        log.warning("Не удалось получить аватарку для %s: %s", username, e)
        return None


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
    await db_upsert_user(
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
    user   = await db_get_user(target)
    if not user:
        await message.answer(f"❌ Пользователь @{target} не найден в базе.")
        return

    import aiosqlite
    from config import DB_PATH
    now = time.time()
    async with aiosqlite.connect(DB_PATH) as conn:
        await conn.execute("UPDATE users SET verified = 1, updated_at = ? WHERE username = ?", (now, target))
        await conn.commit()

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
    user   = await db_get_user(target)
    if not user:
        await message.answer(f"❌ Пользователь @{target} не найден в базе.")
        return

    import aiosqlite
    from config import DB_PATH
    now = time.time()
    async with aiosqlite.connect(DB_PATH) as conn:
        await conn.execute("UPDATE users SET verified = 0, updated_at = ? WHERE username = ?", (now, target))
        await conn.commit()

    await message.answer(f"✅ Верификация @{target} снята.")
