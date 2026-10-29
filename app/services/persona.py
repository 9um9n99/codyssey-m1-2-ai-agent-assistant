"""가상 스터디 친구 9명의 설정(페르소나)과 '하루가 흘러가는' 학습 시간 생성기.

- 모든 수치는 서비스 설계용 가정이며 실제 통계가 아니다.
- 같은 (이름, 날짜)면 항상 같은 값이 나온다(시드 고정). 그래서 서버가 여러 대여도, 재시작해도 결과가 같다.
- day_total: 하루가 끝났을 때의 총 학습 시간(분)
- accrued : 하루 중 지금 시각까지 쌓인 학습 시간(분). 친구마다 공부하는 시간대가 달라서 시간이 흐를수록 늘어난다.
"""
import random
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from typing import Callable

KST = timezone(timedelta(hours=9))
SEED = 20261021
START = date(2026, 9, 16)  # 시드 데이터의 첫 날짜
CYCLE = 35  # 추세형 유형은 35일마다 새 주기를 시작한다(무한히 커지거나 줄지 않게)

BASIS = (
    "친구 9명은 모두 가상의 인물이고, 숫자는 실제 조사가 아니라 이 서비스를 위해 만든 예시예요. "
    "공부 시간이 긴 사람부터 짧은 사람까지 9가지 유형이 있어요. "
    "이기는 것보다, 나와 비슷한 친구를 기준점으로 삼아 보세요."
)


def _clamp(v: float, lo: int = 0, hi: int = 600) -> float:
    return max(lo, min(hi, v))


def _weekend(d: date) -> bool:
    return d.weekday() >= 5


# ---- 유형별 '그날의 기본 학습 분' (t = 주기 안에서 몇 번째 날인지) ----------------
def _steady(t, d, r):
    return r.gauss(270, 25)


def _weekend_binge(t, d, r):
    return r.gauss(360, 40) if _weekend(d) else r.gauss(120, 30)


def _exam_rush(t, d, r):
    return 150 + (t / (CYCLE - 1)) * 250 + r.gauss(0, 30)


def _burnout(t, d, r):
    return max(120, 330 - t * 6) + r.gauss(0, 25)


def _slump(t, d, r):
    if 12 <= t <= 20:
        return r.gauss(90, 30)
    if 21 <= t <= 26:
        return r.gauss(180, 35)
    return r.gauss(260, 30)


def _night(t, d, r):
    return r.gauss(240, 35)


def _erratic(t, d, r):
    return r.gauss(200, 120)


def _newbie(t, d, r):
    return 90 + t * 5 + r.gauss(0, 20)


def _average(t, d, r):
    return r.gauss(210, 40)


# ---- 공부하는 시간대(0~23시 각 시간대의 상대적 비중) ---------------------------
def _w(*hours: int) -> list[float]:
    w = [0.0] * 24
    for h in hours:
        w[h % 24] += 1.0
    return w


def _hours_steady(d, r):
    return _w(9, 10, 11, 14, 15, 16, 17, 20, 21)


def _hours_weekend(d, r):
    return _w(10, 11, 14, 15, 16, 17, 18) if _weekend(d) else _w(20, 21, 22)


def _hours_exam(d, r):
    return _w(10, 11, 14, 15, 16, 17, 18, 20, 21, 22)


def _hours_burnout(d, r):
    return _w(7, 8, 9, 10, 14, 15)


def _hours_slump(d, r):
    return _w(10, 11, 15, 16, 17, 21)


def _hours_night(d, r):
    return _w(22, 23, 0, 1, 2, 14)


def _hours_erratic(d, r):
    # 날마다 공부 블록의 위치가 달라진다(그날 시드로 고정)
    starts = r.sample(range(7, 22), k=r.choice([2, 3]))
    return _w(*[h + i for h in starts for i in range(2)])


def _hours_newbie(d, r):
    return _w(10, 11, 14, 15, 16, 17) if _weekend(d) else _w(19, 20, 21, 22)


def _hours_average(d, r):
    return _w(10, 11, 15, 16, 20, 21)


@dataclass(frozen=True)
class Persona:
    name: str
    label: str
    intro: str
    pattern: str  # 하루 분량 패턴
    when: str  # 주로 공부하는 시간대
    rest_p: float
    prefix: str
    total: Callable
    hours: Callable


