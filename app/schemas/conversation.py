"""채팅 목록 API의 요청/응답 모양과 검증 규칙."""
from typing import Annotated, Literal

from pydantic import BaseModel, Field, StringConstraints

MAX_MESSAGES = 100  # 채팅 하나에 담을 수 있는 최대 메시지 수 (Firestore 문서 1MiB 한도와 비용 보호)

Content = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=4000)]
Title = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=60)]


class MessageIn(BaseModel):
    role: Literal["user", "assistant"]
    content: Content


class Message(MessageIn):
    created_at: str | None = None  # 서버가 저장 시각을 붙인다


class ConversationCreate(BaseModel):
    title: Title | None = Field(None, description="비우면 첫 번째 user 메시지 앞부분으로 자동 생성")
    messages: list[MessageIn] = Field(min_length=1, max_length=MAX_MESSAGES)


class ConversationOut(BaseModel):
    id: str
    title: str
    created_at: str
    updated_at: str
    message_count: int
    messages: list[Message]


class ConversationListItem(BaseModel):
    """목록용: 메시지 본문(messages)은 싣지 않는다. 불러오기는 GET /api/conversations/{id}."""

    id: str
    title: str
    created_at: str
    updated_at: str
    message_count: int
    last_message: str | None = None
