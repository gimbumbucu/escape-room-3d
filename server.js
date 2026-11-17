const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const os = require('os');
const QRCode = require('qrcode');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'data', 'db.json');

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// DB 로드 / 저장 헬퍼
function loadDB() {
  try {
    if (!fs.existsSync(DB_FILE)) {
      return { settings: {}, furnitures: [], rooms: [], questions: [], students: [] };
    }
    const data = fs.readFileSync(DB_FILE, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error('DB Load Error:', err);
    return { settings: {}, furnitures: [], rooms: [], questions: [], students: [] };
  }
}

function saveDB(db) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('DB Save Error:', err);
    return false;
  }
}

// 로컬 IP 주소 탐색 (QR 코드 생성용)
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

// ----------------------------------------------------------------
// [1] 학생 / 게임 클라이언트 API
// ----------------------------------------------------------------

// 게임 초기 데이터 및 설정 로드
app.get('/api/game/config', (req, res) => {
  const db = loadDB();
  const activeQuestions = db.questions
    .filter(q => q.active)
    .map(q => {
      // 보안을 위해 정답 인덱스는 클라이언트에 노출하지 않고 문제 풀이 제출 시 서버에서 검증
      const { answerIndex, ...safeQ } = q;
      return safeQ;
    });

  res.json({
    success: true,
    settings: {
      siteTitle: db.settings.siteTitle || '3D 방탈출 게임',
      escapeRequiredFurnitures: db.settings.escapeRequiredFurnitures || 2,
      activeQuestionCount: db.settings.activeQuestionCount || activeQuestions.length
    },
    rooms: db.rooms || [],
    furnitures: db.furnitures || [],
    questions: activeQuestions
  });
});

// 학생 참가 등록
app.post('/api/students/register', (req, res) => {
  const { grade, classNum, studentNum, name, character } = req.body;
  if (!name || !classNum || !studentNum) {
    return res.status(400).json({ success: false, message: '반, 번호, 이름을 모두 입력해주세요.' });
  }

  const db = loadDB();
  const studentId = 'st_' + Date.now() + '_' + Math.floor(Math.random() * 1000);

  const newStudent = {
    id: studentId,
    grade: grade || '1',
    classNum: classNum.toString().trim(),
    studentNum: studentNum.toString().trim(),
    name: name.trim(),
    character: character || 'char_boy_1',
    score: 0,
    wood: 0,
    metal: 0,
    craftedFurnitures: [],
    solvedQuestions: [],
    escaped: false,
    startedAt: new Date().toISOString(),
    escapedAt: null
  };

  db.students.push(newStudent);
  saveDB(db);

  res.json({ success: true, student: newStudent });
});

// 문제 정답 제출 및 채점
app.post('/api/students/submit-answer', (req, res) => {
  const { studentId, questionId, selectedIndex } = req.body;
  const db = loadDB();

  const student = db.students.find(s => s.id === studentId);
  if (!student) {
    return res.status(404).json({ success: false, message: '학생 정보를 찾을 수 없습니다.' });
  }

  const question = db.questions.find(q => q.id === parseInt(questionId));
  if (!question) {
    return res.status(404).json({ success: false, message: '문제를 찾을 수 없습니다.' });
  }

  if (student.solvedQuestions.includes(question.id)) {
    return res.status(400).json({ success: false, message: '이미 푼 문제입니다.' });
  }

  const isCorrect = question.answerIndex === parseInt(selectedIndex);

  if (isCorrect) {
    student.score += (question.points || 20);
    student.wood += (question.rewardWood || 1);
    student.metal += (question.rewardMetal || 1);
    student.solvedQuestions.push(question.id);
    saveDB(db);

    return res.json({
      success: true,
      isCorrect: true,
      message: '정답입니다! 🎉 재료와 점수를 획득했습니다.',
      earnedPoints: question.points || 20,
      rewardWood: question.rewardWood || 1,
      rewardMetal: question.rewardMetal || 1,
      studentState: {
        score: student.score,
        wood: student.wood,
        metal: student.metal,
        solvedQuestions: student.solvedQuestions
      }
    });
  } else {
    return res.json({
      success: true,
      isCorrect: false,
      message: '아쉽게도 오답입니다. 다시 도전해보세요! 💡',
      hint: question.hint || '방 안의 힌트를 잘 살펴보세요.'
    });
  }
});

