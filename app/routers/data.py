"""데이터 CRUD + 요약 엔드포인트. 요청을 받아 서비스에 넘기고, 결과를 HTTP 응답으로 바꾼다."""
from fastapi import APIRouter, Depends, HTTPException, Query

from app.schemas.data import DataCreate, DataOut, DataUpdate, EntryUpdate
from app.schemas.summary import SummaryOut
from app.services import data_service, summary_service
from app.services.firebase import get_db

router = APIRouter(prefix="/api/data", tags=["data"])


@router.post("", response_model=DataOut, status_code=201, summary="새 데이터 추가 (같은 날 기록이 있으면 그날에 한 건 더 쌓임)")
def create_data(body: DataCreate, db=Depends(get_db)):
    try:
        return data_service.create_item(db, body)
    except data_service.DayLimitError:
        raise HTTPException(400, "하루 합계가 24시간을 넘을 수 없어요.")


@router.get("", response_model=list[DataOut], summary="데이터 목록 조회 (최신 날짜순)")
def list_data(
    person: str | None = Query(None, max_length=20, description="특정 사람만 보기"),
    limit: int = Query(100, ge=1, le=500, description="최대 개수"),
    db=Depends(get_db),
):
    return data_service.list_items(db, person=person, limit=limit)


@router.get("/summary", response_model=SummaryOut, summary="데이터 요약 (프롬프트 주입용)")
def get_summary(
    me: str = Query("나", max_length=20, description="비교 대상인 '나'의 이름 (메이트 통계에서 제외됨)"),
    include_prompt: bool = Query(False, description="true면 AI에게 넣을 요약 글(prompt_text)도 함께 반환"),
    db=Depends(get_db),
):
    summary = summary_service.get_summary(db, me=me)
    if include_prompt:
        return {**summary, "prompt_text": summary_service.build_prompt_text(summary)}
    return summary


@router.put("/{doc_id}", response_model=DataOut, summary="데이터 수정 (value, memo)")
def update_data(doc_id: str, body: DataUpdate, db=Depends(get_db)):
    try:
        return data_service.update_item(db, doc_id, body)
    except data_service.DataNotFoundError:
        raise HTTPException(404, "해당 id의 데이터가 없습니다.")


@router.delete("/{doc_id}", summary="데이터 삭제")
def delete_data(doc_id: str, db=Depends(get_db)):
    try:
        data_service.delete_item(db, doc_id)
    except data_service.DataNotFoundError:
        raise HTTPException(404, "해당 id의 데이터가 없습니다.")
    return {"deleted": doc_id}


@router.put("/{doc_id}/entries/{entry_id}", response_model=DataOut, summary="하루 안의 기록 한 건 수정")
def update_entry(doc_id: str, entry_id: str, body: EntryUpdate, db=Depends(get_db)):
    try:
        return data_service.update_entry(db, doc_id, entry_id, body)
    except data_service.DataNotFoundError:
        raise HTTPException(404, "해당 id의 기록이 없습니다.")
    except data_service.DayLimitError:
        raise HTTPException(400, "하루 합계가 24시간을 넘을 수 없어요.")


@router.delete("/{doc_id}/entries/{entry_id}", summary="하루 안의 기록 한 건 삭제")
def delete_entry(doc_id: str, entry_id: str, db=Depends(get_db)):
    try:
        data_service.delete_entry(db, doc_id, entry_id)
    except data_service.DataNotFoundError:
        raise HTTPException(404, "해당 id의 기록이 없습니다.")
    return {"deleted": entry_id}
