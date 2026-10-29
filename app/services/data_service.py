"""data 컬렉션 CRUD 로직. HTTP를 모른다(상태코드는 라우터가 정한다).

문서 ID는 "{person}_{date}" 로 정한다. 하루치 문서 하나가 그날의 합계(value)를 갖고,
그날 여러 번 추가한 기록은 entries 목록에 쌓는다. (요약·순위는 합계 value만 쓰므로 그대로 동작한다)
entries가 없는 예전 문서는 value 하나짜리 기록으로 본다.
"""
import uuid
from datetime import datetime

from google.api_core import exceptions as gexc
from google.cloud import firestore
from google.cloud.firestore_v1 import FieldFilter

from app.schemas.data import DataCreate, DataUpdate, EntryUpdate
from app.services import cache, persona

COLLECTION = "data"
DAY_MINUTES = 1440


class DayLimitError(Exception):
    """하루 합계가 24시간을 넘음."""


class DataNotFoundError(Exception):
    """해당 id의 기록이 없음."""


def _entries(d: dict) -> list[dict]:
    e = d.get("entries")
    if e is not None:
        return e
    if d.get("value", 0) > 0:
        return [{"id": "e0", "minutes": d["value"], "at": "", "memo": d.get("memo", "")}]
    return []


def _to_out(doc_id: str, d: dict) -> dict:
    return {
        "id": doc_id, "person": d["person"], "date": d["date"], "value": d["value"],
        "memo": d.get("memo", ""), "entries": _entries(d),
    }


def _total(entries: list[dict]) -> int:
    total = sum(e["minutes"] for e in entries)
    if total > DAY_MINUTES:
        raise DayLimitError(total)
    return total


def create_item(db, item: DataCreate) -> dict:
    """새 기록을 추가한다. 그날 문서가 있으면 그 문서에 한 건 더 쌓는다."""
    date_str = item.date.isoformat()
    doc_id = f"{item.person}_{date_str}"
    ref = db.collection(COLLECTION).document(doc_id)
    entry = {"id": uuid.uuid4().hex[:8], "minutes": item.value, "at": item.at or "", "memo": item.memo}
    snap = ref.get()
    if snap.exists:
        d = snap.to_dict()
        entries = _entries(d) + [entry]
        total = _total(entries)
        d.update({"entries": entries, "value": total, "memo": d.get("memo") or item.memo})
        ref.set(d)
    else:
        d = {"person": item.person, "date": date_str, "value": item.value, "memo": item.memo, "entries": [entry]}
        ref.set(d)
    cache.clear()  # 데이터가 바뀌었으니 요약 캐시를 비운다
    return _to_out(doc_id, d)


def list_items(db, person: str | None = None, limit: int = 100) -> list[dict]:
    # 같은 조회를 되풀이하면 Firestore 읽기가 크게 늘어서, 날짜별로 짧게 저장해 둔다.
    # 기록이 바뀌면 cache.clear()로 비워지고, 날짜가 바뀌면 키가 달라져 새로 읽는다.
    key = f"list:{datetime.now(persona.KST).date().isoformat()}:{person or ''}:{limit}"
    hit = cache.get(key)
    if hit is not None:
        return hit
    col = db.collection(COLLECTION)
    if person:
        # 단일 조건 조회 후 파이썬에서 정렬 (복합 인덱스를 만들지 않기 위해)
        docs = col.where(filter=FieldFilter("person", "==", person)).stream()
        rows = [_to_out(s.id, s.to_dict()) for s in docs]
        rows.sort(key=lambda r: r["date"], reverse=True)
        rows = rows[:limit]
    else:
        docs = col.order_by("date", direction=firestore.Query.DESCENDING).limit(limit).stream()
        rows = [_to_out(s.id, s.to_dict()) for s in docs]
    cache.set(key, rows)
    return rows


def update_item(db, doc_id: str, item: DataUpdate) -> dict:
    """하루 전체를 한 건으로 덮어쓴다. (건별 수정은 update_entry)"""
    ref = db.collection(COLLECTION).document(doc_id)
    try:
        ref.update({
            "value": item.value, "memo": item.memo,
            "entries": [{"id": "e0", "minutes": item.value, "at": "", "memo": item.memo}] if item.value else [],
        })
    except gexc.NotFound as e:
        raise DataNotFoundError(doc_id) from e
    cache.clear()
    return _to_out(doc_id, ref.get().to_dict())


def delete_item(db, doc_id: str) -> None:
    ref = db.collection(COLLECTION).document(doc_id)
    if not ref.get().exists:
        raise DataNotFoundError(doc_id)
    ref.delete()
    cache.clear()


def _find(db, doc_id: str, entry_id: str):
    ref = db.collection(COLLECTION).document(doc_id)
    snap = ref.get()
    if not snap.exists:
        raise DataNotFoundError(doc_id)
    d = snap.to_dict()
    entries = _entries(d)
    idx = next((i for i, e in enumerate(entries) if e["id"] == entry_id), None)
    if idx is None:
        raise DataNotFoundError(entry_id)
    return ref, d, entries, idx


def update_entry(db, doc_id: str, entry_id: str, body: EntryUpdate) -> dict:
    ref, d, entries, idx = _find(db, doc_id, entry_id)
    entries[idx] = {**entries[idx], "minutes": body.minutes, "memo": body.memo}
    d.update({"entries": entries, "value": _total(entries)})
    ref.set(d)
    cache.clear()
    return _to_out(doc_id, d)


def delete_entry(db, doc_id: str, entry_id: str) -> dict | None:
    """건 하나를 지운다. 마지막 건이면 그날 문서도 함께 지운다(None 반환)."""
    ref, d, entries, idx = _find(db, doc_id, entry_id)
    del entries[idx]
    if not entries:
        ref.delete()
        cache.clear()
        return None
    d.update({"entries": entries, "value": sum(e["minutes"] for e in entries)})
    ref.set(d)
    cache.clear()
    return _to_out(doc_id, d)