// 가구 제작하기
app.post('/api/students/craft-furniture', (req, res) => {
  const { studentId, furnitureId } = req.body;
  const db = loadDB();

  const student = db.students.find(s => s.id === studentId);
  if (!student) {
    return res.status(404).json({ success: false, message: '학생 정보를 찾을 수 없습니다.' });
  }

  const furniture = db.furnitures.find(f => f.id === furnitureId);
  if (!furniture) {
    return res.status(404).json({ success: false, message: '가구 정보를 찾을 수 없습니다.' });
  }

  const needWood = furniture.cost.wood || 0;
  const needMetal = furniture.cost.metal || 0;

  if (student.wood < needWood || student.metal < needMetal) {
    return res.status(400).json({
      success: false,
      message: `재료가 부족합니다! (필요: 목재 ${needWood}개, 금속 ${needMetal}개 / 보유: 목재 ${student.wood}개, 금속 ${student.metal}개)`
    });
  }

  // 재료 차감 및 점수 지급
  student.wood -= needWood;
  student.metal -= needMetal;
  student.score += (furniture.score || 50);
  student.craftedFurnitures.push(furniture.name);

  // 필요 가구수 충족 시 탈출 조건 달성 여부 확인
  const requiredCount = db.settings.escapeRequiredFurnitures || 2;
  const canEscape = student.craftedFurnitures.length >= requiredCount;

  saveDB(db);

  res.json({
    success: true,
    message: `${furniture.name} 제작 성공! 방에 배치되었으며 +${furniture.score}점을 획득했습니다. ✨`,
    furniture: furniture,
    canEscape: canEscape,
    studentState: {
      score: student.score,
      wood: student.wood,
      metal: student.metal,
      craftedFurnitures: student.craftedFurnitures
    }
  });
});

// 최종 방 탈출 완료
app.post('/api/students/escape', (req, res) => {
  const { studentId } = req.body;
  const db = loadDB();

  const student = db.students.find(s => s.id === studentId);
  if (!student) {
    return res.status(404).json({ success: false, message: '학생 정보를 찾을 수 없습니다.' });
  }

  student.escaped = true;
  student.escapedAt = new Date().toISOString();
  // 탈출 보너스 점수
  student.score += 200;

  saveDB(db);

  res.json({
    success: true,
    message: '축하합니다! 방탈출에 성공하셨습니다! 🏆',
    finalScore: student.score,
    escapedAt: student.escapedAt
  });
});

// 랭킹 조회 (총점 높은 순 정렬, 소요시간은 순위에 반영하지 않음!)
app.get('/api/ranking', (req, res) => {
  const db = loadDB();
  const students = [...db.students];

  // 총점 높은 순(내림차순) 정렬 - 소요시간 미반영 규칙 준수
  students.sort((a, b) => (b.score || 0) - (a.score || 0));

  const rankedList = students.map((s, index) => ({
    rank: index + 1,
    id: s.id,
    displayClass: `${s.classNum}반`,
    classNum: s.classNum,
    studentNum: s.studentNum,
    name: s.name,
    character: s.character,
    score: s.score || 0,
    wood: s.wood || 0,
    metal: s.metal || 0,
    craftedCount: (s.craftedFurnitures || []).length,
    craftedFurnitures: s.craftedFurnitures || [],
    solvedCount: (s.solvedQuestions || []).length,
    escaped: !!s.escaped
  }));

  res.json({
    success: true,
    ranking: rankedList
  });
});

// ----------------------------------------------------------------
// [2] 관리자 패널 API
// ----------------------------------------------------------------

// 관리자 로그인 검증
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  const db = loadDB();
  const correctPassword = db.settings.adminPassword || '1212';

  if (password === correctPassword) {
    return res.json({ success: true, message: '관리자 인증 성공' });
  } else {
    return res.status(401).json({ success: false, message: '비밀번호가 일치하지 않습니다.' });
  }
});

