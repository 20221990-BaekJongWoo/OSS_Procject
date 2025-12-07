// src/main.js

const $ = (s) => document.querySelector(s);

// 사운드 효과 함수
const audioContext = new (window.AudioContext || window.webkitAudioContext)();
function playTone(frequency, duration, type = "sine", volume = 0.3) {
  try {
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.frequency.value = frequency;
    oscillator.type = type;

    gainNode.gain.setValueAtTime(0, audioContext.currentTime);
    gainNode.gain.linearRampToValueAtTime(
      volume,
      audioContext.currentTime + 0.01
    );
    gainNode.gain.exponentialRampToValueAtTime(
      0.01,
      audioContext.currentTime + duration
    );

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + duration);
  } catch (e) {
    if (audioContext.state === "suspended") {
      audioContext.resume();
    }
  }
}

function playClickSound(frequency = 800, volume = 0.2, duration = 0.05) {
  playTone(frequency, duration, "sine", volume);
}

function playStartSound() {
  playTone(600, 0.15, "sine", 0.4);
  setTimeout(() => playTone(800, 0.1, "sine", 0.3), 100);
}

function playStopSound() {
  playTone(400, 0.2, "sine", 0.4);
  setTimeout(() => playTone(300, 0.3, "sine", 0.3), 150);
}

let MENUS_KOREAN = {};
let MENUS_OTHERS = {};

const CATEGORIES = ["korean", "chinese", "japanese", "southeast", "western", "etc"];

let currentCategory = "korean";
let currentSubcategory = "grill";

const excluded = new Set(); // 전역 제외 메뉴 id 모음

// 추천 결과 저장 (검색 때 사용)
let lastRecoId = null;
let lastRecoCat = null;
let lastRecoSub = null;
let lastRecoLabel = null;
let highlightedMenu = null; // 하이라이트할 메뉴 (추천 결과)
let recommendationMode = "roulette"; // 추천 방식 (roulette, claw, scratch)

// 즐겨찾기
const FAV_KEY = "fav_places_v1";
const favorites = new Set(JSON.parse(localStorage.getItem(FAV_KEY) || "[]"));

// 최근 검색
const RECENT_KEY = "recent_searches_v1";
let recentSearches = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");

// 정렬/필터
let currentSort = "distance";
let onlyFav = false;
let lastPlaces = [];
let lastGeo = null; // { x, y }

// 스킵 기능
const skipButton = $("#btn-skip");
let activeSkipHandler = null;
let pendingSkipRequest = false;

// 자동 제외
const autoExcludedMenuIds = new Set();

// 게임 전략
const gameStrategies = {};

// 전역 interval 관리
let globalRouletteInterval = null;

function updateGlobalInterval(interval) {
  if (globalRouletteInterval) {
    clearTimeout(globalRouletteInterval);
  }
  globalRouletteInterval = interval;
}

// 전역 변수: 카테고리 랜덤 결과 저장
let selectedCategoryFromRandom = null;

// id -> { cat, sub } 메타 정보 (백엔드 연동용/검색용)
const menuMeta = {};

// --------------------------
// 스킵 핸들러
// --------------------------
function setSkipHandler(handler) {
  activeSkipHandler = typeof handler === "function" ? handler : null;
  if (skipButton) {
    skipButton.disabled = !activeSkipHandler;
  }
  if (activeSkipHandler && pendingSkipRequest) {
    pendingSkipRequest = false;
    skipButton.disabled = true;
    activeSkipHandler();
  } else if (!activeSkipHandler) {
    pendingSkipRequest = false;
  }
}

setSkipHandler(null);

function primeSkipButton() {
  if (!skipButton) return;
  pendingSkipRequest = false;
  skipButton.disabled = false;
}

// [Concept: Decorator (perf + logging)]
function withLogging(name, fn) {
  return async (...args) => {
    const start = performance.now?.() ?? Date.now();
    const result = await fn(...args);
    const elapsed = (performance.now?.() ?? Date.now()) - start;
    return result;
  };
}

// --------------------------
// 메뉴 JSON 두 개 로드
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
    updateCategoryRandomButton();
  } catch (e) {
    console.error("❌ 메뉴 로드 실패:", e);
    $("#menu-chips").innerHTML =
      '<li class="muted">메뉴 데이터를 불러올 수 없습니다.</li>';
  }
}

