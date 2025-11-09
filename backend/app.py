from flask import Flask, request, jsonify
from dotenv import load_dotenv
import os, time, math, json, requests
from typing import Dict, Any, List

# -------------------------
# 설정/초기화
# -------------------------
load_dotenv()
KAKAO_KEY = os.getenv("KAKAO_REST_KEY")
assert KAKAO_KEY, "KAKAO_REST_KEY 가 .env 에 필요합니다."

app = Flask(__name__)

# 데이터셋 로드 (aliases 사용 안 함)
with open(os.path.join(os.path.dirname(__file__), "menu_index.json"), "r", encoding="utf-8") as f:
    DATA = json.load(f)
MENU_INDEX: Dict[str, Dict[str, List[str]]] = DATA.get("menu_index", {})

# 간단 정규화(공백 제거 + 소문자)
def norm(s: str) -> str:
    return (s or "").strip().lower().replace(" ", "")

# -------------------------
# 캐시 (메모리)
# -------------------------
TTL = 600  # 10분
GEO_CACHE: Dict[str, Dict[str, Any]] = {}

def geokey(lng: float, lat: float, radius: int) -> str:
    # 아주 단순 버킷화: 소수점 3자리(약 수백 m) + 반경
    return f"{round(lng,3)}:{round(lat,3)}:{radius}"

def save_cache(store: Dict, key: str, payload: Dict[str, Any]):
    store[key] = {"expires": time.time()+TTL, **payload}

def load_cache(store: Dict, key: str):
    v = store.get(key)
    if not v:
        return None
    if v["expires"] < time.time():
        store.pop(key, None)
        return None
    return v

# -------------------------
# Kakao Local REST 유틸
# -------------------------
KAKAO_LOCAL = "https://dapi.kakao.com/v2/local/search/category.json"
HEADERS = {"Authorization": f"KakaoAK {KAKAO_KEY}"}

def kakao_category_fd6(lng: float, lat: float, radius: int, page: int = 1, size: int = 15):
    # x=경도(lng), y=위도(lat)
    params = {
        "category_group_code": "FD6",
        # ⚠️ 실제 사용 시 아래 두 줄은 x: lng, y: lat 로 변경
        "x": lng,   # 테스트용 하드코딩
        "y": lat,  # 테스트용 하드코딩
        "radius": radius,
        "page": page,
        "size": size,
        "sort": "accuracy"
    }
    r = requests.get(KAKAO_LOCAL, headers=HEADERS, params=params, timeout=3)
    r.raise_for_status()
    return r.json()

def dedup_places(docs: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    seen = set()
    out = []
    for d in docs:
        # place_name + 좌표로 간단 중복제거
        key = (norm(d.get("place_name","")), d.get("x"), d.get("y"))
        if key in seen:
            continue
        seen.add(key)
        out.append(d)
    return out

def to_place_item(doc: Dict[str, Any], base_lng: float, base_lat: float) -> Dict[str, Any]:
    name = doc.get("place_name","")
    address = doc.get("road_address_name") or doc.get("address_name") or ""
    tel = doc.get("phone","")
    x = float(doc.get("x", 0.0))
    y = float(doc.get("y", 0.0))
    dist = int(float(doc.get("distance", 0.0))) if doc.get("distance") else haversine_m(base_lat, base_lng, y, x)
    return {
        "name": name,
        "address": address,
        "tel": tel,
        "lat": y, "lng": x,
        "distance": dist,
        "kakaomap_link": f"https://map.kakao.com/link/search/{name}"
    }

# 거리 계산(m)
def haversine_m(lat1, lon1, lat2, lon2):
    R = 6371000
    p1 = math.radians(lat1); p2 = math.radians(lat2)
    dphi = math.radians(lat2-lat1); dl = math.radians(lon2-lon1)
    a = math.sin(dphi/2)**2 + math.cos(p1)*math.cos(p2)*math.sin(dl/2)**2
    return int(R*2*math.atan2(math.sqrt(a), math.sqrt(1-a)))

# -------------------------
# API
# -------------------------

@app.get("/api/categories")
def categories():
    # 프론트 초기 로드용 트리 반환
    return jsonify({"ok": True, "data": MENU_INDEX})

@app.get("/api/places")
def places():
    # 쿼리 파라미터
    menu = request.args.get("menu")
    x = float(request.args.get("x"))
    y = float(request.args.get("y"))
    radius = int(request.args.get("radius", 2000))
    cat = guess_category_by_menu(menu)

    # 1) 캐시 조회/생성
    key = geokey(x, y, radius)
    entry = load_cache(GEO_CACHE, key)
    if not entry:
        docs_all: List[Dict[str, Any]] = []
        for p in (1, 2, 3):
            j = kakao_category_fd6(x, y, radius, page=p)
            docs_all.extend(j.get("documents", []))
            if not j.get("meta", {}).get("is_end", False) and p < 3:
                continue
        docs = dedup_places(docs_all)
        save_cache(GEO_CACHE, key, {"places": docs, "pages_loaded": 3})
        entry = GEO_CACHE[key]

    base_docs = entry["places"]

    # 2) 메뉴→지점 리스트
    brands: List[str] = MENU_INDEX.get(cat, {}).get(menu, []) if cat else []
    brand_keys = [norm(b) for b in brands]

    # 3) 매칭 (정규화 + 부분 일치)
    filtered: List[Dict[str, Any]] = []
    for d in base_docs:
        pname_norm = norm(d.get("place_name", ""))
        for bk in brand_keys:
            if bk in pname_norm or pname_norm in bk:
                filtered.append(to_place_item(d, x, y))
                break

    # 4) 거리순 정렬
    filtered.sort(key=lambda v: v.get("distance", 10**9))

    return jsonify({
        "ok": True,
        "count": len(filtered),
        "places": filtered
    })

def guess_category_by_menu(menu_id: str) -> str:
    for cat, menu_dict in MENU_INDEX.items():
        if menu_id in menu_dict:
            return cat
    return ""

# -------------------------
# 진입
# -------------------------
if __name__ == "__main__":
    app.run(port=5000, debug=True)
