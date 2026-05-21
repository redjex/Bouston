import time
from collections import defaultdict

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

# Статические файлы не считаем — только API
_API_PREFIXES = ("/api/", "/posts", "/users", "/user-info", "/send-code", "/verify-code", "/profile", "/events", "/post/")
_STATIC_PREFIXES = ("/img/", "/web/", "/appimg/")

# Лимиты: (макс запросов, окно в секундах)
_LIMITS = {
    "heavy": (30, 10),   # /posts, /api/posts — 30 req / 10 сек
    "auth":  (10, 60),   # /send-code, /verify-code — 10 req / мин
    "default": (60, 10), # всё остальное — 60 req / 10 сек
}

# ip → { bucket: [timestamps] }
_counters: dict[str, dict[str, list[float]]] = defaultdict(lambda: defaultdict(list))


def _get_bucket(path: str) -> str:
    if path.startswith("/posts") or path.startswith("/api/posts"):
        return "heavy"
    if path.startswith("/send-code") or path.startswith("/verify-code"):
        return "auth"
    return "default"


def _get_ip(request: Request) -> str:
    return request.headers.get("CF-Connecting-IP") or request.client.host


class RateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        path = request.url.path

        # Статику не ограничиваем
        if any(path.startswith(p) for p in _STATIC_PREFIXES):
            return await call_next(request)

        ip     = _get_ip(request)
        bucket = _get_bucket(path)
        max_req, window = _LIMITS[bucket]
        now    = time.time()

        timestamps = _counters[ip][bucket]
        # Чистим старые
        timestamps[:] = [t for t in timestamps if now - t < window]

        if len(timestamps) >= max_req:
            retry_after = int(window - (now - timestamps[0])) + 1
            return JSONResponse(
                {"detail": f"Слишком много запросов. Подожди {retry_after} сек."},
                status_code=429,
                headers={"Retry-After": str(retry_after)},
            )

        timestamps.append(now)
        return await call_next(request)
