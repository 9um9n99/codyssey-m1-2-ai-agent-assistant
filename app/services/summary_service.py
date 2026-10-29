"""데이터 요약 계산. compute_summary 는 DB를 모르는 순수 함수라서 단독으로 테스트할 수 있다.

용어
- 스터디 메이트: '나'를 제외한 사람들. 전체 통계는 메이트만으로 계산한다.
  (내가 기록을 추가할 때마다 기준(친구 평균)이 흔들리지 않게 하려는 설계)
- 추세: 각 사람의 마지막 날짜 기준 "최근 14일 평균" vs "그 직전 14일 평균".
  변화율이 +-5% 이내면 유지.
- 순위: 평균(휴식일 포함)이 높은 순. 기록이 1건만 있어도 순위에 넣는다(내 기록이 쌓이는 만큼 바로 반영).
"""
import logging
from collections import defaultdict
from datetime import date, datetime, timedelta

from app.services import cache, persona
from app.services.data_service import COLLECTION

logger = logging.getLogger("app.summary")
MAX_BACKFILL_DAYS = 120  # 서버가 오래 쉬었다 깨어나도 한 번에 쓰는 문서 수를 제한한다
BATCH_SIZE = 400

WINDOW_DAYS = 14
MIN_WINDOW_RECORDS = 3  # 추세 판단에 필요한 구간별 최소 기록 수
MIN_RECORDS_FOR_RANK = 1
FEW_RECORDS = 7  # 이보다 적으면 평균/순위가 크게 흔들릴 수 있다고 AI에게 알려 준다
FLAT_PCT = 5.0
_REQUIRED = ("person", "date", "value")


def _avg(values: list[int]) -> float:
    return sum(values) / len(values) if values else 0.0


def _ex(rec: dict | None, with_person: bool = False) -> dict | None:
    if rec is None:
        return None
    out = {"value": rec["value"], "date": rec["date"]}
    if with_person:
        out["person"] = rec["person"]
    return out


def _trend(recs: list[dict], anchor: date) -> dict:
    recent_start, prev_start = anchor - timedelta(days=WINDOW_DAYS - 1), anchor - timedelta(days=WINDOW_DAYS * 2 - 1)
    recent = [r["value"] for r in recs if recent_start <= r["_d"] <= anchor]
    prev = [r["value"] for r in recs if prev_start <= r["_d"] < recent_start]
    if len(recent) < MIN_WINDOW_RECORDS or len(prev) < MIN_WINDOW_RECORDS:
        return {"label": "데이터 부족", "change_pct": None, "recent_avg": None, "prev_avg": None}
    ra, pa = _avg(recent), _avg(prev)
    if pa == 0:
        pct, label = None, ("증가" if ra > 0 else "유지")
    else:
        pct = (ra - pa) / pa * 100
        label = "증가" if pct > FLAT_PCT else "감소" if pct < -FLAT_PCT else "유지"
    return {
        "label": label,
        "change_pct": None if pct is None else round(pct, 1),
        "recent_avg": round(ra),
        "prev_avg": round(pa),
    }


def _person_summary(name: str, recs: list[dict]) -> dict:
    recs = sorted(recs, key=lambda r: r["date"])
    values = [r["value"] for r in recs]
    studied = [r for r in recs if r["value"] > 0]
    weekday = [r["value"] for r in recs if r["_d"].weekday() < 5]
    weekend = [r["value"] for r in recs if r["_d"].weekday() >= 5]
    return {
        "person": name,
        "label": persona.label_of(name),
        "count": len(recs),
        "period": f"{recs[0]['date']} ~ {recs[-1]['date']}",
        "total_minutes": sum(values),
        "average_minutes": round(_avg(values)),
        "studied_days_average_minutes": round(_avg([r["value"] for r in studied])) if studied else None,
        "rest_days": len(recs) - len(studied),
        "max": _ex(max(recs, key=lambda r: (r["value"], r["date"]))),
        "min_studied": _ex(min(studied, key=lambda r: (r["value"], r["date"]))) if studied else None,
        "weekday_average": round(_avg(weekday)) if weekday else None,
        "weekend_average": round(_avg(weekend)) if weekend else None,
        "trend": _trend(recs, recs[-1]["_d"]),
        "enough_data": len(recs) >= MIN_RECORDS_FOR_RANK,
        "rank": None,
    }


