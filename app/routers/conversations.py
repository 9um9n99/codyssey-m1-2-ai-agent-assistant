"""채팅 목록 엔드포인트: 저장 / 목록 / 불러오기(A안: id로 messages 조회) / 삭제."""
from fastapi import APIRouter, Depends, HTTPException, Query

from app.schemas.conversation import ConversationCreate, ConversationListItem, ConversationOut
from app.services import conversation_service as svc
from app.services.firebase import get_db

router = APIRouter(prefix="/api/conversations", tags=["conversations"])


@router.post("", response_model=ConversationOut, status_code=201, summary="채팅 저장")
def create_conversation(body: ConversationCreate, db=Depends(get_db)):
    return svc.create_conversation(db, body)


@router.get("", response_model=list[ConversationListItem], summary="채팅 목록 조회 (최근 수정순, messages 미포함)")
def list_conversations(limit: int = Query(30, ge=1, le=100, description="최대 개수"), db=Depends(get_db)):
    return svc.list_conversations(db, limit=limit)


@router.get("/{conv_id}", response_model=ConversationOut, summary="특정 채팅의 전체 messages 불러오기")
def get_conversation(conv_id: str, db=Depends(get_db)):
    try:
        return svc.get_conversation(db, conv_id)
    except svc.ConversationNotFoundError:
        raise HTTPException(404, "해당 id의 채팅이 없습니다.")


@router.delete("/{conv_id}", summary="채팅 삭제")
def delete_conversation(conv_id: str, db=Depends(get_db)):
    try:
        svc.delete_conversation(db, conv_id)
    except svc.ConversationNotFoundError:
        raise HTTPException(404, "해당 id의 채팅이 없습니다.")
    return {"deleted": conv_id}
