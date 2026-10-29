"""간단한 호출 제한(서버 메모리). 내 AI 키가 무제한으로 쓰이는 것을 막는다.

- IP당 분당 N회 (CHAT_RATE_LIMIT_PER_MIN, 기본 10)
- 서버 전체 하루 M회 (CHAT_DAILY_LIMIT, 기본 300)
한계: 서버가 재시작되면 초기화되고, 서버가 여러 대면 대수만큼 늘어난다. 학습용 최소 장치다.
"""
import os
import time
from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone

_hits: dict[str, deque] = defaultdict(deque)
_daily = {"day": None, "n": 0}
_KST = timezone(timedelta(hours=9))


class RateLimitExceeded(Exception):
    def __init__(self, message: str, retry_after: int):
        super().__init__(message)
        self.message, self.retry_after = message, retry_after


def _int_env(name: str, default: int) -> int:
    try:
        return int(os.getenv(name) or default)
    except ValueError:
        return default


def check(ip: str, now: float | None = None) -> None:
    now = time.monotonic() if now is None else now
    per_min = _int_env("CHAT_RATE_LIMIT_PER_MIN", 10)
    daily = _int_env("CHAT_DAILY_LIMIT", 300)

    today = datetime.now(_KST).date().isoformat()
    if _daily["day"] != today:
        _daily["day"], _daily["n"] = today, 0
    if _daily["n"] >= daily:
        raise RateLimitExceeded("오늘 사용할 수 있는 채팅 횟수를 모두 썼어요. 내일 다시 시도해 주세요.", 3600)

    q = _hits[ip]
    while q and now - q[0] >= 60:
        q.popleft()
    if len(q) >= per_min:
        raise RateLimitExceeded("요청이 너무 많아요. 잠시 후 다시 시도해 주세요.", int(60 - (now - q[0])) + 1)

    q.append(now)
    _daily["n"] += 1
    if len(_hits) > 1000:  # 오래된 IP 기록 정리
        for k in [k for k, v in _hits.items() if not v]:
            del _hits[k]


def reset() -> None:
    _hits.clear()
    _daily.update({"day": None, "n": 0})
