"""개발 환경 점검 스크립트.

확인 항목: Python 버전, 패키지, .env 값 유무, Firestore 읽기/쓰기, AI 호출(아주 짧게).
키 값 자체는 절대 출력하지 않는다.
사용법: python check_env.py            (전체 점검)
        python check_env.py --no-ai    (AI 호출 없이 점검, 과금 없음)
"""
import json
import os
import sys
import time

OK, NG = "[OK]", "[실패]"
results = []


def report(label, ok, detail=""):
    results.append(ok)
    print(f"{OK if ok else NG} {label}" + (f" - {detail}" if detail else ""))


def main():
    no_ai = "--no-ai" in sys.argv

    # 1) Python 버전 (과제 요구: 3.10 이상)
    v = sys.version_info
    report("Python 3.10 이상", v >= (3, 10), f"현재 {v.major}.{v.minor}.{v.micro}")

    # 2) 패키지 설치 여부
    missing = []
    for mod in ["fastapi", "uvicorn", "firebase_admin", "openai", "dotenv"]:
        try:
            __import__(mod)
        except ImportError:
            missing.append(mod)
    report("패키지 설치", not missing, "누락: " + ", ".join(missing) if missing else "")
    if missing:
        print("  -> 가상환경을 켠 뒤 pip install -r requirements.txt 를 실행하세요.")
        return

    from dotenv import load_dotenv

    load_dotenv()

    # 3) 환경변수 (값은 출력하지 않고 설정 여부만 확인)
    report("OPENAI_API_KEY 설정", bool(os.getenv("OPENAI_API_KEY")))
    report("OPENAI_BASE_URL 설정", bool(os.getenv("OPENAI_BASE_URL")))
    report("OPENAI_MODEL 설정", bool(os.getenv("OPENAI_MODEL")))
    has_fb = bool(os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON") or os.getenv("FIREBASE_SERVICE_ACCOUNT_PATH"))
    report("Firebase 서비스 계정 설정", has_fb)

    # 4) Firestore 연결 (임시 문서 쓰기 -> 읽기 -> 삭제)
    if has_fb:
        try:
            import firebase_admin
            from firebase_admin import credentials, firestore

            raw = os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON")
            if raw:
                cred = credentials.Certificate(json.loads(raw))
            else:
                cred = credentials.Certificate(os.getenv("FIREBASE_SERVICE_ACCOUNT_PATH"))
            if not firebase_admin._apps:
                firebase_admin.initialize_app(cred)
            db = firestore.client()
            ref = db.collection("_healthcheck").document("ping")
            ref.set({"t": int(time.time())})
            got = ref.get().to_dict()
            ref.delete()
            report("Firestore 쓰기/읽기/삭제", bool(got))
        except Exception as e:
            report("Firestore 연결", False, f"{type(e).__name__}: {str(e)[:120]}")
    else:
        report("Firestore 연결", False, "서비스 계정 설정이 없어 건너뜀")

    # 5) AI 호출 (아주 짧게, max_tokens 제한)
    if no_ai:
        print("[건너뜀] AI 호출 (--no-ai)")
    elif os.getenv("OPENAI_API_KEY") and os.getenv("OPENAI_MODEL"):
        try:
            from openai import OpenAI

            client = OpenAI(
                api_key=os.getenv("OPENAI_API_KEY"),
                base_url=os.getenv("OPENAI_BASE_URL") or None,
            )
            r = client.chat.completions.create(
                model=os.getenv("OPENAI_MODEL"),
                messages=[{"role": "user", "content": "한 단어로 인사해줘"}],
                max_tokens=10,
            )
            report("AI 호출", True, "응답: " + (r.choices[0].message.content or "").strip()[:30])
        except Exception as e:
            report("AI 호출", False, f"{type(e).__name__}: {str(e)[:120]}")
    else:
        report("AI 호출", False, "키 또는 모델명이 없어 건너뜀")

    print()
    print("모두 통과!" if all(results) else "실패한 항목을 위에서 확인하세요.")


if __name__ == "__main__":
    main()
