from flask import Flask, request, jsonify
from dotenv import load_dotenv
import os

load_dotenv()
KAKAO_KEY = os.getenv("KAKAO_REST_KEY")

app = Flask(__name__)

# 카테고리/세부메뉴 트리 (샘플)
CATEGORIES = {
    "중식": ["짜장면", "짬뽕", "탕수육"],
    "일식": ["초밥", "돈까스", "라멘"]
}

@app.get("/api/categories")
def categories():
    return jsonify({"ok": True, "data": CATEGORIES})

@app.post("/api/recommend")
def recommend():
    print("요청받음")
    body = request.get_json(force=True)
    cat = body.get("selectedCategory")
    exclude = set(body.get("excludeMenus", []))
    menus = [m for m in CATEGORIES.get(cat, []) if m not in exclude]
    menu = menus[0] if menus else None
    return jsonify({"ok": True, "menu": menu})

@app.get("/api/places")
def places():
    # 프론트에서 넘어온 쿼리
    menu = request.args.get("menu")
    x = float(request.args.get("x"))  # 경도
    y = float(request.args.get("y"))  # 위도
    radius = int(request.args.get("radius", 2000))

    # TODO: Kakao Local(FD6) 호출 + 데이터셋 필터링 + 캐시
    # 지금은 더미로 반환
    sample = [
        {"name": f"{menu} 잘하는 집 A", "address": "주소1", "tel": "02-111-2222",
         "lat": y, "lng": x, "distance": 420,
         "kakaomap_link": f"https://map.kakao.com/link/search/{menu}"},
        {"name": f"{menu} 잘하는 집 B", "address": "주소2", "tel": "02-333-4444",
         "lat": y, "lng": x, "distance": 950,
         "kakaomap_link": f"https://map.kakao.com/link/search/{menu}"}
    ]
    return jsonify({"ok": True, "count": len(sample), "places": sample})

if __name__ == "__main__":
    app.run(port=5000, debug=True)