// 전체 문제 목록 조회 (관리자용 - 정답 포함)
app.get('/api/admin/questions', (req, res) => {
  const db = loadDB();
  res.json({
    success: true,
    questions: db.questions || [],
    totalCount: (db.questions || []).length,
    activeCount: (db.questions || []).filter(q => q.active).length,
    settingActiveCount: db.settings.activeQuestionCount || 8
  });
});

// 문제 추가
app.post('/api/admin/questions', (req, res) => {
  const { roomId, title, question, options, answerIndex, points, rewardWood, rewardMetal, hint } = req.body;
  if (!question || !options || options.length < 2 || answerIndex === undefined) {
    return res.status(400).json({ success: false, message: '문제 내용과 최소 2개 이상의 보기 및 정답을 입력해주세요.' });
  }

  const db = loadDB();
  const nextId = db.questions.length > 0 ? Math.max(...db.questions.map(q => q.id)) + 1 : 1;

  const newQ = {
    id: nextId,
    roomId: roomId || 'room_1',
    title: title || `문제 #${nextId}`,
    question: question.trim(),
    options: options.map(o => o.trim()),
    answerIndex: parseInt(answerIndex),
    points: parseInt(points) || 20,
    rewardWood: parseInt(rewardWood) || 1,
    rewardMetal: parseInt(rewardMetal) || 1,
    hint: hint || '',
    active: true
  };

  db.questions.push(newQ);
  saveDB(db);

  res.json({ success: true, message: '문제가 성공적으로 추가되었습니다.', question: newQ });
});

// 문제 수정
app.put('/api/admin/questions/:id', (req, res) => {
  const qId = parseInt(req.params.id);
  const { roomId, title, question, options, answerIndex, points, rewardWood, rewardMetal, hint, active } = req.body;
  const db = loadDB();

  const idx = db.questions.findIndex(q => q.id === qId);
  if (idx === -1) {
    return res.status(404).json({ success: false, message: '해당 문제를 찾을 수 없습니다.' });
  }

  db.questions[idx] = {
    ...db.questions[idx],
    roomId: roomId !== undefined ? roomId : db.questions[idx].roomId,
    title: title !== undefined ? title : db.questions[idx].title,
    question: question !== undefined ? question.trim() : db.questions[idx].question,
    options: options !== undefined ? options.map(o => o.trim()) : db.questions[idx].options,
    answerIndex: answerIndex !== undefined ? parseInt(answerIndex) : db.questions[idx].answerIndex,
    points: points !== undefined ? parseInt(points) : db.questions[idx].points,
    rewardWood: rewardWood !== undefined ? parseInt(rewardWood) : db.questions[idx].rewardWood,
    rewardMetal: rewardMetal !== undefined ? parseInt(rewardMetal) : db.questions[idx].rewardMetal,
    hint: hint !== undefined ? hint : db.questions[idx].hint,
    active: active !== undefined ? !!active : db.questions[idx].active
  };

  saveDB(db);
  res.json({ success: true, message: '문제가 성공적으로 수정되었습니다.', question: db.questions[idx] });
});

// 문제 삭제
app.delete('/api/admin/questions/:id', (req, res) => {
  const qId = parseInt(req.params.id);
  const db = loadDB();

  const initialLen = db.questions.length;
  db.questions = db.questions.filter(q => q.id !== qId);

  if (db.questions.length === initialLen) {
    return res.status(404).json({ success: false, message: '삭제할 문제를 찾을 수 없습니다.' });
  }

  saveDB(db);
  res.json({ success: true, message: '문제가 삭제되었습니다.' });
});

