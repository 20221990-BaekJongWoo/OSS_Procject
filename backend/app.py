from flask import Flask, request, jsonify
from dotenv import load_dotenv
import os
import time
import math
import json
import requests
from typing import Dict, Any, List

# -------------------------
# 설정/초기화
# -------------------------
load_dotenv()
KAKAO_KEY = os.getenv("KAKAO_REST_KEY")
assert KAKAO_KEY, "KAKAO_REST_KEY 가 .env 에 필요합니다."

app = Flask(__name__)


with open(os.path.join(os.path.dirname(__file__), "menu_index.json"), "r", encoding="utf-8") as f:
    DATA = json.load(f)

# top-level 이 바로 korean / chinese / ... 이라 그대로 사용
MENU_INDEX: Dict[str, Dict[str, List[str]]] = DATA

# ★ 카카오 검색 최대 페이지 수
# 페이지당 검색결과 15개 최대 페이지는 45
MAX_KAKAO_PAGES = 10


# 간단 정규화: 공백만 제거 (띄어쓰기 유무만 무시)
def norm(s: str) -> str:
    return (s or "").replace(" ", "").strip()


# -------------------------
# 캐시 (메모리)
# -------------------------
TTL = 600  # 10분
GEO_CACHE: Dict[str, Dict[str, Any]] = {}


def geokey(lng: float, lat: float, radius: int) -> str:
    # 아주 단순 버킷화: 소수점 3자리(약 수백 m) + 반경
    return f"{round(lng, 3)}:{round(lat, 3)}:{radius}"


def save_cache(store: Dict, key: str, payload: Dict[str, Any]):
    store[key] = {"expires": time.time() + TTL, **payload}


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
    """
    Kakao Local FD6(음식점) 카테고리 검색
    x=경도(lng), y=위도(lat)
    """
    params = {
        "category_group_code": "FD6",
        "x": lng,
        "y": lat,
        "radius": radius,
        "page": page,
        "size": size,
        "sort": "accuracy",
    }
    r = requests.get(KAKAO_LOCAL, headers=HEADERS, params=params, timeout=3)
    r.raise_for_status()
    return r.json()


def dedup_places(docs: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    seen = set()
    out = []
    for d in docs:
        # place_name + 좌표로 간단 중복제거
        key = (norm(d.get("place_name", "")), d.get("x"), d.get("y"))
        if key in seen:
            continue
        seen.add(key)
        out.append(d)
    return out


def to_place_item(doc: Dict[str, Any], base_lng: float, base_lat: float) -> Dict[str, Any]:
    name = doc.get("place_name", "")
    address = doc.get("road_address_name") or doc.get("address_name") or ""
    tel = doc.get("phone", "")
    x = float(doc.get("x", 0.0))
    y = float(doc.get("y", 0.0))
    if doc.get("distance"):
        dist = int(float(doc["distance"]))
    else:
        dist = haversine_m(base_lat, base_lng, y, x)

    return {
        "name": name,
        "address": address,
        "tel": tel,
        "lat": y,
        "lng": x,
        "distance": dist,
        "kakaomap_link": f"https://map.kakao.com/link/search/{name}",
    }


# 거리 계산(m)
def haversine_m(lat1, lon1, lat2, lon2):
    R = 6371000
    p1 = math.radians(lat1)
    p2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return int(R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a)))


# -------------------------
# API
# -------------------------

@app.get("/api/categories")
def categories():
    """
     전체 메뉴 인덱스 반환
   
    """
    return jsonify({"ok": True, "data": MENU_INDEX})


@app.get("/api/places")
def places():
    """
    근처 음식점 중에서, 선택된 메뉴/브랜드에 해당하는 곳만 필터링해서 반환.

    프론트에서 넘기는 파라미터:
      - menu:   한글 메뉴 라벨 
      - menuId: 한글 메뉴 id 
      - cat:    "korean" / "chinese" / "japanese" / "southeast" / "western" / "etc"
      - x:      경도 (float)
      - y:      위도 (float)
      - radius: 반경 (m)
    """
    print("요청받음")
    # 1) 쿼리 파라미터
    menu_label = request.args.get("menu")       # 예쁜 이름용 (라벨)
    menu_id = request.args.get("menuId") or menu_label  # 실제 키로 쓸 값 (지금은 라벨과 동일)
    cat = request.args.get("cat") or ""         # korean / chinese / ...

    x = float(request.args.get("x"))
    y = float(request.args.get("y"))
    radius = int(request.args.get("radius", 2000))
    
    # cat 이 비어 있는 구버전 요청 대비용: 메뉴명으로 카테고리 추론
    if not cat and menu_id:
        cat = guess_category_by_menu(menu_id)

    # 2) 캐시 조회 / 생성 (FD6 전체 후보 가져오기)
    key = geokey(x, y, radius)
    entry = load_cache(GEO_CACHE, key)
    if not entry:
        docs_all: List[Dict[str, Any]] = []

        # ★ 여기부터: 여러 페이지 순차적으로 긁어오기
        page = 1
        while page <= MAX_KAKAO_PAGES:
            j = kakao_category_fd6(x, y, radius, page=page)
            docs_all.extend(j.get("documents", []))

            meta = j.get("meta", {}) or {}
            # meta.is_end 가 True면 다음 페이지 없음
            if meta.get("is_end"):
                break

            page += 1

        docs = dedup_places(docs_all)
        save_cache(GEO_CACHE, key, {
            "places": docs,
            "pages_loaded": page,
            "raw_count": len(docs_all),
        })
        entry = GEO_CACHE[key]

    base_docs = entry["places"]

    # 3) 메뉴 → 브랜드 리스트 (menu_index.json 기준)
    brands: List[str] = []
    if cat and menu_id:
        brands = MENU_INDEX.get(cat, {}).get(menu_id, [])
    elif menu_id:
        # cat 없이 들어온 경우를 위한 fallback
        for c, m in MENU_INDEX.items():
            if menu_id in m:
                brands = m[menu_id]
                cat = c
                break

    brand_keys = [norm(b) for b in brands]

    # 4) 매칭 (정규화 + 부분 일치, 공백만 무시)
    filtered: List[Dict[str, Any]] = []
    if brand_keys:
        for d in base_docs:
            pname_norm = norm(d.get("place_name", ""))
            for bk in brand_keys:
                if not bk:
                    continue
                if bk in pname_norm or pname_norm in bk:
                    filtered.append(to_place_item(d, x, y))
                    break

    # 거리순 정렬
    filtered.sort(key=lambda v: v.get("distance", 10 ** 9))

    return jsonify({
        "ok": True,
        "count": len(filtered),
        "cat": cat,
        "menu": menu_label,
        "menuId": menu_id,
        "places": filtered,
        # 디버깅용, 필요 없으면 프론트에서 무시
        "kakao_pages_loaded": entry.get("pages_loaded"),
        "kakao_raw_count": entry.get("raw_count"),
    })


# cat 파라미터가 없을 때
def guess_category_by_menu(menu_id: str) -> str:
    for cat, menu_dict in MENU_INDEX.items():
        if menu_id in menu_dict:
            return cat
    return ""


if __name__ == "__main__":
    app.run(port=5000, debug=True)
