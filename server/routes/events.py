import asyncio

import jwt
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse

from config import JWT_ALGO, JWT_SECRET
from database import db_touch_auth_session
from sse import _sse_subscribers

router = APIRouter()


@router.get("/events")
async def sse_events(token: str, request: Request):
    try:
        payload  = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
        username = payload.get("sub")
        session_id = payload.get("jti")
        if not username:
            raise HTTPException(401, "Invalid token")
        if session_id and not await db_touch_auth_session(session_id, username):
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
