import json
import time
import uuid
from pathlib import Path

import aiosqlite

from config import DB_PATH, SERVER_BASE

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

COMMENTS_QUERY = """
    SELECT c.*,
           u.display_name, u.first_name, u.profile_username,
           u.avatar_path  AS author_avatar_path,
           u.verified     AS author_verified,
           u.updated_at   AS updated_at
    FROM comments c
    JOIN users u ON u.username = c.tg_username
"""


async def get_db() -> aiosqlite.Connection:
    conn = await aiosqlite.connect(DB_PATH)
    conn.row_factory = aiosqlite.Row
    return conn


async def init_db() -> None:
    async with aiosqlite.connect(DB_PATH) as conn:
        conn.row_factory = aiosqlite.Row
        await conn.execute("""
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
        cursor = await conn.execute("PRAGMA table_info(users)")
        cols = [r[1] for r in await cursor.fetchall()]
        if 'bio'              not in cols: await conn.execute("ALTER TABLE users ADD COLUMN bio              TEXT")
        if 'display_name'     not in cols: await conn.execute("ALTER TABLE users ADD COLUMN display_name     TEXT")
        if 'profile_username' not in cols: await conn.execute("ALTER TABLE users ADD COLUMN profile_username TEXT")
        if 'verified'         not in cols: await conn.execute("ALTER TABLE users ADD COLUMN verified         INTEGER DEFAULT 0")
        if 'banner_path'      not in cols: await conn.execute("ALTER TABLE users ADD COLUMN banner_path      TEXT")

        await conn.execute("""
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
        cursor = await conn.execute("PRAGMA table_info(posts)")
        pcols = [r[1] for r in await cursor.fetchall()]
        if 'edited_at' not in pcols: await conn.execute("ALTER TABLE posts ADD COLUMN edited_at REAL")

        await conn.execute("""
            CREATE TABLE IF NOT EXISTS post_reactions (
                post_id     INTEGER NOT NULL,
                tg_username TEXT NOT NULL,
                emoji       TEXT NOT NULL,
                created_at  REAL NOT NULL,
                PRIMARY KEY (post_id, tg_username, emoji),
                FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
            )
        """)
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS comments (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                post_id     INTEGER NOT NULL,
                tg_username TEXT NOT NULL,
                text        TEXT NOT NULL,
                created_at  REAL NOT NULL,
                FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
            )
        """)
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS comment_likes (
                comment_id  INTEGER NOT NULL,
                tg_username TEXT NOT NULL,
                created_at  REAL NOT NULL,
                PRIMARY KEY (comment_id, tg_username),
                FOREIGN KEY (comment_id) REFERENCES comments(id) ON DELETE CASCADE
            )
        """)
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS auth_sessions (
                id          TEXT PRIMARY KEY,
                tg_username TEXT NOT NULL,
                user_agent  TEXT,
                ip          TEXT,
                device      TEXT,
                created_at  REAL NOT NULL,
                last_seen_at REAL NOT NULL,
                revoked_at  REAL,
                FOREIGN KEY (tg_username) REFERENCES users(username) ON DELETE CASCADE
            )
        """)
        await conn.commit()

        await conn.execute("""
            UPDATE users SET profile_username = LOWER(profile_username)
            WHERE profile_username IS NOT NULL AND profile_username != LOWER(profile_username)
        """)
        await conn.commit()


async def db_upsert_user(
    username: str,
    user_id: int,
    chat_id: int,
    first_name: str,
    last_name: str | None,
    is_premium: bool,
) -> None:
    now = time.time()
    async with aiosqlite.connect(DB_PATH) as conn:
        await conn.execute("""
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
        """, (username, user_id, chat_id, first_name, last_name, int(is_premium), now, now))
        await conn.commit()


async def db_get_user(username: str) -> aiosqlite.Row | None:
    async with aiosqlite.connect(DB_PATH) as conn:
        conn.row_factory = aiosqlite.Row
        cursor = await conn.execute("SELECT * FROM users WHERE username = ?", (username,))
        return await cursor.fetchone()


async def db_set_registered(username: str, avatar_path: str | None, bio: str | None) -> None:
    now = time.time()
    async with aiosqlite.connect(DB_PATH) as conn:
        await conn.execute(
            "UPDATE users SET registered = 1, avatar_path = ?, bio = ?, updated_at = ? WHERE username = ?",
            (avatar_path, bio, now, username),
        )
        await conn.commit()


def describe_user_agent(user_agent: str) -> str:
    ua = user_agent or ""
    browser = "Браузер"
    os = "Устройство"

    if "Edg/" in ua:
        browser = "Microsoft Edge"
    elif "OPR/" in ua:
        browser = "Opera"
    elif "Chrome/" in ua and "Edg/" not in ua:
        browser = "Chrome"
    elif "Firefox/" in ua:
        browser = "Firefox"
    elif "Safari/" in ua and "Chrome/" not in ua:
        browser = "Safari"

    if "Android" in ua:
        os = "Android"
    elif any(item in ua for item in ("iPhone", "iPad", "iPod")):
        os = "iOS"
    elif "Windows" in ua:
        os = "Windows"
    elif "Mac OS X" in ua or "Macintosh" in ua:
        os = "macOS"
    elif "Linux" in ua:
        os = "Linux"

    return f"{browser} на {os}"


async def db_create_auth_session(username: str, user_agent: str, ip: str) -> str:
    session_id = uuid.uuid4().hex
    now = time.time()
    async with aiosqlite.connect(DB_PATH) as conn:
        await conn.execute(
            """
            INSERT INTO auth_sessions (id, tg_username, user_agent, ip, device, created_at, last_seen_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (session_id, username, user_agent, ip, describe_user_agent(user_agent), now, now),
        )
        await conn.commit()
    return session_id


