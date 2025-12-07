<<<<<<< HEAD
import pandas as pd
import json
from pathlib import Path

# ----------------------------
#  설정
# ----------------------------
DATASETS = [
    ("한식.xlsx", "korean"),
    ("중식.xlsx", "chinese"),
    ("일식.xlsx", "japanese"),
    ("동남아.xlsx", "southeast"),
    ("서양식.xlsx", "western"),
    ("기타.xlsx", "etc"),
]

NAME_COL = "사업장명"
TYPE_COL = "업태구분명"     
OUTPUT_JSON = "menu_index.json"

# ----------------------------
#  한 파일 → 메뉴 속성 생성
# ----------------------------
def build_index(path: str) -> dict:
    p = Path(path)

    if p.suffix.lower() == ".xlsx":
        df = pd.read_excel(p)
    else:
        df = pd.read_csv(p, encoding="utf-8-sig")

    # 메뉴 열 = 사업장명/업태구분명 제거
    menu_cols = [c for c in df.columns if c not in (NAME_COL, TYPE_COL)]

    menu_index = {}

    for col in menu_cols:
        values = df[col]

        mask = (
            (values == 1) |
            (values == 1.0) |
            (values == "1")
        )

        shops = (
            df.loc[mask, NAME_COL]
              .dropna()
              .astype(str)
              .unique()
              .tolist()
        )

        if shops:
            menu_index[col] = shops

    return menu_index

# ----------------------------
#  전체 카테고리 합치기
# ----------------------------
def main():
    result = {}

    for file, catname in DATASETS:
        print(f"[INFO] {file} 처리 중 → {catname}")
        result[catname] = build_index(file)

    with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    print(f"\n[완료] {OUTPUT_JSON} 생성됨.")
    print(f"카테고리 목록 → {list(result.keys())}")


if __name__ == "__main__":
    main()
=======
import pandas as pd
import json
from pathlib import Path

# ----------------------------
#  설정
# ----------------------------
DATASETS = [
    ("한식.xlsx", "korean"),
    ("중식.xlsx", "chinese"),
    ("일식.xlsx", "japanese"),
    ("동남아.xlsx", "southeast"),
    ("서양식.xlsx", "western"),
    ("기타.xlsx", "etc"),
]

NAME_COL = "사업장명"
TYPE_COL = "업태구분명"     
OUTPUT_JSON = "menu_index.json"

# ----------------------------
#  한 파일 → 메뉴 속성 생성
# ----------------------------
def build_index(path: str) -> dict:
    p = Path(path)

    if p.suffix.lower() == ".xlsx":
        df = pd.read_excel(p)
    else:
        df = pd.read_csv(p, encoding="utf-8-sig")

    # 메뉴 열 = 사업장명/업태구분명 제거
    menu_cols = [c for c in df.columns if c not in (NAME_COL, TYPE_COL)]

    menu_index = {}

    for col in menu_cols:
        values = df[col]

        mask = (
            (values == 1) |
            (values == 1.0) |
            (values == "1")
        )

        shops = (
            df.loc[mask, NAME_COL]
              .dropna()
              .astype(str)
              .unique()
              .tolist()
        )

        if shops:
            menu_index[col] = shops

    return menu_index

# ----------------------------
#  전체 카테고리 합치기
# ----------------------------
def main():
    result = {}

    for file, catname in DATASETS:
        print(f"[INFO] {file} 처리 중 → {catname}")
        result[catname] = build_index(file)

    with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    print(f"\n[완료] {OUTPUT_JSON} 생성됨.")
    print(f"카테고리 목록 → {list(result.keys())}")


if __name__ == "__main__":
    main()
>>>>>>> 9a35768762c2ed2a119fe54798063f487fe65531
