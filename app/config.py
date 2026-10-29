"""환경변수를 한 곳에서 읽는다. 다른 파일은 os.getenv 대신 settings만 가져다 쓴다."""
import os

from dotenv import load_dotenv

load_dotenv()

_DEFAULT_ORIGINS = "http://localhost:5500,http://127.0.0.1:5500"


def _split_csv(value: str) -> list[str]:
    """쉼표로 구분된 문자열을 목록으로 만든다. 공백과 끝의 슬래시는 제거한다."""
    return [v.strip().rstrip("/") for v in value.split(",") if v.strip()]


class Settings:
    def __init__(self) -> None:
        # 비어 있으면 로컬 기본값을 쓴다. "*"(전체 허용)는 의도적으로 기본값으로 쓰지 않는다.
        self.allowed_origins: list[str] = _split_csv(
            os.getenv("ALLOWED_ORIGINS") or _DEFAULT_ORIGINS
        )


settings = Settings()
