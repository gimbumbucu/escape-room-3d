/**
 * 교사용 관리자 패널 스크립트 (Admin Panel)
 * 문제 CRUD, 출제 문제 개수 N개 설정 및 [적용하기], 방 관리, 학생 기록, 랭킹 리셋, QR코드 관리
 */

window.Admin = (function () {
  let isAuthenticated = false;
  let allQuestions = [];
  let allRooms = [];
  let allStudents = [];
  let currentEditingQId = null;
  let selectedQuestionId = null;

  // 초기화 및 이벤트 바인딩
  function init() {
    bindEvents();
  }

  function bindEvents() {
    // 관리자 로그인 폼 제출
    const formLogin = document.getElementById('form-admin-login');
    if (formLogin) {
      formLogin.addEventListener('submit', async (e) => {
        e.preventDefault();
        const pw = document.getElementById('input-admin-pw').value;
        await handleLogin(pw);
      });
    }

    // 관리자 닫기/취소 버튼
    const btnCancel = document.getElementById('btn-cancel-admin-login');
    if (btnCancel) {
      btnCancel.addEventListener('click', closeAdminModal);
    }
    const btnCloseDash = document.getElementById('btn-close-admin-dash');
    if (btnCloseDash) {
      btnCloseDash.addEventListener('click', closeAdminModal);
    }

    // 관리자 로그아웃
    const btnLogout = document.getElementById('btn-admin-logout');
    if (btnLogout) {
      btnLogout.addEventListener('click', handleLogout);
    }

    // 관리자 사이드바 탭 전환
    const tabs = document.querySelectorAll('.admin-tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const targetTabId = tab.dataset.tab;

        document.querySelectorAll('.admin-tab-section').forEach(sec => {
          sec.classList.remove('active');
        });
        const targetSec = document.getElementById(targetTabId);
        if (targetSec) targetSec.classList.add('active');

        // 해당 탭 데이터 새로고침
        if (targetTabId === 'tab-questions') loadQuestions();
        if (targetTabId === 'tab-rooms') loadRooms();
        if (targetTabId === 'tab-students') loadStudents();
        if (targetTabId === 'tab-ranking') loadRanking();
        if (targetTabId === 'tab-settings') loadSettings();
      });
    });

    // 출제할 문제 개수 설정 [적용하기] 버튼 (사진 하단 레이아웃 일치)
    const btnApplyActiveQ = document.getElementById('btn-apply-active-q');
    if (btnApplyActiveQ) {
      btnApplyActiveQ.addEventListener('click', handleApplyActiveQuestionCount);
    }

    // 상단 사진 일치 알약 버튼: 추가 [파란색], 수정 [초록색], 삭제 [빨간색]
    const btnOpenAddQ = document.getElementById('btn-open-add-q');
    if (btnOpenAddQ) {
      btnOpenAddQ.addEventListener('click', () => openQuestionEditor(null));
    }

    const btnPillEditQ = document.getElementById('btn-pill-edit-q');
    if (btnPillEditQ) {
      btnPillEditQ.addEventListener('click', () => {
        if (!selectedQuestionId) {
          alert('수정할 문제를 목록에서 먼저 클릭하여 선택해주세요.');
          return;
        }
        const qData = allQuestions.find(q => q.id === selectedQuestionId);
        if (qData) {
          openQuestionEditor(qData);
        } else {
          alert('선택된 문제를 찾을 수 없습니다.');
        }
      });
    }

    const btnPillDelQ = document.getElementById('btn-pill-del-q');
    if (btnPillDelQ) {
      btnPillDelQ.addEventListener('click', async () => {
        if (!selectedQuestionId) {
          alert('삭제할 문제를 목록에서 먼저 클릭하여 선택해주세요.');
          return;
        }
        if (confirm(`선택한 문제 #${selectedQuestionId}를 정말로 삭제하시겠습니까?`)) {
          await deleteQuestion(selectedQuestionId);
          selectedQuestionId = null;
        }
      });
    }

    // 문제 에디터 모달 닫기
    const btnCloseQEditor = document.getElementById('btn-close-q-editor');
    if (btnCloseQEditor) {
      btnCloseQEditor.addEventListener('click', closeQuestionEditor);
    }

    // 문제 저장 폼 제출 (추가 / 수정)
    const formQEditor = document.getElementById('form-q-editor');
    if (formQEditor) {
      formQEditor.addEventListener('submit', handleSaveQuestion);
    }

    // 학생 전체 기록 초기화 버튼
    const btnResetStudents = document.getElementById('btn-reset-students');
    if (btnResetStudents) {
      btnResetStudents.addEventListener('click', handleResetStudents);
    }

    // 게임 일반 설정 폼 제출
    const formSettings = document.getElementById('form-admin-general-settings');
    if (formSettings) {
      formSettings.addEventListener('submit', handleSaveSettings);
    }
  }

  // 관리자 모달 열기
  function openAdminModal() {
    const modal = document.getElementById('modal-admin');
    if (!modal) return;
    modal.classList.remove('hidden');

    if (isAuthenticated) {
      showDashboardView();
      loadQuestions();
    } else {
      showLockView();
    }
  }

  function closeAdminModal() {
    const modal = document.getElementById('modal-admin');
    if (modal) modal.classList.add('hidden');
  }

  function showLockView() {
    document.getElementById('admin-lock-view').classList.remove('hidden');
    document.getElementById('admin-dashboard-view').classList.add('hidden');
    const pwInput = document.getElementById('input-admin-pw');
    if (pwInput) {
      pwInput.value = '';
      pwInput.focus();
    }
  }

  function showDashboardView() {
    document.getElementById('admin-lock-view').classList.add('hidden');
    document.getElementById('admin-dashboard-view').classList.remove('hidden');
  }

  // 관리자 인증 요청
  async function handleLogin(password) {
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });
      const data = await res.json();
      if (data.success) {
        isAuthenticated = true;
        showDashboardView();
        loadQuestions();
      } else {
        alert(data.message || '비밀번호가 올바르지 않습니다.');
      }
    } catch (err) {
      console.error(err);
      alert('서버 통신 오류가 발생했습니다.');
    }
  }

  function handleLogout() {
    isAuthenticated = false;
    showLockView();
  }

  // -------------------------------------------------------------
  // [탭 1] 문제 관리 (CRUD & 개수 설정 적용)
  // -------------------------------------------------------------
  async function loadQuestions() {
    try {
      const res = await fetch('/api/admin/questions');
      const data = await res.json();
      if (data.success) {
        allQuestions = data.questions || [];
        renderQuestionTable(allQuestions);

        // 상단 비밀번호 뱃지 갱신 (사진 우측 상단 '비밀번호: qwer1234')
        const pwBadge = document.getElementById('admin-pw-badge-val');
        if (pwBadge && data.adminPassword) {
          pwBadge.textContent = data.adminPassword;
        }

        // 카운터 텍스트: 문제 목록 (총 100개 중 15개 출제)
        const counter = document.getElementById('admin-q-counter');
        if (counter) {
          counter.textContent = `(총 ${data.totalCount}개 중 ${data.activeCount}개 출제)`;
        }

        // 하단 출제 수 드롭다운 셀렉트 동적 옵션 및 현재값 동기화
        const selectCount = document.getElementById('select-active-q-count');
        if (selectCount) {
          const currentVal = data.settingActiveCount || data.activeCount || 8;
          // 총 개수 기반으로 적절한 옵션 목록 설정
          const defaultOptions = [3, 5, 8, 10, 12, 15, 20, 25, 30, 50, 100];
          const optsSet = new Set(defaultOptions.filter(n => n <= Math.max(data.totalCount, 15)));
          optsSet.add(currentVal);
          optsSet.add(data.totalCount);

          const sortedOpts = Array.from(optsSet).filter(n => n > 0).sort((a, b) => a - b);
          selectCount.innerHTML = sortedOpts.map(n => 
            `<option value="${n}" ${n === currentVal ? 'selected' : ''}>${n}개</option>`
          ).join('');
        }
      }
    } catch (err) {
      console.error(err);
    }
  }

  function renderQuestionTable(questions) {
    const tbody = document.getElementById('admin-q-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!questions || questions.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: #94a3b8; padding: 25px;">등록된 문제가 없습니다. 상단 [추가] 버튼을 눌러 문제를 등록하세요.</td></tr>`;
      return;
    }

    questions.forEach((q, index) => {
      const tr = document.createElement('tr');
      tr.dataset.id = q.id;

      if (selectedQuestionId === q.id) {
        tr.classList.add('selected-row');
      }

      // 보기 한 줄 문자열 포맷: 1.수성 2.금성 3.지구 4.화성 (사진과 100% 동일한 노란색 폰트)
      const formattedOptions = (q.options || [])
        .map((opt, i) => `${i + 1}.${opt}`)
        .join(' ');

      // 정답 번호 (1-based index)
      const answerDisplay = (q.answerIndex !== undefined ? q.answerIndex + 1 : 1);

      tr.innerHTML = `
        <td class="photo-col-num">${index + 1}</td>
        <td class="photo-col-question">${escapeHtml(q.question || q.title)}</td>
        <td class="photo-col-options"><span class="table-opt-highlight">${escapeHtml(formattedOptions)}</span></td>
        <td class="photo-col-answer"><span class="table-ans-highlight">${answerDisplay}</span></td>
      `;

      // 행 클릭 시 선택 상태 토글 및 하이라이트
      tr.addEventListener('click', () => {
        tbody.querySelectorAll('tr').forEach(r => r.classList.remove('selected-row'));
        tr.classList.add('selected-row');
        selectedQuestionId = q.id;
      });

      // 더블 클릭 시 바로 수정창 오픈
      tr.addEventListener('dblclick', () => {
        selectedQuestionId = q.id;
        openQuestionEditor(q);
      });

      tbody.appendChild(tr);
    });

    // 선택된 항목이 없거나 목록에 없으면 첫 번째 행 자동 선택
    if ((!selectedQuestionId || !questions.some(q => q.id === selectedQuestionId)) && questions.length > 0) {
      selectedQuestionId = questions[0].id;
      const firstRow = tbody.querySelector('tr');
      if (firstRow) firstRow.classList.add('selected-row');
    }
  }

  // 출제할 문제 개수(N개) 설정 및 [적용하기] (사진 하단 출제 수 설정 UI 연동)
  async function handleApplyActiveQuestionCount() {
    const select = document.getElementById('select-active-q-count');
    const count = parseInt(select ? select.value : 8);

    if (isNaN(count) || count <= 0) {
      alert('1개 이상의 올바른 문제 개수를 선택해주세요.');
      return;
    }

    try {
      const res = await fetch('/api/admin/questions/set-active-count', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count, mode: 'sequential' })
      });
      const data = await res.json();
      if (data.success) {
        alert(`✅ ${data.message}`);
        await loadQuestions();
        // 게임 클라이언트 설정도 실시간 동기화
        if (window.App && window.App.refreshGameConfig) {
          window.App.refreshGameConfig();
        }
      } else {
        alert(data.message || '출제 개수 적용 실패');
      }
    } catch (err) {
      console.error(err);
      alert('서버 통신 오류가 발생했습니다.');
    }
  }

  // 문제 추가 / 수정 모달 열기
  function openQuestionEditor(questionData) {
    const modal = document.getElementById('modal-q-editor');
    const titleEl = document.getElementById('q-editor-title');
    const idInput = document.getElementById('edit-q-id');
    const roomSelect = document.getElementById('edit-q-room');
    const titleInput = document.getElementById('edit-q-obj-title');
    const contentInput = document.getElementById('edit-q-content');
    const pointsInput = document.getElementById('edit-q-points');
    const woodInput = document.getElementById('edit-q-wood');
    const metalInput = document.getElementById('edit-q-metal');
    const hintInput = document.getElementById('edit-q-hint');

    if (!questionData) {
      // 새 문제 추가 모드
      currentEditingQId = null;
      titleEl.textContent = '새 문제 추가';
      idInput.value = '';
      roomSelect.value = 'room_1';
      titleInput.value = '';
      contentInput.value = '';
      document.getElementById('edit-opt-0').value = '';
      document.getElementById('edit-opt-1').value = '';
      document.getElementById('edit-opt-2').value = '';
      document.getElementById('edit-opt-3').value = '';
      document.querySelector('input[name="edit-correct-idx"][value="0"]').checked = true;
      pointsInput.value = '20';
      woodInput.value = '1';
      metalInput.value = '1';
      hintInput.value = '';
    } else {
      // 기존 문제 수정 모드
      currentEditingQId = questionData.id;
      titleEl.textContent = `문제 #${questionData.id} 수정`;
      idInput.value = questionData.id;
      roomSelect.value = questionData.roomId || 'room_1';
      titleInput.value = questionData.title || '';
      contentInput.value = questionData.question || '';
      document.getElementById('edit-opt-0').value = questionData.options[0] || '';
      document.getElementById('edit-opt-1').value = questionData.options[1] || '';
      document.getElementById('edit-opt-2').value = questionData.options[2] || '';
      document.getElementById('edit-opt-3').value = questionData.options[3] || '';

      const correctRadio = document.querySelector(`input[name="edit-correct-idx"][value="${questionData.answerIndex}"]`);
      if (correctRadio) correctRadio.checked = true;

      pointsInput.value = questionData.points || 20;
      woodInput.value = questionData.rewardWood || 1;
      metalInput.value = questionData.rewardMetal || 1;
      hintInput.value = questionData.hint || '';
    }

    modal.classList.remove('hidden');
  }

  function closeQuestionEditor() {
    const modal = document.getElementById('modal-q-editor');
    if (modal) modal.classList.add('hidden');
  }

  // 문제 저장 처리 (POST or PUT)
  async function handleSaveQuestion(e) {
    e.preventDefault();

    const roomId = document.getElementById('edit-q-room').value;
    const title = document.getElementById('edit-q-obj-title').value.trim();
    const question = document.getElementById('edit-q-content').value.trim();
    const opt0 = document.getElementById('edit-opt-0').value.trim();
    const opt1 = document.getElementById('edit-opt-1').value.trim();
    const opt2 = document.getElementById('edit-opt-2').value.trim();
    const opt3 = document.getElementById('edit-opt-3').value.trim();
    const checkedRadio = document.querySelector('input[name="edit-correct-idx"]:checked');
    const answerIndex = checkedRadio ? parseInt(checkedRadio.value) : 0;
    const points = parseInt(document.getElementById('edit-q-points').value) || 20;
    const rewardWood = parseInt(document.getElementById('edit-q-wood').value) || 1;
    const rewardMetal = parseInt(document.getElementById('edit-q-metal').value) || 1;
    const hint = document.getElementById('edit-q-hint').value.trim();

    const options = [opt0, opt1, opt2, opt3].filter(o => o.length > 0);
    if (options.length < 2) {
      alert('보기를 최소 2개 이상 입력해주세요.');
      return;
    }

    const payload = {
      roomId,
      title,
      question,
      options,
      answerIndex,
      points,
      rewardWood,
      rewardMetal,
      hint
    };

    try {
      let res;
      if (currentEditingQId) {
        // 수정 (PUT)
        res = await fetch(`/api/admin/questions/${currentEditingQId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      } else {
        // 추가 (POST)
        res = await fetch('/api/admin/questions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      }

      const data = await res.json();
      if (data.success) {
        alert(data.message);
        closeQuestionEditor();
        await loadQuestions();
        if (window.App && window.App.refreshGameConfig) {
          window.App.refreshGameConfig();
        }
      } else {
        alert(data.message || '저장 실패');
      }
    } catch (err) {
      console.error(err);
      alert('서버 통신 오류가 발생했습니다.');
    }
  }

  // 문제 삭제 API 호출
  async function deleteQuestion(qId) {
    try {
      const res = await fetch(`/api/admin/questions/${qId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        alert('문제가 성공적으로 삭제되었습니다.');
        await loadQuestions();
        if (window.App && window.App.refreshGameConfig) {
          window.App.refreshGameConfig();
        }
      } else {
        alert(data.message || '삭제 실패');
      }
    } catch (err) {
      console.error(err);
      alert('서버 통신 오류가 발생했습니다.');
    }
  }

  // -------------------------------------------------------------
  // [탭 2] 방 관리
  // -------------------------------------------------------------
  async function loadRooms() {
    try {
      const res = await fetch('/api/admin/rooms');
      const data = await res.json();
      if (data.success) {
        allRooms = data.rooms || [];
        renderRooms(allRooms);
      }
    } catch (err) {
      console.error(err);
    }
  }

  function renderRooms(rooms) {
    const container = document.getElementById('admin-room-cards');
    if (!container) return;
    container.innerHTML = '';

    rooms.forEach(room => {
      const card = document.createElement('div');
      card.className = 'room-admin-card';
      const qCountInRoom = allQuestions.filter(q => q.roomId === room.id).length;

      card.innerHTML = `
        <h4><i class="fa-solid fa-door-open"></i> ${escapeHtml(room.name)}</h4>
        <p>${escapeHtml(room.description)}</p>
        <div style="margin-top: 12px; font-size: 12px; color: #94a3b8;">
          <span>배치된 문제: <strong style="color: #fbbf24;">${qCountInRoom}개</strong></span> | 
          <span>테마 색상: <span style="display:inline-block; width:12px; height:12px; background:${room.color}; border-radius:2px; vertical-align:middle;"></span></span>
        </div>
      `;
      container.appendChild(card);
    });
  }

  // -------------------------------------------------------------
  // [탭 3] 학생 기록 관리 & 초기화
  // -------------------------------------------------------------
  async function loadStudents() {
    try {
      const res = await fetch('/api/admin/students');
      const data = await res.json();
      if (data.success) {
        allStudents = data.students || [];
        renderStudentTable(allStudents);
      }
    } catch (err) {
      console.error(err);
    }
  }

  function renderStudentTable(students) {
    const tbody = document.getElementById('admin-student-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (students.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: #94a3b8; padding: 20px;">참가한 학생 기록이 없습니다.</td></tr>`;
      return;
    }

    students.forEach(s => {
      const tr = document.createElement('tr');
      const escapedBadge = s.escaped
        ? `<span class="badge-active">탈출 성공 🏆</span>`
        : `<span class="badge-inactive">도전 중 🏃</span>`;

      tr.innerHTML = `
        <td>${s.grade || 1}학년 ${s.classNum}반 ${s.studentNum}번</td>
        <td style="font-weight: 700; color: #fff;">${escapeHtml(s.name)}</td>
        <td style="color: #fbbf24; font-weight: 800;">${s.score || 0}점</td>
        <td>🪵 ${s.wood || 0} / ⚙️ ${s.metal || 0}</td>
        <td>${(s.craftedFurnitures || []).length}개 (${escapeHtml((s.craftedFurnitures || []).join(', ') || '없음')})</td>
        <td>${(s.solvedQuestions || []).length}개</td>
        <td>${escapedBadge}</td>
        <td>
          <button class="btn-table-action btn-del btn-del-student" data-id="${s.id}"><i class="fa-solid fa-trash"></i> 삭제</button>
        </td>
      `;
      tbody.appendChild(tr);
    });

    tbody.querySelectorAll('.btn-del-student').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        if (confirm('해당 학생의 기록을 삭제하시겠습니까?')) {
          await deleteStudent(id);
        }
      });
    });
  }

  async function deleteStudent(id) {
    try {
      const res = await fetch(`/api/admin/students/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        alert(data.message);
        await loadStudents();
      }
    } catch (err) {
      console.error(err);
    }
  }

  async function handleResetStudents() {
    if (confirm('⚠️ 모든 학생의 플레이 기록과 랭킹 데이터를 완전히 초기화하시겠습니까? (되돌릴 수 없습니다)')) {
      try {
        const res = await fetch('/api/admin/students', { method: 'DELETE' });
        const data = await res.json();
        if (data.success) {
          alert(data.message);
          await loadStudents();
        }
      } catch (err) {
        console.error(err);
        alert('초기화 중 오류가 발생했습니다.');
      }
    }
  }

  // -------------------------------------------------------------
  // [탭 4] 랭킹 관리
  // -------------------------------------------------------------
  async function loadRanking() {
    try {
      const res = await fetch('/api/ranking');
      const data = await res.json();
      if (data.success) {
        renderRankingTable(data.ranking || []);
      }
    } catch (err) {
      console.error(err);
    }
  }

  function renderRankingTable(rankingList) {
    const tbody = document.getElementById('admin-rank-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    rankingList.forEach((r, idx) => {
      const tr = document.createElement('tr');
      const crown = idx === 0 ? '🥇 ' : idx === 1 ? '🥈 ' : idx === 2 ? '🥉 ' : `${idx + 1}위`;

      tr.innerHTML = `
        <td style="font-weight: 800; font-size: 15px; color: #fbbf24;">${crown}</td>
        <td><strong>${r.classNum}반 ${escapeHtml(r.name)}</strong> <span style="font-size: 12px; color: #94a3b8;">(${r.studentNum}번)</span></td>
        <td>${escapeHtml((r.craftedFurnitures || []).join(', ') || '없음')}</td>
        <td style="color: #fbbf24; font-weight: 900; font-size: 15px;">${r.score.toLocaleString()}점</td>
        <td>${r.escaped ? '🏆 탈출 완료' : '탐험 중'}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  // -------------------------------------------------------------
  // [탭 5] 게임 설정 저장
  // -------------------------------------------------------------
  async function loadSettings() {
    try {
      const res = await fetch('/api/admin/settings');
      const data = await res.json();
      if (data.success && data.settings) {
        document.getElementById('setting-admin-pw').value = data.settings.adminPassword || '1212';
        document.getElementById('setting-escape-furn').value = data.settings.escapeRequiredFurnitures || 2;
        document.getElementById('setting-site-title').value = data.settings.siteTitle || '3D 방탈출 아카데미';
      }
    } catch (err) {
      console.error(err);
    }
  }

  async function handleSaveSettings(e) {
    e.preventDefault();
    const adminPassword = document.getElementById('setting-admin-pw').value.trim();
    const escapeRequiredFurnitures = parseInt(document.getElementById('setting-escape-furn').value);
    const siteTitle = document.getElementById('setting-site-title').value.trim();

    try {
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminPassword, escapeRequiredFurnitures, siteTitle })
      });
      const data = await res.json();
      if (data.success) {
        alert('설정이 성공적으로 저장되었습니다.');
      }
    } catch (err) {
      console.error(err);
      alert('설정 저장 실패');
    }
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

  return {
    init: init,
    openAdminModal: openAdminModal,
    closeAdminModal: closeAdminModal
  };
})();