// id → cat/sub 메타 정보 생성
function buildMenuMeta() {
  // 한식
  Object.entries(MENUS_KOREAN || {}).forEach(([sub, arr]) => {
    arr.forEach((m) => {
      menuMeta[m.id] = { cat: "korean", sub };
    });
  });
  // 나머지
  Object.entries(MENUS_OTHERS || {}).forEach(([cat, arr]) => {
    arr.forEach((m) => {
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

  CATEGORIES.forEach((key) => {
    const opt = document.createElement("option");
    opt.value = key;
    opt.textContent = labels[key] || key;
    sel.appendChild(opt);
  });

  sel.value = currentCategory;
}

// --------------------------
// 한식 세부 카테고리 렌더링
// --------------------------
function renderSubcategoryOptions() {
  const subSel = $("#subcategory");
  const subLabel = $("#subcat-label");

  // 한식이 아닐 때는 서브 카테고리 숨김
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

  // 현재 서브카테고리가 유효하지 않으면 기본값으로
  if (!MENUS_KOREAN[currentSubcategory] && currentSubcategory !== "all") {
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
    // 🔥 추가: 한식 전체
    all: "전체 (한식 전체)",
  };

  // 실제 표시 순서: 기존 서브카테고리들 + 마지막에 '전체'
  const allKeys = [...keys, "all"];

  allKeys.forEach((key) => {
    const opt = document.createElement("option");
    opt.value = key;
    opt.textContent = subLabels[key] || key;
    subSel.appendChild(opt);
  });

  subSel.value = currentSubcategory;
  subSel.style.display = "inline-block";
  subLabel.style.display = "inline-block";
}

// 카테고리 랜덤 버튼 표시/숨김 업데이트
function updateCategoryRandomButton() {
  const btnNormal = $("#btn-category-random");
  const btnKorean = $("#btn-category-random-korean");

  if (currentCategory === "korean") {
    if (btnNormal) btnNormal.style.display = "none";
    if (btnKorean)
      btnKorean.style.display = selectedCategoryFromRandom
        ? "none"
        : "inline-block";
  } else {
    if (btnNormal)
      btnNormal.style.display = selectedCategoryFromRandom
        ? "none"
        : "inline-block";
    if (btnKorean) btnKorean.style.display = "none";
  }
}

// --------------------------
// 현재 화면에 보여줄 메뉴 리스트
// --------------------------
function getVisibleMenuList() {
  if (currentCategory === "korean") {
    // 🔥 '전체' 탭일 때는 모든 한식 메뉴 합쳐서 반환
    if (currentSubcategory === "all") {
      return Object.values(MENUS_KOREAN || {}).flat();
    }
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

  list.forEach((m) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip";
    chip.textContent = m.label;
    chip.dataset.id = m.id;

    if (excluded.has(m.id)) chip.classList.add("excluded");

    // 하이라이트 상태 확인
    if (highlightedMenu === m.label) {
      chip.classList.add("highlight", "final");
    }

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
    autoExcludedMenuIds.delete(id);
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
  const ids = list.map((m) => m.id);
  const allExcluded =
    ids.length > 0 && ids.every((id) => excluded.has(id));

  if (allExcluded) {
    ids.forEach((id) => {
      excluded.delete(id);
      autoExcludedMenuIds.delete(id);
    });
  } else {
    ids.forEach((id) => excluded.add(id));
  }
  renderChips();
});

function updateToggleAllButton() {
  const btn = $("#btn-toggle-all");
  if (!btn) return;

  const list = getVisibleMenuList();
  const ids = list.map((m) => m.id);
  const excludedCount = ids.filter((id) => excluded.has(id)).length;
  const total = ids.length;
  btn.textContent =
    total > 0 && excludedCount >= total ? "전체 해제" : "전체 제외";
}

// --------------------------
// 사용 가능한 모든 메뉴 가져오기 (카테고리별)
// --------------------------
function getAllAvailableMenus() {
  const catCandidates = [];

  // 한식 전체 (세부 구분 없이)
  const korIds = Object.values(MENUS_KOREAN || {})
    .flat()
    .map((m) => m.id)
    .filter((id) => !excluded.has(id));
  if (korIds.length > 0) {
    catCandidates.push("korean");
  }

  // 나머지 카테고리
  Object.keys(MENUS_OTHERS || {}).forEach((cat) => {
    const ids = (MENUS_OTHERS[cat] || [])
      .map((m) => m.id)
      .filter((id) => !excluded.has(id));
    if (ids.length > 0) {
      catCandidates.push(cat);
    }
  });

  return catCandidates;
}

// 사용 가능한 카테고리 중에서 랜덤 하나 선택
function pickRandomAvailableCategory() {
  const cats = getAllAvailableMenus();
  if (!cats.length) return null;
  const idx = Math.floor(Math.random() * cats.length);
  return cats[idx];
}

// --------------------------
// 카테고리에서 사용 가능한 메뉴 가져오기
// --------------------------
function getAvailableMenusFromCategory(cat) {
  let candidates = [];

  if (cat === "korean") {
    // 한식이면 세부 구분 없이 전체 한식 메뉴에서 선택
    Object.entries(MENUS_KOREAN || {}).forEach(([sub, arr]) => {
      arr.forEach((m) => {
        if (!excluded.has(m.id)) {
          candidates.push({ ...m, sub });
        }
      });
    });
  } else {
    // 다른 카테고리면 해당 카테고리에서 선택
    (MENUS_OTHERS[cat] || []).forEach((m) => {
      if (!excluded.has(m.id)) {
        candidates.push({ ...m, sub: null });
      }
    });
  }

  return candidates;
}

// --------------------------
// 카테고리 랜덤 버튼 클릭 (룰렛 연출)
// --------------------------
function startCategoryRandom() {
  const container = $("#menu-chips");
  const originalHTML = container.innerHTML;
  container.innerHTML = "";
  container.style.display = "block";

  // 카테고리 후보 가져오기
  const catCandidates = getAllAvailableMenus();
  if (!catCandidates.length) {
    toast("추천할 카테고리가 없습니다");
    return;
  }

  // 카테고리 라벨 매핑
  const catLabels = {
    korean: "한식",
    chinese: "중식",
    japanese: "일식",
    southeast: "동남아",
    western: "서양식",
    etc: "기타",
  };

  // 슬롯머신 생성
  const catSlotMachine = document.createElement("div");
  catSlotMachine.className = "slot-machine";
  catSlotMachine.style.display = "flex";

  const catSlotItems = catCandidates.map((cat) => catLabels[cat] || cat);
  let catCurrentIndex = 0;
  let catSpeed = 50;
  let catRounds = 1;
  let catRoundCount = 0;
  let catSlotInterval = null;
  let catLastSoundTime = 0;
  let catHasFinished = false;

  catSlotItems.forEach((catLabelText, idx) => {
    const item = document.createElement("div");
    item.className = "slot-item";
    item.textContent = catLabelText;
    item.dataset.index = idx;
    catSlotMachine.appendChild(item);
  });

  container.appendChild(catSlotMachine);
  const catSlotElements = Array.from(
    catSlotMachine.querySelectorAll(".slot-item")
  );

  playStartSound();

  const finalizeCatSpin = (forcedIndex = null) => {
    if (catHasFinished) return;
    catHasFinished = true;
    if (catSlotInterval) {
      clearTimeout(catSlotInterval);
      catSlotInterval = null;
    }
    setSkipHandler(null);
    updateGlobalInterval(null);
    playStopSound();

    catSlotElements.forEach((el) =>
      el.classList.remove("active", "next")
    );

    let resolvedIndex;
    if (typeof forcedIndex === "number") {
      resolvedIndex =
        ((forcedIndex % catSlotElements.length) +
          catSlotElements.length) %
        catSlotElements.length;
    } else {
      const baseIndex =
        ((catCurrentIndex % catSlotElements.length) +
          catSlotElements.length) %
        catSlotElements.length;
      const randomOffset = Math.floor(
        Math.random() * Math.min(3, catSlotElements.length)
      );
      resolvedIndex = (baseIndex + randomOffset) % catSlotElements.length;
    }

    if (catSlotElements[resolvedIndex]) {
      catSlotElements[resolvedIndex].classList.add("active");
      catSlotElements[resolvedIndex].style.transform = "scale(1.1)";
      catSlotElements[resolvedIndex].style.transition =
        "transform 0.3s ease";
    }

    selectedCategoryFromRandom = catCandidates[resolvedIndex];

    // UI 업데이트
    currentCategory = selectedCategoryFromRandom;
    $("#category").value = selectedCategoryFromRandom;
    renderSubcategoryOptions();
    renderChips();

    // 카테고리 랜덤 버튼 숨기고 추천 버튼 활성화
    updateCategoryRandomButton();

    setTimeout(() => {
      container.innerHTML = originalHTML;
      renderChips();
    }, 1000);
  };

  setSkipHandler(() => finalizeCatSpin(catCurrentIndex));

  const spinCatSlot = () => {
    catSlotElements.forEach((el) => {
      el.classList.remove("active", "next");
    });

    const currentEl = catSlotElements[catCurrentIndex];
    const nextEl =
      catSlotElements[(catCurrentIndex + 1) % catSlotElements.length];

    if (currentEl) currentEl.classList.add("active");
    if (nextEl) nextEl.classList.add("next");

    const now = Date.now();
    if (now - catLastSoundTime >= Math.max(catSpeed * 0.7, 30)) {
      const speedRatio = Math.min(
        1,
        Math.max(0, (catSpeed - 50) / 200)
      );
      const frequency = 700 - speedRatio * 350;
      const volume = 0.2 - speedRatio * 0.1;
      const duration = 0.04 + speedRatio * 0.04;
      playClickSound(frequency, volume, duration);
      catLastSoundTime = now;
    }

    if (catRoundCount >= catRounds) {
      catSpeed += 12;
      if (catSpeed > 200) {
        finalizeCatSpin();
        return;
      }
    }

    catCurrentIndex = (catCurrentIndex + 1) % catSlotElements.length;

    if (catCurrentIndex === 0) {
      catRoundCount++;
    }

    catSlotInterval = setTimeout(spinCatSlot, catSpeed);
    updateGlobalInterval(catSlotInterval);
  };

  spinCatSlot();
  catSlotInterval = setTimeout(spinCatSlot, catSpeed);
  updateGlobalInterval(catSlotInterval);
}

// --------------------------
// 게임 전략: 룰렛 (슬롯머신)
// --------------------------
function startSlotMachine(availableChips, btn, recoEl) {
  const container = $("#menu-chips");
  const originalHTML = container.innerHTML;
  container.innerHTML = "";
  container.style.display = "block";

  // 카테고리 랜덤 결과가 있으면 그걸 쓰고, 없으면 사용 가능한 카테고리 중에서 자동 랜덤
  let selectedCat =
    selectedCategoryFromRandom || pickRandomAvailableCategory();
  if (!selectedCat) {
    recoEl.textContent = "추천할 메뉴가 없습니다";
    btn.classList.remove("loading");
    btn.disabled = false;
    container.innerHTML = originalHTML;
    return;
  }

  // 선택된 카테고리에서 메뉴 선택
  const candidates = getAvailableMenusFromCategory(selectedCat);
  if (!candidates.length) {
    recoEl.textContent = "추천할 메뉴가 없습니다";
    btn.classList.remove("loading");
    btn.disabled = false;
    return;
  }

  const slotMachine = document.createElement("div");
  slotMachine.className = "slot-machine";
  slotMachine.style.display = "flex";

  playStartSound();

  const slotItems = candidates.map((m) => m.label);
  let currentIndex = 0;
  let speed = 50;
  let rounds = 1;
  let roundCount = 0;
  let finalIndex = -1;
  let slotInterval = null;
  let lastSoundTime = 0;
  let hasFinished = false;

  slotItems.forEach((menu, idx) => {
    const item = document.createElement("div");
    item.className = "slot-item";
    item.textContent = menu;
    item.dataset.index = idx;
    slotMachine.appendChild(item);
  });

  container.appendChild(slotMachine);
  const slotElements = Array.from(
    slotMachine.querySelectorAll(".slot-item")
  );

  const finalizeSpin = (forcedIndex = null) => {
    if (hasFinished) return;
    hasFinished = true;
    if (slotInterval) {
      clearTimeout(slotInterval);
      slotInterval = null;
    }
    updateGlobalInterval(null);
    setSkipHandler(null);
    playStopSound();

    slotElements.forEach((el) =>
      el.classList.remove("active", "next")
    );

    const resolvedIndex = slotElements.length
      ? ((typeof forcedIndex === "number"
          ? forcedIndex
          : currentIndex) %
          slotElements.length +
          slotElements.length) %
        slotElements.length
      : 0;

    finalIndex = resolvedIndex;
    if (slotElements[finalIndex]) {
      slotElements[finalIndex].classList.add("active");
      slotElements[finalIndex].style.transform = "scale(1.1)";
      slotElements[finalIndex].style.transition =
        "transform 0.3s ease";
    }

    const finalMenu = slotItems[finalIndex] || "";
    highlightedMenu = finalMenu;

    // 추천 결과 저장 + 자동 제외
    const picked = candidates[finalIndex];
    if (picked) {
      lastRecoId = picked.id;
      lastRecoCat = selectedCat;
      lastRecoSub = picked.sub;
      lastRecoLabel = picked.label;

      if (!selectedCategoryFromRandom) {
        currentCategory = selectedCat;
        $("#category").value = selectedCat;
        renderSubcategoryOptions();
      }
      if (selectedCat === "korean" && picked.sub) {
        currentSubcategory = picked.sub;
        $("#subcategory").value = picked.sub;
      }

      autoExcludeMenu(picked.label, picked.id);
    } else {
      const found = candidates.find((m) => m.label === finalMenu);
      if (found) {
        lastRecoId = found.id;
        lastRecoCat = selectedCat;
        lastRecoSub = found.sub;
        lastRecoLabel = found.label;

        if (!selectedCategoryFromRandom) {
          currentCategory = selectedCat;
          $("#category").value = selectedCat;
          renderSubcategoryOptions();
        }
        if (selectedCat === "korean" && found.sub) {
          currentSubcategory = found.sub;
          $("#subcategory").value = found.sub;
        }

        autoExcludeMenu(found.label, found.id);
      }
    }

    recoEl.textContent = finalMenu
      ? `추천: ${finalMenu}`
      : "추천할 메뉴가 없습니다";
    recoEl.classList.add("show");

    setTimeout(() => {
      container.innerHTML = originalHTML;
      renderChips();
    }, 1000);

    btn.classList.remove("loading");
    btn.disabled = false;

    // 카테고리 랜덤 초기화
    selectedCategoryFromRandom = null;
    updateCategoryRandomButton();
  };

  setSkipHandler(() => finalizeSpin(currentIndex));

  const spinSlot = () => {
    slotElements.forEach((el) => {
      el.classList.remove("active", "next");
    });

    const currentEl = slotElements[currentIndex];
    const nextEl =
      slotElements[(currentIndex + 1) % slotElements.length];

    if (currentEl) currentEl.classList.add("active");
    if (nextEl) nextEl.classList.add("next");

    const now = Date.now();
    if (now - lastSoundTime >= Math.max(speed * 0.7, 30)) {
      const speedRatio = Math.min(
        1,
        Math.max(0, (speed - 50) / 200)
      );
      const frequency = 700 - speedRatio * 350;
      const volume = 0.2 - speedRatio * 0.1;
      const duration = 0.04 + speedRatio * 0.04;
      playClickSound(frequency, volume, duration);
      lastSoundTime = now;
    }

    if (roundCount >= rounds) {
      speed += 12;
      if (speed > 200) {
        finalizeSpin(currentIndex);
        return;
      }
    }

    currentIndex = (currentIndex + 1) % slotElements.length;

    if (currentIndex === 0) {
      roundCount++;
    }

    slotInterval = setTimeout(spinSlot, speed);
    updateGlobalInterval(slotInterval);
  };

  spinSlot();
  slotInterval = setTimeout(spinSlot, speed);
  updateGlobalInterval(slotInterval);
}

// --------------------------
// 게임 전략: 인형 뽑기
// --------------------------
function startClawMachine(availableChips, btn, recoEl) {
  const container = $("#menu-chips");
  const originalHTML = container.innerHTML;
  container.innerHTML = "";

  // 카테고리 랜덤 결과가 있으면 그걸 쓰고, 없으면 사용 가능한 카테고리 중에서 자동 랜덤
  let selectedCat =
    selectedCategoryFromRandom || pickRandomAvailableCategory();
  if (!selectedCat) {
    recoEl.textContent = "추천할 메뉴가 없습니다";
    btn.classList.remove("loading");
    btn.disabled = false;
    container.innerHTML = originalHTML;
    return;
  }

  // 선택된 카테고리에서 메뉴 선택
  const candidates = getAvailableMenusFromCategory(selectedCat);
  if (!candidates.length) {
    recoEl.textContent = "추천할 메뉴가 없습니다";
    btn.classList.remove("loading");
    btn.disabled = false;
    return;
  }

  const menuPool = candidates.map((m) => m.label);

  const clawArea = document.createElement("div");
  clawArea.className = "claw-area";

  const claw = document.createElement("div");
  claw.className = "claw";
  claw.id = "claw";
  clawArea.appendChild(claw);

  const capsulesContainer = document.createElement("div");
  capsulesContainer.className = "capsules-container";

  const capsuleCount = Math.min(30, Math.max(20, menuPool.length || 20));
  const colorClasses = ["color-0", "color-1", "color-2", "color-3"];
  for (let i = 0; i < capsuleCount; i += 1) {
    const capsule = document.createElement("div");
    const colorClass =
      colorClasses[Math.floor(Math.random() * colorClasses.length)];
    capsule.className = `capsule ${colorClass}`;
    const inner = document.createElement("div");
    inner.className = "capsule-text";
    inner.textContent = "?";
    capsule.appendChild(inner);
    const floatDelay = (Math.random() * 2).toFixed(2);
    const wobbleDelay = (Math.random() * 2).toFixed(2);
    const floatDuration = (2.4 + Math.random()).toFixed(2);
    const wobbleDuration = (2 + Math.random()).toFixed(2);
    capsule.style.animationDelay = `${floatDelay}s, ${wobbleDelay}s`;
    capsule.style.animationDuration = `${floatDuration}s, ${wobbleDuration}s`;
    capsulesContainer.appendChild(capsule);
  }

  clawArea.appendChild(capsulesContainer);
  const glassOverlay = document.createElement("div");
  glassOverlay.className = "claw-glass";
  clawArea.appendChild(glassOverlay);
  container.appendChild(clawArea);

  const resultBadge = document.createElement("div");
  resultBadge.className = "claw-result";
  resultBadge.textContent = "무엇이 나올까요?";
  container.appendChild(resultBadge);

  let clawPosition = 50;
  let clawDirection = 1;
  const clawMoveInterval = setInterval(() => {
    clawPosition += clawDirection * 0.5;
    if (clawPosition > 90 || clawPosition < 10) {
      clawDirection *= -1;
    }
    claw.style.left = `${clawPosition}%`;
  }, 20);

  function findNearestCapsule() {
    const clawRect = claw.getBoundingClientRect();
    const clawCenter = clawRect.left + clawRect.width / 2;
    let bestDist = Infinity;
    const bestCapsules = [];
    capsulesContainer.querySelectorAll(".capsule").forEach((capsule) => {
      const rect = capsule.getBoundingClientRect();
      const center = rect.left + rect.width / 2;
      const dist = Math.abs(center - clawCenter);
      if (dist < bestDist - 1) {
        bestDist = dist;
        bestCapsules.length = 0;
        bestCapsules.push(capsule);
      } else if (Math.abs(dist - bestDist) <= 2) {
        bestCapsules.push(capsule);
      }
    });
    if (!bestCapsules.length) return null;
    return bestCapsules[
      Math.floor(Math.random() * bestCapsules.length)
    ];
  }

  function showReveal(menu) {
    const overlay = document.createElement("div");
    overlay.className = "capsule-reveal";
    overlay.innerHTML = `
      <div class="reveal-emoji">${getFoodEmoji(menu)}</div>
      <div class="reveal-name">${menu}</div>
    `;
    container.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add("show"));
    setTimeout(() => overlay.remove(), 1600);
  }

  btn.classList.remove("loading");
  btn.disabled = false;

  const originalOnclick = btn.onclick;
  btn.onclick = () => {
    clearInterval(clawMoveInterval);
    btn.classList.add("loading");
    btn.disabled = true;
    playStartSound();

    claw.classList.add("dropping");

    setTimeout(() => {
      const targetCapsule =
        findNearestCapsule() ||
        capsulesContainer.querySelector(".capsule");
      const picked =
        candidates[Math.floor(Math.random() * candidates.length)];
      const selectedMenu = picked.label;

      if (targetCapsule) {
        targetCapsule.classList.add("picked");
        const textEl = targetCapsule.querySelector(".capsule-text");
        if (textEl) {
          textEl.textContent = getFoodEmoji(selectedMenu);
        }
      }
      playStopSound();
      resultBadge.textContent = `🎁 ${selectedMenu} 등장!`;
      showReveal(selectedMenu);

      setTimeout(() => {
        highlightedMenu = selectedMenu;

        // 추천 결과 저장 + 자동 제외
        if (picked) {
          lastRecoId = picked.id;
          lastRecoCat = selectedCat;
          lastRecoSub = picked.sub;
          lastRecoLabel = picked.label;

          if (!selectedCategoryFromRandom) {
            currentCategory = selectedCat;
            $("#category").value = selectedCat;
            renderSubcategoryOptions();
          }
          if (selectedCat === "korean" && picked.sub) {
            currentSubcategory = picked.sub;
            $("#subcategory").value = picked.sub;
          }

          autoExcludeMenu(selectedMenu, picked.id);
        }

        recoEl.textContent = `🎁 당첨: ${selectedMenu}!`;
        recoEl.classList.add("show");

        container.innerHTML = originalHTML;
        renderChips();
        btn.classList.remove("loading");
        btn.disabled = false;
        btn.onclick = originalOnclick;

        // 카테고리 랜덤 초기화
        selectedCategoryFromRandom = null;
        updateCategoryRandomButton();
      }, 1500);
    }, 2000);
  };
}

// --------------------------
// 게임 전략: 스크래치 복권
// --------------------------
function startScratchCard(availableChips, btn, recoEl) {
  const container = $("#menu-chips");
  const originalHTML = container.innerHTML;
  container.innerHTML = "";

  // 카테고리 랜덤 결과가 있으면 그걸 쓰고, 없으면 사용 가능한 카테고리 중에서 자동 랜덤
  let selectedCat =
    selectedCategoryFromRandom || pickRandomAvailableCategory();
  if (!selectedCat) {
    recoEl.textContent = "추천할 메뉴가 없습니다";
    btn.classList.remove("loading");
    btn.disabled = false;
    container.innerHTML = originalHTML;
    return;
  }

  // 선택된 카테고리에서 메뉴 선택
  const candidates = getAvailableMenusFromCategory(selectedCat);
  if (!candidates.length) {
    recoEl.textContent = "추천할 메뉴가 없습니다";
    btn.classList.remove("loading");
    btn.disabled = false;
    return;
  }

  const scratchArea = document.createElement("div");
  scratchArea.className = "scratch-area";

  const canvas = document.createElement("canvas");
  canvas.id = "scratch-canvas";

  const resultDiv = document.createElement("div");
  resultDiv.className = "scratch-result";
  const emojiDiv = document.createElement("div");
  emojiDiv.className = "result-emoji";
  const textDiv = document.createElement("div");
  textDiv.className = "result-text";
  resultDiv.appendChild(emojiDiv);
  resultDiv.appendChild(textDiv);

  scratchArea.appendChild(canvas);
  scratchArea.appendChild(resultDiv);
  container.appendChild(scratchArea);

  // 랜덤 메뉴 선택
  const picked =
    candidates[Math.floor(Math.random() * candidates.length)];
  const selectedMenu = picked.label;
  emojiDiv.textContent = getFoodEmoji(selectedMenu);
  textDiv.textContent = selectedMenu;

  // 캔버스 설정
  const rect = scratchArea.getBoundingClientRect();
  canvas.width = rect.width;
  canvas.height = rect.height;

  const ctx = canvas.getContext("2d");

  // 은색 레이어 그리기
  ctx.fillStyle = "#c0c0c0";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#888";
  ctx.font = "bold 36px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("긁어보세요!", canvas.width / 2, canvas.height / 2);

  let isScratching = false;
  const revealThreshold = 0.3; // 30% 긁으면 공개
  let revealed = false;

  function scratch(e) {
    if (revealed) return;

    const rect = canvas.getBoundingClientRect();
    const x =
      (e.clientX || (e.touches && e.touches[0]?.clientX) || 0) -
      rect.left;
    const y =
      (e.clientY || (e.touches && e.touches[0]?.clientY) || 0) -
      rect.top;

    // 원형으로 긁기
    ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath();
    ctx.arc(x, y, 40, 0, Math.PI * 2);
    ctx.fill();

    // 긁힌 픽셀 계산
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let transparent = 0;
    for (let i = 3; i < imageData.data.length; i += 4) {
      if (imageData.data[i] === 0) transparent++;
    }
    const scratchedPixels =
      transparent / (imageData.data.length / 4);

    // 30% 이상 긁히면 결과 공개
    if (scratchedPixels >= revealThreshold) {
      revealed = true;
      isScratching = false;
      playStopSound();
      canvas.style.opacity = "0";
      canvas.style.transition = "opacity 0.5s";

      setTimeout(() => {
        highlightedMenu = selectedMenu;

        // 추천 결과 저장 + 자동 제외
        if (picked) {
          lastRecoId = picked.id;
          lastRecoCat = selectedCat;
          lastRecoSub = picked.sub;
          lastRecoLabel = picked.label;

          if (!selectedCategoryFromRandom) {
            currentCategory = selectedCat;
            $("#category").value = selectedCat;
            renderSubcategoryOptions();
          }
          if (selectedCat === "korean" && picked.sub) {
            currentSubcategory = picked.sub;
            $("#subcategory").value = picked.sub;
          }

          autoExcludeMenu(selectedMenu, picked.id);
        }

        recoEl.textContent = `🎫 당첨: ${selectedMenu}!`;
        recoEl.classList.add("show");

        container.innerHTML = originalHTML;
        renderChips();

        // 카테고리 랜덤 초기화
        selectedCategoryFromRandom = null;
        updateCategoryRandomButton();
      }, 500);
    }
  }

  canvas.addEventListener("mousedown", (e) => {
    isScratching = true;
    scratch(e);
  });

  canvas.addEventListener("mousemove", (e) => {
    if (isScratching) scratch(e);
  });

  canvas.addEventListener("mouseup", () => {
    isScratching = false;
  });
  canvas.addEventListener("mouseleave", () => {
    isScratching = false;
  });

  canvas.addEventListener("touchstart", (e) => {
    e.preventDefault();
    isScratching = true;
    scratch(e);
  });

  canvas.addEventListener("touchmove", (e) => {
    e.preventDefault();
    if (isScratching) scratch(e);
  });

  canvas.addEventListener("touchend", () => {
    isScratching = false;
  });

  btn.classList.remove("loading");
  btn.disabled = false;
}

// 음식 이모지 매핑 함수
function getFoodEmoji(name) {
  const emojiMap = {
    김치찌개: "🍲",
    된장찌개: "🍲",
    순두부찌개: "🍲",
    부대찌개: "🍲",
    청국장: "🍲",
    갈비탕: "🍲",
    설렁탕: "🍲",
    육개장: "🍲",
    삼계탕: "🍲",
    감자탕: "🍲",
    돼지국밥: "🍲",
    소고기국밥: "🍲",
    순대국밥: "🍲",
    콩나물국밥: "🍲",
    얼큰이국밥: "🍲",
    내장국밥: "🍲",
    굴국밥: "🍲",
    선지해장국: "🍲",
    제육볶음: "🥩",
    오징어볶음: "🦑",
    불고기: "🥩",
    삼겹살: "🥓",
    닭갈비: "🍗",
    장어구이: "🐟",
    비빔밥: "🍚",
    돌솥비빔밥: "🍚",
    육회비빔밥: "🍚",
    뚝배기불고기: "🍲",
    곱창덮밥: "🍚",
    장조림덮밥: "🍚",
    칼국수: "🍜",
    잔치국수: "🍜",
    냉면: "🍜",
    비빔냉면: "🍜",
    콩국수: "🍜",
    김밥: "🍙",
    찜닭: "🍗",
    족발: "🍖",
    보쌈: "🥬",
    해물파전: "🥞",
    물회: "🍲",
    잡채: "🥢",
  };
  return emojiMap[name] || "🍽️";
}

// 자동 제외 (id 기반, label fallback)
function autoExcludeMenu(label, id) {
  if (id) {
    autoExcludedMenuIds.add(id);
    excluded.add(id);
  }
  // 화면 다시 렌더링해서 하이라이트/제외 상태 반영
  renderChips();
}

// --------------------------
// 인근 음식점 검색
// --------------------------
async function findPlaces() {
  if (!lastRecoId || !lastRecoCat) {
    toast("먼저 메뉴를 추천받아 주세요.");
    return;
  }

  const radiusInput = $("#radius");
  const radius = parseInt(radiusInput?.value || "1500", 10) || 1500;

  if (!navigator.geolocation) {
    toast("브라우저에서 위치 정보를 지원하지 않습니다.");
    return;
  }

  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const { latitude, longitude } = pos.coords;
      lastGeo = { x: longitude, y: latitude };

      const params = new URLSearchParams({
        x: String(longitude),
        y: String(latitude),
        radius: String(radius),
        menuId: lastRecoId,
        cat: lastRecoCat,
      });

      try {
        const res = await fetch(`/api/places?${params.toString()}`);
        if (!res.ok) {
          toast("가게 검색 중 오류가 발생했습니다.");
          return;
        }

        const data = await res.json();
        lastPlaces = data.places || [];
        renderPlaces();
      } catch (e) {
        console.error(e);
        toast("가게 검색에 실패했습니다.");
      }
    },

    (err) => {
      console.error(err);
      toast("위치 정보를 가져올 수 없습니다.");
    },

    
    {
      enableHighAccuracy: true,
      timeout: 8000,
      maximumAge: 0,
    }
  );
}

function renderPlaces() {
  const listEl = $("#list");
  listEl.innerHTML = "";

  let places = [...lastPlaces];

  if (onlyFav) {
    places = places.filter((p) => favorites.has(p.id));
  }

  if (currentSort === "distance") {
    places.sort((a, b) => (a.distance || 0) - (b.distance || 0));
  } else if (currentSort === "name") {
    places.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  }

  if (!places.length) {
    const li = document.createElement("li");
    li.className = "muted";
    li.textContent = "조건에 맞는 가게가 없습니다.";
    listEl.appendChild(li);
    return;
  }

  places.forEach((p) => {
    const li = document.createElement("li");

    const left = document.createElement("div");
    left.style.display = "flex";
    left.style.flexDirection = "column";
    left.style.gap = "2px";

    const name = document.createElement("div");
    name.textContent = p.name || "(이름 없음)";
    name.style.fontWeight = "600";

    const sub = document.createElement("div");
    sub.className = "muted";
    const dist =
      p.distance != null ? `${p.distance}m · ` : "";
    sub.textContent =
      dist + (p.address || p.road_address_name || "");

    left.appendChild(name);
    left.appendChild(sub);

    const right = document.createElement("div");
    right.style.display = "flex";
    right.style.gap = "8px";
    right.style.alignItems = "center";

    const link = document.createElement("a");
    link.href = p.url || "#";
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = "카카오맵";

    const favBtn = document.createElement("button");
    favBtn.type = "button";
    favBtn.textContent = favorites.has(p.id) ? "★" : "☆";
    favBtn.title = "즐겨찾기";
    favBtn.onclick = () => {
      if (favorites.has(p.id)) {
        favorites.delete(p.id);
      } else {
        favorites.add(p.id);
      }
      localStorage.setItem(FAV_KEY, JSON.stringify([...favorites]));
      renderPlaces();
    };

    right.appendChild(favBtn);
    right.appendChild(link);

    li.appendChild(left);
    li.appendChild(right);

    listEl.appendChild(li);
  });
}

// --------------------------
// 토스트
// --------------------------
let toastTimer = null;
function toast(msg) {
  const t = $("#toast");
  if (!t) return;
  t.textContent = msg;
  t.style.display = "block";
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    t.style.display = "none";
  }, 2000);
}