def compute_summary(rows: list[dict], me: str = "나") -> dict:
    valid = []
    for r in rows:
        if all(k in r for k in _REQUIRED):
            try:
                valid.append({**r, "_d": date.fromisoformat(r["date"])})
            except ValueError:
                continue  # 날짜가 깨진 문서는 건너뜀

    by_person: dict[str, list[dict]] = defaultdict(list)
    for r in valid:
        by_person[r["person"]].append(r)
    summaries = {name: _person_summary(name, recs) for name, recs in by_person.items()}

    # 순위: 기록이 충분한 사람끼리 평균 내림차순 (나 포함)
    ranked = sorted(
        (s for s in summaries.values() if s["enough_data"]),
        key=lambda s: (-s["average_minutes"], s["person"]),
    )
    for i, s in enumerate(ranked, start=1):
        s["rank"] = i

    mates = sorted(
        (s for n, s in summaries.items() if n != me),
        key=lambda s: (s["rank"] is None, s["rank"] or 0, s["person"]),
    )
    mate_rows = [r for r in valid if r["person"] != me]

    base = {"me_name": me, "me": summaries.get(me), "rank_total": len(ranked), "people": mates,
            "people_count": len(mates), "count": len(mate_rows)}
    if not mate_rows:
        return {**base, "period": None, "metrics": None,
                "trend": {"label": "데이터 없음", "change_pct": None, "recent_avg": None, "prev_avg": None}}

    values = [r["value"] for r in mate_rows]
    studied = [r for r in mate_rows if r["value"] > 0]
    dates = sorted(r["date"] for r in mate_rows)
    return {
        **base,
        "period": f"{dates[0]} ~ {dates[-1]}",
        "metrics": {
            "total_minutes": sum(values),
            "average_minutes": round(_avg(values)),
            "max": _ex(max(mate_rows, key=lambda r: (r["value"], r["date"])), with_person=True),
            "min_studied": _ex(min(studied, key=lambda r: (r["value"], r["date"])), with_person=True) if studied else None,
        },
        "trend": _trend(mate_rows, max(r["_d"] for r in mate_rows)),
    }


def _now() -> datetime:
    return datetime.now(persona.KST)


def ensure_friend_days(db, rows: list[dict], today: date) -> list[dict]:
    """친구들의 '어제까지' 빠진 날짜를 채워 Firestore에 저장하고, 새로 만든 행을 돌려준다.

    친구 기록은 설정(persona.py)에서 계산되는 값이라 같은 날짜는 언제나 같은 값이다.
    그래서 서버가 여러 번/동시에 실행해도 결과가 같고, 다시 써도 안전하다(set).
    오늘 날짜는 하루가 끝나기 전이라 저장하지 않고, build_today 가 시각에 맞춰 계산한다.
    """
    yesterday = today - timedelta(days=1)
    last: dict[str, date] = {}
    for r in rows:
        name = r.get("person")
        if name in persona.NAMES and "date" in r:
            try:
                d = date.fromisoformat(r["date"])
            except ValueError:
                continue
            if name not in last or d > last[name]:
                last[name] = d
    new_rows: list[dict] = []
    for name, d_last in last.items():
        start = max(d_last + timedelta(days=1), yesterday - timedelta(days=MAX_BACKFILL_DAYS - 1))
        d = start
        while d <= yesterday:
            new_rows.append(persona.make_row(name, d))
            d += timedelta(days=1)
    if not new_rows:
        return []
    try:
        col = db.collection(COLLECTION)
        for i in range(0, len(new_rows), BATCH_SIZE):
            batch = db.batch()
            for r in new_rows[i : i + BATCH_SIZE]:
                batch.set(col.document(f"{r['person']}_{r['date']}"), r)
            batch.commit()
    except Exception:  # 저장에 실패해도 요약은 계산된 값으로 계속 보여 준다(다음 요청에서 다시 시도)
        logger.exception("친구 기록 자동 추가 실패")
    return new_rows


