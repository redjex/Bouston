import os
import re
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

BOT_TOKEN  = os.getenv("BOT_TOKEN")
ADMIN_IDS  = {int(x) for x in os.getenv("ADMIN_IDS", "").split(",") if x.strip().isdigit()}
JWT_SECRET = os.getenv("JWT_SECRET", "")
JWT_ALGO   = "HS256"
JWT_TTL    = 86400 * 30  # 30 дней

if not JWT_SECRET:
    raise RuntimeError("JWT_SECRET не задан в .env — сервер не запустится без него")

BASE_DIR      = Path(__file__).parent
IMG_DIR       = BASE_DIR / "img"
POSTS_IMG_DIR = IMG_DIR / "posts"
BANNERS_DIR   = IMG_DIR / "banners"
DB_PATH       = BASE_DIR / "bouston.db"
BANER_PATH    = BASE_DIR / "baner.png"
CODE_PATH     = BASE_DIR / "code.png"
WEB_DIR       = BASE_DIR.parent / "web"

IMG_DIR.mkdir(exist_ok=True)
POSTS_IMG_DIR.mkdir(exist_ok=True)
BANNERS_DIR.mkdir(exist_ok=True)

SERVER_BASE = "https://bouston.xyz"

# Rate limits
POST_COOLDOWN   = 10
POST_WINDOW     = 60
POST_WINDOW_MAX = 5
SEND_COOLDOWN   = 300
CODE_TTL        = 300
BLOCK_DURATIONS = [60, 300, 1800, 3600, 86400, 604800]

# Validation limits
MAX_POST_TEXT    = 5_000
MAX_COMMENT_TEXT = 2_000
MAX_BIO_LEN      = 300
MAX_NAME_LEN     = 60
MAX_IMAGES       = 10
MAX_LIMIT        = 100
MAX_AVATAR_BYTES = 5 * 1024 * 1024

USERNAME_RE = re.compile(r'^[a-zA-Z0-9_]{3,20}$')
