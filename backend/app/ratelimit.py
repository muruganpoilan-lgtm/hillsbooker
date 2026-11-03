"""A small in-memory rate limiter that slows down password guessing and sign-up spam.
The API runs as one process, so counting in memory is enough. Counts reset when the API restarts."""
import threading
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request

_lock = threading.Lock()
_hits: dict[str, deque] = defaultdict(deque)


def client_ip(request: Request) -> str:
    # Caddy sets X-Forwarded-For to the visitor's address; the API port is not open to the internet.
    fwd = request.headers.get("x-forwarded-for", "")
    if fwd:
        return fwd.split(",")[0].strip()[:45]
    return request.client.host if request.client else "unknown"


def _prune(q: deque, window: float, now: float) -> None:
    while q and now - q[0] > window:
        q.popleft()


def count(key: str, window: float) -> int:
    now = time.monotonic()
    with _lock:
        q = _hits.get(key)
        if not q:
            return 0
        _prune(q, window, now)
        if not q:
            _hits.pop(key, None)
        return len(q)


def hit(key: str) -> None:
    now = time.monotonic()
    with _lock:
        if len(_hits) > 50_000:  # keep memory bounded if someone floods with random keys
            for k in list(_hits)[:10_000]:
                _hits.pop(k, None)
        _hits[key].append(now)


def clear(key: str) -> None:
    with _lock:
        _hits.pop(key, None)


def guard(key: str, limit: int, window: float, message: str) -> None:
    """Raises 429 when `key` already has `limit` hits inside `window` seconds."""
    if count(key, window) >= limit:
        raise HTTPException(429, message)


def reset_for_tests() -> None:
    with _lock:
        _hits.clear()
