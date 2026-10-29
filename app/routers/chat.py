"""AI 채팅 엔드포인트. 호출 제한 -> 서비스 호출 -> 오류를 HTTP 상태코드로 변환."""
import logging

from fastapi import APIRouter, Depends, HTTPException, Request

from app.schemas.chat import ChatRequest, ChatResponse
from app.services import ai_client, chat_service, rate_limit
from app.services.conversation_service import ConversationNotFoundError, ConversationTooLongError
from app.services.firebase import get_db

logger = logging.getLogger("app.chat")
router = APIRouter(prefix="/api/chat", tags=["chat"])


def get_ai():
    """AI 클라이언트를 만든다. (테스트에서는 가짜로 바꿔 끼울 수 있다)"""
    return ai_client.get_client()


def limit_calls(request: Request) -> None:
    # Render 같은 프록시 뒤에서는 실제 사용자 IP가 X-Forwarded-For 에 들어 있다.
    ip = request.headers.get("x-forwarded-for", "").split(",")[0].strip() or (request.client.host if request.client else "unknown")
    try:
        rate_limit.check(ip)
    except rate_limit.RateLimitExceeded as e:
        raise HTTPException(429, e.message, headers={"Retry-After": str(e.retry_after)})


@router.post("", response_model=ChatResponse, summary="AI 채팅 (데이터 요약을 프롬프트에 주입)")
def chat(body: ChatRequest, _=Depends(limit_calls), db=Depends(get_db)):
    try:
        client = get_ai()
        return chat_service.handle_chat(db, client, body.message, body.conversation_id, body.me)
    except ConversationNotFoundError:
        raise HTTPException(404, "해당 id의 채팅이 없습니다.")
    except ConversationTooLongError:
        raise HTTPException(409, "이 채팅은 너무 길어졌어요. 새 채팅을 시작해 주세요.")
    except ai_client.AIConfigError as e:
        logger.error("AI 설정 오류: %s", e)
        raise HTTPException(503, "AI 설정에 문제가 있습니다. (서버 로그를 확인하세요)")
    except ai_client.AIAuthError as e:
        logger.error("AI 인증 실패: %s", e)
        raise HTTPException(502, "AI 서버가 API 키를 거부했습니다. 키를 확인하세요.")
    except ai_client.AIRateLimitedError as e:
        logger.warning("AI 서버 요청 과다: %s", e)
        raise HTTPException(429, "AI 서버가 바쁩니다. 잠시 후 다시 시도해 주세요.")
    except ai_client.AIUnavailableError as e:
        logger.warning("AI 연결 실패/시간 초과: %s", e)
        raise HTTPException(504, "AI 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.")
    except ai_client.AIBadResponseError as e:
        logger.error("AI 응답 이상: %s", e)
        raise HTTPException(502, "AI 서버가 올바른 응답을 주지 않았습니다.")
