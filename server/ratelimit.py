import re
import time
from collections import defaultdict

from fastapi import Request
from fastapi.responses import Response, JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

# ── Известные пути ботнетов/сканеров ─────────────────────────────────────────

_BLOCK_EXACT = frozenset({
    "/admin", "/wp-login.php", "/wp-admin",
    "/xmlrpc.php", "/shell", "/cmd", "/console", "/.env",
    "/.git/config", "/config.php", "/phpmyadmin", "/mips",
    "/mips64", "/mipsel", "/arm", "/arm7", "/i686", "/x86_64",
    "/sh", "/bash", "/busybox",
})

_BLOCK_PREFIXES = (
    "/bins/", "/hiddenbin/", "/whoareyou/", "/wp-", "/cgi-bin/",
    "/.git/", "/.env", "/vendor/", "/backup", "/old/",
    "/shell", "/cmd", "/exec", "/system", "/phpinfo",
    "/boatnet", "/mirai", "/gpon", "/setup.cgi",
    "/telescope", "/actuator", "/solr", "/manager/",
    "//",
)

_BLOCK_RE = re.compile(
    r"\.(php|asp|aspx|jsp|cgi|pl|py|rb|sh|bat|exe|env|bak|sql|conf|cfg|ini|log|tar|gz|zip)$",
    re.IGNORECASE,
)

_FORBIDDEN = Response(status_code=403)

# Статические файлы не лимитируем
_STATIC_PREFIXES = ("/img/", "/web/", "/appimg/", "/emoji/", "/emoji", "/api/emoji")

# ── Rate limits ───────────────────────────────────────────────────────────────

_LIMITS = {
    "heavy":   (30, 10),
    "auth":    (10, 60),
    "default": (60, 10),
}

_counters: dict[str, dict[str, list[float]]] = defaultdict(lambda: defaultdict(list))


def _get_bucket(path: str) -> str:
    if path.startswith("/posts") or path.startswith("/api/posts"):
        return "heavy"
    if path.startswith("/send-code") or path.startswith("/verify-code"):
        return "auth"
    return "default"


def _get_ip(request: Request) -> str:
    return request.headers.get("CF-Connecting-IP") or request.client.host


def _is_blocked(path: str) -> bool:
    if path in _BLOCK_EXACT:
        return True
    if any(path.startswith(p) for p in _BLOCK_PREFIXES):
        return True
    if _BLOCK_RE.search(path):
        return True
    return False


class RateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        path = request.url.path

        # Блокируем сканеры сразу — без обработки
        if _is_blocked(path):
            return _FORBIDDEN

        # Статику не лимитируем
        if any(path.startswith(p) for p in _STATIC_PREFIXES):
            return await call_next(request)

        ip     = _get_ip(request)
        bucket = _get_bucket(path)
        max_req, window = _LIMITS[bucket]
        now    = time.time()

        timestamps = _counters[ip][bucket]
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