// 출제할 문제 개수(N개) 설정 및 활성화 [적용하기] 기능
app.post('/api/admin/questions/set-active-count', (req, res) => {
  const { count, mode } = req.body; // mode: 'random' | 'sequential'
  const targetCount = parseInt(count);

  const db = loadDB();
  const total = db.questions.length;

  if (isNaN(targetCount) || targetCount <= 0) {
    return res.status(400).json({ success: false, message: '올바른 문제 개수를 입력해주세요.' });
  }

  const finalCount = Math.min(targetCount, total);
  db.settings.activeQuestionCount = finalCount;

  if (mode === 'random') {
    // 무작위로 finalCount개 선택
    const shuffled = [...db.questions].sort(() => 0.5 - Math.random());
    const selectedIds = new Set(shuffled.slice(0, finalCount).map(q => q.id));
    db.questions.forEach(q => {
      q.active = selectedIds.has(q.id);
    });
  } else {
    // 순차적으로 앞에서부터 finalCount개 활성화
    db.questions.forEach((q, idx) => {
      q.active = idx < finalCount;
    });
  }

  saveDB(db);

  res.json({
    success: true,
    message: `총 ${total}개 문제 중 ${finalCount}개의 문제가 게임 출제로 설정되었습니다.`,
    activeCount: finalCount,
    totalCount: total
  });
});

// 방 목록 및 관리
app.get('/api/admin/rooms', (req, res) => {
  const db = loadDB();
  res.json({ success: true, rooms: db.rooms || [] });
});

// 학생 전체 기록 조회 (관리자용)
app.get('/api/admin/students', (req, res) => {
  const db = loadDB();
  res.json({
    success: true,
    students: db.students || []
  });
});

// 학생 기록 초기화 (관리자용)
app.delete('/api/admin/students', (req, res) => {
  const db = loadDB();
  db.students = [];
  saveDB(db);
  res.json({ success: true, message: '모든 학생 기록과 랭킹 데이터가 초기화되었습니다.' });
});

// 단일 학생 기록 삭제
app.delete('/api/admin/students/:id', (req, res) => {
  const { id } = req.params;
  const db = loadDB();
  db.students = db.students.filter(s => s.id !== id);
  saveDB(db);
  res.json({ success: true, message: '해당 학생의 기록이 삭제되었습니다.' });
});

// 관리자 설정 조회 및 저장
app.get('/api/admin/settings', (req, res) => {
  const db = loadDB();
  res.json({ success: true, settings: db.settings });
});

app.post('/api/admin/settings', (req, res) => {
  const { adminPassword, escapeRequiredFurnitures, siteTitle } = req.body;
  const db = loadDB();

  if (adminPassword) db.settings.adminPassword = adminPassword.trim();
  if (escapeRequiredFurnitures) db.settings.escapeRequiredFurnitures = parseInt(escapeRequiredFurnitures);
  if (siteTitle) db.settings.siteTitle = siteTitle.trim();

  saveDB(db);
  res.json({ success: true, message: '설정이 저장되었습니다.', settings: db.settings });
});

// QR 코드 생성 API (접속 URL 제공)
app.get('/api/qrcode', async (req, res) => {
  try {
    const localIP = getLocalIP();
    // 클라이언트가 요청한 Host 헤더 또는 로컬 IP 사용
    const hostHeader = req.headers.host || `${localIP}:${PORT}`;
    const protocol = req.headers['x-forwarded-proto'] || 'http';
    const clientUrl = `${protocol}://${hostHeader}`;

    const qrDataUrl = await QRCode.toDataURL(clientUrl, {
      width: 300,
      margin: 2,
      color: {
        dark: '#0e1e38',
        light: '#ffffff'
      }
    });

    res.json({
      success: true,
      url: clientUrl,
      localIP: localIP,
      qrDataUrl: qrDataUrl
    });
  } catch (err) {
    console.error('QR Code Generation Error:', err);
    res.status(500).json({ success: false, message: 'QR 코드 생성 실패' });
  }
});

// 서버 기동
app.listen(PORT, '0.0.0.0', () => {
  const localIP = getLocalIP();
  console.log(`===============================================`);
  console.log(`🎮 3D 방탈출 게임 서버가 시작되었습니다!`);
  console.log(`- 로컬 접속:   http://localhost:${PORT}`);
  console.log(`- 모바일/QR접속: http://${localIP}:${PORT}`);
  console.log(`- 관리자 초기 비밀번호: 1212`);
  console.log(`===============================================`);
});
