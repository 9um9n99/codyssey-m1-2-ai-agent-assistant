"""채팅 API의 요청/응답 모양과 검증 규칙."""
from typing import Annotated

from pydantic import BaseModel, Field, StringConstraints

from app.schemas.data import Person

# 질문 길이를 제한한다: AI 호출 비용(토큰)을 보호하기 위한 입력 검증
ChatMessage = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=1000)]


class ChatRequest(BaseModel):
    message: ChatMessage = Field(description="사용자의 질문")
    conversation_id: str | None = Field(None, max_length=64, description="이어서 채팅할 채팅 id. 비우면 새 채팅")
    me: Person = Field("나", description="비교 대상인 '나'의 이름")


class ChatResponse(BaseModel):
    reply: str
    conversation_id: str | None = None
    title: str | None = None
    message_count: int | None = None
    saved: bool = True  # 답변은 왔는데 채팅 저장에 실패하면 false
