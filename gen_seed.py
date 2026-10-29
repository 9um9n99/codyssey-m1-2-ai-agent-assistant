"""가상 스터디 메이트 9명의 학습 시간 시드 데이터 생성기.

- 출력: seed_data.json  (필드: person, date, value, memo)
- value: 하루 총 학습 시간(분), 5분 단위, 0~1440
- 같은 SEED면 항상 같은 결과가 나온다 (재현 가능)
- 모든 수치는 설계상의 가정이며 실제 통계가 아니다.
"""
import json
import random
from datetime import date, timedelta

SEED = 20261021
DAYS = 35
END_DATE = date(2026, 10, 20)  # 마지막 날짜 = 생성 기준 전날


def clamp(v, lo=0, hi=600):
    return max(lo, min(hi, v))


def is_weekend(d):
    return d.weekday() >= 5


# 유형별 "그날의 기본 학습 분" 함수. t = 0..DAYS-1, rng = 난수, d = 날짜
def steady(t, d, rng):
    return rng.gauss(270, 25)


def weekend_binge(t, d, rng):
    return rng.gauss(360, 40) if is_weekend(d) else rng.gauss(120, 30)


def exam_rush(t, d, rng):
    return 150 + (t / (DAYS - 1)) * 250 + rng.gauss(0, 30)


def burnout(t, d, rng):
    return max(120, 330 - t * 6) + rng.gauss(0, 25)


def slump_recovery(t, d, rng):
    if 12 <= t <= 20:
        return rng.gauss(90, 30)
    if 21 <= t <= 26:
        return rng.gauss(180, 35)
    return rng.gauss(260, 30)


def night_owl(t, d, rng):
    return rng.gauss(240, 35)


def erratic(t, d, rng):
    return rng.gauss(200, 120)


def newbie_growth(t, d, rng):
    return 90 + t * 5 + rng.gauss(0, 20)


def average(t, d, rng):
    return rng.gauss(210, 40)


# (이름, 유형 라벨, 함수, 휴식일 확률, memo 접두어)
PERSONAS = [
    ("민준", "꾸준형", steady, 0.03, ""),
    ("서연", "주말 몰아하기형", weekend_binge, 0.05, ""),
    ("지호", "시험 임박 급상승형", exam_rush, 0.03, ""),
    ("하은", "번아웃형", burnout, 0.03, ""),
    ("도윤", "슬럼프 탈출형", slump_recovery, 0.04, ""),
    ("수아", "야행성형", night_owl, 0.05, "야간 "),
    ("예준", "들쭉날쭉형", erratic, 0.20, ""),
    ("지우", "신입 성장형", newbie_growth, 0.04, ""),
    ("시우", "평균형", average, 0.06, ""),
]

TAGS = ["자소서", "인적성", "면접준비", "어학", "직무공부", "포트폴리오"]


def build():
    rng = random.Random(SEED)
    start = END_DATE - timedelta(days=DAYS - 1)
    rows = []
    for name, _label, fn, rest_p, prefix in PERSONAS:
        for t in range(DAYS):
            d = start + timedelta(days=t)
            if rng.random() < rest_p:
                value = 0
                memo = "휴식"
            else:
                raw = clamp(fn(t, d, rng))
                value = int(round(raw / 5.0) * 5)
                if value == 0:
                    memo = "휴식"
                else:
                    day_type = "주말" if is_weekend(d) else "평일"
                    memo = f"{prefix}{rng.choice(TAGS)}, {day_type}"
            rows.append(
                {"person": name, "date": d.isoformat(), "value": value, "memo": memo}
            )
    return rows


if __name__ == "__main__":
    data = build()
    with open("seed_data.json", "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"생성 완료: {len(data)}건 -> seed_data.json")
