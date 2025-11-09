const $ = (s) => document.querySelector(s);

let MENUS = {};                       // { korean: [...], chinese: [...], ... }
const excludedMap = {};               // { korean: Set([...]), ... }
const collapsedMap = {};              // { korean: boolean, ... }

const CATEGORY_LABELS = {
  korean: '한식',
  chinese: '중식',
  japanese: '일식',
  southeast: '동남아',
  western: '서양식',
  etc: '기타',
};

// 1) 메뉴 JSON 로드
async function loadMenus() {
  try {
    const res = await fetch('/src/menu.json');
    MENUS = await res.json();

    Object.keys(MENUS).forEach(cat => {
      excludedMap[cat] = new Set();
      collapsedMap[cat] = true; // 🔥 기본값: 전부 접혀있음
    });

    renderSections();
  } catch (e) {
    console.error('❌ 메뉴 로드 실패:', e);
    $('#menu-sections').innerHTML =
      '<li class="muted">메뉴 데이터를 불러올 수 없습니다.</li>';
  }
}

// 2) 카테고리별 섹션 렌더링
function renderSections() {
  const wrap = $('#menu-sections');
  if (!wrap) return;

  wrap.innerHTML = '';

  for (const [cat, menuList] of Object.entries(MENUS)) {
    const section = document.createElement('section');
    section.className = 'menu-section';

    const header = document.createElement('div');
    header.className = 'section-header';

    const exSet = excludedMap[cat] || new Set();
    const total = menuList.length;
    const excludedCount = exSet.size;
    const allExcluded = excludedCount >= total && total > 0;

    // 섹션 제목 버튼 (한식/중식 등) → 접기/펼치기
    const collapsed = collapsedMap[cat];
    const titleBtn = document.createElement('button');
    titleBtn.className = 'section-toggle';
    titleBtn.textContent = `${CATEGORY_LABELS[cat] || cat} ${collapsed ? '▸' : '▾'}`;
    titleBtn.onclick = () => {
      collapsedMap[cat] = !collapsedMap[cat];
      renderSections();
    };

    // 🔥 전체 제외 상태면 제목 색상 강조
    if (allExcluded) {
      titleBtn.style.color = '#b71c1c';
      titleBtn.style.fontWeight = '700';
    } else {
      titleBtn.style.color = '#222';
      titleBtn.style.fontWeight = '600';
    }

    header.appendChild(titleBtn);

    // 전체 제외/해제 버튼
    const btnToggleAll = document.createElement('button');
    btnToggleAll.textContent = allExcluded ? '전체 해제' : '전체 제외';
    btnToggleAll.onclick = () => {
      const set = excludedMap[cat];
      if (set.size >= total && total > 0) {
        set.clear();
      } else {
        menuList.forEach(m => set.add(m.id));
      }
      renderSections();
    };
    header.appendChild(btnToggleAll);

    section.appendChild(header);

    // 칩 영역
    const chipContainer = document.createElement('div');
    chipContainer.className = 'chips';
    chipContainer.style.display = collapsed ? 'none' : 'flex';

    menuList.forEach(m => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip';
      chip.textContent = m.label;
      chip.dataset.id = m.id;

      if (exSet.has(m.id)) chip.classList.add('excluded');

      chip.onclick = () => {
        const set = excludedMap[cat];
        if (set.has(m.id)) {
          set.delete(m.id);
        } else {
          set.add(m.id);
        }
        renderSections();
      };

      chipContainer.appendChild(chip);
    });

    section.appendChild(chipContainer);
    wrap.appendChild(section);
  }
}

// 3) 추천 (전체 카테고리에서 랜덤 + 추천된 메뉴 자동 제외)
$('#btn-reco').onclick = () => {
  const candidates = []; // { cat, item }

  for (const [cat, list] of Object.entries(MENUS)) {
    const exSet = excludedMap[cat] || new Set();
    list.forEach(m => {
      if (!exSet.has(m.id)) {
        candidates.push({ cat, item: m });
      }
    });
  }

  if (!candidates.length) {
    $('#reco').textContent = '추천 없음 (모두 제외됨)';
    return;
  }

  const pickedObj = candidates[Math.floor(Math.random() * candidates.length)];
  const { cat, item } = pickedObj;

  // 추천된 메뉴를 자동 제외 처리
  excludedMap[cat].add(item.id);

  renderSections();
  $('#reco').textContent = `추천: ${item.label}`;
};

// 4) 내 위치로 검색
$('#btn-search').onclick = async () => {
  if (!navigator.geolocation) return alert('Geolocation 미지원');

  const radius = Number($('#radius').value || 2000);
  const recoText = $('#reco').textContent.replace('추천: ', '').trim();
  if (!recoText) return alert('먼저 추천을 받아주세요.');

  $('#list').innerHTML = '<li class="muted">위치 확인 중...</li>';

  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const { latitude: y, longitude: x } = pos.coords;
      const url = `/api/places?menu=${encodeURIComponent(
        recoText
      )}&x=${x}&y=${y}&radius=${radius}`;
      try {
        const res = await fetch(url);
        const data = await res.json();
        renderList(data?.places || []);
      } catch (e) {
        console.error(e);
        $('#list').innerHTML = '<li class="muted">검색 실패</li>';
      }
    },
    (err) => {
      console.error(err);
      $('#list').innerHTML =
        '<li class="muted">위치 권한 필요 또는 실패</li>';
    }
  );
};

// 5) 근처 식당 리스트 렌더링
function renderList(places) {
  const ul = $('#list');
  ul.innerHTML = '';
  if (!places.length) {
    ul.innerHTML = '<li class="muted">근처 결과가 없어요</li>';
    return;
  }
  places.forEach(p => {
    const li = document.createElement('li');
    const link = `https://map.kakao.com/link/search/${encodeURIComponent(
      p.name || ''
    )}`;
    li.innerHTML = `${p.name} - ${p.address ?? ''} (${p.distance ?? '?'}m)
      <a href="${link}" target="_blank" rel="noreferrer">카카오맵</a>`;
    ul.appendChild(li);
  });
}

// 6) 초기 로드
loadMenus();
