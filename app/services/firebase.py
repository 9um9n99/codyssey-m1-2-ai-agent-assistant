"""Firebase Admin SDK 초기화. 서비스 계정 키는 환경변수로만 받는다(코드에 하드코딩 금지)."""
import json
import os
import threading
from functools import lru_cache

# gRPC가 Firestore 주소를 찾는 기본 방식이 일부 환경(macOS 등)에서 응답 없이 멈춘다.
# 운영체제의 DNS를 쓰도록 바꿔야 해서, gRPC가 불러지기(import) 전에 먼저 정한다.
os.environ.setdefault("GRPC_DNS_RESOLVER", "native")

import firebase_admin
from firebase_admin import credentials, firestore

from app import config  # noqa: F401  (.env 를 먼저 읽어 두기 위해 import)


class FirebaseConfigError(RuntimeError):
    """Firebase 설정이 없거나 잘못됐을 때."""


def _load_credential():
    raw = os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON")
    if raw:  # 배포(Render): JSON 내용 전체를 환경변수로
        try:
            return credentials.Certificate(json.loads(raw))
        except (ValueError, TypeError) as e:
            raise FirebaseConfigError("FIREBASE_SERVICE_ACCOUNT_JSON 형식이 올바르지 않습니다.") from e
    path = os.getenv("FIREBASE_SERVICE_ACCOUNT_PATH")
    if path:  # 로컬: 프로젝트 폴더 밖의 키 파일 경로
        if not os.path.isfile(path):
            raise FirebaseConfigError("서비스 계정 키 파일을 찾을 수 없습니다. 경로 설정을 확인하세요.")
        try:
            return credentials.Certificate(path)
        except (ValueError, OSError) as e:  # 파일이 비었거나 JSON 모양이 깨졌을 때
            raise FirebaseConfigError(f"서비스 계정 키 파일 내용이 올바르지 않습니다. ({type(e).__name__})") from e
    raise FirebaseConfigError("FIREBASE_SERVICE_ACCOUNT_PATH 또는 FIREBASE_SERVICE_ACCOUNT_JSON 을 설정하세요.")


_lock = threading.Lock()


@lru_cache(maxsize=1)
def get_db():
    """Firestore 클라이언트를 한 번만 만들어 재사용한다.

    화면이 열리면 요청이 동시에 여러 개 들어와서, 잠금 없이 초기화하면
    "default Firebase app already exists" 오류가 난다. 그래서 잠그고 한 번만 초기화한다.
    """
    with _lock:
        if not firebase_admin._apps:
            firebase_admin.initialize_app(_load_credential())
        return firestore.client()