// --------------------------
// 테마 토글
// --------------------------
const themeToggle = $("#theme-toggle");
if (themeToggle) {
  const root = document.documentElement;
  let theme = localStorage.getItem("theme") || "dark";
  if (theme === "light") {
    root.setAttribute("data-theme", "light");
    themeToggle.textContent = "🌙 다크";
  } else {
    root.setAttribute("data-theme", "dark");
    themeToggle.textContent = "☀️ 라이트";
  }

  themeToggle.addEventListener("click", () => {
    const current = root.getAttribute("data-theme") || "dark";
    const next = current === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    localStorage.setItem("theme", next);
    themeToggle.textContent = next === "light" ? "🌙 다크" : "☀️ 라이트";
  });
}

// --------------------------
// 이벤트 바인딩
// --------------------------
$("#category")?.addEventListener("change", (e) => {
  currentCategory = e.target.value;
  highlightedMenu = null;
  renderSubcategoryOptions();
  renderChips();
  updateCategoryRandomButton();
});

$("#subcategory")?.addEventListener("change", (e) => {
  currentSubcategory = e.target.value;
  highlightedMenu = null;
  renderChips();
});

$("#btn-category-random")?.addEventListener("click", () => {
  startCategoryRandom();
});

$("#btn-category-random-korean")?.addEventListener("click", () => {
  startCategoryRandom();
});

