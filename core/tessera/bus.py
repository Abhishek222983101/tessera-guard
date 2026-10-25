"""In-process event bus + replay ring. Same shape as the NATS subjects in production (SYSTEM-ARCHITECTURE §5)."""
from __future__ import annotations
import asyncio, json, time
from collections import deque
from typing import Any

RING = 6000


class Bus:
    def __init__(self):
        self.seq = 0
        self.ring: deque[dict] = deque(maxlen=RING)
        self.subs: set[asyncio.Queue] = set()
        self.loop: asyncio.AbstractEventLoop | None = None

    def publish(self, type_: str, data: Any) -> int:
        self.seq += 1
        ev = {"seq": self.seq, "type": type_, "ts": time.time(), "data": json.loads(json.dumps(data, default=_enc))}
        self.ring.append(ev)
        for q in list(self.subs):
            try:
                if self.loop and self.loop.is_running():
                    self.loop.call_soon_threadsafe(_put, q, ev)
                else:
                    _put(q, ev)
            except Exception:
                self.subs.discard(q)
        return self.seq

    def since(self, seq: int, limit: int = 500) -> list[dict]:
        return [e for e in self.ring if e["seq"] > seq][:limit]

    def subscribe(self) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue(maxsize=2000)
        self.subs.add(q)
        return q

    def unsubscribe(self, q: asyncio.Queue):
        self.subs.discard(q)

    def clear(self):
        self.ring.clear()


def _put(q: asyncio.Queue, ev: dict):
    try:
        q.put_nowait(ev)
    except asyncio.QueueFull:
        pass  # slow consumer: it will catch up via /events?since=


def _enc(o):
    if hasattr(o, "model_dump"):
        return o.model_dump(mode="json")
    if hasattr(o, "__dict__"):
        return o.__dict__
    return str(o)


BUS = Bus()
