import asyncio
import json

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
