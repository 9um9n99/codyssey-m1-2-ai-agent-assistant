"""아주 작은 메모리 캐시(서버 프로세스 안에서만 유지).

요약은 data 컬렉션 전체를 읽어야 해서 채팅할 때마다 계산하면 Firestore 읽기가 낭비된다.
그래서 저장해 두고(TTL), 데이터가 바뀌면(추가/수정/삭제) 바로 비운다.
"""
import time

TTL_SECONDS = 1800  # 기록이 바뀌면 clear()로 바로 비우므로 길게 두어도 된다. Firestore 읽기 횟수를 아끼는 게 목적
_store: dict[str, tuple[float, object]] = {}


def get(key: str):
    hit = _store.get(key)
    if hit and time.monotonic() - hit[0] < TTL_SECONDS:
        return hit[1]
    return None


def set(key: str, value) -> None:  # noqa: A001
    _store[key] = (time.monotonic(), value)


def clear() -> None:
    _store.clear()
