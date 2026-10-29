"""요약 API 응답의 모양 (Swagger 문서에도 그대로 표시된다)."""
from pydantic import BaseModel


class Extreme(BaseModel):
    value: int
    date: str
    person: str | None = None


class Trend(BaseModel):
    label: str  # 증가 / 감소 / 유지 / 데이터 부족 / 데이터 없음
    change_pct: float | None = None
    recent_avg: int | None = None  # 최근 14일 평균(분)
    prev_avg: int | None = None  # 그 직전 14일 평균(분)


class PersonSummary(BaseModel):
    person: str
    label: str | None = None  # 친구 유형(꾸준형 등). 내 기록이면 null
    count: int
    period: str
    total_minutes: int
    average_minutes: int  # 휴식일(0분) 포함 평균
    studied_days_average_minutes: int | None = None  # 공부한 날만의 평균
    rest_days: int
    max: Extreme
    min_studied: Extreme | None = None  # 공부한 날 중 최소
    weekday_average: int | None = None
    weekend_average: int | None = None
    trend: Trend
    enough_data: bool  # 순위에 들어갈 기록이 있는지(1건 이상)
    rank: int | None = None


class GroupMetrics(BaseModel):
    total_minutes: int
    average_minutes: int  # 사람-일 기준 전체 평균
    max: Extreme
    min_studied: Extreme | None = None


class TodayFriend(BaseModel):
    person: str
    label: str | None = None
    minutes: int  # 지금 시각까지 쌓인 학습 시간(분)


class TodayOut(BaseModel):
    """오늘 하루가 진행 중인 값. 친구들의 값은 시간이 지날수록 늘어난다."""

    date: str
    as_of: str  # 기준 시각(한국 시간, HH:MM)
    me_rank: int  # 오늘 순위(같은 시각까지 쌓인 시간 기준, 나 포함)
    rank_total: int
    me_minutes: int | None = None  # 오늘 내 기록(없으면 null)
    friends_avg_minutes: int
    friends: list[TodayFriend]


class FriendProfile(BaseModel):
    name: str
    label: str
    intro: str
    pattern: str
    when: str


class FriendsOut(BaseModel):
    basis: str
    friends: list[FriendProfile]


class SummaryOut(BaseModel):
    period: str | None = None
    count: int  # 스터디 메이트(나 제외) 기록 수
    people_count: int
    metrics: GroupMetrics | None = None
    trend: Trend
    people: list[PersonSummary]  # 스터디 메이트별 요약 (순위순)
    me_name: str
    me: PersonSummary | None = None  # '나'의 기록이 없으면 null
    rank_total: int  # 순위가 매겨진 인원 수(나 포함)
    today: TodayOut | None = None  # 오늘 지금까지(하루 진행 중)
    prompt_text: str | None = None  # include_prompt=true 일 때만