FRIENDS: list[Persona] = [
    Persona("민준", "꾸준형", "매일 비슷한 양을 꾸준히 해요.",
            "평일과 주말 상관없이 하루 4시간 30분 안팎이에요.", "오전, 오후, 저녁에 나눠서 해요.", 0.03, "", _steady, _hours_steady),
    Persona("서연", "주말 몰아하기형", "평일엔 짧게, 주말엔 길게 해요.",
            "평일은 2시간 안팎, 주말은 6시간 안팎이에요.", "평일엔 저녁에만, 주말엔 낮에 길게 해요.", 0.05, "", _weekend_binge, _hours_weekend),
    Persona("지호", "시험 임박 급상승형", "시험이 다가올수록 공부 시간이 늘어요.",
            "새 주기를 시작할 땐 2시간 30분쯤에서 35일 뒤 6시간 30분 근처까지 올라가요.", "낮부터 밤까지 길게 해요.", 0.03, "", _exam_rush, _hours_exam),
    Persona("하은", "번아웃형", "처음엔 달리다가 점점 지쳐요.",
            "5시간 30분에서 시작해 35일 동안 점점 줄어 2시간 안팎까지 내려가고, 그다음 새 주기를 시작해요.", "주로 오전에 해요.", 0.03, "", _burnout, _hours_burnout),
    Persona("도윤", "슬럼프 탈출형", "슬럼프를 겪고 다시 올라와요.",
            "평소 4시간 20분, 슬럼프 구간엔 1시간 30분, 회복 구간엔 3시간이에요.", "오전, 오후, 밤에 나눠서 해요.", 0.04, "", _slump, _hours_slump),
    Persona("수아", "야행성형", "밤늦게 집중이 잘돼요.",
            "하루 4시간 안팎이에요.", "밤 10시부터 새벽 3시 사이에 많이 해요.", 0.05, "야간 ", _night, _hours_night),
    Persona("예준", "들쭉날쭉형", "공부하는 날과 쉬는 날의 차이가 커요.",
            "하루 0분에서 6시간 이상까지 편차가 크고, 5일에 하루꼴로 쉬어요.", "날마다 시간대가 달라요.", 0.20, "", _erratic, _hours_erratic),
    Persona("지우", "신입 성장형", "이제 막 시작해서 조금씩 늘려 가요.",
            "1시간 30분에서 시작해 하루에 약 5분씩 늘어 35일 뒤 4시간 20분쯤 되고, 그다음 새 주기를 시작해요.", "평일 저녁, 주말 낮에 해요.", 0.04, "", _newbie, _hours_newbie),
    Persona("시우", "평균형", "친구들 평균과 가장 비슷해요.",
            "하루 3시간 30분 안팎이에요.", "오전, 오후, 저녁에 짧게 나눠서 해요.", 0.06, "", _average, _hours_average),
]
BY_NAME = {p.name: p for p in FRIENDS}
NAMES = frozenset(BY_NAME)
TAGS = ["자소서", "인적성", "면접준비", "어학", "직무공부", "포트폴리오"]


def label_of(name: str) -> str | None:
    p = BY_NAME.get(name)
    return p.label if p else None


def _rng(name: str, d: date, salt: str = "") -> random.Random:
    return random.Random(f"{SEED}:{name}:{d.isoformat()}:{salt}")  # 문자열 시드는 실행/서버가 달라도 같은 결과


def day_total(name: str, d: date) -> int:
    """그날이 끝났을 때 이 친구의 총 학습 시간(분, 5분 단위)."""
    p = BY_NAME[name]
    r = _rng(name, d)
    if r.random() < p.rest_p:
        return 0
    t = (d - START).days % CYCLE
    return int(round(_clamp(p.total(t, d, r)) / 5.0) * 5)


def _weights(name: str, d: date) -> list[float]:
    w = BY_NAME[name].hours(d, _rng(name, d, "hours"))
    s = sum(w) or 1.0
    return [x / s for x in w]


def accrued(name: str, d: date, now: datetime) -> int:
    """now 시각까지 쌓인 학습 시간(분). 과거 날짜는 하루 전체, 미래 날짜는 0."""
    today = now.date()
    if d < today:
        return day_total(name, d)
    if d > today:
        return 0
    total = day_total(name, d)
    if total == 0:
        return 0
    h = now.hour + now.minute / 60 + now.second / 3600
    cum = 0.0
    for i, w in enumerate(_weights(name, d)):
        if h >= i + 1:
            cum += w
        elif h > i:
            cum += w * (h - i)
    return int(total * min(cum, 1.0))


def make_row(name: str, d: date) -> dict:
    """Firestore에 저장할 하루치 문서(시드 데이터와 같은 모양)."""
    p = BY_NAME[name]
    v = day_total(name, d)
    if v == 0:
        memo = "휴식"
    else:
        r = _rng(name, d, "memo")
        memo = f"{p.prefix}{r.choice(TAGS)}, {'주말' if _weekend(d) else '평일'}"
    return {"person": name, "date": d.isoformat(), "value": v, "memo": memo}


def profiles() -> list[dict]:
    return [{"name": p.name, "label": p.label, "intro": p.intro, "pattern": p.pattern, "when": p.when} for p in FRIENDS]
