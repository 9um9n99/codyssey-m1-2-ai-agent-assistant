"""AI(OpenAI 호환 API) 호출. 라이브러리의 오류를 우리 서비스의 오류로 바꿔서 던진다.

- 키/주소/모델은 환경변수로만 받는다(코드에 하드코딩 금지).
- 과금 보호: max_tokens, 타임아웃, 재시도 1회로 제한한다.
"""
import logging
import os
from functools import lru_cache

import openai
from openai import OpenAI

from app import config  # noqa: F401  (.env 를 먼저 읽어 두기 위해 import)

logger = logging.getLogger("app.ai")


class AIError(Exception):
    """AI 호출 실패의 공통 부모."""


class AIConfigError(AIError):
    """키/모델 설정이 없거나 모델명이 잘못됨."""


class AIAuthError(AIError):
    """AI 서버가 키를 거부함."""


class AIRateLimitedError(AIError):
    """AI 서버가 요청 과다로 거절함."""


class AIUnavailableError(AIError):
    """연결 실패 또는 시간 초과."""


class AIBadResponseError(AIError):
    """AI 서버가 이상한 응답을 줌."""


def _env_number(name: str, default: float, cast=float):
    try:
        return cast(os.getenv(name) or default)
    except ValueError:
        return default


@lru_cache(maxsize=1)
def get_client() -> OpenAI:
    if not os.getenv("OPENAI_API_KEY"):
        raise AIConfigError("OPENAI_API_KEY 가 설정되지 않았습니다.")
    if not os.getenv("OPENAI_MODEL"):
        raise AIConfigError("OPENAI_MODEL 이 설정되지 않았습니다.")
    return OpenAI(
        api_key=os.getenv("OPENAI_API_KEY"),
        base_url=os.getenv("OPENAI_BASE_URL") or None,  # 코디세이 콘솔이 안내한 주소
        timeout=_env_number("CHAT_TIMEOUT_SECONDS", 30.0),
        max_retries=1,
    )


def chat_completion(client, messages: list[dict]) -> str:
    model = os.getenv("OPENAI_MODEL")
    if not model:
        raise AIConfigError("OPENAI_MODEL 이 설정되지 않았습니다.")
    try:
        resp = client.chat.completions.create(
            model=model,
            messages=messages,
            max_tokens=_env_number("CHAT_MAX_TOKENS", 500, int),
            temperature=0.3,
        )
    except (openai.AuthenticationError, openai.PermissionDeniedError) as e:
        raise AIAuthError(str(e)) from e
    except openai.RateLimitError as e:
        raise AIRateLimitedError(str(e)) from e
    except (openai.APITimeoutError, openai.APIConnectionError) as e:
        raise AIUnavailableError(type(e).__name__) from e
    except openai.NotFoundError as e:  # 보통 모델명이 잘못된 경우
        raise AIConfigError(f"모델 또는 주소를 찾을 수 없습니다. OPENAI_MODEL/OPENAI_BASE_URL 확인: {e}") from e
    except openai.APIStatusError as e:
        raise AIBadResponseError(f"status={e.status_code}: {e}") from e

    content = resp.choices[0].message.content if getattr(resp, "choices", None) else None
    if not content or not content.strip():
        raise AIBadResponseError("빈 응답")
    return content.strip()