async def db_touch_auth_session(session_id: str, username: str) -> bool:
    if not session_id:
        return False
    async with aiosqlite.connect(DB_PATH) as conn:
        cursor = await conn.execute(
            """
            UPDATE auth_sessions
            SET last_seen_at = ?
            WHERE id = ? AND tg_username = ? AND revoked_at IS NULL
            """,
            (time.time(), session_id, username),
        )
        await conn.commit()
        return cursor.rowcount > 0


async def db_list_auth_sessions(username: str) -> list[dict]:
    async with aiosqlite.connect(DB_PATH) as conn:
        conn.row_factory = aiosqlite.Row
        cursor = await conn.execute(
            """
            SELECT id, device, ip, created_at, last_seen_at, revoked_at
            FROM auth_sessions
            WHERE tg_username = ? AND revoked_at IS NULL
            ORDER BY last_seen_at DESC
            LIMIT 30
            """,
            (username,),
        )
        rows = await cursor.fetchall()
    return [dict(row) for row in rows]


async def db_revoke_auth_session(username: str, session_id: str) -> bool:
    async with aiosqlite.connect(DB_PATH) as conn:
        cursor = await conn.execute(
            """
            UPDATE auth_sessions
            SET revoked_at = COALESCE(revoked_at, ?)
            WHERE id = ? AND tg_username = ?
            """,
            (time.time(), session_id, username),
        )
        await conn.commit()
        return cursor.rowcount > 0


def build_post_response(row: aiosqlite.Row, viewer: str, reactions: dict, my_reactions: list, comment_count: int) -> dict:
    images_filenames = json.loads(row["images"] or "[]")
    image_urls = [f"{SERVER_BASE}/img/posts/{f}" for f in images_filenames]

    avatar_url = None
    if row["author_avatar_path"] and Path(row["author_avatar_path"]).exists():
        t = int(row["updated_at"] or 0)
        avatar_url = f"{SERVER_BASE}/img/{row['tg_username']}.jpg?t={t}"

    return {
        "id":           row["id"],
        "text":         row["text"] or "",
        "images":       image_urls,
        "pinned":       bool(row["pinned"]),
        "pinnedAt":     int(row["pinned_at"] * 1000) if row["pinned_at"] else None,
        "createdAt":    int(row["created_at"] * 1000),
        "editedAt":     int(row["edited_at"] * 1000) if row["edited_at"] else None,
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


async def fetch_post_extras(conn: aiosqlite.Connection, post_id: int, viewer: str):
    cursor = await conn.execute(
        "SELECT emoji, tg_username FROM post_reactions WHERE post_id = ?", (post_id,)
    )
    rx_rows = await cursor.fetchall()
    reactions: dict[str, int] = {}
    my_reactions: list[str] = []
    for rx in rx_rows:
        reactions[rx["emoji"]] = reactions.get(rx["emoji"], 0) + 1
        if viewer and rx["tg_username"] == viewer:
            my_reactions.append(rx["emoji"])
    cursor = await conn.execute("SELECT COUNT(*) FROM comments WHERE post_id = ?", (post_id,))
    count_row = await cursor.fetchone()
    comment_count = count_row[0]
    return reactions, my_reactions, comment_count


def build_comment_response(row: aiosqlite.Row, viewer: str, likes_count: int, my_like: bool) -> dict:
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
            "tgUsername":  row["tg_username"],
            "displayName": row["display_name"] or row["first_name"] or row["tg_username"],
            "avatarUrl":   avatar_url,
            "isVerified":  bool(row["author_verified"]),
        },
    }


async def fetch_comment_extras(conn: aiosqlite.Connection, comment_id: int, viewer: str):
    cursor = await conn.execute(
        "SELECT COUNT(*) FROM comment_likes WHERE comment_id = ?", (comment_id,)
    )
    row = await cursor.fetchone()
    likes_count = row[0]
    my_like = False
    if viewer:
        cursor = await conn.execute(
            "SELECT 1 FROM comment_likes WHERE comment_id = ? AND tg_username = ?",
            (comment_id, viewer),
        )
        my_like = (await cursor.fetchone()) is not None
    return likes_count, my_like
