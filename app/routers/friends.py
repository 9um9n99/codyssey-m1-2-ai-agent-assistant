"""친구(가상 스터디 메이트) 소개. 어떤 기준으로 만든 어떤 유형인지 화면에 보여 주기 위한 정보."""
from fastapi import APIRouter

from app.schemas.summary import FriendsOut
from app.services import persona

router = APIRouter(prefix="/api/friends", tags=["friends"])


@router.get("", response_model=FriendsOut, summary="가상 친구 소개 (유형과 하루 패턴)")
def list_friends():
    return {"basis": persona.BASIS, "friends": persona.profiles()}