def fill_idle_days(rows: list[dict], me: str, today: date) -> list[dict]:
    """내가 기록하지 않은 지난 날짜를 0분으로 채운 행을 더해 돌려준다(저장하지 않는 계산용 행).

    친구는 매일 값이 있는데 나는 쉰 날에 기록이 없으면 평균이 '공부한 날'만으로 계산되어
    며칠을 쉬어도 순위가 그대로인 문제가 생긴다. 첫 기록일부터 어제까지의 빈 날을 0분으로 센다.
    """
    mine: set[str] = set()
    for r in rows:
        if r.get("person") == me and "date" in r:
            mine.add(r["date"])
    parsed = []
    for x in mine:
        try:
            parsed.append(date.fromisoformat(x))
        except ValueError:
            continue
    if not parsed:
        return rows
    d, end = min(parsed), today - timedelta(days=1)
    extra = []
    while d <= end:
        if d.isoformat() not in mine:
            extra.append({"person": me, "date": d.isoformat(), "value": 0, "memo": ""})
        d += timedelta(days=1)
    return rows + extra


def build_today(me_values: dict, friend_names: list[str], now: datetime) -> dict | None:
    if not friend_names:
        return None
    d = now.date()
    friends = sorted(
        ({"person": n, "label": persona.label_of(n), "minutes": persona.accrued(n, d, now)} for n in friend_names),
        key=lambda f: (-f["minutes"], f["person"]),
    )
    me_min = me_values.get(d.isoformat())
    # 오늘 순위: 같은 시각까지 쌓인 시간이 많은 순서(나 포함). 동점이면 내가 앞서고, 오늘 공부 전(0분)이면 꼴찌다.
    me_rank = 1 + sum(1 for f in friends if f["minutes"] >= (me_min or 0)) if not me_min else 1 + sum(1 for f in friends if f["minutes"] > me_min)
    return {
        "date": d.isoformat(),
        "as_of": now.strftime("%H:%M"),
        "me_rank": me_rank,
        "rank_total": len(friends) + 1,
        "me_minutes": me_min,
        "friends_avg_minutes": round(_avg([f["minutes"] for f in friends])),
        "friends": friends,
    }


def get_summary(db, me: str = "나", now: datetime | None = None) -> dict:
    now = now or _now()
    today = now.date().isoformat()
    key = f"summary:{me}"
    hit = cache.get(key)
    if hit is None or hit["day"] != today:  # 날짜가 바뀌면 캐시를 쓰지 않는다
        rows = [s.to_dict() for s in db.collection(COLLECTION).stream()]
        rows += ensure_friend_days(db, rows, now.date())
        hit = {
            "day": today,
            "summary": compute_summary(fill_idle_days(rows, me, now.date()), me=me),
            "me_values": {r["date"]: r["value"] for r in rows if r.get("person") == me and "date" in r and "value" in r},
            "friends": sorted({r["person"] for r in rows if r.get("person") in persona.NAMES}),
        }
        cache.set(key, hit)
    # '오늘 지금까지'는 시각마다 달라지므로 캐시 밖에서 매번 계산한다
    return {**hit["summary"], "today": build_today(hit["me_values"], hit["friends"], now)}


# ---- 프롬프트에 넣을 글 만들기 ----------------------------------------------

def fmt_minutes(m: int | None) -> str:
    if m is None:
        return "-"
    h, mm = divmod(int(m), 60)
    return f"{h}시간 {mm}분" if h and mm else f"{h}시간" if h else f"{mm}분"


