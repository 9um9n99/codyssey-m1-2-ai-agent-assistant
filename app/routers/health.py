"""서버 상태 확인용 라우터. 배포(Render) 후 "서버가 깨어 있는지" 확인할 때도 쓴다."""
from fastapi import APIRouter

router = APIRouter(tags=["health"])


@router.get("/")
def root():
    return {"message": "학습 스터디 메이트 AI 비서 API", "docs": "/docs"}


@router.get("/health")
def health():
    return {"status": "ok"}