$("#recommendation-mode")?.addEventListener("change", (e) => {
  recommendationMode = e.target.value;
});

const btnReco = $("#btn-reco");
const recoEl = $("#reco");

btnReco?.addEventListener("click", () => {
  if (btnReco.classList.contains("loading")) return;

  const available = getAllAvailableMenus();
  if (!available.length) {
    toast("추천할 수 있는 메뉴가 없습니다.");
    return;
  }

  recoEl.textContent = "";
  recoEl.classList.remove("show");

  btnReco.classList.add("loading");
  btnReco.disabled = true;
  primeSkipButton();

  const strategyMap = {
    roulette: startSlotMachine,
    claw: startClawMachine,
    scratch: startScratchCard,
  };

  const strat = strategyMap[recommendationMode] || startSlotMachine;
  strat(null, btnReco, recoEl);
});

$("#btn-find")?.addEventListener("click", () => {
  findPlaces();
});

$("#sort-select")?.addEventListener("change", (e) => {
  currentSort = e.target.value;
  renderPlaces();
});

$("#filter-fav")?.addEventListener("change", (e) => {
  onlyFav = e.target.checked;
  renderPlaces();
});

skipButton?.addEventListener("click", () => {
  if (skipButton.disabled) return;
  if (activeSkipHandler) {
    skipButton.disabled = true;
    activeSkipHandler();
  } else {
    pendingSkipRequest = true;
  }
});

// --------------------------
// 시작
// --------------------------
loadMenus();