def _trend_text(t: dict) -> str:
    if t["change_pct"] is None:
        return t["label"]
    return f"{t['label']} ({t['change_pct']:+.1f}%)"


def _person_line(s: dict) -> str:
    rank = f"{s['rank']}위 " if s["rank"] else ""
    who = f"{s['person']}({s['label']})" if s.get("label") else s["person"]
    return (
        f"{rank}{who} - 기록 {s['count']}건, 평균 {fmt_minutes(s['average_minutes'])}, "
        f"최근 추세 {_trend_text(s['trend'])}, 최대 {fmt_minutes(s['max']['value'])}({s['max']['date']}), "
        f"휴식 {s['rest_days']}일, 평일 평균 {fmt_minutes(s['weekday_average'])} / 주말 평균 {fmt_minutes(s['weekend_average'])}"
    )


def build_prompt_text(summary: dict) -> str:
    """요약 dict 를 시스템 프롬프트에 끼워 넣을 한국어 글로 바꾼다. (컨텍스트 주입의 재료)"""
    if summary["metrics"] is None:
        return "[공부 데이터 요약]\n- 아직 저장된 친구 데이터가 없습니다."
    m = summary["metrics"]
    lines = [
        "[친구 공부 데이터 요약] (가상 인물의 데이터이며 하루 총 학습 시간 기준)",
        f"- 기간: {summary['period']}",
        f"- 인원/기록: {summary['people_count']}명, {summary['count']}건",
        f"- 전체 평균: 하루 {fmt_minutes(m['average_minutes'])} (휴식일 포함)",
        f"- 최대 기록: {fmt_minutes(m['max']['value'])} ({m['max']['person']}, {m['max']['date']})",
        f"- 최근 추세: {_trend_text(summary['trend'])}",
        "",
        "[친구별 요약] (순위는 평균 기준이며 '나'를 포함해 매긴 값이라 번호가 건너뛸 수 있음)",
    ]
    lines += [f"- {_person_line(s)}" for s in summary["people"]]
    lines.append("")
    me = summary["me"]
    if me is None:
        lines.append(f"[{summary['me_name']}의 기록] 아직 없습니다.")
    else:
        lines.append(f"[{summary['me_name']}의 기록]")
        lines.append(f"- {_person_line(me)}")
        if me["rank"]:
            lines.append(f"- 나 포함 {summary['rank_total']}명 중 전체 기간 하루 평균 기준 {me['rank']}위 (기록하지 않은 날은 0분으로 계산)")
        else:
            lines.append("- 아직 순위를 매길 기록이 없습니다.")
        if me["count"] < FEW_RECORDS:
            lines.append(f"- 기록한 날이 {me['count']}일뿐이라 평균과 순위는 기록이 쌓이면 크게 달라질 수 있습니다.")
    today = summary.get("today")
    if today:
        lines.append("")
        lines.append(f"[오늘 {today['date']} {today['as_of']} 현재까지] (하루가 진행 중이라 친구들 값은 시간이 지날수록 늘어남. 같은 시각 기준으로만 비교할 것)")
        lines.append(f"- 친구 평균: {fmt_minutes(today['friends_avg_minutes'])}")
        lines.append(f"- {summary['me_name']}: " + (fmt_minutes(today['me_minutes']) if today["me_minutes"] is not None else "아직 기록 없음"))
        lines.append(f"- 오늘 순위(같은 시각 기준): 나 포함 {today['rank_total']}명 중 {today['me_rank']}위. 앱의 어항 수심과 순위는 이 오늘 값으로 정해지며 매일 자정에 처음(얕은 물, 꼴찌 근처)으로 돌아감")
        lines.append("- 친구별: " + ", ".join(f"{f['person']} {fmt_minutes(f['minutes'])}" for f in today["friends"]))
    return "\n".join(lines)
