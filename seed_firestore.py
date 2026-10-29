"""seed_data.json 을 Firestore 'data' 컬렉션에 업로드한다.

- 문서 ID가 "{person}_{date}" 로 고정이라 여러 번 실행해도 중복되지 않는다(덮어씀).
- 사용법: python seed_firestore.py        (확인 질문 후 업로드)
          python seed_firestore.py --yes  (질문 없이 업로드)
"""
import json
import sys
from pathlib import Path

from app.services.data_service import COLLECTION

SEED_FILE = Path(__file__).parent / "seed_data.json"
BATCH_SIZE = 400  # Firestore 배치 한도(500) 아래로


def seed(db, rows: list[dict]) -> int:
    col = db.collection(COLLECTION)
    written = 0
    for i in range(0, len(rows), BATCH_SIZE):
        batch = db.batch()
        for r in rows[i : i + BATCH_SIZE]:
            doc_id = f"{r['person']}_{r['date']}"
            batch.set(
                col.document(doc_id),
                {"person": r["person"], "date": r["date"], "value": r["value"], "memo": r["memo"]},
            )
            written += 1
        batch.commit()
    return written


def main():
    if not SEED_FILE.exists():
        sys.exit("seed_data.json 이 없습니다. 먼저 python gen_seed.py 를 실행하세요.")
    rows = json.loads(SEED_FILE.read_text(encoding="utf-8"))
    print(f"업로드 대상: {len(rows)}건 -> Firestore '{COLLECTION}' 컬렉션 (이미 있으면 덮어씀)")
    if "--yes" not in sys.argv and input("계속할까요? (y/N) ").strip().lower() != "y":
        sys.exit("취소했습니다.")

    from app.services.firebase import FirebaseConfigError, get_db

    try:
        db = get_db()
        n = seed(db, rows)
    except FirebaseConfigError as e:
        sys.exit(f"[실패] Firebase 설정: {e}")
    except Exception as e:  # 연결/권한 오류 등. 키 값은 출력되지 않는다.
        sys.exit(f"[실패] {type(e).__name__}: {str(e)[:200]}")
    print(f"[완료] {n}건 저장")


if __name__ == "__main__":
    main()
