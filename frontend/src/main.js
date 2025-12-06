// src/main.js

const $ = (s) => document.querySelector(s);

let MENUS_KOREAN = {};  
let MENUS_OTHERS = {};   

const CATEGORIES = ["korean", "chinese", "japanese", "southeast", "western", "etc"];

let currentCategory = "korean";
let currentSubcategory = "grill";

const excluded = new Set();  // 전역 제외 메뉴 id 모음

// 추천 결과 저장 (검색 때 사용)
let lastRecoId = null;
let lastRecoCat = null;
let lastRecoSub = null;

// id -> { cat, sub } 메타 정보 (백엔드 연동용/검색용)
const menuMeta = {};

// --------------------------
//  메뉴 JSON 두 개 로드
// --------------------------
async function loadMenus() {
  try {
    const [resKor, resOthers] = await Promise.all([
      fetch("/src/menu_korean.json"),
      fetch("/src/menu_others.json"),
    ]);

    MENUS_KOREAN = await resKor.json();
    MENUS_OTHERS = await resOthers.json();

    buildMenuMeta();
    renderCategoryOptions();
    renderSubcategoryOptions();
    renderChips();
  } catch (e) {
    console.error("❌ 메뉴 로드 실패:", e);
    $("#menu-chips").innerHTML = '<li class="muted">메뉴 데이터를 불러올 수 없습니다.</li>';
  }
}

// id → cat/sub 메타 정보 생성
function buildMenuMeta() {
  // 한식
  Object.entries(MENUS_KOREAN || {}).forEach(([sub, arr]) => {
    arr.forEach(m => {
      menuMeta[m.id] = { cat: "korean", sub };
    });
  });
  // 나머지
  Object.entries(MENUS_OTHERS || {}).forEach(([cat, arr]) => {
    arr.forEach(m => {
      menuMeta[m.id] = { cat, sub: null };
    });
  });
}

// --------------------------
// 카테고리 셀렉트 렌더링
// --------------------------
function renderCategoryOptions() {
  const sel = $("#category");
  sel.innerHTML = "";

  const labels = {
    korean: "한식",
    chinese: "중식",
    japanese: "일식",
    southeast: "동남아",
    western: "서양식",
    etc: "기타",
  };

  CATEGORIES.forEach(key => {
    const opt = document.createElement("option");
    opt.value = key;
    opt.textContent = labels[key] || key;
    sel.appendChild(opt);
  });

  sel.value = currentCategory;
}

// --------------------------
//한식 세부 카테고리 렌더링
// --------------------------
function renderSubcategoryOptions() {
  const subSel = $("#subcategory");
  const subLabel = $("#subcat-label");

  if (currentCategory !== "korean") {
    subSel.style.display = "none";
    subLabel.style.display = "none";
    return;
  }

  const keys = Object.keys(MENUS_KOREAN || {});
  if (!keys.length) {
    subSel.style.display = "none";
    subLabel.style.display = "none";
    return;
  }

  // 현재 서브카테고리 유효성 체크
  if (!MENUS_KOREAN[currentSubcategory]) {
    currentSubcategory = keys[0];
  }

  subSel.innerHTML = "";
  const subLabels = {
    grill: "구이류",
    stew: "찌개/탕",
    gukbap: "국밥류",
    noodle: "면류",
    jeongol: "전골",
    seafood: "해산물",
    snack: "분식/간단",
    health: "보양식",
    anju: "안주류",
    rice: "밥류",
    other: "기타",
  };

  keys.forEach(key => {
    const opt = document.createElement("option");
    opt.value = key;
    opt.textContent = subLabels[key] || key;
    subSel.appendChild(opt);
  });

  subSel.value = currentSubcategory;
  subSel.style.display = "inline-block";
  subLabel.style.display = "inline-block";
}

// --------------------------
// 현재 화면에 보여줄 메뉴 리스트
// --------------------------
function getVisibleMenuList() {
  if (currentCategory === "korean") {
    return MENUS_KOREAN[currentSubcategory] || [];
  } else {
    return MENUS_OTHERS[currentCategory] || [];
  }
}

// --------------------------
// 칩 렌더링
// --------------------------
function renderChips() {
  const wrap = $("#menu-chips");
  wrap.innerHTML = "";

  const list = getVisibleMenuList();

  list.forEach(m => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip";
    chip.textContent = m.label;
    chip.dataset.id = m.id;

    if (excluded.has(m.id)) chip.classList.add("excluded");

    chip.onclick = () => toggleChip(chip, m.id);
    wrap.appendChild(chip);
  });

  updateToggleAllButton();
}

// 개별 토글
function toggleChip(el, id) {
  if (excluded.has(id)) {
    excluded.delete(id);
    el.classList.remove("excluded");
  } else {
    excluded.add(id);
    el.classList.add("excluded");
  }
  updateToggleAllButton();
}

// --------------------------
// 전체 제외/해제 버튼
// --------------------------
$("#btn-toggle-all")?.addEventListener("click", () => {
  const list = getVisibleMenuList();
  const ids = list.map(m => m.id);
  const allExcluded = ids.length > 0 && ids.every(id => excluded.has(id));

  if (allExcluded) {
    ids.forEach(id => excluded.delete(id));
  } else {
    ids.forEach(id => excluded.add(id));
  }
  renderChips();
});

function updateToggleAllButton() {
  const btn = $("#btn-toggle-all");
  const list = getVisibleMenuList();
  const ids = list.map(m => m.id);
  const excludedCount = ids.filter(id => excluded.has(id)).length;
  const total = ids.length;
  btn.textContent = total > 0 && excludedCount >= total ? "전체 해제" : "전체 제외";
}

