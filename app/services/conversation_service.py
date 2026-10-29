"""conversations 컬렉션 로직. HTTP를 모른다.

문서 모양: {title, created_at, updated_at, message_count, last_message, messages: [{role, content, created_at}]}
- 목록 조회는 select() 로 필요한 필드만 읽어서 messages(무거운 부분)를 가져오지 않는다.
- /api/chat 이 매 턴마다 append_messages 로 채팅을 자동 저장한다.
"""
from datetime import datetime, timezone

from google.cloud import firestore

from app.schemas.conversation import MAX_MESSAGES, ConversationCreate

COLLECTION = "conversations"
_LIST_FIELDS = ["title", "created_at", "updated_at", "message_count", "last_message"]
_TITLE_LEN = 30
_PREVIEW_LEN = 80


class ConversationNotFoundError(Exception):
    """해당 id의 채팅이 없음."""


class ConversationTooLongError(Exception):
    """채팅에 담을 수 있는 메시지 수(MAX_MESSAGES)를 넘음."""


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="microseconds")


def _oneline(text: str, n: int) -> str:
    return " ".join(text.split())[:n]


def _make_title(messages: list[dict]) -> str:
    first_user = next((m["content"] for m in messages if m["role"] == "user"), None)
    return _oneline(first_user, _TITLE_LEN) if first_user else "새 채팅"


def _stamp(messages: list[dict], now: str) -> list[dict]:
    return [{"role": m["role"], "content": m["content"], "created_at": now} for m in messages]


def _full(doc_id: str, d: dict) -> dict:
    return {"id": doc_id, **{k: d[k] for k in ("title", "created_at", "updated_at", "message_count")}, "messages": d["messages"]}


def create_conversation(db, body: ConversationCreate) -> dict:
    msgs = [m.model_dump() for m in body.messages]
    return create_with_messages(db, msgs, title=body.title)


def create_with_messages(db, messages: list[dict], title: str | None = None) -> dict:
    now = _now()
    stamped = _stamp(messages, now)
    doc = {
        "title": title or _make_title(messages),
        "created_at": now,
        "updated_at": now,
        "message_count": len(stamped),
        "last_message": _oneline(stamped[-1]["content"], _PREVIEW_LEN),
        "messages": stamped,
    }
    ref = db.collection(COLLECTION).document()  # Firestore 가 임의 ID를 만든다
    ref.set(doc)
    return _full(ref.id, doc)


def list_conversations(db, limit: int = 30) -> list[dict]:
    query = (
        db.collection(COLLECTION)
        .select(_LIST_FIELDS)
        .order_by("updated_at", direction=firestore.Query.DESCENDING)
        .limit(limit)
    )
    out = []
    for s in query.stream():
        d = s.to_dict()
        out.append({"id": s.id, **{k: d.get(k) for k in _LIST_FIELDS}})
    return out


def get_conversation(db, conv_id: str) -> dict:
    snap = db.collection(COLLECTION).document(conv_id).get()
    if not snap.exists:
        raise ConversationNotFoundError(conv_id)
    return _full(snap.id, snap.to_dict())


def delete_conversation(db, conv_id: str) -> None:
    ref = db.collection(COLLECTION).document(conv_id)
    if not ref.get().exists:
        raise ConversationNotFoundError(conv_id)
    ref.delete()


def append_messages(db, conv_id: str, messages: list[dict]) -> dict:
    """기존 채팅 끝에 메시지를 덧붙인다. (채팅 한 턴 = user 질문 + assistant 답변)"""
    ref = db.collection(COLLECTION).document(conv_id)
    snap = ref.get()
    if not snap.exists:
        raise ConversationNotFoundError(conv_id)
    if snap.to_dict()["message_count"] + len(messages) > MAX_MESSAGES:
        raise ConversationTooLongError(conv_id)
    now = _now()
    stamped = _stamp(messages, now)
    ref.update(
        {
            "messages": firestore.ArrayUnion(stamped),
            "message_count": firestore.Increment(len(stamped)),
            "updated_at": now,
            "last_message": _oneline(stamped[-1]["content"], _PREVIEW_LEN),
        }
    )
    return get_conversation(db, conv_id)
