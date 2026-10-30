"""앱 진입점: FastAPI 앱을 만들고 CORS와 라우터를 연결한다.

실행: uvicorn main:app --reload
문서: http://localhost:8000/docs (Swagger UI)
"""
import logging
import os

os.environ.setdefault("GRPC_DNS_RESOLVER", "native")  # firebase.py 설명 참고. grpc보다 먼저 정해야 한다.

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import settings
from app.routers import chat, conversations, data, friends, health
from app.services.firebase import FirebaseConfigError

logger = logging.getLogger("app")

app = FastAPI(
    title="DeepFin API - 함께 깊어지는 공부",
    description="가상 스터디 메이트의 학습 시간 데이터를 요약해 AI 답변에 반영하는 서비스",
    version="0.6.0",
)

# CORS: 브라우저가 "다른 주소(origin)"의 프론트에서 이 API를 호출하도록 허용할 목록.
# 목록에 없는 주소에서 온 요청은 브라우저가 막는다. (키 보호와는 별개의 장치)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)


@app.exception_handler(FirebaseConfigError)
async def firebase_config_error_handler(request: Request, exc: FirebaseConfigError):
    # 상세 원인은 서버 로그에만 남기고, 응답에는 내부 정보(경로 등)를 싣지 않는다.
    logger.error("Firebase 설정 오류: %s", exc)
    # reason에는 경로·키 같은 비밀이 없는 짧은 설명만 담는다(원인 찾기용).
    return JSONResponse(status_code=503, content={"detail": "서버의 DB 설정에 문제가 있습니다.", "reason": str(exc)})


@app.exception_handler(Exception)
async def unhandled_error_handler(request: Request, exc: Exception):
    # 예상 못 한 오류도 로그에 남기고, 응답에는 오류 종류(클래스 이름)만 알려 준다.
    logger.exception("처리되지 않은 오류")
    return JSONResponse(status_code=500, content={"detail": "서버 오류가 났어요.", "error": type(exc).__name__})


app.include_router(health.router)
app.include_router(data.router)
app.include_router(friends.router)
app.include_router(conversations.router)
app.include_router(chat.router)
