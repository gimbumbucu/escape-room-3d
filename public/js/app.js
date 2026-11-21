/**
 * 메인 애플리케이션 제어 스크립트 (App.js)
 * 학생 플로우: 등록 -> 캐릭터 선택 -> 3D 방 탐험 -> 문제 풀이 & 재료 수집 -> 가구 제작 -> 방 탈출 -> 최종 랭킹
 */

window.App = (function () {
  let studentData = {
    id: null,
    grade: '1',
    classNum: '1',
    studentNum: '1',
    name: '',
    character: 'char_boy_1',
    score: 0,
    wood: 0,
    metal: 0,
    craftedFurnitures: [],
    solvedQuestions: [],
    escaped: false
  };

  let gameConfig = {
    settings: {
      siteTitle: '3D 방탈출 아카데미',
      escapeRequiredFurnitures: 2,
      activeQuestionCount: 8
    },
    rooms: [],
    furnitures: [],
    questions: []
  };

  let selectedFurnId = 'furn_chair';
  let currentActiveQuestion = null;

  // 현재 커스터마이징 파츠 상태
  let currentCustom = {
    skinColor: 0xffdbac,
    hairStyle: 'dandy',
    hairColor: 0x1f2937,
    topStyle: 'uniform',
    topColor: 0x1e3a8a,
    bottomStyle: 'slacks',
    bottomColor: 0x1e293b,
    shoesStyle: 'loafers',
    shoesColor: 0x0f172a,
    hasGlasses: false,
    hasBackpack: true,
    backpackColor: 0x334155
  };

  // -------------------------------------------------------------
  // [1] 앱 초기화
  // -------------------------------------------------------------
  async function init() {
    await fetchGameConfig();
    initScreenNavigation();
    initCharacterSelection();
    initModals();
    initMobileControls();

    // 관리자 모듈 초기화
    if (window.Admin) {
      window.Admin.init();
    }
  }

  // 서버로부터 게임 초기 설정 로드
  async function fetchGameConfig() {
    try {
      const res = await fetch('/api/game/config');
      const data = await res.json();
      if (data.success) {
        gameConfig = data;
        updateGoalRequirementDisplay();
      }
    } catch (err) {
      console.error('Failed to load game config:', err);
    }
  }

  // 화면 전환 헬퍼
  function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const target = document.getElementById(screenId);
    if (target) target.classList.add('active');
  }

  // -------------------------------------------------------------
  // [2] 화면 1: 학생 참가 등록
  // -------------------------------------------------------------
  function initScreenNavigation() {
    const formLogin = document.getElementById('form-student-login');
    if (formLogin) {
      formLogin.addEventListener('submit', async (e) => {
        e.preventDefault();
        const grade = document.getElementById('input-grade').value;
        const classNum = document.getElementById('input-class').value;
        const studentNum = document.getElementById('input-num').value;
        const name = document.getElementById('input-name').value.trim();

        if (!grade || !name || !classNum || !studentNum) {
          alert('학년, 반, 번호, 이름을 모두 선택 및 입력해주세요.');
          return;
        }

        // 임시 학생 정보 저장
        studentData.grade = grade;
        studentData.classNum = classNum;
        studentData.studentNum = studentNum;
        studentData.name = name;

        // 상단 배지 갱신
        const badge = document.getElementById('char-user-badge');
        if (badge) {
          badge.innerHTML = `<i class="fa-solid fa-user-graduate"></i> ${classNum}반 ${name}`;
        }

        // 캐릭터 선택 화면으로 전환
        showScreen('screen-character');

        // 캐릭터 3D 프리뷰 캔버스 초기화
        setTimeout(() => {
          Game3D.initPreview('char-preview-canvas-container', currentCustom);
        }, 100);
      });
    }

    // 뒤로 가기 (캐릭터 선택 -> 로그인)
    const btnBack = document.getElementById('btn-back-to-login');
    if (btnBack) {
      btnBack.addEventListener('click', () => {
        showScreen('screen-login');
      });
    }

    // 캐릭터 선택 완료 및 게임 시작 버튼
    const btnConfirmChar = document.getElementById('btn-confirm-character');
    if (btnConfirmChar) {
      btnConfirmChar.addEventListener('click', async () => {
        studentData.character = currentCustom;
        await registerStudentOnServer();
      });
    }

    // 3D 뷰포트 회전 및 랜덤 버튼 바인딩
    const btnRotL = document.getElementById('btn-rotate-left');
    if (btnRotL) btnRotL.addEventListener('click', () => Game3D.rotatePreview('left'));
    const btnRotF = document.getElementById('btn-rotate-front');
    if (btnRotF) btnRotF.addEventListener('click', () => Game3D.rotatePreview('front'));
    const btnRotR = document.getElementById('btn-rotate-right');
    if (btnRotR) btnRotR.addEventListener('click', () => Game3D.rotatePreview('right'));

    const btnRandom = document.getElementById('btn-random-avatar');
    if (btnRandom) {
      btnRandom.addEventListener('click', () => {
        generateRandomAvatar();
      });
    }

    // 하단 보조 버튼들
    document.getElementById('btn-show-qr').addEventListener('click', openQRCodeModal);
    document.getElementById('btn-open-rank-login').addEventListener('click', openRankingModal);
    document.getElementById('btn-open-admin-login').addEventListener('click', () => {
      if (window.Admin) window.Admin.openAdminModal();
    });
    document.getElementById('btn-open-admin-from-game').addEventListener('click', () => {
      if (window.Admin) window.Admin.openAdminModal();
    });
  }

  // 서버에 학생 등록 후 3D 인게임 진입
  async function registerStudentOnServer() {
    try {
      const res = await fetch('/api/students/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grade: studentData.grade,
          classNum: studentData.classNum,
          studentNum: studentData.studentNum,
          name: studentData.name,
          character: currentCustom
        })
      });
      const data = await res.json();
      if (data.success) {
        studentData = { ...studentData, ...data.student };
        startGame();
      } else {
        alert(data.message || '참가 등록 실패');
      }
    } catch (err) {
      console.error(err);
      alert('서버와 통신할 수 없습니다.');
    }
  }

  // -------------------------------------------------------------
  // [3] 화면 2: 캐릭터 커스터마이징 스튜디오 컨트롤러
  // -------------------------------------------------------------
  function initCharacterSelection() {
    // 탭 전환 이벤트 바인딩
    const tabs = document.querySelectorAll('.custom-tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        const targetId = tab.dataset.tab;
        document.querySelectorAll('.custom-section').forEach(sec => sec.classList.remove('active'));
        const targetSec = document.getElementById(targetId);
        if (targetSec) targetSec.classList.add('active');
      });
    });

    // 각 카테고리 렌더링
    renderPresets();
    renderHairControls();
    renderTopControls();
    renderBottomControls();
    renderShoesControls();
    renderAccControls();
  }

  // 1. 추천 프리셋 렌더링
  function renderPresets() {
    const grid = document.getElementById('preset-grid');
    if (!grid) return;
    grid.innerHTML = '';

    const presets = Game3D.characterPresets || [];
    presets.forEach(p => {
      const card = document.createElement('div');
      card.className = 'preset-card';
      card.innerHTML = `
        <span class="preset-card-icon">${p.icon}</span>
        <div class="preset-card-name">${escapeHtml(p.name)}</div>
        <div class="preset-card-tag">${escapeHtml(p.tag)}</div>
      `;

      card.addEventListener('click', () => {
        document.querySelectorAll('.preset-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');

        // 프리셋 옵션 딥 카피 적용
        currentCustom = JSON.parse(JSON.stringify(p.custom));
        Game3D.updatePreviewCharacter(currentCustom);

        // 설명창 업데이트
        document.getElementById('preview-char-name').textContent = p.name;
        document.getElementById('preview-char-desc').textContent = p.desc;

        // 다른 탭의 UI 선택 상태 동기화
        syncActiveSelections();
      });

      grid.appendChild(card);
    });
  }

  // 2. 머리/헤어 컨트롤 렌더링
  function renderHairControls() {
    const hairGrid = document.getElementById('hair-style-grid');
    const colorPalette = document.getElementById('hair-color-palette');
    if (!hairGrid || !colorPalette) return;

    const hairStyles = [
      { id: 'dandy', name: '단정 댄디컷', icon: '🧑‍🎓' },
      { id: 'twintail', name: '양갈래 트윈', icon: '👧' },
      { id: 'volume', name: '볼륨 웨이브', icon: '🧑‍🦱' },
      { id: 'bob', name: '단발 보브컷', icon: '👩' },
      { id: 'two_block', name: '투블럭 컷', icon: '💇' },
      { id: 'cap', name: '스포티 캡', icon: '🧢' }
    ];

    hairGrid.innerHTML = '';
    hairStyles.forEach(s => {
      const card = document.createElement('div');
      card.className = `style-card ${currentCustom.hairStyle === s.id ? 'selected' : ''}`;
      card.dataset.id = s.id;
      card.innerHTML = `
        <span class="style-card-icon">${s.icon}</span>
        <span class="style-card-name">${s.name}</span>
      `;
      card.addEventListener('click', () => {
        hairGrid.querySelectorAll('.style-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        currentCustom.hairStyle = s.id;
        Game3D.updatePreviewCharacter(currentCustom);
      });
      hairGrid.appendChild(card);
    });

    const hairColors = [
      { color: 0x1f2937, hex: '#1f2937', title: '블랙' },
      { color: 0x451a03, hex: '#451a03', title: '다크브라운' },
      { color: 0x854d0e, hex: '#854d0e', title: '허니브라운' },
      { color: 0xca8a04, hex: '#ca8a04', title: '골드블론드' },
      { color: 0x94a3b8, hex: '#94a3b8', title: '애쉬그레이' },
      { color: 0x1e3a8a, hex: '#1e3a8a', title: '딥네이비' }
    ];

    colorPalette.innerHTML = '';
    hairColors.forEach(c => {
      const chip = document.createElement('div');
      chip.className = `color-chip ${currentCustom.hairColor === c.color ? 'selected' : ''}`;
      chip.style.backgroundColor = c.hex;
      chip.title = c.title;
      chip.addEventListener('click', () => {
        colorPalette.querySelectorAll('.color-chip').forEach(ch => ch.classList.remove('selected'));
        chip.classList.add('selected');
        currentCustom.hairColor = c.color;
        Game3D.updatePreviewCharacter(currentCustom);
      });
      colorPalette.appendChild(chip);
    });
  }

  // 3. 상의(옷) 컨트롤 렌더링
  function renderTopControls() {
    const topGrid = document.getElementById('top-style-grid');
    const colorPalette = document.getElementById('top-color-palette');
    if (!topGrid || !colorPalette) return;

    const topStyles = [
      { id: 'uniform', name: '교복 재킷', icon: '👔' },
      { id: 'hoodie', name: '캐주얼 후드', icon: '🧥' },
      { id: 'knit_vest', name: '니트 조끼', icon: '🦺' },
      { id: 'windbreaker', name: '스포티 바람막이', icon: '🏃' }
    ];

    topGrid.innerHTML = '';
    topStyles.forEach(s => {
      const card = document.createElement('div');
      card.className = `style-card ${currentCustom.topStyle === s.id ? 'selected' : ''}`;
      card.dataset.id = s.id;
      card.innerHTML = `
        <span class="style-card-icon">${s.icon}</span>
        <span class="style-card-name">${s.name}</span>
      `;
      card.addEventListener('click', () => {
        topGrid.querySelectorAll('.style-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        currentCustom.topStyle = s.id;
        Game3D.updatePreviewCharacter(currentCustom);
      });
      topGrid.appendChild(card);
    });

    const topColors = [
      { color: 0x1e3a8a, hex: '#1e3a8a', title: '네이비블루' },
      { color: 0x831843, hex: '#831843', title: '와인버건디' },
      { color: 0x14532d, hex: '#14532d', title: '포레스트그린' },
      { color: 0xef4444, hex: '#ef4444', title: '크림슨레드' },
      { color: 0x0284c7, hex: '#0284c7', title: '스카이블루' },
      { color: 0xd97706, hex: '#d97706', title: '카멜베이지' },
      { color: 0x0f172a, hex: '#0f172a', title: '차콜블랙' },
      { color: 0x7c3aed, hex: '#7c3aed', title: '바이올렛' }
    ];

    colorPalette.innerHTML = '';
    topColors.forEach(c => {
      const chip = document.createElement('div');
      chip.className = `color-chip ${currentCustom.topColor === c.color ? 'selected' : ''}`;
      chip.style.backgroundColor = c.hex;
      chip.title = c.title;
      chip.addEventListener('click', () => {
        colorPalette.querySelectorAll('.color-chip').forEach(ch => ch.classList.remove('selected'));
        chip.classList.add('selected');
        currentCustom.topColor = c.color;
        Game3D.updatePreviewCharacter(currentCustom);
      });
      colorPalette.appendChild(chip);
    });
  }

  // 4. 바지/하의 컨트롤 렌더링
  function renderBottomControls() {
    const bottomGrid = document.getElementById('bottom-style-grid');
    const colorPalette = document.getElementById('bottom-color-palette');
    if (!bottomGrid || !colorPalette) return;

    const bottomStyles = [
      { id: 'slacks', name: '슬랙스(교복바지)', icon: '👖' },
      { id: 'jeans', name: '슬림 청바지', icon: '👖' },
      { id: 'skirt', name: '플리츠 스커트', icon: '👗' },
      { id: 'jogger', name: '조거 트레이닝', icon: '🩳' }
    ];

    bottomGrid.innerHTML = '';
    bottomStyles.forEach(s => {
      const card = document.createElement('div');
      card.className = `style-card ${currentCustom.bottomStyle === s.id ? 'selected' : ''}`;
      card.dataset.id = s.id;
      card.innerHTML = `
        <span class="style-card-icon">${s.icon}</span>
        <span class="style-card-name">${s.name}</span>
      `;
      card.addEventListener('click', () => {
        bottomGrid.querySelectorAll('.style-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        currentCustom.bottomStyle = s.id;
        Game3D.updatePreviewCharacter(currentCustom);
      });
      bottomGrid.appendChild(card);
    });

    const bottomColors = [
      { color: 0x1e293b, hex: '#1e293b', title: '차콜그레이' },
      { color: 0x1d4ed8, hex: '#1d4ed8', title: '클래식데님' },
      { color: 0x1e3a8a, hex: '#1e3a8a', title: '다크네이비' },
      { color: 0x78350f, hex: '#78350f', title: '베이지브라운' },
      { color: 0x0f172a, hex: '#0f172a', title: '올블랙' }
    ];

    colorPalette.innerHTML = '';
    bottomColors.forEach(c => {
      const chip = document.createElement('div');
      chip.className = `color-chip ${currentCustom.bottomColor === c.color ? 'selected' : ''}`;
      chip.style.backgroundColor = c.hex;
      chip.title = c.title;
      chip.addEventListener('click', () => {
        colorPalette.querySelectorAll('.color-chip').forEach(ch => ch.classList.remove('selected'));
        chip.classList.add('selected');
        currentCustom.bottomColor = c.color;
        Game3D.updatePreviewCharacter(currentCustom);
      });
      colorPalette.appendChild(chip);
    });
  }

  // 5. 신발 컨트롤 렌더링
  function renderShoesControls() {
    const shoesGrid = document.getElementById('shoes-style-grid');
    const colorPalette = document.getElementById('shoes-color-palette');
    if (!shoesGrid || !colorPalette) return;

    const shoesStyles = [
      { id: 'sneakers', name: '에어 스니커즈', icon: '👟' },
      { id: 'loafers', name: '클래식 로퍼', icon: '👞' },
      { id: 'hightop', name: '하이탑 농구화', icon: '🏀' }
    ];

    shoesGrid.innerHTML = '';
    shoesStyles.forEach(s => {
      const card = document.createElement('div');
      card.className = `style-card ${currentCustom.shoesStyle === s.id ? 'selected' : ''}`;
      card.dataset.id = s.id;
      card.innerHTML = `
        <span class="style-card-icon">${s.icon}</span>
        <span class="style-card-name">${s.name}</span>
      `;
      card.addEventListener('click', () => {
        shoesGrid.querySelectorAll('.style-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        currentCustom.shoesStyle = s.id;
        Game3D.updatePreviewCharacter(currentCustom);
      });
      shoesGrid.appendChild(card);
    });

    const shoesColors = [
      { color: 0xf8fafc, hex: '#f8fafc', title: '스노우화이트' },
      { color: 0x0f172a, hex: '#0f172a', title: '올블랙' },
      { color: 0xdc2626, hex: '#dc2626', title: '레드화이트' },
      { color: 0x78350f, hex: '#78350f', title: '레더브라운' },
      { color: 0x38bdf8, hex: '#38bdf8', title: '시안블루' }
    ];

    colorPalette.innerHTML = '';
    shoesColors.forEach(c => {
      const chip = document.createElement('div');
      chip.className = `color-chip ${currentCustom.shoesColor === c.color ? 'selected' : ''}`;
      chip.style.backgroundColor = c.hex;
      chip.title = c.title;
      chip.addEventListener('click', () => {
        colorPalette.querySelectorAll('.color-chip').forEach(ch => ch.classList.remove('selected'));
        chip.classList.add('selected');
        currentCustom.shoesColor = c.color;
        Game3D.updatePreviewCharacter(currentCustom);
      });
      colorPalette.appendChild(chip);
    });
  }

  // 6. 악세서리 & 피부톤 컨트롤 렌더링
  function renderAccControls() {
    const skinPalette = document.getElementById('skin-color-palette');
    const accGrid = document.getElementById('acc-options-grid');
    if (!skinPalette || !accGrid) return;

    const skins = [
      { color: 0xffdbac, hex: '#ffdbac', title: '밝은 살구 피부' },
      { color: 0xf5d0b0, hex: '#f5d0b0', title: '자연스러운 피부' },
      { color: 0xd29d71, hex: '#d29d71', title: '건강한 웜톤' }
    ];

    skinPalette.innerHTML = '';
    skins.forEach(s => {
      const chip = document.createElement('div');
      chip.className = `color-chip ${currentCustom.skinColor === s.color ? 'selected' : ''}`;
      chip.style.backgroundColor = s.hex;
      chip.title = s.title;
      chip.addEventListener('click', () => {
        skinPalette.querySelectorAll('.color-chip').forEach(ch => ch.classList.remove('selected'));
        chip.classList.add('selected');
        currentCustom.skinColor = s.color;
        Game3D.updatePreviewCharacter(currentCustom);
      });
      skinPalette.appendChild(chip);
    });

    accGrid.innerHTML = `
      <div class="acc-card ${currentCustom.hasGlasses ? 'active' : ''}" id="card-toggle-glasses">
        <div class="acc-info">
          <span class="acc-icon">👓</span>
          <span class="acc-title">스마트 안경</span>
        </div>
        <span class="acc-toggle-switch">${currentCustom.hasGlasses ? '착용 중' : '미착용'}</span>
      </div>
      <div class="acc-card ${currentCustom.hasBackpack ? 'active' : ''}" id="card-toggle-backpack">
        <div class="acc-info">
          <span class="acc-icon">🎒</span>
          <span class="acc-title">학생 백팩</span>
        </div>
        <span class="acc-toggle-switch">${currentCustom.hasBackpack ? '착용 중' : '미착용'}</span>
      </div>
    `;

    document.getElementById('card-toggle-glasses').addEventListener('click', function () {
      currentCustom.hasGlasses = !currentCustom.hasGlasses;
      this.classList.toggle('active', currentCustom.hasGlasses);
      this.querySelector('.acc-toggle-switch').textContent = currentCustom.hasGlasses ? '착용 중' : '미착용';
      Game3D.updatePreviewCharacter(currentCustom);
    });

    document.getElementById('card-toggle-backpack').addEventListener('click', function () {
      currentCustom.hasBackpack = !currentCustom.hasBackpack;
      this.classList.toggle('active', currentCustom.hasBackpack);
      this.querySelector('.acc-toggle-switch').textContent = currentCustom.hasBackpack ? '착용 중' : '미착용';
      Game3D.updatePreviewCharacter(currentCustom);
    });
  }

  // 무작위 랜덤 스타일 생성기
  function generateRandomAvatar() {
    const hairStyles = ['dandy', 'twintail', 'volume', 'bob', 'two_block', 'cap'];
    const hairColors = [0x1f2937, 0x451a03, 0x854d0e, 0xca8a04, 0x94a3b8, 0x1e3a8a];
    const topStyles = ['uniform', 'hoodie', 'knit_vest', 'windbreaker'];
    const topColors = [0x1e3a8a, 0x831843, 0x14532d, 0xef4444, 0x0284c7, 0xd97706, 0x0f172a, 0x7c3aed];
    const bottomStyles = ['slacks', 'jeans', 'skirt', 'jogger'];
    const bottomColors = [0x1e293b, 0x1d4ed8, 0x1e3a8a, 0x78350f, 0x0f172a];
    const shoesStyles = ['sneakers', 'loafers', 'hightop'];
    const shoesColors = [0xf8fafc, 0x0f172a, 0xdc2626, 0x78350f, 0x38bdf8];
    const skins = [0xffdbac, 0xf5d0b0, 0xd29d71];

    function pick(arr) {
      return arr[Math.floor(Math.random() * arr.length)];
    }

    currentCustom = {
      skinColor: pick(skins),
      hairStyle: pick(hairStyles),
      hairColor: pick(hairColors),
      topStyle: pick(topStyles),
      topColor: pick(topColors),
      bottomStyle: pick(bottomStyles),
      bottomColor: pick(bottomColors),
      shoesStyle: pick(shoesStyles),
      shoesColor: pick(shoesColors),
      hasGlasses: Math.random() > 0.6,
      hasBackpack: Math.random() > 0.2,
      backpackColor: pick(bottomColors)
    };

    Game3D.updatePreviewCharacter(currentCustom);
    document.getElementById('preview-char-name').textContent = '🎲 랜덤 스타일 아바타';
    document.getElementById('preview-char-desc').textContent = '독창적인 개성으로 완성된 나만의 3D 캐릭터';

    syncActiveSelections();
  }

  // UI 선택 상태 동기화 헬퍼
  function syncActiveSelections() {
    renderHairControls();
    renderTopControls();
    renderBottomControls();
    renderShoesControls();
    renderAccControls();
  }

  // -------------------------------------------------------------
  // [4] 화면 3: 3D 인게임 시작 및 HUD 설정
  // -------------------------------------------------------------
  let gameInitialized = false;

  const ROOM_ORDER = ['room_1', 'room_2', 'room_3', 'room_4', 'room_5'];

  // 이미 탈출 완료하여 폐쇄된 이전 방 목록 (이전 방으로는 되돌아갈 수 없음)
  let escapedRooms = [];

  // 해금된 방 목록 (현재 입장 가능한 활성 방 및 탈출문이 열린 방)
  let unlockedRooms = ['room_1'];

  const roomConfigMap = {
    room_1: { name: '1번 방 도서관', icon: 'fa-book' },
    room_2: { name: '2번 방 과학실', icon: 'fa-flask' },
    room_3: { name: '3번 방 박물관', icon: 'fa-landmark' },
    room_4: { name: '4번 방 공방', icon: 'fa-hammer' },
    room_5: { name: '5번 힐링공원 🌳', icon: 'fa-tree' }
  };

  const ESCAPE_STORAGE_PREFIX = 'escape_cleared_rooms_';

  function getStorageKey() {
    const sId = (studentData && studentData.id) ? studentData.id : 'default';
    return `${ESCAPE_STORAGE_PREFIX}${sId}`;
  }

  function loadEscapedRooms() {
    try {
      const raw = localStorage.getItem(getStorageKey());
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          escapedRooms = parsed;
        }
      }
    } catch (e) {
      console.warn('Failed to load escapedRooms:', e);
    }
  }

  function saveEscapedRooms() {
    try {
      localStorage.setItem(getStorageKey(), JSON.stringify(escapedRooms));
    } catch (e) {
      console.warn('Failed to save escapedRooms:', e);
    }
  }

  function updateRoomTabsLockState() {
    const currentRoom = Game3D.getCurrentRoomId ? Game3D.getCurrentRoomId() : 'room_1';
    const tabs = document.querySelectorAll('.room-tab');
    tabs.forEach(tab => {
      const rId = tab.dataset.room;
      const conf = roomConfigMap[rId] || { name: rId, icon: 'fa-door-open' };
      const isEscaped = escapedRooms.includes(rId);
      const isCurrent = (rId === currentRoom);
      const isUnlocked = unlockedRooms.includes(rId);

      tab.classList.remove('escaped', 'locked', 'active');

      if (isEscaped) {
        // 이미 탈출 완료한 이전 방 (영구 폐쇄 및 되돌아가기 불가)
        tab.classList.add('escaped', 'locked');
        tab.setAttribute('title', '🔒 탈출 완료 (이전 방으로는 되돌아갈 수 없습니다)');
        tab.innerHTML = `<i class="fa-solid fa-lock"></i> <span style="text-decoration: line-through; opacity: 0.7;">${conf.name}</span> <span class="tab-badge-escaped">탈출완료</span>`;
      } else if (isCurrent) {
        // 현재 위치한 방
        tab.classList.add('active');
        tab.removeAttribute('title');
        tab.innerHTML = `<i class="fa-solid ${conf.icon}"></i> ${conf.name}`;
      } else if (isUnlocked) {
        // 미션 완료 후 탈출문이 열려 진입 가능한 다음 방
        tab.removeAttribute('title');
        tab.innerHTML = `<i class="fa-solid ${conf.icon}"></i> ${conf.name}`;
      } else {
        // 아직 도달하지 못한 미래의 잠긴 방
        tab.classList.add('locked');
        tab.setAttribute('title', '🔒 미션 미해결로 잠김 (현재 방의 미션을 완료하고 탈출해야 입장 가능)');
        tab.innerHTML = `<i class="fa-solid fa-lock"></i> ${conf.name}`;
      }
    });
  }

  function unlockRoom(roomId) {
    if (!escapedRooms.includes(roomId) && !unlockedRooms.includes(roomId)) {
      unlockedRooms.push(roomId);
    }
    updateRoomTabsLockState();
  }

  function getRoomMissionStatus(roomId) {
    const targetRoom = roomId || (Game3D.getCurrentRoomId ? Game3D.getCurrentRoomId() : 'room_1');
    if (targetRoom === 'room_5') {
      return { isComplete: true, isPark: true, totalQ: 0, solvedQ: 0, isAllQuestionsSolved: true, placedCount: 0, isDecorated: true };
    }

    const roomQuestions = (gameConfig.questions || []).filter(q => q.roomId === targetRoom);
    const totalQ = roomQuestions.length;
    const solvedSet = new Set(studentData.solvedQuestions || []);
    const solvedQ = roomQuestions.filter(q => solvedSet.has(q.id)).length;
    const isAllQuestionsSolved = totalQ > 0 ? (solvedQ >= totalQ) : false;

    const placedList = (Game3D.getPlacedFurnitures ? Game3D.getPlacedFurnitures() : []).filter(f => f.roomId === targetRoom);
    const placedCount = placedList.length;
    const isDecorated = placedCount >= 1;

    const isComplete = isAllQuestionsSolved && isDecorated;

    return {
      roomId: targetRoom,
      totalQ,
      solvedQ,
      isAllQuestionsSolved,
      placedCount,
      isDecorated,
      isComplete
    };
  }

  function isRoomCompleted(roomId) {
    return getRoomMissionStatus(roomId).isComplete;
  }

  function syncUnlockedRoomsFromProgress() {
    if (!studentData) return;

    loadEscapedRooms();

    const nextMap = { room_1: 'room_2', room_2: 'room_3', room_3: 'room_4', room_4: 'room_5' };
    const solvedSet = new Set(studentData.solvedQuestions || []);
    const placedList = (Game3D.getPlacedFurnitures ? Game3D.getPlacedFurnitures() : []);

    if (studentData.escaped) {
      escapedRooms = ['room_1', 'room_2', 'room_3', 'room_4'];
      unlockedRooms = ['room_5'];
      saveEscapedRooms();
      updateRoomTabsLockState();
      return;
    }

    // 탈출하지 않은 첫 번째 방을 활성 방으로 지정
    let activeR = 'room_1';
    for (let i = 0; i < ROOM_ORDER.length; i++) {
      const rId = ROOM_ORDER[i];
      if (!escapedRooms.includes(rId)) {
        activeR = rId;
        break;
      }
    }

    unlockedRooms = [activeR];

    // 활성 방의 미션이 이미 완료된 경우 다음 방까지 해금
    if (activeR !== 'room_5') {
      const roomQs = (gameConfig.questions || []).filter(q => q.roomId === activeR);
      const isAllQ = roomQs.length > 0 && roomQs.every(q => solvedSet.has(q.id));
      const roomIdx = ROOM_ORDER.indexOf(activeR);
      const isDeco = placedList.some(f => f.roomId === activeR) || (studentData.craftedFurnitures && studentData.craftedFurnitures.length >= (roomIdx + 1));

      if (isAllQ && isDeco) {
        const nextR = nextMap[activeR];
        if (nextR && !unlockedRooms.includes(nextR)) {
          unlockedRooms.push(nextR);
        }
      }
    }

    updateRoomTabsLockState();
  }

  function startGame() {
    showScreen('screen-game');

    // 해금 및 이전 방 탈출 상태 동기화
    syncUnlockedRoomsFromProgress();

    // 현재 진입해야 할 활성 방 확인 (이미 탈출한 이전 방 제외)
    let spawnRoom = 'room_1';
    for (let i = 0; i < ROOM_ORDER.length; i++) {
      if (!escapedRooms.includes(ROOM_ORDER[i])) {
        spawnRoom = ROOM_ORDER[i];
        break;
      }
    }

    // 3D 씬 초기화 (최초 1회)
    if (!gameInitialized) {
      if (Game3D.loadPlacedFurnituresFromLocal) {
        Game3D.loadPlacedFurnituresFromLocal();
      }
      Game3D.init('game-canvas-container', spawnRoom);
      gameInitialized = true;
    } else {
      Game3D.buildRoom(spawnRoom);
    }

    // 플레이어 스폰
    Game3D.spawnPlayer(studentData.character);

    // 상단 HUD 갱신
    updateHudInfo();
    updateRoomTabsLockState();
    updateGoalRequirementDisplay();

    // 방 이동 탭 버튼 이벤트 바인딩
    const roomTabs = document.querySelectorAll('.room-tab');
    roomTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const targetRoom = tab.dataset.room;
        const currentRoom = Game3D.getCurrentRoomId ? Game3D.getCurrentRoomId() : 'room_1';
        if (targetRoom === currentRoom) return;

        // 이미 탈출 완료한 이전 방인 경우
        if (escapedRooms.includes(targetRoom)) {
          showToast(`🔒 이미 탈출 완료한 방(${roomConfigMap[targetRoom]?.name || targetRoom})입니다! 이전 방으로는 되돌아갈 수 없습니다.`, 3000);
          return;
        }

        // 아직 잠겨있는 방인 경우
        if (!unlockedRooms.includes(targetRoom)) {
          showToast('🔒 아직 잠겨있는 방입니다! 현재 방의 미션을 먼저 탈출/해결해야 이동할 수 있습니다.', 3000);
          return;
        }

        switchRoom(targetRoom);
      });
    });

    // 5번 방 힐링 공원 술래잡기 HUD 버튼들
    const btnToggleTag = document.getElementById('btn-toggle-tag-role');
    if (btnToggleTag) {
      btnToggleTag.addEventListener('click', () => {
        const newRole = Game3D.toggleTagRole();
        showToast('🎭 역할 변경: ' + (newRole === 'tagger' ? '술래 🎯 (친구들을 터치해 잡으세요!)' : '도망자 🏃 (술래를 피해 도망치세요!)'), 2500);
      });
    }

    const btnParkBoost = document.getElementById('btn-park-super-boost');
    if (btnParkBoost) {
      btnParkBoost.addEventListener('click', () => {
        Game3D.triggerParkBoost();
        showToast('⚡ 스피드 부스터 가속 발동! (3초간 2배속) 🏃‍♂️💨', 2000);
      });
    }

    // 힐링 공원 안내 팝업 닫기
    const closeParkGuide = () => {
      const modal = document.getElementById('modal-park-guide');
      if (modal) modal.classList.add('hidden');
    };
    const btnCloseGuide = document.getElementById('btn-close-park-guide');
    if (btnCloseGuide) btnCloseGuide.addEventListener('click', closeParkGuide);
    const btnConfirmGuide = document.getElementById('btn-confirm-park-guide');
    if (btnConfirmGuide) btnConfirmGuide.addEventListener('click', closeParkGuide);

    // 상호작용 프롬프트 버튼
    document.getElementById('btn-prompt-inspect').addEventListener('click', () => {
      Game3D.triggerNearbyInspect();
    });

    // 탈출 시도 버튼 (현재 방 미션 완료 시 다음 방으로 이동 or 최종 탈출)
    document.getElementById('btn-try-escape').addEventListener('click', () => {
      handleExitGateInteraction();
    });
  }

  // 방 전환 공통 함수
  function switchRoom(targetRoomId) {
    const currentRoom = Game3D.getCurrentRoomId ? Game3D.getCurrentRoomId() : 'room_1';
    if (targetRoomId === currentRoom) return;

    // 이미 탈출 완료한 이전 방인 경우 입장 금지
    if (escapedRooms.includes(targetRoomId)) {
      showToast(`🔒 이미 탈출 완료한 방(${roomConfigMap[targetRoomId]?.name || targetRoomId})입니다! 이전 방으로는 되돌아갈 수 없습니다.`, 3000);
      return;
    }

    if (!unlockedRooms.includes(targetRoomId)) {
      showToast('🔒 아직 잠겨있는 방입니다! 현재 방의 미션을 먼저 탈출/해결해야 입장할 수 있습니다.', 3000);
      return;
    }

    // 다음 방으로 이동할 때, 대상 방보다 이전 방들을 모두 탈출 완료(폐쇄) 목록에 영구 추가
    const targetIdx = ROOM_ORDER.indexOf(targetRoomId);
    if (targetIdx > 0) {
      for (let i = 0; i < targetIdx; i++) {
        const prevRoom = ROOM_ORDER[i];
        if (!escapedRooms.includes(prevRoom)) {
          escapedRooms.push(prevRoom);
        }
        // unlockedRooms에서 이전 방 제거하여 재진입 완전 차단
        unlockedRooms = unlockedRooms.filter(r => r !== prevRoom);
      }
      saveEscapedRooms();
    }

    if (!unlockedRooms.includes(targetRoomId)) {
      unlockedRooms.push(targetRoomId);
    }

    Game3D.buildRoom(targetRoomId);
    updateRoomTabsLockState();
    updateGoalRequirementDisplay();
  }

  // 출구 게이트 상호작용 처리 (3D 문 앞 E키 또는 상단 탈출 버튼 클릭 시)
  function handleExitGateInteraction() {
    const currentRoom = Game3D.getCurrentRoomId ? Game3D.getCurrentRoomId() : 'room_1';
    const status = getRoomMissionStatus(currentRoom);

    if (!status.isComplete) {
      let missing = [];
      if (!status.isAllQuestionsSolved) {
        missing.push(`문제 ${status.totalQ - status.solvedQ}개 남음`);
      }
      if (!status.isDecorated) {
        missing.push('가구를 제작하여 방에 배치');
      }
      showToast(`🔒 탈출문이 굳게 잠겨 있습니다! (${missing.join(', ')}해야 문이 열립니다)`, 3500);
      return;
    }

    if (currentRoom === 'room_4') {
      handleFinalEscape();
    } else {
      const nextRoomMap = { room_1: 'room_2', room_2: 'room_3', room_3: 'room_4' };
      const nextR = nextRoomMap[currentRoom];
      if (nextR) {
        // 현재 방 탈출 완료 처리: 이전 방 영구 폐쇄
        if (!escapedRooms.includes(currentRoom)) {
          escapedRooms.push(currentRoom);
          saveEscapedRooms();
        }
        unlockedRooms = [nextR];
        switchRoom(nextR);
        showToast(`🚪 ${roomConfigMap[currentRoom].name} 탈출 성공! ${roomConfigMap[nextR].name}에 입장했습니다! (이전 방은 폐쇄되었습니다)`, 3500);
      }
    }
  }

  // 플로팅 토스트 안내 배너
  let toastTimer = null;
  function showToast(msg, duration = 2500) {
    const banner = document.getElementById('game-toast-banner');
    const textEl = document.getElementById('game-toast-text');
    if (!banner || !textEl) return;

    textEl.textContent = msg;
    banner.classList.remove('hidden');

    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      banner.classList.add('hidden');
    }, duration);
  }

  function updateHudInfo() {
    const studentLabel = document.getElementById('hud-student-label');
    const studentScore = document.getElementById('hud-student-score');
    const woodCount = document.getElementById('hud-wood-count');
    const metalCount = document.getElementById('hud-metal-count');
    const avatarIcon = document.getElementById('hud-avatar-icon');

    let avatarEmoji = '👦';
    if (studentData.character && typeof studentData.character === 'object') {
      if (studentData.character.hairStyle === 'twintail') avatarEmoji = '👧';
      else if (studentData.character.hairStyle === 'bob') avatarEmoji = '👩';
      else if (studentData.character.hairStyle === 'cap') avatarEmoji = '🧢';
      else if (studentData.character.hairStyle === 'volume') avatarEmoji = '🧑‍🦱';
      else avatarEmoji = '👦';
    }

    if (studentLabel) studentLabel.textContent = `${studentData.classNum}반 ${studentData.name}`;
    if (studentScore) studentScore.innerHTML = `<i class="fa-solid fa-star"></i> 점수: <strong>${studentData.score}점</strong>`;
    if (woodCount) woodCount.textContent = studentData.wood;
    if (metalCount) metalCount.textContent = studentData.metal;
    if (avatarIcon) avatarIcon.textContent = avatarEmoji;

    // 제작 및 탈출 목표 프로그레스 갱신
    updateGoalRequirementDisplay();
  }

  function updateGoalRequirementDisplay() {
    const currentRoom = Game3D.getCurrentRoomId ? Game3D.getCurrentRoomId() : 'room_1';
    const status = getRoomMissionStatus(currentRoom);

    const goalBar = document.getElementById('escape-goal-bar');
    const goalTextEl = document.querySelector('.goal-text');
    const btnEscape = document.getElementById('btn-try-escape');
    if (!goalBar || !goalTextEl) return;

    if (currentRoom === 'room_5') {
      goalTextEl.innerHTML = `
        <i class="fa-solid fa-tree" style="color: #4ade80;"></i>
        <strong>5번 힐링공원 🌳</strong> 자유롭게 술래잡기를 즐기고 야외 가구로 공원을 꾸며보세요!
      `;
      if (btnEscape) btnEscape.classList.add('hidden');
      return;
    }

    const conf = roomConfigMap[currentRoom] || { name: '현재 방' };
    const qBadge = status.isAllQuestionsSolved 
      ? `<span style="color:#4ade80; font-weight:800;">✓ 문제 완료 (${status.solvedQ}/${status.totalQ})</span>` 
      : `<span style="color:#fde047; font-weight:800;">📝 문제 (${status.solvedQ}/${status.totalQ})</span>`;
    
    const fBadge = status.isDecorated 
      ? `<span style="color:#4ade80; font-weight:800;">✓ 방 꾸미기 완료 (${status.placedCount}개 배치)</span>` 
      : `<span style="color:#fb923c; font-weight:800;">🪑 가구 배치 필요 (${status.placedCount}/1개)</span>`;

    const nextRoomMap = { room_1: 'room_2', room_2: 'room_3', room_3: 'room_4', room_4: 'room_5' };
    const nextR = nextRoomMap[currentRoom];

    if (status.isComplete) {
      goalTextEl.innerHTML = `
        <i class="fa-solid fa-door-open" style="color: #4ade80;"></i>
        <strong>[${conf.name} 완료!]</strong> ${qBadge} | ${fBadge} ➔ <strong style="color: #67e8f9;">문이 열렸습니다!</strong>
      `;
      if (Game3D.unlockExitGate) Game3D.unlockExitGate();
      if (nextR) unlockRoom(nextR);

      if (btnEscape) {
        btnEscape.classList.remove('hidden');
        if (currentRoom === 'room_4') {
          btnEscape.innerHTML = `<i class="fa-solid fa-flag-checkered"></i> <span>최종 탈출구 열기! (성공)</span>`;
        } else {
          const nextName = roomConfigMap[nextR] ? roomConfigMap[nextR].name : '다음 방';
          btnEscape.innerHTML = `<i class="fa-solid fa-door-open"></i> <span>${nextName}으로 이동하기</span>`;
        }
      }
    } else {
      goalTextEl.innerHTML = `
        <i class="fa-solid fa-lock" style="color: #f87171;"></i>
        <strong>[${conf.name} 미션]</strong> ${qBadge} | ${fBadge}
      `;
      if (btnEscape) btnEscape.classList.add('hidden');
    }
  }

  // -------------------------------------------------------------
  // [5] 모바일 조작 (조사/제작/달리기)
  // -------------------------------------------------------------
  function initMobileControls() {
    const btnInspect = document.getElementById('btn-mobile-inspect');
    if (btnInspect) {
      btnInspect.addEventListener('click', () => {
        Game3D.triggerNearbyInspect();
      });
    }

    const btnCraft = document.getElementById('btn-mobile-craft');
    if (btnCraft) {
      btnCraft.addEventListener('click', openCraftingModal);
    }

    const btnRun = document.getElementById('btn-mobile-run');
    if (btnRun) {
      let isRunning = false;
      btnRun.addEventListener('click', () => {
        isRunning = !isRunning;
        btnRun.classList.toggle('active', isRunning);
        Game3D.toggleRunning(isRunning);
      });
    }
  }

  // -------------------------------------------------------------
  // [6] 문제 풀이 (상호작용 스팟에서 발생)
  // -------------------------------------------------------------
  function onInspectObject(nearbyObject) {
    if (!nearbyObject) return;

    // 3D 탈출문 (Exit Gate) 조사 시 탈출/다음 방 처리
    if (nearbyObject.isExitGate || nearbyObject.type === 'exit_gate') {
      handleExitGateInteraction();
      return;
    }

    // 5번 방 힐링 공원 안내판 조사 시
    if (nearbyObject.type === 'park_sign' || nearbyObject.defaultQId === 99) {
      const guideModal = document.getElementById('modal-park-guide');
      if (guideModal) guideModal.classList.remove('hidden');
      return;
    }

    // 해당 오브젝트에 해당하는 문제 찾기
    let targetQuestion = gameConfig.questions.find(q => q.title === nearbyObject.title);
    if (!targetQuestion) {
      // 매칭되는 문제가 없다면 디폴트 문제 또는 첫 번째 활성 문제 사용
      targetQuestion = gameConfig.questions.find(q => q.id === nearbyObject.defaultQId) || gameConfig.questions[0];
    }

    if (!targetQuestion) {
      alert('출제된 문제가 없습니다. 관리자 패널에서 문제를 활성화해주세요.');
      return;
    }

    currentActiveQuestion = targetQuestion;
    openQuestionModal(targetQuestion, nearbyObject);
  }

  function openQuestionModal(question, nearbyObject) {
    const modal = document.getElementById('modal-question');
    const titleEl = document.getElementById('modal-q-title');
    const textEl = document.getElementById('modal-q-text');
    const pointsEl = document.getElementById('modal-q-points');
    const woodEl = document.getElementById('modal-q-wood');
    const metalEl = document.getElementById('modal-q-metal');
    const optionsContainer = document.getElementById('modal-q-options');
    const feedbackEl = document.getElementById('modal-q-feedback');

    titleEl.textContent = question.title;
    textEl.textContent = question.question;
    pointsEl.innerHTML = `<i class="fa-solid fa-star"></i> +${question.points || 20}점`;
    woodEl.textContent = question.rewardWood || 1;
    metalEl.textContent = question.rewardMetal || 1;

    feedbackEl.className = 'q-feedback hidden';
    feedbackEl.textContent = '';

    // 보기 버튼들 생성
    optionsContainer.innerHTML = '';
    const alreadySolved = (studentData.solvedQuestions || []).includes(question.id);

    (question.options || []).forEach((opt, idx) => {
      const btn = document.createElement('button');
      btn.className = 'btn-q-option';
      btn.innerHTML = `<span class="opt-num">${idx + 1}</span> <span>${escapeHtml(opt)}</span>`;

      if (alreadySolved) {
        btn.disabled = true;
        btn.style.opacity = '0.5';
      } else {
        btn.addEventListener('click', () => submitAnswer(question.id, idx));
      }
      optionsContainer.appendChild(btn);
    });

    if (alreadySolved) {
      feedbackEl.className = 'q-feedback correct';
      feedbackEl.textContent = '이미 정답을 맞힌 문제입니다! ✨';
      feedbackEl.classList.remove('hidden');
    }

    modal.classList.remove('hidden');
  }

  async function submitAnswer(questionId, selectedIndex) {
    try {
      const res = await fetch('/api/students/submit-answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: studentData.id,
          questionId: questionId,
          selectedIndex: selectedIndex
        })
      });
      const data = await res.json();
      const feedbackEl = document.getElementById('modal-q-feedback');

      if (data.isCorrect) {
        // 정답 피드백
        feedbackEl.className = 'q-feedback correct';
        feedbackEl.textContent = data.message;
        feedbackEl.classList.remove('hidden');

        // 학생 상태 갱신
        studentData.score = data.studentState.score;
        studentData.wood = data.studentState.wood;
        studentData.metal = data.studentState.metal;
        studentData.solvedQuestions = data.studentState.solvedQuestions;
        updateHudInfo();

        // 폭죽 효과
        if (window.confetti) {
          window.confetti({ particleCount: 50, spread: 70, origin: { y: 0.6 } });
        }

        // 보기 비활성화
        document.querySelectorAll('.btn-q-option').forEach(b => b.disabled = true);

        const currentRoom = Game3D.getCurrentRoomId();
        const conf = roomConfigMap[currentRoom] || { name: '현재 방' };
        feedbackEl.innerHTML = `${data.message}<br><strong style="color: #67e8f9; font-size: 14px; margin-top: 8px; display: inline-block;">✨ 정답입니다! 🪵 목재 ${data.rewardWood || 1}개, ⚙️ 금속 ${data.rewardMetal || 1}개를 획득했습니다!</strong>`;

        // 1.5초 후 문제 모달 닫기 (자동 방 이동을 하지 않고, 현재 방에서 가구 제작/배치 및 남은 문제 풀이 진행)
        setTimeout(() => {
          document.getElementById('modal-question').classList.add('hidden');

          const status = getRoomMissionStatus(currentRoom);
          const nextRoomMap = { room_1: 'room_2', room_2: 'room_3', room_3: 'room_4', room_4: 'room_5' };
          const nextR = nextRoomMap[currentRoom];

          if (status.isComplete) {
            if (nextR) unlockRoom(nextR);
            if (Game3D.unlockExitGate) Game3D.unlockExitGate();
            showToast(`🎉 [${conf.name}] 모든 문제 해결 & 가구 꾸미기 완료! 🚪 탈출문이 열렸습니다!`, 4000);
            if (window.confetti) {
              window.confetti({ particleCount: 80, spread: 90, origin: { y: 0.5 } });
            }
          } else if (status.isAllQuestionsSolved) {
            showToast(`🎉 이 방의 모든 문제를 풀었습니다! 이제 [가구 제작/방 꾸미기]로 가구를 배치해 탈출문을 여세요! 🪑`, 4000);
          } else {
            showToast(`✨ 정답! (남은 문제: ${status.totalQ - status.solvedQ}개) 🪵 목재:${studentData.wood}개 ⚙️ 금속:${studentData.metal}개`, 2500);
          }
        }, 1500);
      } else {
        // 오답 피드백
        feedbackEl.className = 'q-feedback incorrect';
        feedbackEl.innerHTML = `${data.message} <br><small style="color:#fde047;">힌트: ${escapeHtml(data.hint)}</small>`;
        feedbackEl.classList.remove('hidden');
      }
    } catch (err) {
      console.error(err);
      alert('답안 제출 중 오류가 발생했습니다.');
    }
  }

  // -------------------------------------------------------------
  // [7] 가구 제작하기 모달 (이미지 1 좌하단 레이아웃 완벽 매칭)
  // -------------------------------------------------------------
  function openCraftingModal() {
    const modal = document.getElementById('modal-crafting');
    if (!modal) return;

    // 플레이어 보유 재료 표시 갱신
    document.getElementById('craft-wood-count').textContent = studentData.wood;
    document.getElementById('craft-metal-count').textContent = studentData.metal;

    renderFurnitureList();
    updateCraftingPreview(selectedFurnId);

    modal.classList.remove('hidden');
  }

  function renderFurnitureList() {
    const grid = document.getElementById('furniture-cards-grid');
    if (!grid) return;
    grid.innerHTML = '';

    const furnitures = gameConfig.furnitures || [];
    const craftedList = studentData.craftedFurnitures || [];

    furnitures.forEach(furn => {
      const card = document.createElement('div');
      card.className = `furn-card ${furn.id === selectedFurnId ? 'selected' : ''}`;
      card.dataset.id = furn.id;

      const isCrafted = craftedList.includes(furn.name);

      card.innerHTML = `
        <div class="furn-card-top">
          <span class="furn-card-icon">${furn.icon}</span>
          <div>
            <div class="furn-card-title">${escapeHtml(furn.name)}</div>
            <div class="furn-card-score">+${furn.score}점</div>
            ${isCrafted ? '<span class="badge-crafted"><i class="fa-solid fa-sparkles"></i> 보유 중</span>' : ''}
          </div>
        </div>
        <div class="furn-card-cost">
          <span>🪵 목재 ${furn.cost.wood}개</span>
          <span>⚙️ 금속 ${furn.cost.metal}개</span>
        </div>
      `;

      card.addEventListener('click', () => {
        document.querySelectorAll('.furn-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        selectedFurnId = furn.id;
        updateCraftingPreview(selectedFurnId);
      });

      grid.appendChild(card);
    });
  }

  function updateCraftingPreview(furnId) {
    const furn = (gameConfig.furnitures || []).find(f => f.id === furnId) || (gameConfig.furnitures || [])[0];
    if (!furn) return;

    document.getElementById('craft-selected-icon').textContent = furn.icon;
    document.getElementById('craft-selected-name').textContent = furn.name;
    document.getElementById('craft-selected-desc').textContent = furn.description;
    document.getElementById('craft-selected-score').textContent = `+${furn.score}점 획득`;

    const reqsEl = document.getElementById('craft-selected-reqs');
    reqsEl.innerHTML = `
      <div class="req-item">필요 목재: <span class="req-val">${furn.cost.wood}개</span> (보유: ${studentData.wood}개)</div>
      <div class="req-item">필요 금속: <span class="req-val">${furn.cost.metal}개</span> (보유: ${studentData.metal}개)</div>
    `;

    // 제작하기 버튼 바인딩
    const btnExecute = document.getElementById('btn-execute-craft');
    btnExecute.onclick = () => executeCraftFurniture(furn);

    // 이미 제작하여 보유 중인 가구일 경우 "방에 배치하기 / 위치 변경" 버튼 활성화
    const btnReposition = document.getElementById('btn-reposition-craft');
    const isCrafted = (studentData.craftedFurnitures || []).includes(furn.name);
    if (btnReposition) {
      if (isCrafted) {
        btnReposition.classList.remove('hidden');
        btnReposition.onclick = () => {
          document.getElementById('modal-crafting').classList.add('hidden');
          Game3D.startFurniturePlacement(furn);
        };
      } else {
        btnReposition.classList.add('hidden');
      }
    }
  }

  async function executeCraftFurniture(furn) {
    if (studentData.wood < furn.cost.wood || studentData.metal < furn.cost.metal) {
      alert(`재료가 부족합니다!\n필요: 목재 ${furn.cost.wood}개, 금속 ${furn.cost.metal}개\n보유: 목재 ${studentData.wood}개, 금속 ${studentData.metal}개\n\n문제를 풀어 재료를 먼저 수집하세요!`);
      return;
    }

    try {
      const res = await fetch('/api/students/craft-furniture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: studentData.id,
          furnitureId: furn.id
        })
      });
      const data = await res.json();
      if (data.success) {
        // 학생 상태 갱신
        studentData.score = data.studentState.score;
        studentData.wood = data.studentState.wood;
        studentData.metal = data.studentState.metal;
        studentData.craftedFurnitures = data.studentState.craftedFurnitures;
        updateHudInfo();

        // 모달 닫기
        document.getElementById('modal-crafting').classList.add('hidden');

        // 가구 실시간 3D 방 꾸미기 배치 모드 시작!
        Game3D.startFurniturePlacement(furn);
      } else {
        alert(data.message || '가구 제작 실패');
      }
    } catch (err) {
      console.error(err);
      alert('가구 제작 요청 중 오류가 발생했습니다.');
    }
  }

  // 가구 배치 완료 시 호출 콜백 (미션 달성 체크)
  function onFurniturePlaced(furnObj) {
    updateHudInfo();
    updateGoalRequirementDisplay();

    const currentRoom = Game3D.getCurrentRoomId ? Game3D.getCurrentRoomId() : 'room_1';
    const status = getRoomMissionStatus(currentRoom);
    const conf = roomConfigMap[currentRoom] || { name: '현재 방' };
    const nextRoomMap = { room_1: 'room_2', room_2: 'room_3', room_3: 'room_4', room_4: 'room_5' };
    const nextR = nextRoomMap[currentRoom];

    if (status.isComplete) {
      if (nextR) unlockRoom(nextR);
      if (Game3D.unlockExitGate) Game3D.unlockExitGate();
      showToast(`🎉 [${conf.name}] 가구 배치 완료! 🚪 탈출문이 열렸습니다!`, 4000);
      if (window.confetti) {
        window.confetti({ particleCount: 80, spread: 90, origin: { y: 0.5 } });
      }
    } else if (!status.isAllQuestionsSolved) {
      showToast(`🪑 가구 배치 완료! 남은 문제(${status.totalQ - status.solvedQ}개)를 풀면 탈출문이 열립니다!`, 3500);
    }
  }

  // -------------------------------------------------------------
  // [8] 최종 방 탈출 & 성공 모달
  // -------------------------------------------------------------
  async function handleFinalEscape() {
    try {
      const res = await fetch('/api/students/escape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId: studentData.id })
      });
      const data = await res.json();
      if (data.success) {
        studentData.escaped = true;
        studentData.score = data.finalScore;
        updateHudInfo();

        // 4번 방까지 모든 탈출 방 완료 처리 -> 이전 방(1, 2, 3, 4) 모두 영구 폐쇄, 5번 힐링공원만 활성화
        escapedRooms = ['room_1', 'room_2', 'room_3', 'room_4'];
        unlockedRooms = ['room_5'];
        saveEscapedRooms();
        Game3D.buildRoom('room_5');
        updateRoomTabsLockState();
        updateGoalRequirementDisplay();

        // 축하 폭죽 연출 (화려한 연속 폭죽)
        fireFireworks();

        // 성공 모달 표시
        document.getElementById('final-score-val').textContent = `${studentData.score.toLocaleString()}점`;
        document.getElementById('modal-escape-success').classList.remove('hidden');
      }
    } catch (err) {
      console.error(err);
    }
  }

  function fireFireworks() {
    if (!window.confetti) return;
    const duration = 3 * 1000;
    const end = Date.now() + duration;

    (function frame() {
      window.confetti({
        particleCount: 5,
        angle: 60,
        spread: 55,
        origin: { x: 0 }
      });
      window.confetti({
        particleCount: 5,
        angle: 120,
        spread: 55,
        origin: { x: 1 }
      });

      if (Date.now() < end) {
        requestAnimationFrame(frame);
      }
    })();
  }

  // -------------------------------------------------------------
  // [9] 랭킹 모달 (총점 높은 순 정렬, 소요시간 순위 미반영!)
  // -------------------------------------------------------------
  async function openRankingModal() {
    const modal = document.getElementById('modal-ranking');
    if (!modal) return;

    try {
      const res = await fetch('/api/ranking');
      const data = await res.json();
      if (data.success) {
        renderRankingTable(data.ranking || []);
      }
    } catch (err) {
      console.error(err);
    }

    modal.classList.remove('hidden');
  }

  function renderRankingTable(rankList) {
    const tbody = document.getElementById('ranking-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    rankList.forEach((r, idx) => {
      const tr = document.createElement('tr');
      let rankDisplay = '';
      if (idx === 0) rankDisplay = `<span class="rank-badge-crown rank-1">1</span>`;
      else if (idx === 1) rankDisplay = `<span class="rank-badge-crown rank-2">2</span>`;
      else if (idx === 2) rankDisplay = `<span class="rank-badge-crown rank-3">3</span>`;
      else rankDisplay = `<span style="font-weight:700; color:#94a3b8;">${idx + 1}</span>`;

      const furnText = (r.craftedFurnitures || []).length > 0
        ? (r.craftedFurnitures || []).join(', ')
        : '-';

      tr.innerHTML = `
        <td>${rankDisplay}</td>
        <td>
          <div class="rank-student-info">
            <span class="rank-student-class">${r.classNum}반</span>
            <span>${escapeHtml(r.name)}</span>
          </div>
        </td>
        <td style="font-size: 12px; color: #cbd5e1;">${escapeHtml(furnText)}</td>
        <td><span class="rank-score-val">${r.score.toLocaleString()}점</span></td>
      `;
      tbody.appendChild(tr);
    });
  }

  // -------------------------------------------------------------
  // [10] QR 코드 모달 로드
  // -------------------------------------------------------------
  async function openQRCodeModal() {
    const modal = document.getElementById('modal-qrcode');
    if (!modal) return;

    try {
      const res = await fetch('/api/qrcode');
      const data = await res.json();
      if (data.success) {
        document.getElementById('qr-image').src = data.qrDataUrl;
        document.getElementById('qr-url-text').textContent = data.url;

        // 복사 버튼
        document.getElementById('btn-copy-qr-url').onclick = () => {
          navigator.clipboard.writeText(data.url);
          alert('접속 주소가 복사되었습니다: ' + data.url);
        };
      }
    } catch (err) {
      console.error(err);
    }

    modal.classList.remove('hidden');
  }

  // -------------------------------------------------------------
  // [11] 모달 닫기 공통 이벤트
  // -------------------------------------------------------------
  function initModals() {
    // 문제 모달 닫기
    document.getElementById('btn-close-q-modal').addEventListener('click', () => {
      document.getElementById('modal-question').classList.add('hidden');
    });

    // 가구 제작 모달 닫기
    document.getElementById('btn-close-craft-modal').addEventListener('click', () => {
      document.getElementById('modal-crafting').classList.add('hidden');
    });

    // 랭킹 모달 닫기
    document.getElementById('btn-close-rank-modal').addEventListener('click', () => {
      document.getElementById('modal-ranking').classList.add('hidden');
    });

    // QR코드 모달 닫기
    document.getElementById('btn-close-qr-modal').addEventListener('click', () => {
      document.getElementById('modal-qrcode').classList.add('hidden');
    });

    // 가구 제작 열기 버튼
    document.getElementById('btn-open-crafting').addEventListener('click', openCraftingModal);
    // 인게임 랭킹 열기 버튼
    document.getElementById('btn-open-rank').addEventListener('click', openRankingModal);

    // 탈출 성공 모달 버튼들
    const btnGoPark = document.getElementById('btn-success-go-park');
    if (btnGoPark) {
      btnGoPark.addEventListener('click', () => {
        document.getElementById('modal-escape-success').classList.add('hidden');
        switchRoom('room_5');
        showToast('🌳 5번 힐링공원에 오신 것을 환영합니다! 자유롭게 휴식과 술래잡기를 즐겨보세요!', 3500);
      });
    }

    document.getElementById('btn-success-view-rank').addEventListener('click', () => {
      document.getElementById('modal-escape-success').classList.add('hidden');
      openRankingModal();
    });
    document.getElementById('btn-success-replay').addEventListener('click', () => {
      try {
        localStorage.removeItem(getStorageKey());
      } catch (e) {}
      window.location.reload();
    });
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // 외부 공개 API
  return {
    init: init,
    onInspectObject: onInspectObject,
    onFurniturePlaced: onFurniturePlaced,
    isRoomCompleted: isRoomCompleted,
    getRoomMissionStatus: getRoomMissionStatus,
    updateGoalRequirementDisplay: updateGoalRequirementDisplay,
    refreshGameConfig: fetchGameConfig,
    showToast: showToast,
    switchRoom: switchRoom
  };
})();

// DOM 준비 완료 시 실행
window.addEventListener('DOMContentLoaded', () => {
  window.App.init();
});
