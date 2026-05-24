import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from bot import bot, dp
from config import IMG_DIR, BASE_DIR
from database import init_db
from ratelimit import RateLimitMiddleware
from routes import comments, events, posts, users, web

logging.basicConfig(level=logging.INFO)

WEB_ROOT_DIR = BASE_DIR / "web"
WEB_DIR      = BASE_DIR / "web" / "app"
APP_IMG_DIR  = BASE_DIR / "web" / "app" / "img" / "icons"
EMOJI_DIR    = BASE_DIR / "img" / "emoji"


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    asyncio.create_task(dp.start_polling(bot))
    yield
    await bot.session.close()


app = FastAPI(lifespan=lifespan)

app.mount("/img",      StaticFiles(directory=str(IMG_DIR)),          name="img")
app.mount("/web/app", StaticFiles(directory=str(WEB_DIR)),          name="web-app")
app.mount("/web",      StaticFiles(directory=str(WEB_ROOT_DIR)),     name="web")
APP_IMG_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/appimg", StaticFiles(directory=str(APP_IMG_DIR)),  name="appimg")
EMOJI_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/emoji",  StaticFiles(directory=str(EMOJI_DIR)),    name="emoji")

app.add_middleware(RateLimitMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["*"],
)

app.include_router(users.router)
app.include_router(posts.router)
app.include_router(comments.router)
app.include_router(events.router)
app.include_router(web.router)
