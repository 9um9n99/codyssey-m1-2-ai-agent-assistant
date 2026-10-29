"""요청/응답 데이터의 모양과 검증 규칙(Pydantic).

잘못된 입력은 서버 입구(라우터에 도달하기 전)에서 422 오류로 막힌다.
"""
from datetime import date as Date
from typing import Annotated

from pydantic import BaseModel, Field, StringConstraints

# 사람 이름: 앞뒤 공백 제거, 1~20자, '/' 금지 (문서 ID에 쓰이므로)
Person = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=20, pattern=r"^[^/]+$")
]
# 하루 학습 시간(분): 0~1440 (하루는 1440분)
Minutes = Annotated[int, Field(ge=0, le=1440, description="하루 학습 시간(분), 0~1440")]
Memo = Annotated[str, StringConstraints(strip_whitespace=True, max_length=200)]


# 기록한 시각 "HH:MM" (선택). 하루 안에서 여러 번 추가한 기록을 구분하는 데 쓴다.
Clock = Annotated[str, StringConstraints(pattern=r"^([01]\d|2[0-3]):[0-5]\d$")]


class DataCreate(BaseModel):
    person: Person = Field(description="기록 주인 이름 (예: 민준, 나)")
    date: Date = Field(description="날짜 (YYYY-MM-DD)")
    value: Minutes
    memo: Memo = ""
    at: Clock | None = Field(None, description="기록한 시각 HH:MM (선택)")


class DataUpdate(BaseModel):
    """수정은 value와 memo만 가능하다. (person, date는 기록의 신원이라 바꿀 수 없음)"""

    value: Minutes
    memo: Memo = ""


class EntryUpdate(BaseModel):
    minutes: Minutes
    memo: Memo = ""


class EntryOut(BaseModel):
    id: str
    minutes: int
    at: str = ""
    memo: str = ""


class DataOut(BaseModel):
    id: str
    person: str
    date: str
    value: int
    memo: str
    entries: list[EntryOut] = []
