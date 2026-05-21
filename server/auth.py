import logging
import secrets
import string
import time

import jwt
from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from config import (
    BLOCK_DURATIONS, JWT_ALGO, JWT_SECRET, POST_COOLDOWN, POST_WINDOW,
    POST_WINDOW_MAX,
)

log = logging.getLogger(__name__)

# ── Post spam protection ──────────────────────────────────────────────────────

_last_post_time: dict[str, float] = {}
_post_history: dict[str, list[float]] = {}


def check_post_rate(username: str) -> None:
    now = time.time()
    last = _last_post_time.get(username, 0)
    if now - last < POST_COOLDOWN:
        remaining = int(POST_COOLDOWN - (now - last))
        raise HTTPException(429, f"Не так быстро! Подожди ещё {remaining} сек.")

    history = _post_history.get(username, [])
    history = [t for t in history if now - t < POST_WINDOW]
    if len(history) >= POST_WINDOW_MAX:
        raise HTTPException(429, "Слишком много постов. Подожди немного.")
    history.append(now)
    _post_history[username] = history
    _last_post_time[username] = now


# ── Auth code state ───────────────────────────────────────────────────────────

pending_codes: dict[str, dict] = {}
username_blocks: dict[str, dict] = {}
ip_blocks: dict[str, dict] = {}
last_send: dict[str, float] = {}
ip_active_username: dict[str, str] = {}


def get_block_duration(level: int) -> int:
    return BLOCK_DURATIONS[min(level, len(BLOCK_DURATIONS) - 1)]


def format_block_time(seconds: int) -> str:
    if seconds < 60:     return f"{seconds} сек."
    if seconds < 3600:   return f"{seconds // 60} мин."
    if seconds < 86400:  return f"{seconds // 3600} ч."
    if seconds < 604800: return f"{seconds // 86400} д."
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


def normalize(username: str) -> str:
    return username.lstrip("@").lower()


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
