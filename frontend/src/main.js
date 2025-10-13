const $ = (s) => document.querySelector(s);

// 카테고리별 메뉴 id(slug) 리스트
const MENUS = {
  chinese: [
    { id: 'jjajang', label: '짜장면' },
    { id: 'jjambbong', label: '짬뽕' },
    { id: 'tangsuyuk', label: '탕수육' },
    { id: 'malatang', label: '마라탕' }
  ],
  japanese: [
    { id: 'sushi', label: '초밥' },
    { id: 'donkatsu', label: '돈까스' },
    { id: 'ramen', label: '라멘' },
    { id: 'udon', label: '우동' }
  ],
  korean: [
    { id: 'gukbap', label: '국밥류' },
    { id: 'jjigae', label: '찌개/전골' },
    { id: 'bbq', label: '고기구이' },
    { id: 'chicken', label: '치킨' }
  ],
  western: [
    { id: 'pasta', label: '파스타' },
    { id: 'pizza', label: '피자' },
    { id: 'steak', label: '스테이크' },
    { id: 'burger', label: '햄버거' }
  ],
};

// 현재 상태
let currentCategory = $('#category').value;   // 'chinese' 등
const excluded = new Set();                   // 제외된 메뉴 id 저장

// 메뉴 칩 렌더
function renderChips() {
  excluded.clear(); // 카테고리 바뀌면 제외 초기화
  const wrap = $('#menu-chips');
  wrap.innerHTML = '';
  MENUS[currentCategory].forEach(({ id, label }) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip';
    chip.dataset.id = id;
    chip.textContent = label;
    chip.onclick = () => toggleMenu(chip, id);
    wrap.appendChild(chip);
  });
}

// 토글 핸들러
function toggleMenu(el, id) {
  if (excluded.has(id)) {
    excluded.delete(id);
    el.classList.remove('excluded');
  } else {
    excluded.add(id);
    el.classList.add('excluded');
  }
}

// 카테고리 변경 시 칩 업데이트
$('#category').addEventListener('change', (e) => {
  currentCategory = e.target.value;
  $('#reco').textContent = ''; // 이전 추천 초기화
  renderChips();
});

// 추천받기
$('#btn-reco').onclick = async () => {
  const selectedCategory = currentCategory;
  const body = {
    selectedCategory,
    excludeMenus: Array.from(excluded) // ["jjambbong","malatang"]
  };
  try {
    $('#reco').textContent = '추천 계산 중...';
    const res = await fetch('/api/recommend', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify(body)
    });
    const data = await res.json();
    $('#reco').textContent = data?.menu ? `추천: ${prettyLabel(data.menu)}` : '추천 없음';
  } catch (e) {
    $('#reco').textContent = '추천 실패';
  }
};

// 내 위치로 검색
$('#btn-search').onclick = async () => {
  if (!navigator.geolocation) return alert('Geolocation 미지원');

  const radius = Number($('#radius').value || 2000);
  const recoText = $('#reco').textContent;
  // 서버는 메뉴 id(slug)를 기대한다 가정. 추천에서 받은 값이 label이면 맵핑 필요.
  const fallback = MENUS[currentCategory][0]?.id || 'jjajang';
  const menuId = findMenuIdFromRecoText(recoText) || fallback;

  $('#list').innerHTML = '<li class="muted">위치 확인 중...</li>';
  navigator.geolocation.getCurrentPosition(async pos => {
    const { latitude: y, longitude: x } = pos.coords;
    const url = `/api/places?menu=${encodeURIComponent(menuId)}&x=${x}&y=${y}&radius=${radius}`;
    try {
      const res = await fetch(url);
      const data = await res.json();
      renderList(data?.places || []);
    } catch (e) {
      $('#list').innerHTML = '<li class="muted">검색 실패</li>';
    }
  }, err => {
    $('#list').innerHTML = '<li class="muted">위치 권한 필요 또는 실패</li>';
  });
};

// 결과 리스트 렌더
function renderList(places) {
  const ul = $('#list');
  ul.innerHTML = '';
  if (!places.length) {
    ul.innerHTML = '<li class="muted">근처 결과가 없어요</li>';
    return;
  }
  places.forEach(p => {
    const li = document.createElement('li');
    const link = `https://map.kakao.com/link/search/${encodeURIComponent(p.name || '')}`;
    li.innerHTML = `${p.name} - ${p.address ?? ''} (${p.distance ?? '?'}m)
      <a href="${link}" target="_blank" rel="noreferrer">카카오맵</a>`;
    ul.appendChild(li);
  });
}

// 추천 텍스트에서 메뉴 id 추출(데모용)
function findMenuIdFromRecoText(txt) {
  // "추천: 짜장면" → 'jjajang' 같은 id로 맵핑
  const label = txt.replace('추천: ', '').trim();
  if (!label) return null;
  for (const cat of Object.values(MENUS)) {
    const f = cat.find(m => m.label === label);
    if (f) return f.id;
  }
  return null;
}

// 서버에서 받은 id → 사용자 표기 라벨
function prettyLabel(id) {
  for (const cat of Object.values(MENUS)) {
    const f = cat.find(m => m.id === id);
    if (f) return f.label;
  }
  return id;
}

// 초기 렌더
renderChips();
