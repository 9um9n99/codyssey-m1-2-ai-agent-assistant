"""채팅 한 턴을 처리한다: 요약 조회 -> 시스템 프롬프트에 주입 -> AI 호출 -> 대화 자동 저장.

이 파일이 과제의 핵심인 "컨텍스트 주입"이다. AI를 새로 학습시키는 게 아니라,
질문이 올 때마다 최신 데이터 요약을 시스템 프롬프트에 끼워서 함께 보낸다.
"""
import logging
from datetime import datetime, timedelta, timezone

from app.schemas.conversation import MAX_MESSAGES
from app.services import ai_client, conversation_service, summary_service

logger = logging.getLogger("app.chat")

MAX_HISTORY = 10  # 이전 대화는 최근 10개 메시지만 AI에게 보낸다(토큰/비용 보호)
_KST = timezone(timedelta(hours=9))
_WEEKDAY = "월화수목금토일"

SYSTEM_TEMPLATE = """당신은 '공부 습관 비교 비서'입니다. 사용자의 공부 시간을 가상의 친구 데이터와 비교해 알려 주고, 그 기록을 바탕으로 공부 습관을 함께 점검합니다.

규칙
- 아래 [데이터 요약]에 있는 숫자만 근거로 답하세요. 요약에 없는 숫자나 사실은 지어내지 말고 "요약에 없는 정보예요"라고 말하세요.
- 친구는 가상 인물이고, 공부 시간이 성과를 보장하지 않습니다. 특정 시간을 '정답'처럼 단정하지 마세요.
- 한국어로 3~5문장 안에서 간결하게 답하고, 비교할 때는 구체적인 수치(시간/분)를 함께 말하세요.
- 사용자가 자신의 공부 시간을 말하면 친구 평균·순위와 비교해 주세요. 그 값이 저장된 기록이 아닐 수 있다는 점은 감안하세요.
- 공부 습관·계획·집중 방법 같은 질문에도 답하세요. 이때는 사용자의 기록(평균, 최근 추세, 평일/주말 차이, 쉰 날 수 등)을 먼저 짚고, 그 수치에 맞는 실천 방법을 1~2가지 구체적으로 제안하세요. 일반적인 학습 팁은 '일반적인 팁'이라고 밝히고 수치처럼 꾸미지 마세요.
- 공부와 상관없는 질문(코딩 대행, 의료·법률 상담 등)은 정중히 거절하고, 공부 기록이나 습관 이야기로 돌려 주세요.
- 오늘 날짜(한국 시간): {today}.
- [오늘 ... 현재까지] 값은 하루가 진행 중인 값입니다. 오늘 공부 시간을 친구와 비교할 때는 이 값(같은 시각 기준)이나 완료된 날의 평균과 비교하고, 하루가 끝난 값처럼 말하지 마세요.
- 답변에서는 '스터디 메이트' 대신 '친구'라고 부르세요.
- 친구 이름 옆 괄호는 가상 유형(공부 방식)입니다. 요청받으면 유형에 맞춰 설명하되, 요약에 없는 성격은 지어내지 마세요.

[데이터 요약]
{summary}
"""


def build_system_prompt(summary_text: str, now: datetime | None = None) -> str:
    now = now or datetime.now(_KST)
    today = f"{now.date().isoformat()} ({_WEEKDAY[now.weekday()]})"
    return SYSTEM_TEMPLATE.format(today=today, summary=summary_text)


def handle_chat(db, client, message: str, conversation_id: str | None, me: str, now: datetime | None = None) -> dict:
    history: list[dict] = []
    if conversation_id:
        conv = conversation_service.get_conversation(db, conversation_id)  # 없으면 NotFound
        if conv["message_count"] + 2 > MAX_MESSAGES:  # AI 호출(과금) 전에 먼저 거절
            raise conversation_service.ConversationTooLongError(conversation_id)
        history = [{"role": m["role"], "content": m["content"]} for m in conv["messages"]][-MAX_HISTORY:]

    summary = summary_service.get_summary(db, me=me, now=now)
    system = build_system_prompt(summary_service.build_prompt_text(summary), now)
    messages = [{"role": "system", "content": system}, *history, {"role": "user", "content": message}]

    reply = ai_client.chat_completion(client, messages)[:4000]

    turn = [{"role": "user", "content": message}, {"role": "assistant", "content": reply}]
    saved, conv_out = True, None
    try:
        if conversation_id:
            conv_out = conversation_service.append_messages(db, conversation_id, turn)
        else:
            conv_out = conversation_service.create_with_messages(db, turn)
    except Exception:  # 저장 실패가 이미 받은 답변을 막지는 않는다
        logger.exception("대화 자동 저장 실패")
        saved = False

    return {
        "reply": reply,
        "conversation_id": conv_out["id"] if conv_out else conversation_id,
        "title": conv_out["title"] if conv_out else None,
        "message_count": conv_out["message_count"] if conv_out else None,
        "saved": saved,
    }