// --------------------------
// 추천
// --------------------------
$("#btn-reco").onclick = () => {
  // 1. 카테고리별로 아직 남아 있는 메뉴가 있는지 확인
  const catCandidates = [];

  // 한식
  const korIds = Object.values(MENUS_KOREAN || {})
    .flat()
    .map(m => m.id)
    .filter(id => !excluded.has(id));
  if (korIds.length > 0) catCandidates.push("korean");

  // 나머지
  Object.keys(MENUS_OTHERS || {}).forEach(cat => {
    const ids = (MENUS_OTHERS[cat] || [])
      .map(m => m.id)
      .filter(id => !excluded.has(id));
    if (ids.length > 0) catCandidates.push(cat);
  });

  if (!catCandidates.length) {
    $("#reco").textContent = "모든 메뉴가 제외되어 있어요";
    lastRecoId = null;
    lastRecoCat = null;
    lastRecoSub = null;
    return;
  }

  // 2. 대분류 랜덤
  const cat = catCandidates[Math.floor(Math.random() * catCandidates.length)];
  let candidates = [];

  if (cat === "korean") {
    Object.entries(MENUS_KOREAN || {}).forEach(([sub, arr]) => {
      arr.forEach(m => {
        if (!excluded.has(m.id)) {
          candidates.push({ ...m, sub });
        }
      });
    });
  } else {
    (MENUS_OTHERS[cat] || []).forEach(m => {
      if (!excluded.has(m.id)) candidates.push({ ...m, sub: null });
    });
  }

  if (!candidates.length) {
    $("#reco").textContent = "추천할 메뉴가 없습니다";
    return;
  }

  // 3. 해당 카테고리 내 랜덤
  const picked = candidates[Math.floor(Math.random() * candidates.length)];
  lastRecoId = picked.id;
  lastRecoCat = cat;
  lastRecoSub = picked.sub;

  // 추천된 메뉴 자동 제외
  excluded.add(picked.id);

  // UI도 그 카테고리/서브카테고리로 맞춰 줌 (선택사항이지만 편함)
  currentCategory = cat;
  $("#category").value = cat;
  renderSubcategoryOptions();
  if (cat === "korean" && picked.sub) {
    currentSubcategory = picked.sub;
    $("#subcategory").value = picked.sub;
  }

  // 칩 다시 그려서 방금 추천된 메뉴가 '빨간 제외 상태'로 보이게
  renderChips();

  const pretty = picked.label;
  $("#reco").textContent = `추천: ${pretty}`;
};
// --------------------------
// 위치 검색 (/api/places 호출)
//   - 현재는 기존 백엔드 호환 위해 menu=한글라벨 사용
// --------------------------
$("#btn-search").onclick = async () => {
  if (!navigator.geolocation) return alert("Geolocation 미지원");

  if (!lastRecoId || !lastRecoCat) {
    return alert("먼저 추천을 받아주세요.");
  }

  const radius = Number($("#radius").value || 2000);
  const { label } = findLabelAndMetaById(lastRecoId) || {};
  if (!label) {
    return alert("추천 메뉴 정보를 찾을 수 없습니다.");
  }

  $("#list").innerHTML = '<li class="muted">위치 확인 중...</li>';

  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const { latitude: y, longitude: x } = pos.coords;

      const params = new URLSearchParams({
        menu: label,              // 현재 백엔드 호환용
        cat: lastRecoCat,         // 추후 백엔드 개편 시 사용
        menuId: lastRecoId,
      });
      if (lastRecoCat === "korean" && lastRecoSub) {
        params.append("sub", lastRecoSub);
      }
      params.append("x", String(x));
      params.append("y", String(y));
      params.append("radius", String(radius));

      const url = `/api/places?${params.toString()}`;

      try {
        const res = await fetch(url);
        const data = await res.json();
        renderList(data?.places || []);
      } catch (e) {
        console.error(e);
        $("#list").innerHTML = '<li class="muted">검색 실패</li>';
      }
    },
    (err) => {
      console.error(err);
      $("#list").innerHTML = '<li class="muted">위치 권한 필요 또는 실패</li>';
    }
  );
};

// --------------------------
// 근처 식당 리스트 
// --------------------------
function renderList(places) {
  const ul = $("#list");
  ul.innerHTML = "";
  if (!places.length) {
    ul.innerHTML = '<li class="muted">근처 결과가 없어요</li>';
    return;
  }
  places.forEach(p => {
    const li = document.createElement("li");
    const link = `https://map.kakao.com/link/search/${encodeURIComponent(p.name || "")}`;
    li.innerHTML = `${p.name} - ${p.address ?? ""} (${p.distance ?? "?"}m)
      <a href="${link}" target="_blank" rel="noreferrer">카카오맵</a>`;
    ul.appendChild(li);
  });
}

// --------------------------
//  id → label/meta 찾기
// --------------------------
function findLabelAndMetaById(id) {
  if (!id) return null;

  // 한식
  for (const [sub, arr] of Object.entries(MENUS_KOREAN || {})) {
    const f = arr.find(m => m.id === id);
    if (f) return { label: f.label, cat: "korean", sub };
  }
  // 나머지
  for (const [cat, arr] of Object.entries(MENUS_OTHERS || {})) {
    const f = arr.find(m => m.id === id);
    if (f) return { label: f.label, cat, sub: null };
  }
  return null;
}


$("#category").addEventListener("change", (e) => {
  currentCategory = e.target.value;
  renderSubcategoryOptions();
  renderChips();
});

$("#subcategory").addEventListener("change", (e) => {
  currentSubcategory = e.target.value;
  renderChips();
});

// --------------------------
// 12️⃣ 시작
// --------------------------
loadMenus();
