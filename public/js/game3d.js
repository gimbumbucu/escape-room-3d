/**
 * 3D Game Engine (Three.js 기반)
 * 3D 방탈출 아카데미 - 룸 탐험, 캐릭터 컨트롤, 가구 소환, 오브젝트 상호작용
 */

window.Game3D = (function() {
  let scene, camera, renderer;
  let playerMesh = null;
  let currentRoomId = 'room_1';
  let roomObjects = []; // 인터랙티브 3D 오브젝트 목록
  let placedFurnitures = []; // 제작되어 방에 배치된 가구들
  let nearbyObject = null; // 현재 접근 중인 오브젝트
  let colliders = []; // 사물/가구 통과 방지 충돌체 목록 (Colliders)

  // 사물 통과 방지 충돌체 헬퍼
  function addBoxCollider(x, z, width, depth) {
    colliders.push({
      type: 'box',
      minX: x - width / 2,
      maxX: x + width / 2,
      minZ: z - depth / 2,
      maxZ: z + depth / 2
    });
  }

  function addCircleCollider(x, z, radius) {
    colliders.push({
      type: 'circle',
      x: x,
      z: z,
      radius: radius
    });
  }

  // 플레이어와 사물 간 충돌 감지 (radius = 0.45)
  function isColliding(x, z, radius = 0.45) {
    // 1. 외벽/울타리 경계 (5번 방 공원은 16.5m, 일반 방은 10.5m)
    const bound = (currentRoomId === 'room_5') ? 16.5 : 10.5;
    if (x - radius < -bound || x + radius > bound || z - radius < -bound || z + radius > bound) {
      return true;
    }

    // 2. 사물 및 가구 충돌 검사
    for (let i = 0; i < colliders.length; i++) {
      const c = colliders[i];
      if (c.type === 'box') {
        if (x + radius > c.minX && x - radius < c.maxX && z + radius > c.minZ && z - radius < c.maxZ) {
          return true;
        }
      } else if (c.type === 'circle') {
        const dx = x - c.x;
        const dz = z - c.z;
        const distSq = dx * dx + dz * dz;
        const minDist = radius + c.radius;
        if (distSq < minDist * minDist) {
          return true;
        }
      }
    }
    return false;
  }

  // 캐릭터 이동 및 물리 관련 변수
  const moveState = {
    forward: 0,
    right: 0,
    speed: 5.5,
    isRunning: false
  };
  const keysDown = {};
  let walkAnimTime = 0;

  // 조이스틱 상태
  let joystickActive = false;
  let joystickVector = { x: 0, y: 0 };

  // 테마 방 정의
  const roomThemes = {
    room_1: {
      name: '1번 방 - 도서관',
      floorColor: 0x3e2723,
      wallColor: 0x271910,
      lightColor: 0xffe0b2,
      ambientColor: 0x4a3424
    },
    room_2: {
      name: '2번 방 - 과학실',
      floorColor: 0x1e293b,
      wallColor: 0x0f172a,
      lightColor: 0x93c5fd,
      ambientColor: 0x1e3a5f
    },
    room_3: {
      name: '3번 방 - 박물관',
      floorColor: 0x2b1e3a,
      wallColor: 0x1a1024,
      lightColor: 0xfde047,
      ambientColor: 0x3c2652
    },
    room_4: {
      name: '4번 방 - 공방',
      floorColor: 0x3d2817,
      wallColor: 0x26190e,
      lightColor: 0xfb923c,
      ambientColor: 0x4a2e18
    },
    room_5: {
      name: '5번 방 - 힐링 공원',
      floorColor: 0x2e7d32,
      wallColor: 0x1e3a2b,
      lightColor: 0xfffaed,
      ambientColor: 0xdcfce7,
      isPark: true
    }
  };

  // 5번 방 힐링 공원 전용 피처 및 점프 물리 상태
  let trampolines = [];
  let boosters = [];
  let parkBoostTime = 0;
  let playerVelocityY = 0;
  let isGrounded = true;
  let tagRole = 'runner'; // 'runner' (도망자) or 'tagger' (술래)

  // -------------------------------------------------------------
  // [1] Three.js 초기화 및 씬 설정
  // -------------------------------------------------------------
  function init(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    // 씬 생성
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x080d1a);
    scene.fog = new THREE.FogExp2(0x080d1a, 0.035);

    // 카메라 생성
    camera = new THREE.PerspectiveCamera(
      60,
      container.clientWidth / container.clientHeight,
      0.1,
      100
    );
    camera.position.set(0, 5, 8);

    // 렌더러 생성
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    // 조명 추가
    setupLights();

    // 입력 이벤트 등록
    setupInputListeners();

    // 초기 방 구축
    buildRoom(currentRoomId);

    // 창 크기 및 화면 회전(Orientation) 자동 반응형 리사이즈 이벤트
    function handleResize() {
      if (!renderer || !camera || !container) return;
      const width = container.clientWidth || window.innerWidth;
      const height = container.clientHeight || window.innerHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    }

    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', () => {
      setTimeout(handleResize, 150);
    });
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleResize);
    }

    // 렌더 루프 시작
    animate();
  }

  // 조명 설정
  let dirLight, pointLight, ambientLight;
  function setupLights() {
    ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    dirLight = new THREE.DirectionalLight(0xfff5e6, 0.9);
    dirLight.position.set(8, 14, 10);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 40;
    dirLight.shadow.camera.left = -15;
    dirLight.shadow.camera.right = 15;
    dirLight.shadow.camera.top = 15;
    dirLight.shadow.camera.bottom = -15;
    scene.add(dirLight);

    pointLight = new THREE.PointLight(0xffe082, 1.2, 18);
    pointLight.position.set(0, 4, 0);
    scene.add(pointLight);
  }

  // -------------------------------------------------------------
  // [2] 3D 방(Room) 빌더 (테마별 방 구조 생성)
  // -------------------------------------------------------------
  let roomGroup = null;
  function buildRoom(roomId) {
    currentRoomId = roomId;
    const theme = roomThemes[roomId] || roomThemes.room_1;

    // 기존 방 제거
    if (roomGroup) {
      scene.remove(roomGroup);
      roomGroup.traverse(child => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
          else child.material.dispose();
        }
      });
    }

    roomGroup = new THREE.Group();
    roomObjects = [];
    colliders = [];
    trampolines = [];
    boosters = [];
    parkBoostTime = 0;
    fountainData = null;

    // 조명 & 안개 & 배경 하늘 설정
    if (roomId === 'room_5') {
      // 5번 방 힐링 공원: 화창한 야외 푸른 하늘 & 따스한 햇살
      scene.background = new THREE.Color(0x7dd3fc); // 맑고 화창한 하늘색
      scene.fog = new THREE.FogExp2(0xbae6fd, 0.012); // 부드러운 수평선 안개
      dirLight.position.set(12, 22, 14);
      dirLight.intensity = 1.35;
      dirLight.color.setHex(0xfffbeb);
      ambientLight.intensity = 0.85;
      ambientLight.color.setHex(0xdcfce7);
      pointLight.intensity = 0.6;
      pointLight.color.setHex(0xfff7ed);

      // 공원 3D 전체 빌드
      buildParkObjects();

      // 공원에서도 제작/배치된 가구 소환!
      placedFurnitures.forEach(furn => {
        if (furn.roomId === 'room_5') {
          spawnFurnitureMesh(furn, false);
        }
      });

      // 공원 술래잡기 HUD 표시
      const parkHud = document.getElementById('park-tag-hud');
      if (parkHud) parkHud.classList.remove('hidden');

      // 캐릭터 위치 공원 남쪽 입구 산책로에 배치 (정면 분수대를 바라봄)
      if (playerMesh) {
        playerMesh.position.set(0, 0, 13);
        playerMesh.rotation.y = Math.PI;
      }
    } else {
      // 1~4번 방 (실내 던전/테마 방)
      scene.background = new THREE.Color(0x080d1a);
      scene.fog = new THREE.FogExp2(0x080d1a, 0.035);
      dirLight.position.set(8, 14, 10);
      dirLight.intensity = 0.9;
      dirLight.color.setHex(0xfff5e6);
      ambientLight.intensity = 0.6;
      ambientLight.color.setHex(theme.ambientColor || 0x4a3424);
      pointLight.intensity = 1.2;
      pointLight.color.setHex(theme.lightColor);

      // 공원 술래잡기 HUD 숨김
      const parkHud = document.getElementById('park-tag-hud');
      if (parkHud) parkHud.classList.add('hidden');

      // 바닥 (Floor)
      const floorGeo = new THREE.PlaneGeometry(24, 24);
      const floorMat = new THREE.MeshStandardMaterial({
        color: theme.floorColor,
        roughness: 0.7,
        metalness: 0.1
      });
      const floor = new THREE.Mesh(floorGeo, floorMat);
      floor.rotation.x = -Math.PI / 2;
      floor.receiveShadow = true;
      roomGroup.add(floor);

      // 격자 바닥 타일 라인
      const grid = new THREE.GridHelper(24, 12, 0xffffff, 0x475569);
      grid.position.y = 0.01;
      grid.material.opacity = 0.15;
      grid.material.transparent = true;
      roomGroup.add(grid);

      // 벽면 (Walls - 뒤, 좌, 우)
      const wallMat = new THREE.MeshStandardMaterial({
        color: theme.wallColor,
        roughness: 0.9
      });

      // 뒷벽
      const backWall = new THREE.Mesh(new THREE.BoxGeometry(24, 8, 1), wallMat);
      backWall.position.set(0, 4, -12);
      backWall.receiveShadow = true;
      roomGroup.add(backWall);

      // 좌측벽
      const leftWall = new THREE.Mesh(new THREE.BoxGeometry(1, 8, 24), wallMat);
      leftWall.position.set(-12, 4, 0);
      leftWall.receiveShadow = true;
      roomGroup.add(leftWall);

      // 우측벽
      const rightWall = new THREE.Mesh(new THREE.BoxGeometry(1, 8, 24), wallMat);
      rightWall.position.set(12, 4, 0);
      rightWall.receiveShadow = true;
      roomGroup.add(rightWall);

      // 천장 샹들리에 또는 중앙 조명 장식
      const chandelier = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.8, 1),
        new THREE.MeshStandardMaterial({
          color: 0xfbbf24,
          emissive: 0xf59e0b,
          emissiveIntensity: 0.6,
          wireframe: true
        })
      );
      chandelier.position.set(0, 5.5, 0);
      roomGroup.add(chandelier);

      // 비상 탈출 게이트 (Exit Door)
      createExitGate();
      if (window.App && window.App.isRoomCompleted && window.App.isRoomCompleted(roomId)) {
        unlockExitGate();
      }

      // 테마별 고유 오브젝트 및 문제 조사 스팟 배치
      buildThemeSpecificObjects(roomId);

      // 기존 제작된 가구 재소환
      placedFurnitures.forEach(furn => {
        if (furn.roomId === roomId) {
          spawnFurnitureMesh(furn, false);
        }
      });

      // 캐릭터 위치 방 중앙 앞쪽으로 리셋
      if (playerMesh) {
        playerMesh.position.set(0, 0, 5);
        playerMesh.rotation.y = Math.PI;
      }
    }

    scene.add(roomGroup);
  }

  // 비상 탈출구 (Gate)
  let exitGateMesh = null;
  function createExitGate() {
    const gateGroup = new THREE.Group();
    gateGroup.position.set(0, 0, -11.4);

    const frameGeo = new THREE.BoxGeometry(3.6, 5.5, 0.4);
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.6 });
    const frame = new THREE.Mesh(frameGeo, frameMat);
    frame.position.y = 2.75;
    gateGroup.add(frame);

    // 문 내부 (포털)
    const portalGeo = new THREE.PlaneGeometry(2.8, 4.8);
    const portalMat = new THREE.MeshStandardMaterial({
      color: 0x3b82f6,
      emissive: 0x1d4ed8,
      emissiveIntensity: 0.5,
      roughness: 0.2
    });
    const portal = new THREE.Mesh(portalGeo, portalMat);
    portal.position.set(0, 2.5, 0.25);
    gateGroup.add(portal);

    // 비상 탈출구 팻말
    const signGeo = new THREE.BoxGeometry(2, 0.5, 0.1);
    const signMat = new THREE.MeshStandardMaterial({
      color: 0x10b981,
      emissive: 0x059669,
      emissiveIntensity: 0.8
    });
    const sign = new THREE.Mesh(signGeo, signMat);
    sign.position.set(0, 5.6, 0.3);
    gateGroup.add(sign);

    exitGateMesh = gateGroup;
    roomGroup.add(gateGroup);
  }

  // 탈출구 활성화 연출
  function unlockExitGate() {
    if (!exitGateMesh) return;
    exitGateMesh.traverse(child => {
      if (child.material && child.material.emissive) {
        child.material.emissive.setHex(0x10b981);
        child.material.emissiveIntensity = 1.2;
      }
    });
  }

  // 테마별 오브젝트 배치
  function buildThemeSpecificObjects(roomId) {
    if (roomId === 'room_1') {
      // 1번 방: 도서관
      // 대형 서가들
      createBookshelf(-8, 0, -10, 0);
      createBookshelf(-4, 0, -10, 0);
      createBookshelf(4, 0, -10, 0);
      createBookshelf(8, 0, -10, 0);
      createBookshelf(-10.5, 0, -4, Math.PI / 2);
      createBookshelf(10.5, 0, -4, -Math.PI / 2);

      // 인터랙티브 오브젝트 1: 고대 마법 서가
      addInteractiveSpot(-6, 0, -8, '도서관의 숨겨진 책장', 0xf59e0b, 'bookshelf', 1);
      // 인터랙티브 오브젝트 2: 고대 천구의 / 지구본
      createGlobe(5, 0, -5);
      addInteractiveSpot(5, 0, -5, '고대 천문 관측의 수수께끼', 0x38bdf8, 'globe', 2);
      // 인터랙티브 오브젝트 3: 도서관 암호 열람대
      createReadingDesk(-5, 0, 2);
      addInteractiveSpot(-5, 0, 2, '도서관 암호 책자', 0xa855f7, 'desk', 3);

    } else if (roomId === 'room_2') {
      // 2번 방: 과학실
      createLabBench(-7, 0, -7);
      createLabBench(7, 0, -7);
      createBlackboard(0, 3, -11.4);

      // 인터랙티브 오브젝트 1: 화학 실험대
      addInteractiveSpot(-7, 0, -7, '화학 실험대의 시험관', 0x06b6d4, 'flask', 4);
      // 인터랙티브 오브젝트 2: 과학실 비밀 칠판
      addInteractiveSpot(0, 0, -9.5, '과학실 비밀 칠판', 0x10b981, 'board', 5);
      // 인터랙티브 오브젝트 3: 정밀 현미경
      createMicroscope(6, 0, 1);
      addInteractiveSpot(6, 0, 1, '정밀 현미경의 렌즈', 0xf43f5e, 'microscope', 6);

    } else if (roomId === 'room_3') {
      // 3번 방: 박물관
      createMuseumPillars();

      // 인터랙티브 오브젝트 1: 공룡 화석 표본
      createDinoFossil(0, 0, -4);
      addInteractiveSpot(0, 0, -4, '공룡 화석 표본대', 0xf59e0b, 'fossil', 7);
      // 인터랙티브 오브젝트 2: 고대 유물 비석
      createAncientRelic(-7, 0, 0);
      addInteractiveSpot(-7, 0, 0, '고대 석조 유적 판독', 0x8b5cf6, 'relic', 8);
      // 인터랙티브 오브젝트 3: 박물관 비밀 금고
      createTreasureChest(7, 0, 0);
      addInteractiveSpot(7, 0, 0, '박물관 비밀 금고', 0xec4899, 'chest', 9);

    } else if (roomId === 'room_4') {
      // 4번 방: 공방
      createFurnace(-8, 0, -8);
      createWorkbench(6, 0, -6);

      // 인터랙티브 오브젝트 1: 제련 화로
      addInteractiveSpot(-8, 0, -8, '공방 제련 화로', 0xef4444, 'furnace', 10);
      // 인터랙티브 오브젝트 2: 목공 작업대
      addInteractiveSpot(6, 0, -6, '목공 선반과 줄자', 0xd97706, 'workbench', 11);
      // 인터랙티브 오브젝트 3: 장인의 부품함
      createToolBox(-5, 0, 2);
      addInteractiveSpot(-5, 0, 2, '장인의 부품 상자', 0x3b82f6, 'toolbox', 12);

    } else if (roomId === 'room_5') {
      // 5번 방: 힐링 공원 & 술래잡기 놀이 공간
      buildParkObjects();
    }
  }

  // -------------------------------------------------------------
  // [2-B] 5번 방: 힐링 공원 & 술래잡기 놀이 공간 빌더
  // -------------------------------------------------------------
  function buildParkObjects() {
    // 1. 넓은 야외 잔디 바닥 (36 x 36)
    const lawnGeo = new THREE.PlaneGeometry(36, 36);
    const lawnMat = new THREE.MeshStandardMaterial({
      color: 0x2e7d32,
      roughness: 0.85,
      metalness: 0.05
    });
    const lawn = new THREE.Mesh(lawnGeo, lawnMat);
    lawn.rotation.x = -Math.PI / 2;
    lawn.receiveShadow = true;
    roomGroup.add(lawn);

    // 잔디 위 패턴 라인
    const parkGrid = new THREE.GridHelper(36, 18, 0x166534, 0x15803d);
    parkGrid.position.y = 0.01;
    parkGrid.material.opacity = 0.25;
    parkGrid.material.transparent = true;
    roomGroup.add(parkGrid);

    // 2. 십자형 및 원형 돌 산책로
    createParkWalkways();

    // 3. 중앙 분수대 (Stone Fountain)
    createParkFountain(0, 0, 0);

    // 4. 울창한 공원 나무들 (12그루 - 술래잡기 엄폐물)
    const treePositions = [
      [-10, 0, -10], [-5, 0, -12], [6, 0, -11], [11, 0, -8],
      [-12, 0, -3], [-11, 0, 6], [12, 0, 2], [10, 0, 9],
      [-7, 0, 11], [-2, 0, 12], [5, 0, 12], [11, 0, -2]
    ];
    treePositions.forEach((pos, idx) => {
      createParkTree(pos[0], pos[1], pos[2], 0.9 + (idx % 3) * 0.2);
    });

    // 5. 공원 원목 벤치들 (6개 - 산책로 주변 및 나무 그늘 아래)
    createParkBench(-4, 0, -3.5, 0);
    createParkBench(4, 0, -3.5, 0);
    createParkBench(-4, 0, 3.5, Math.PI);
    createParkBench(4, 0, 3.5, Math.PI);
    createParkBench(-7, 0, 6, Math.PI / 2);
    createParkBench(7, 0, -6, -Math.PI / 2);

    // 6. 피크닉 테이블 & 파라솔 (2개)
    createPicnicTable(-8, 0, -6, 0xef4444); // 빨간 파라솔
    createPicnicTable(8, 0, 6, 0x3b82f6);  // 파란 파라솔

    // 7. 슈퍼 점프 트램펄린 (밟으면 하늘 높이 솟구침!)
    createTrampoline(-7, 0, 3);

    // 8. 놀이터 미끄럼틀 & 시소
    createPlaygroundSlide(7, 0, -3);
    createPlaygroundSeesaw(8, 0, 2);

    // 9. 스피드 부스터 발판 (산책로 4곳 - 밟으면 3초간 2배속 가속!)
    createSpeedBooster(0, 0.02, -5, 'north');
    createSpeedBooster(0, 0.02, 5, 'south');
    createSpeedBooster(-5, 0.02, 0, 'west');
    createSpeedBooster(5, 0.02, 0, 'east');

    // 10. 공원 가로등 (4개 코너에서 따뜻한 노란 조명)
    createStreetLamp(-5, 0, -5);
    createStreetLamp(5, 0, -5);
    createStreetLamp(-5, 0, 5);
    createStreetLamp(5, 0, 5);

    // 11. 화단 및 꽃들
    createFlowerBed(-2.5, 0, -5);
    createFlowerBed(2.5, 0, -5);
    createFlowerBed(-2.5, 0, 5);
    createFlowerBed(2.5, 0, 5);

    // 12. 공원 외곽 울타리 & 환영 아치
    createParkFence();
    createParkWelcomeArch(0, 0, 15);

    // 13. 공원 쉼터 축하 안내 마커 (분수대 앞)
    addInteractiveSpot(0, 0, -2.8, '힐링 공원 쉼터 안내판', 0x22c55e, 'park_sign', 99);
  }

  // 돌 산책로
  function createParkWalkways() {
    const walkMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.9 });

    // 중앙 광장 (지름 8m 원형)
    const plazaGeo = new THREE.CircleGeometry(4.2, 32);
    const plaza = new THREE.Mesh(plazaGeo, walkMat);
    plaza.rotation.x = -Math.PI / 2;
    plaza.position.y = 0.015;
    plaza.receiveShadow = true;
    roomGroup.add(plaza);

    // 남북 산책로 (폭 2.6m, 길이 32m)
    const pathNSGeo = new THREE.PlaneGeometry(2.6, 32);
    const pathNS = new THREE.Mesh(pathNSGeo, walkMat);
    pathNS.rotation.x = -Math.PI / 2;
    pathNS.position.y = 0.012;
    pathNS.receiveShadow = true;
    roomGroup.add(pathNS);

    // 동서 산책로 (폭 2.6m, 길이 32m)
    const pathEWGeo = new THREE.PlaneGeometry(32, 2.6);
    const pathEW = new THREE.Mesh(pathEWGeo, walkMat);
    pathEW.rotation.x = -Math.PI / 2;
    pathEW.position.y = 0.012;
    pathEW.receiveShadow = true;
    roomGroup.add(pathEW);
  }

  // 5번 방 힐링 공원 실시간 분수대 물줄기 물리 시스템
  let fountainData = null;

  // 중앙 석조 분수대 (실시간 물 분출 & 폭포수 파티클)
  function createParkFountain(x, y, z) {
    const fGroup = new THREE.Group();
    fGroup.position.set(x, y, z);

    const stoneMat = new THREE.MeshStandardMaterial({
      color: 0x64748b,
      roughness: 0.65,
      metalness: 0.1
    });
    const stoneTrimMat = new THREE.MeshStandardMaterial({
      color: 0x475569,
      roughness: 0.5,
      metalness: 0.2
    });

    // 1단 대형 수조 (외벽 및 바닥)
    const outerBasin = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.8, 0.75, 36), stoneMat);
    outerBasin.position.y = 0.375;
    outerBasin.castShadow = true;
    outerBasin.receiveShadow = true;
    fGroup.add(outerBasin);

    // 1단 수조 상단 테두리 림 (고급스러운 원형 석조 마감)
    const rimGeo = new THREE.TorusGeometry(2.7, 0.18, 12, 36);
    const rimMesh = new THREE.Mesh(rimGeo, stoneTrimMat);
    rimMesh.rotation.x = Math.PI / 2;
    rimMesh.position.y = 0.75;
    fGroup.add(rimMesh);

    // 1단 수조 반짝이는 에메랄드 물 표면
    const waterGeo = new THREE.CylinderGeometry(2.45, 2.45, 0.08, 36);
    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x06b6d4,
      emissive: 0x0891b2,
      emissiveIntensity: 0.45,
      roughness: 0.08,
      metalness: 0.15,
      transparent: true,
      opacity: 0.88
    });
    const lowerWater = new THREE.Mesh(waterGeo, waterMat);
    lowerWater.position.y = 0.68;
    fGroup.add(lowerWater);

    // 수면 물결 파동 링 (Concentric Ripples)
    const rippleList = [];
    for (let r = 0; r < 3; r++) {
      const ripGeo = new THREE.RingGeometry(0.5, 0.65, 32);
      const ripMat = new THREE.MeshBasicMaterial({
        color: 0xbae6fd,
        transparent: true,
        opacity: 0.6,
        side: THREE.DoubleSide
      });
      const ripMesh = new THREE.Mesh(ripGeo, ripMat);
      ripMesh.rotation.x = -Math.PI / 2;
      ripMesh.position.y = 0.70;
      ripMesh.scale.set(0.4 + r * 0.5, 0.4 + r * 0.5, 1);
      fGroup.add(ripMesh);
      rippleList.push({ mesh: ripMesh, phase: r * 0.33 });
    }

    // 2단 중앙 석조 기둥 (우아한 곡선 기둥)
    const centerCol = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 1.6, 20), stoneMat);
    centerCol.position.y = 1.35;
    centerCol.castShadow = true;
    fGroup.add(centerCol);

    // 2단 상단 수조 (중형 볼)
    const upperBasin = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.45, 0.45, 24), stoneMat);
    upperBasin.position.y = 2.05;
    upperBasin.castShadow = true;
    fGroup.add(upperBasin);

    const upperWaterGeo = new THREE.CylinderGeometry(1.2, 1.2, 0.05, 24);
    const upperWater = new THREE.Mesh(upperWaterGeo, waterMat);
    upperWater.position.y = 2.24;
    fGroup.add(upperWater);

    // 3단 중앙 분수 첨탑 노즐 (Spire Nozzle)
    const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.32, 0.8, 16), stoneTrimMat);
    nozzle.position.y = 2.55;
    fGroup.add(nozzle);

    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 12), new THREE.MeshStandardMaterial({
      color: 0xd97706,
      metalness: 0.8,
      roughness: 0.2
    }));
    tip.position.y = 2.95;
    fGroup.add(tip);

    // 상단 수조에서 하단으로 쏟아지는 8가닥 폭포 물줄기 (Cascading Waterfalls)
    const cascadeList = [];
    const cascadeCount = 8;
    for (let c = 0; c < cascadeCount; c++) {
      const angle = (c / cascadeCount) * Math.PI * 2;
      const startRadius = 1.35;
      const endRadius = 1.85;

      const curve = new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(Math.cos(angle) * startRadius, 2.1, Math.sin(angle) * startRadius),
        new THREE.Vector3(Math.cos(angle) * (startRadius + 0.35), 1.6, Math.sin(angle) * (startRadius + 0.35)),
        new THREE.Vector3(Math.cos(angle) * endRadius, 0.72, Math.sin(angle) * endRadius)
      );

      const tubeGeo = new THREE.TubeGeometry(curve, 10, 0.045, 8, false);
      const streamMat = new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        emissive: 0x0284c7,
        emissiveIntensity: 0.6,
        transparent: true,
        opacity: 0.75,
        roughness: 0.1
      });
      const streamMesh = new THREE.Mesh(tubeGeo, streamMat);
      fGroup.add(streamMesh);
      cascadeList.push(streamMesh);
    }

    // 솟구치는 물줄기 파티클 시스템 (280개 동적 물방울)
    const particleCount = 280;
    const pPositions = new Float32Array(particleCount * 3);
    const pVelocities = [];
    const nozzleHeight = 2.95;

    for (let i = 0; i < particleCount; i++) {
      const spreadAngle = Math.random() * Math.PI * 2;
      const spreadRadius = Math.random() * 0.35 + 0.05;
      const upwardSpeed = 3.6 + Math.random() * 2.2;
      const outwardSpeed = 0.5 + Math.random() * 0.9;

      pVelocities.push({
        vx: Math.cos(spreadAngle) * outwardSpeed,
        vy: upwardSpeed,
        vz: Math.sin(spreadAngle) * outwardSpeed,
        age: Math.random() * 1.5,
        maxLife: 1.2 + Math.random() * 0.6
      });

      pPositions[i * 3] = Math.cos(spreadAngle) * spreadRadius;
      pPositions[i * 3 + 1] = nozzleHeight + Math.random() * 0.5;
      pPositions[i * 3 + 2] = Math.sin(spreadAngle) * spreadRadius;
    }

    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute('position', new THREE.BufferAttribute(pPositions, 3));

    // 물방울 원형 텍스처 생성 (반짝이는 구체 캔버스 텍스처)
    const dropCanvas = document.createElement('canvas');
    dropCanvas.width = 32;
    dropCanvas.height = 32;
    const ctx = dropCanvas.getContext('2d');
    const grad = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
    grad.addColorStop(0.3, 'rgba(186, 230, 253, 0.9)');
    grad.addColorStop(0.7, 'rgba(56, 189, 248, 0.5)');
    grad.addColorStop(1, 'rgba(56, 189, 248, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 32, 32);

    const dropTex = new THREE.CanvasTexture(dropCanvas);

    const pMat = new THREE.PointsMaterial({
      size: 0.16,
      map: dropTex,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      color: 0xffffff
    });

    const particles = new THREE.Points(pGeo, pMat);
    fGroup.add(particles);

    // 물빛 반사 포인트 라이트
    const fLight = new THREE.PointLight(0x38bdf8, 1.2, 7);
    fLight.position.set(0, 2.5, 0);
    fGroup.add(fLight);

    roomGroup.add(fGroup);
    addCircleCollider(x, z, 2.8);

    fountainData = {
      fGroup,
      lowerWater,
      upperWater,
      rippleList,
      cascadeList,
      particles,
      pPositions,
      pVelocities,
      particleCount,
      nozzleHeight,
      time: 0
    };
  }

  // 매 프레임 물줄기 물리 시뮬레이션 및 수면 애니메이션
  function updateFountainWater(delta) {
    if (!fountainData || !fountainData.particles) return;

    fountainData.time += delta;
    const time = fountainData.time;

    // 1. 수면 미세 일렁임 & 반짝임
    if (fountainData.lowerWater) {
      fountainData.lowerWater.position.y = 0.68 + Math.sin(time * 3.5) * 0.012;
      fountainData.lowerWater.material.emissiveIntensity = 0.45 + Math.sin(time * 5.0) * 0.12;
    }
    if (fountainData.upperWater) {
      fountainData.upperWater.position.y = 2.24 + Math.cos(time * 4.0) * 0.01;
    }

    // 2. 수면 파동 링 (Ripples)
    if (fountainData.rippleList) {
      fountainData.rippleList.forEach(r => {
        let prog = (time * 0.7 + r.phase) % 1.0;
        const scale = 0.5 + prog * 2.2;
        r.mesh.scale.set(scale, scale, 1);
        r.mesh.material.opacity = Math.max(0, (1.0 - prog) * 0.65);
      });
    }

    // 3. 폭포수 물줄기 미세 진동
    if (fountainData.cascadeList) {
      fountainData.cascadeList.forEach((mesh, idx) => {
        const s = 1.0 + Math.sin(time * 12.0 + idx * 0.8) * 0.08;
        mesh.scale.set(s, 1.0, s);
      });
    }

    // 4. 물줄기 파티클 포물선 물리 운동
    const { pPositions, pVelocities, particleCount, nozzleHeight, particles } = fountainData;
    const gravity = 8.5; // 중력 가속도

    for (let i = 0; i < particleCount; i++) {
      const v = pVelocities[i];
      v.age += delta;

      // 위치 갱신
      pPositions[i * 3] += v.vx * delta;
      pPositions[i * 3 + 1] += v.vy * delta;
      pPositions[i * 3 + 2] += v.vz * delta;

      // 중력 적용
      v.vy -= gravity * delta;

      // 수조 바닥에 닿았거나 수명이 다하면 노즐에서 재분출
      if (pPositions[i * 3 + 1] < 0.72 || v.age >= v.maxLife) {
        v.age = 0;
        v.maxLife = 1.1 + Math.random() * 0.6;

        const spreadAngle = Math.random() * Math.PI * 2;
        const spreadRadius = Math.random() * 0.15;
        const upwardSpeed = 3.8 + Math.random() * 2.4;
        const outwardSpeed = 0.45 + Math.random() * 0.85;

        v.vx = Math.cos(spreadAngle) * outwardSpeed;
        v.vy = upwardSpeed;
        v.vz = Math.sin(spreadAngle) * outwardSpeed;

        pPositions[i * 3] = Math.cos(spreadAngle) * spreadRadius;
        pPositions[i * 3 + 1] = nozzleHeight + Math.random() * 0.15;
        pPositions[i * 3 + 2] = Math.sin(spreadAngle) * spreadRadius;
      }
    }

    particles.geometry.attributes.position.needsUpdate = true;
  }

  // 울창한 공원 나무 생성 (술래잡기 엄폐물)
  function createParkTree(x, y, z, scale = 1.0) {
    const treeGroup = new THREE.Group();
    treeGroup.position.set(x, y, z);

    // 통나무 기둥
    const trunkGeo = new THREE.CylinderGeometry(0.3 * scale, 0.45 * scale, 2.2 * scale, 10);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5c3818, roughness: 0.9 });
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = 1.1 * scale;
    trunk.castShadow = true;
    trunk.receiveShadow = true;
    treeGroup.add(trunk);

    // 풍성한 3단 잎사귀
    const leafColors = [0x166534, 0x15803d, 0x22c55e, 0x4ade80];
    for (let i = 0; i < 3; i++) {
      const radius = (1.7 - i * 0.35) * scale;
      const height = (1.5 - i * 0.2) * scale;
      const foliageGeo = new THREE.ConeGeometry(radius, height, 8);
      const foliageMat = new THREE.MeshStandardMaterial({
        color: leafColors[i % leafColors.length],
        roughness: 0.8
      });
      const foliage = new THREE.Mesh(foliageGeo, foliageMat);
      foliage.position.y = (2.0 + i * 0.9) * scale;
      foliage.castShadow = true;
      foliage.receiveShadow = true;
      treeGroup.add(foliage);
    }

    roomGroup.add(treeGroup);
    addCircleCollider(x, z, 0.65 * scale);
  }

  // 공원 원목 벤치
  function createParkBench(x, y, z, rotY = 0) {
    const benchGroup = new THREE.Group();
    benchGroup.position.set(x, y, z);
    benchGroup.rotation.y = rotY;

    const woodMat = new THREE.MeshStandardMaterial({ color: 0x9a3412, roughness: 0.7 });
    const ironMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.7 });

    // 좌판 슬랫들
    for (let s = -0.3; s <= 0.3; s += 0.2) {
      const plank = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.08, 0.16), woodMat);
      plank.position.set(0, 0.6, s);
      plank.castShadow = true;
      benchGroup.add(plank);
    }

    // 등받이 슬랫들
    for (let b = 0.85; b <= 1.25; b += 0.2) {
      const back = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.16, 0.08), woodMat);
      back.position.set(0, b, -0.35);
      back.castShadow = true;
      benchGroup.add(back);
    }

    // 철제 다리 2개
    const legGeo = new THREE.BoxGeometry(0.1, 0.6, 0.8);
    const legL = new THREE.Mesh(legGeo, ironMat);
    legL.position.set(-0.9, 0.3, 0);
    const legR = new THREE.Mesh(legGeo, ironMat);
    legR.position.set(0.9, 0.3, 0);
    benchGroup.add(legL);
    benchGroup.add(legR);

    roomGroup.add(benchGroup);
    if (Math.abs(rotY) < 0.1 || Math.abs(rotY - Math.PI) < 0.1) {
      addBoxCollider(x, z, 2.4, 0.9);
    } else {
      addBoxCollider(x, z, 0.9, 2.4);
    }
  }

  // 피크닉 테이블 & 파라솔
  function createPicnicTable(x, y, z, parasolColor = 0xef4444) {
    const tGroup = new THREE.Group();
    tGroup.position.set(x, y, z);

    const woodMat = new THREE.MeshStandardMaterial({ color: 0x854d0e, roughness: 0.8 });

    // 테이블 상판
    const tableTop = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.1, 1.2), woodMat);
    tableTop.position.y = 0.9;
    tableTop.castShadow = true;
    tGroup.add(tableTop);

    // 양쪽 벤치
    const benchL = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.08, 0.4), woodMat);
    benchL.position.set(0, 0.5, -0.9);
    const benchR = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.08, 0.4), woodMat);
    benchR.position.set(0, 0.5, 0.9);
    tGroup.add(benchL, benchR);

    // 파라솔 기둥 및 차양
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.05, 3.2, 8),
      new THREE.MeshStandardMaterial({ color: 0x475569 })
    );
    pole.position.y = 1.6;
    tGroup.add(pole);

    const umbrellaGeo = new THREE.ConeGeometry(1.6, 0.8, 8);
    const umbrellaMat = new THREE.MeshStandardMaterial({ color: parasolColor, roughness: 0.5 });
    const umbrella = new THREE.Mesh(umbrellaGeo, umbrellaMat);
    umbrella.position.y = 3.0;
    umbrella.castShadow = true;
    tGroup.add(umbrella);

    roomGroup.add(tGroup);
    addBoxCollider(x, z, 2.2, 2.4);
  }

  // 슈퍼 점프 트램펄린
  function createTrampoline(x, y, z) {
    const tGroup = new THREE.Group();
    tGroup.position.set(x, y, z);

    // 외곽 링 프레임
    const ringMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, metalness: 0.6, roughness: 0.3 });
    const ringGeo = new THREE.TorusGeometry(1.8, 0.12, 16, 32);
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.65;
    tGroup.add(ring);

    // 탄력 바닥 매트 (검정색 탄성 매트)
    const matGeo = new THREE.CylinderGeometry(1.7, 1.7, 0.08, 32);
    const matMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.9 });
    const mat = new THREE.Mesh(matGeo, matMat);
    mat.position.y = 0.62;
    tGroup.add(mat);

    // 중앙 노란 별모양 타겟 링
    const starGeo = new THREE.RingGeometry(0.3, 0.6, 16);
    const starMat = new THREE.MeshBasicMaterial({ color: 0xfacc15, side: THREE.DoubleSide });
    const star = new THREE.Mesh(starGeo, starMat);
    star.rotation.x = -Math.PI / 2;
    star.position.y = 0.68;
    tGroup.add(star);

    // 4개 철제 지지대 다리
    const legGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.65, 8);
    const legMat = new THREE.MeshStandardMaterial({ color: 0x475569 });
    for (let i = 0; i < 4; i++) {
      const angle = (i * Math.PI) / 2;
      const leg = new THREE.Mesh(legGeo, legMat);
      leg.position.set(Math.cos(angle) * 1.6, 0.325, Math.sin(angle) * 1.6);
      tGroup.add(leg);
    }

    roomGroup.add(tGroup);
    trampolines.push({ x: x, z: z, radius: 1.8 });
  }

  // 놀이터 미끄럼틀
  function createPlaygroundSlide(x, y, z) {
    const sGroup = new THREE.Group();
    sGroup.position.set(x, y, z);

    const woodMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.8 });
    const slideMat = new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.3, metalness: 0.2 });

    // 타워 발판
    const tower = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.8, 1.2), woodMat);
    tower.position.set(0, 0.9, -1.2);
    sGroup.add(tower);

    // 경사 미끄럼틀 램프
    const ramp = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.1, 3.2), slideMat);
    ramp.rotation.x = Math.PI / 6;
    ramp.position.set(0, 0.9, 0.5);
    ramp.castShadow = true;
    sGroup.add(ramp);

    roomGroup.add(sGroup);
    addBoxCollider(x, z, 1.6, 3.2);
  }

  // 놀이터 시소
  function createPlaygroundSeesaw(x, y, z) {
    const seeGroup = new THREE.Group();
    seeGroup.position.set(x, y, z);

    // 중앙 삼각 받침대
    const base = new THREE.Mesh(
      new THREE.ConeGeometry(0.4, 0.8, 4),
      new THREE.MeshStandardMaterial({ color: 0x334155 })
    );
    base.position.y = 0.4;
    seeGroup.add(base);

    // 시소 널판지 (살짝 기울어짐)
    const plank = new THREE.Mesh(
      new THREE.BoxGeometry(3.0, 0.08, 0.35),
      new THREE.MeshStandardMaterial({ color: 0x3b82f6 })
    );
    plank.position.y = 0.75;
    plank.rotation.z = Math.PI / 16;
    plank.castShadow = true;
    seeGroup.add(plank);

    roomGroup.add(seeGroup);
    addBoxCollider(x, z, 3.0, 0.8);
  }

  // 스피드 부스터 발판
  function createSpeedBooster(x, y, z, dir) {
    const bGroup = new THREE.Group();
    bGroup.position.set(x, y, z);

    // 빛나는 네온 패드
    const padGeo = new THREE.PlaneGeometry(1.8, 1.8);
    const padMat = new THREE.MeshStandardMaterial({
      color: 0x06b6d4,
      emissive: 0x0891b2,
      emissiveIntensity: 0.8,
      roughness: 0.2
    });
    const pad = new THREE.Mesh(padGeo, padMat);
    pad.rotation.x = -Math.PI / 2;
    bGroup.add(pad);

    // 화살표 셰이프
    const arrowGeo = new THREE.ConeGeometry(0.45, 0.8, 3);
    const arrowMat = new THREE.MeshBasicMaterial({ color: 0xfef08a });
    const arrow = new THREE.Mesh(arrowGeo, arrowMat);
    arrow.rotation.x = -Math.PI / 2;
    if (dir === 'north') arrow.rotation.z = 0;
    else if (dir === 'south') arrow.rotation.z = Math.PI;
    else if (dir === 'west') arrow.rotation.z = Math.PI / 2;
    else if (dir === 'east') arrow.rotation.z = -Math.PI / 2;
    arrow.position.y = 0.03;
    bGroup.add(arrow);

    roomGroup.add(bGroup);
    boosters.push({ x: x, z: z, radius: 1.4 });
  }

  // 클래식 가로등
  function createStreetLamp(x, y, z) {
    const lampGroup = new THREE.Group();
    lampGroup.position.set(x, y, z);

    const ironMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.8 });

    // 기둥
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 3.6, 8), ironMat);
    pole.position.y = 1.8;
    lampGroup.add(pole);

    // 등갓
    const head = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.35),
      new THREE.MeshStandardMaterial({
        color: 0xfef08a,
        emissive: 0xfbbf24,
        emissiveIntensity: 0.9,
        wireframe: true
      })
    );
    head.position.y = 3.6;
    lampGroup.add(head);

    // 가로등 조명
    const light = new THREE.PointLight(0xfef08a, 0.8, 8);
    light.position.y = 3.5;
    lampGroup.add(light);

    roomGroup.add(lampGroup);
    addCircleCollider(x, z, 0.4);
  }

  // 예쁜 꽃밭
  function createFlowerBed(x, y, z) {
    const bedGroup = new THREE.Group();
    bedGroup.position.set(x, y, z);

    // 화단 테두리 흙
    const earth = new THREE.Mesh(
      new THREE.BoxGeometry(2.4, 0.15, 1.2),
      new THREE.MeshStandardMaterial({ color: 0x3f2e1e })
    );
    earth.position.y = 0.08;
    bedGroup.add(earth);

    // 알록달록 꽃들 (작은 구체)
    const flowerColors = [0xef4444, 0xf59e0b, 0xec4899, 0xa855f7, 0xffffff];
    for (let i = -0.9; i <= 0.9; i += 0.4) {
      for (let j = -0.35; j <= 0.35; j += 0.35) {
        const flower = new THREE.Mesh(
          new THREE.DodecahedronGeometry(0.12),
          new THREE.MeshStandardMaterial({
            color: flowerColors[Math.floor(Math.random() * flowerColors.length)]
          })
        );
        flower.position.set(i + (Math.random() - 0.5) * 0.1, 0.25, j);
        bedGroup.add(flower);
      }
    }

    roomGroup.add(bedGroup);
  }

  // 공원 외곽 울타리
  function createParkFence() {
    const fenceMat = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.6 });
    const postGeo = new THREE.BoxGeometry(0.25, 1.4, 0.25);
    const railGeoX = new THREE.BoxGeometry(33, 0.12, 0.1);
    const railGeoZ = new THREE.BoxGeometry(0.1, 0.12, 33);

    // 가로 레일 4면
    const railN = new THREE.Mesh(railGeoX, fenceMat);
    railN.position.set(0, 0.9, -16.5);
    const railS1 = new THREE.Mesh(new THREE.BoxGeometry(13, 0.12, 0.1), fenceMat);
    railS1.position.set(-9.5, 0.9, 16.5);
    const railS2 = new THREE.Mesh(new THREE.BoxGeometry(13, 0.12, 0.1), fenceMat);
    railS2.position.set(9.5, 0.9, 16.5);
    const railW = new THREE.Mesh(railGeoZ, fenceMat);
    railW.position.set(-16.5, 0.9, 0);
    const railE = new THREE.Mesh(railGeoZ, fenceMat);
    railE.position.set(16.5, 0.9, 0);

    roomGroup.add(railN, railS1, railS2, railW, railE);

    // 기둥들
    for (let x = -16.5; x <= 16.5; x += 3.3) {
      const postN = new THREE.Mesh(postGeo, fenceMat);
      postN.position.set(x, 0.7, -16.5);
      roomGroup.add(postN);

      if (Math.abs(x) > 3) {
        const postS = new THREE.Mesh(postGeo, fenceMat);
        postS.position.set(x, 0.7, 16.5);
        roomGroup.add(postS);
      }

      const postW = new THREE.Mesh(postGeo, fenceMat);
      postW.position.set(-16.5, 0.7, x);
      const postE = new THREE.Mesh(postGeo, fenceMat);
      postE.position.set(16.5, 0.7, x);
      roomGroup.add(postW, postE);
    }
  }

  // 공원 환영 아치 (Welcome Arch)
  function createParkWelcomeArch(x, y, z) {
    const archGroup = new THREE.Group();
    archGroup.position.set(x, y, z);

    const woodMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.8 });
    const postL = new THREE.Mesh(new THREE.BoxGeometry(0.5, 4.0, 0.5), woodMat);
    postL.position.set(-2.5, 2.0, 0);
    const postR = new THREE.Mesh(new THREE.BoxGeometry(0.5, 4.0, 0.5), woodMat);
    postR.position.set(2.5, 2.0, 0);
    const beam = new THREE.Mesh(new THREE.BoxGeometry(5.8, 0.6, 0.6), woodMat);
    beam.position.set(0, 4.0, 0);

    archGroup.add(postL, postR, beam);
    roomGroup.add(archGroup);

    addBoxCollider(x - 2.5, z, 0.6, 0.6);
    addBoxCollider(x + 2.5, z, 0.6, 0.6);
  }

  // 상호작용 가능한 문제 스팟 마커 추가
  function addInteractiveSpot(x, y, z, title, colorHex, type, defaultQId) {
    const spotGroup = new THREE.Group();
    spotGroup.position.set(x, y, z);

    // 바닥 펄스 링 (Pulse Circle)
    const ringGeo = new THREE.RingGeometry(0.8, 1.1, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: colorHex,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.7
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.05;
    spotGroup.add(ring);

    // 공중에 떠있는 회전 큐브 마커
    const markerGeo = new THREE.OctahedronGeometry(0.4, 0);
    const markerMat = new THREE.MeshStandardMaterial({
      color: colorHex,
      emissive: colorHex,
      emissiveIntensity: 0.6,
      roughness: 0.2
    });
    const marker = new THREE.Mesh(markerGeo, markerMat);
    marker.position.y = 2.2;
    spotGroup.add(marker);

    roomGroup.add(spotGroup);

    // 인터랙티브 오브젝트 목록에 등록
    roomObjects.push({
      group: spotGroup,
      marker: marker,
      ring: ring,
      title: title,
      type: type,
      defaultQId: defaultQId,
      pos: new THREE.Vector3(x, y, z),
      radius: 2.8
    });
  }

  // -------------------------------------------------------------
  // [3] 소품 오브젝트 3D 모델 생성기 (저폴리곤/모던 스타일)
  // -------------------------------------------------------------
  function createBookshelf(x, y, z, rotY) {
    const shelfGroup = new THREE.Group();
    shelfGroup.position.set(x, y, z);
    shelfGroup.rotation.y = rotY;

    const frameMat = new THREE.MeshStandardMaterial({ color: 0x5c3a21, roughness: 0.7 });
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(3, 5, 0.8), frameMat);
    shelf.position.y = 2.5;
    shelf.castShadow = true;
    shelf.receiveShadow = true;
    shelfGroup.add(shelf);

    // 책들
    const bookColors = [0xb91c1c, 0x1d4ed8, 0x047857, 0xb45309];
    for (let r = 1; r <= 4; r++) {
      for (let b = -1.1; b <= 1.1; b += 0.35) {
        const bookMat = new THREE.MeshStandardMaterial({
          color: bookColors[Math.floor(Math.random() * bookColors.length)]
        });
        const book = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.75, 0.6), bookMat);
        book.position.set(b, r * 1.05, 0.1);
        shelfGroup.add(book);
      }
    }
    roomGroup.add(shelfGroup);

    // 서가 충돌체 등록
    if (Math.abs(rotY) < 0.1) {
      addBoxCollider(x, z, 3.2, 1.0);
    } else {
      addBoxCollider(x, z, 1.0, 3.2);
    }
  }

  function createGlobe(x, y, z) {
    const gGroup = new THREE.Group();
    gGroup.position.set(x, y, z);

    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.6, 0.8, 1.2, 16),
      new THREE.MeshStandardMaterial({ color: 0x854d0e, roughness: 0.5 })
    );
    base.position.y = 0.6;
    gGroup.add(base);

    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(0.7, 24, 24),
      new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.3 })
    );
    sphere.position.y = 1.9;
    gGroup.add(sphere);

    roomGroup.add(gGroup);
    addCircleCollider(x, z, 1.0);
  }

  function createReadingDesk(x, y, z) {
    const dGroup = new THREE.Group();
    dGroup.position.set(x, y, z);

    const desk = new THREE.Mesh(
      new THREE.BoxGeometry(2.4, 1.1, 1.4),
      new THREE.MeshStandardMaterial({ color: 0x78350f })
    );
    desk.position.y = 0.55;
    desk.castShadow = true;
    dGroup.add(desk);

    const openBook = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, 0.08, 0.6),
      new THREE.MeshStandardMaterial({ color: 0xfef08a })
    );
    openBook.position.set(0, 1.15, 0);
    dGroup.add(openBook);

    roomGroup.add(dGroup);
    addBoxCollider(x, z, 2.6, 1.6);
  }

  function createLabBench(x, y, z) {
    const bGroup = new THREE.Group();
    bGroup.position.set(x, y, z);

    const table = new THREE.Mesh(
      new THREE.BoxGeometry(3.5, 1.2, 1.5),
      new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.4 })
    );
    table.position.y = 0.6;
    table.castShadow = true;
    bGroup.add(table);

    // 플라스크/비커들
    const flask = new THREE.Mesh(
      new THREE.ConeGeometry(0.25, 0.5, 12),
      new THREE.MeshStandardMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.8 })
    );
    flask.position.set(-0.6, 1.45, 0);
    bGroup.add(flask);

    roomGroup.add(bGroup);
    addBoxCollider(x, z, 3.8, 1.8);
  }

  function createBlackboard(x, y, z) {
    const bGeo = new THREE.BoxGeometry(8, 3.5, 0.2);
    const bMat = new THREE.MeshStandardMaterial({ color: 0x064e3b, roughness: 0.9 });
    const board = new THREE.Mesh(bGeo, bMat);
    board.position.set(x, y, z);
    roomGroup.add(board);
    addBoxCollider(x, z, 8.2, 0.6);
  }

  function createMicroscope(x, y, z) {
    const mGroup = new THREE.Group();
    mGroup.position.set(x, y, z);

    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.6, 1.0, 16),
      new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.8 })
    );
    base.position.y = 0.5;
    mGroup.add(base);

    const tube = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.12, 0.8, 12),
      new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.9 })
    );
    tube.position.set(0, 1.4, 0);
    tube.rotation.z = 0.3;
    mGroup.add(tube);

    roomGroup.add(mGroup);
    addCircleCollider(x, z, 0.9);
  }

  function createMuseumPillars() {
    const pMat = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.3 });
    [-8, 8].forEach(px => {
      [-6, 2].forEach(pz => {
        const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 7, 16), pMat);
        pillar.position.set(px, 3.5, pz);
        pillar.castShadow = true;
        roomGroup.add(pillar);
        addCircleCollider(px, pz, 0.8);
      });
    });
  }

  function createDinoFossil(x, y, z) {
    const dGroup = new THREE.Group();
    dGroup.position.set(x, y, z);

    const stand = new THREE.Mesh(
      new THREE.BoxGeometry(4, 0.6, 2.5),
      new THREE.MeshStandardMaterial({ color: 0x475569 })
    );
    stand.position.y = 0.3;
    dGroup.add(stand);

    // 티라노 뼈대 형상
    const boneMat = new THREE.MeshStandardMaterial({ color: 0xfef3c7, roughness: 0.6 });
    const spine = new THREE.Mesh(new THREE.BoxGeometry(3, 0.3, 0.3), boneMat);
    spine.position.set(0, 1.8, 0);
    dGroup.add(spine);

    const skull = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.6, 0.6), boneMat);
    skull.position.set(1.6, 2.2, 0);
    dGroup.add(skull);

    roomGroup.add(dGroup);
    addBoxCollider(x, z, 4.4, 2.8);
  }

  function createAncientRelic(x, y, z) {
    const relic = new THREE.Mesh(
      new THREE.CylinderGeometry(0.4, 0.7, 2.5, 6),
      new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.8 })
    );
    relic.position.set(x, 1.25, z);
    roomGroup.add(relic);
    addCircleCollider(x, z, 0.9);
  }

  function createTreasureChest(x, y, z) {
    const cGroup = new THREE.Group();
    cGroup.position.set(x, y, z);

    const chest = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 1.1, 1.2),
      new THREE.MeshStandardMaterial({ color: 0xb45309, metalness: 0.3 })
    );
    chest.position.y = 0.55;
    chest.castShadow = true;
    cGroup.add(chest);

    roomGroup.add(cGroup);
    addBoxCollider(x, z, 1.8, 1.4);
  }

  function createFurnace(x, y, z) {
    const fGroup = new THREE.Group();
    fGroup.position.set(x, y, z);

    const base = new THREE.Mesh(
      new THREE.BoxGeometry(2.5, 2.8, 2.5),
      new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.9 })
    );
    base.position.y = 1.4;
    fGroup.add(base);

    // 화로 불꽃
    const fire = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.5, 0),
      new THREE.MeshBasicMaterial({ color: 0xf97316 })
    );
    fire.position.set(0, 1.0, 1.26);
    fGroup.add(fire);

    roomGroup.add(fGroup);
    addBoxCollider(x, z, 2.8, 2.8);
  }

  function createWorkbench(x, y, z) {
    const wGroup = new THREE.Group();
    wGroup.position.set(x, y, z);

    const bench = new THREE.Mesh(
      new THREE.BoxGeometry(3.0, 1.2, 1.8),
      new THREE.MeshStandardMaterial({ color: 0x78350f })
    );
    bench.position.y = 0.6;
    bench.castShadow = true;
    wGroup.add(bench);

    roomGroup.add(wGroup);
    addBoxCollider(x, z, 3.3, 2.0);
  }

  function createToolBox(x, y, z) {
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 0.8, 0.8),
      new THREE.MeshStandardMaterial({ color: 0xd97706, metalness: 0.5 })
    );
    box.position.set(x, 0.4, z);
    roomGroup.add(box);
    addBoxCollider(x, z, 1.4, 1.0);
  }

  // -------------------------------------------------------------
  // [4] 가구 제작 및 방 꾸미기: 실시간 3D 가구 배치 시스템
  // -------------------------------------------------------------
  let placementMode = false;
  let placementFurnData = null;
  let placementGhostGroup = null;
  let placementRotation = 0;
  let placementPos = { x: 0, z: 0 };
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const placementRaycaster = new THREE.Raycaster();
  const placementMouse = new THREE.Vector2();

  // 가구 3D 모델 그룹 생성 함수 (실제 가구 및 반투명 배치 고스트 공용)
  function createFurnitureModel(modelType, isGhost = false) {
    const fGroup = new THREE.Group();
    const type = modelType || 'chair';

    const getMat = (col, metal = 0.1, rough = 0.7) => {
      if (isGhost) {
        return new THREE.MeshStandardMaterial({
          color: 0x38bdf8,
          emissive: 0x0284c7,
          emissiveIntensity: 0.55,
          transparent: true,
          opacity: 0.65,
          roughness: 0.2
        });
      }
      return new THREE.MeshStandardMaterial({
        color: col,
        metalness: metal,
        roughness: rough
      });
    };

    if (type === 'chair') {
      // 의자
      const seat = new THREE.Mesh(
        new THREE.BoxGeometry(0.9, 0.1, 0.9),
        getMat(0xb45309)
      );
      seat.position.y = 0.6;
      fGroup.add(seat);

      const back = new THREE.Mesh(
        new THREE.BoxGeometry(0.9, 0.9, 0.1),
        getMat(0x92400e)
      );
      back.position.set(0, 1.1, -0.4);
      fGroup.add(back);

      // 다리 4개
      for (let dx of [-0.35, 0.35]) {
        for (let dz of [-0.35, 0.35]) {
          const leg = new THREE.Mesh(
            new THREE.CylinderGeometry(0.04, 0.04, 0.6),
            getMat(0x78350f)
          );
          leg.position.set(dx, 0.3, dz);
          fGroup.add(leg);
        }
      }
    } else if (type === 'desk') {
      // 책상
      const top = new THREE.Mesh(
        new THREE.BoxGeometry(1.8, 0.12, 1.1),
        getMat(0xa16207)
      );
      top.position.y = 0.9;
      fGroup.add(top);

      for (let dx of [-0.75, 0.75]) {
        for (let dz of [-0.42, 0.42]) {
          const leg = new THREE.Mesh(
            new THREE.CylinderGeometry(0.05, 0.05, 0.9),
            getMat(0x1e293b, 0.7, 0.3)
          );
          leg.position.set(dx, 0.45, dz);
          fGroup.add(leg);
        }
      }
    } else if (type === 'shelf') {
      // 금속 선반
      const shelf = new THREE.Mesh(
        new THREE.BoxGeometry(1.6, 2.2, 0.6),
        getMat(0x475569, 0.8, 0.3)
      );
      shelf.position.y = 1.1;
      fGroup.add(shelf);
    } else if (type === 'cabinet') {
      // 수납장
      const cab = new THREE.Mesh(
        new THREE.BoxGeometry(1.4, 1.6, 0.9),
        getMat(0xd97706, 0.1, 0.5)
      );
      cab.position.y = 0.8;
      fGroup.add(cab);
    } else {
      // 연금술 실험대
      const lab = new THREE.Mesh(
        new THREE.BoxGeometry(2.0, 1.2, 1.2),
        getMat(0x0284c7, 0.6, 0.3)
      );
      lab.position.y = 0.6;
      fGroup.add(lab);
    }

    if (isGhost) {
      // 가구 바닥 원형 네온 배치 링
      const ringGeo = new THREE.RingGeometry(0.7, 0.88, 32);
      const ringMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, side: THREE.DoubleSide });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.02;
      fGroup.add(ring);
    }

    return fGroup;
  }

  // 가구 배치 모드 시작 (방 꾸미기)
  function startFurniturePlacement(furnData) {
    if (!roomGroup) return;

    cancelFurniturePlacement(false);

    placementMode = true;
    placementFurnData = furnData;
    placementRotation = 0;

    // 플레이어의 앞쪽 약 2.5m 지점을 초기 배치 위치로 설정
    let startX = 0;
    let startZ = 0;
    if (playerMesh) {
      const fX = Math.sin(playerMesh.rotation.y);
      const fZ = Math.cos(playerMesh.rotation.y);
      startX = playerMesh.position.x + fX * 2.5;
      startZ = playerMesh.position.z + fZ * 2.5;
    }

    const maxBound = (currentRoomId === 'room_5') ? 15.0 : 9.5;
    placementPos.x = Math.max(-maxBound, Math.min(maxBound, startX));
    placementPos.z = Math.max(-maxBound, Math.min(maxBound, startZ));

    // 반투명 고스트 소환
    placementGhostGroup = createFurnitureModel(furnData.modelType || 'chair', true);
    placementGhostGroup.position.set(placementPos.x, 0, placementPos.z);
    placementGhostGroup.rotation.y = placementRotation;
    roomGroup.add(placementGhostGroup);

    // 상단 배치 컨트롤 HUD 활성화
    const hud = document.getElementById('furniture-placement-hud');
    const iconEl = document.getElementById('place-hud-icon');
    const titleEl = document.getElementById('place-hud-title');
    if (iconEl) iconEl.textContent = furnData.icon || '🪑';
    if (titleEl) titleEl.textContent = `${furnData.name || '가구'} 배치 중...`;
    if (hud) hud.classList.remove('hidden');

    if (window.App && window.App.showToast) {
      window.App.showToast(`🎨 [${furnData.name}] 배치 모드! 바닥을 클릭하거나 조작키로 원하는 위치를 지정하세요!`, 3200);
    }
  }

  // 가구 45도 회전
  function rotatePlacement() {
    if (!placementMode || !placementGhostGroup) return;
    placementRotation = (placementRotation + Math.PI / 4) % (Math.PI * 2);
    placementGhostGroup.rotation.y = placementRotation;
  }

  // 플레이어 앞자리로 이동
  function placeInFrontOfPlayer() {
    if (!placementMode || !placementGhostGroup || !playerMesh) return;
    const fX = Math.sin(playerMesh.rotation.y);
    const fZ = Math.cos(playerMesh.rotation.y);
    const maxBound = (currentRoomId === 'room_5') ? 15.0 : 9.5;
    placementPos.x = Math.max(-maxBound, Math.min(maxBound, playerMesh.position.x + fX * 2.5));
    placementPos.z = Math.max(-maxBound, Math.min(maxBound, playerMesh.position.z + fZ * 2.5));
    placementGhostGroup.position.set(placementPos.x, 0, placementPos.z);
  }

  // 배치 확정
  function confirmFurniturePlacement() {
    if (!placementMode || !placementFurnData) return;

    const furnObj = {
      ...placementFurnData,
      roomId: currentRoomId,
      instanceId: placementFurnData.instanceId || ('inst_' + Date.now()),
      x: placementPos.x,
      z: placementPos.z,
      rotation: placementRotation
    };

    // 기존 목록에서 동일한 instanceId가 있다면 기존 메시 제거 후 교체
    const existIdx = placedFurnitures.findIndex(f => f.instanceId === furnObj.instanceId);
    if (existIdx >= 0) {
      if (placedFurnitures[existIdx].mesh && roomGroup) {
        roomGroup.remove(placedFurnitures[existIdx].mesh);
      }
      placedFurnitures.splice(existIdx, 1);
    }

    placedFurnitures.push(furnObj);
    spawnFurnitureMesh(furnObj, true);

    cancelFurniturePlacement(false);

    // 스토리지에 자동 저장 (방 꾸미기 유지)
    savePlacedFurnituresToLocal();

    if (window.App && window.App.onFurniturePlaced) {
      window.App.onFurniturePlaced(furnObj);
    }

    if (window.App && window.App.showToast) {
      window.App.showToast(`✨ [${furnObj.name}] 배치가 완료되었습니다! 방이 더욱 멋지게 꾸며졌습니다.`, 3000);
    }
    if (window.confetti) {
      window.confetti({ particleCount: 50, spread: 70, origin: { y: 0.6 } });
    }
  }

  // 배치 취소
  function cancelFurniturePlacement(notify = true) {
    if (placementGhostGroup && roomGroup) {
      roomGroup.remove(placementGhostGroup);
      placementGhostGroup = null;
    }
    placementMode = false;
    placementFurnData = null;

    const hud = document.getElementById('furniture-placement-hud');
    if (hud) hud.classList.add('hidden');

    if (notify && window.App && window.App.showToast) {
      window.App.showToast('가구 배치가 취소되었습니다.', 2000);
    }
  }

  // 로컬 스토리지 방 꾸미기 저장 & 복원
  function savePlacedFurnituresToLocal() {
    try {
      const dataToSave = placedFurnitures.map(f => ({
        id: f.id,
        name: f.name,
        icon: f.icon,
        modelType: f.modelType,
        score: f.score,
        roomId: f.roomId,
        instanceId: f.instanceId,
        x: f.x,
        z: f.z,
        rotation: f.rotation
      }));
      localStorage.setItem('escape_placed_furnitures', JSON.stringify(dataToSave));
    } catch (e) {}
  }

  function loadPlacedFurnituresFromLocal() {
    try {
      const saved = localStorage.getItem('escape_placed_furnitures');
      if (saved) {
        placedFurnitures = JSON.parse(saved);
      }
    } catch (e) {}
  }

  // 가구 즉시 스폰 (기본 배치)
  function spawnFurniture(furnitureData) {
    const furnObj = {
      ...furnitureData,
      roomId: currentRoomId,
      instanceId: 'inst_' + Date.now()
    };
    placedFurnitures.push(furnObj);
    spawnFurnitureMesh(furnObj, true);
    savePlacedFurnituresToLocal();
  }

  // 3D 가구 메시 생성 및 방에 부착
  function spawnFurnitureMesh(furnObj, playFx) {
    if (!roomGroup) return;

    let posX = (typeof furnObj.x === 'number') ? furnObj.x : 0;
    let posZ = (typeof furnObj.z === 'number') ? furnObj.z : 0;
    let rotY = (typeof furnObj.rotation === 'number') ? furnObj.rotation : 0;

    // x 좌표가 없는 레거시 데이터는 슬롯 자동 배치
    if (typeof furnObj.x !== 'number') {
      const slotIdx = placedFurnitures.filter(f => f.roomId === currentRoomId).indexOf(furnObj);
      const slots = [
        { x: -3, z: 1 },
        { x: 3, z: 1 },
        { x: -6, z: 4 },
        { x: 6, z: 4 },
        { x: 0, z: 2 }
      ];
      const pos = slots[slotIdx % slots.length] || { x: 0, z: 0 };
      posX = pos.x;
      posZ = pos.z;
      furnObj.x = posX;
      furnObj.z = posZ;
    }

    const fGroup = createFurnitureModel(furnObj.modelType || 'chair', false);
    fGroup.position.set(posX, 0, posZ);
    fGroup.rotation.y = rotY;

    // 가구 객체에 3D 메시 참조 보관
    furnObj.mesh = fGroup;

    // 소환 애니메이션 연출 (스케일 업 & 파티클)
    if (playFx) {
      fGroup.scale.set(0.1, 0.1, 0.1);
      let scale = 0.1;
      const growInterval = setInterval(() => {
        scale += 0.15;
        if (scale >= 1.0) {
          fGroup.scale.set(1, 1, 1);
          clearInterval(growInterval);
        } else {
          fGroup.scale.set(scale, scale, scale);
        }
      }, 20);

      // 반짝임 이펙트 (Confetti)
      if (window.confetti) {
        window.confetti({
          particleCount: 40,
          spread: 60,
          origin: { y: 0.7 }
        });
      }
    }

    roomGroup.add(fGroup);
    addBoxCollider(posX, posZ, 1.2, 1.2);
  }

  // -------------------------------------------------------------
  // [5] 고품질 모듈식 3D 캐릭터 커스터마이징 빌더
  // (머리/헤어, 상의 옷, 바지 하의, 신발, 악세서리, 피부톤)
  // -------------------------------------------------------------
  const defaultCustomData = {
    skinColor: 0xffdbac,
    hairStyle: 'dandy',
    hairColor: 0x1f2937,
    topStyle: 'uniform',
    topColor: 0x1e3a8a,
    bottomStyle: 'slacks',
    bottomColor: 0x1e293b,
    shoesStyle: 'sneakers',
    shoesColor: 0xf8fafc,
    hasGlasses: false,
    hasBackpack: true,
    backpackColor: 0x334155
  };

  // 인기 추천 프리셋 8종
  const characterPresets = [
    {
      id: 'preset_1',
      name: '단정 교복 소년',
      tag: '스마트 모범생',
      icon: '👦',
      desc: '단정한 댄디컷에 네이비 교복 재킷과 슬랙스를 매치한 우등생',
      custom: {
        skinColor: 0xffdbac,
        hairStyle: 'dandy',
        hairColor: 0x1f2937,
        topStyle: 'uniform',
        topColor: 0x1e3a8a,
        bottomStyle: 'slacks',
        bottomColor: 0x1e293b,
        shoesStyle: 'loafers',
        shoesColor: 0x0f172a,
        hasGlasses: true,
        hasBackpack: true,
        backpackColor: 0x334155
      }
    },
    {
      id: 'preset_2',
      name: '캐주얼 후드 소년',
      tag: '자유로운 탐험가',
      icon: '🧑‍🦱',
      desc: '포근한 레드 후드티에 슬림 청바지와 화이트 스니커즈를 신은 모험가',
      custom: {
        skinColor: 0xffdbac,
        hairStyle: 'volume',
        hairColor: 0x451a03,
        topStyle: 'hoodie',
        topColor: 0xef4444,
        bottomStyle: 'jeans',
        bottomColor: 0x1d4ed8,
        shoesStyle: 'sneakers',
        shoesColor: 0xf8fafc,
        hasGlasses: false,
        hasBackpack: true,
        backpackColor: 0x1e293b
      }
    },
    {
      id: 'preset_3',
      name: '양갈래 교복 소녀',
      tag: '명랑 과학소녀',
      icon: '👧',
      desc: '귀여운 양갈래 헤어에 플리츠 교복 스커트와 리본 타이를 착용한 소녀',
      custom: {
        skinColor: 0xffdbac,
        hairStyle: 'twintail',
        hairColor: 0x854d0e,
        topStyle: 'uniform',
        topColor: 0x831843,
        bottomStyle: 'skirt',
        bottomColor: 0x1e293b,
        shoesStyle: 'loafers',
        shoesColor: 0x78350f,
        hasGlasses: false,
        hasBackpack: true,
        backpackColor: 0xd97706
      }
    },
    {
      id: 'preset_4',
      name: '스포티 캡 모험가',
      tag: '열정 행동파',
      icon: '🧢',
      desc: '뒤로 쓴 캡 모자에 바람막이 점퍼와 조거팬츠, 하이탑 농구화 장착',
      custom: {
        skinColor: 0xf5d0b0,
        hairStyle: 'cap',
        hairColor: 0xca8a04,
        topStyle: 'windbreaker',
        topColor: 0x0284c7,
        bottomStyle: 'jogger',
        bottomColor: 0x0f172a,
        shoesStyle: 'hightop',
        shoesColor: 0xdc2626,
        hasGlasses: false,
        hasBackpack: true,
        backpackColor: 0x475569
      }
    },
    {
      id: 'preset_5',
      name: '단발 보브 소녀',
      tag: '시크한 두뇌파',
      icon: '👩',
      desc: '차분한 단발머리에 니트 조끼와 베이지 팬츠, 모던 안경을 쓴 탐구자',
      custom: {
        skinColor: 0xffdbac,
        hairStyle: 'bob',
        hairColor: 0x1f2937,
        topStyle: 'knit_vest',
        topColor: 0x065f46,
        bottomStyle: 'slacks',
        bottomColor: 0x78350f,
        shoesStyle: 'sneakers',
        shoesColor: 0xf8fafc,
        hasGlasses: true,
        hasBackpack: true,
        backpackColor: 0x334155
      }
    },
    {
      id: 'preset_6',
      name: '애쉬 그레이 힙스터',
      tag: '트렌디 크리에이터',
      icon: '🎨',
      desc: '세련된 투블럭 애쉬 헤어에 오버핏 블랙 후드와 데님 매치',
      custom: {
        skinColor: 0xffdbac,
        hairStyle: 'two_block',
        hairColor: 0x94a3b8,
        topStyle: 'hoodie',
        topColor: 0x0f172a,
        bottomStyle: 'jeans',
        bottomColor: 0x334155,
        shoesStyle: 'sneakers',
        shoesColor: 0xf8fafc,
        hasGlasses: false,
        hasBackpack: true,
        backpackColor: 0x0284c7
      }
    },
    {
      id: 'preset_7',
      name: '클래식 니트 소년',
      tag: '다정한 학급반장',
      icon: '🧒',
      desc: '베이지 니트 조끼와 네이비 슬랙스에 브라운 로퍼를 신은 반장 스타일',
      custom: {
        skinColor: 0xffdbac,
        hairStyle: 'dandy',
        hairColor: 0x78350f,
        topStyle: 'knit_vest',
        topColor: 0xd97706,
        bottomStyle: 'slacks',
        bottomColor: 0x1e3a8a,
        shoesStyle: 'loafers',
        shoesColor: 0x451a03,
        hasGlasses: false,
        hasBackpack: true,
        backpackColor: 0x1e293b
      }
    },
    {
      id: 'preset_8',
      name: '사이버 네온 러너',
      tag: '미래지향 엔지니어',
      icon: '🚀',
      desc: '딥블루 헤어에 바이올렛 바람막이와 하이탑 스니커즈를 장착한 러너',
      custom: {
        skinColor: 0xf5d0b0,
        hairStyle: 'volume',
        hairColor: 0x1e3a8a,
        topStyle: 'windbreaker',
        topColor: 0x7c3aed,
        bottomStyle: 'jogger',
        bottomColor: 0x111827,
        shoesStyle: 'hightop',
        shoesColor: 0x38bdf8,
        hasGlasses: true,
        hasBackpack: true,
        backpackColor: 0x4f46e5
      }
    }
  ];

  // 커스텀 옵션으로 고품질 3D 메쉬 생성
  function createCustomCharacterMesh(options) {
    const opt = Object.assign({}, defaultCustomData, options);
    const charGroup = new THREE.Group();

    // 1. 머리 & 얼굴 (Head & Face)
    const headGroup = new THREE.Group();
    headGroup.position.y = 2.0;

    // 머리 본체
    const headGeo = new THREE.BoxGeometry(0.76, 0.76, 0.76);
    const headMat = new THREE.MeshStandardMaterial({
      color: opt.skinColor,
      roughness: 0.65,
      metalness: 0.05
    });
    const headMesh = new THREE.Mesh(headGeo, headMat);
    headMesh.castShadow = true;
    headGroup.add(headMesh);

    // 귀 (좌/우)
    const earGeo = new THREE.BoxGeometry(0.08, 0.16, 0.12);
    const earL = new THREE.Mesh(earGeo, headMat);
    earL.position.set(-0.41, 0, 0);
    const earR = earL.clone();
    earR.position.set(0.41, 0, 0);
    headGroup.add(earL);
    headGroup.add(earR);

    // 눈 (Eyes - 동공 + 반사광 하이라이트)
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x111827 });
    const eyeHighMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

    for (let side of [-0.2, 0.2]) {
      const eye = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.13, 0.04), eyeMat);
      eye.position.set(side, 0.05, 0.39);
      headGroup.add(eye);

      // 눈 반사광 하이라이트
      const highlight = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.02), eyeHighMat);
      highlight.position.set(side + (side > 0 ? 0.02 : -0.02), 0.08, 0.41);
      headGroup.add(highlight);
    }

    // 볼터치 (Blush - 사랑스러운 살구/핑크)
    const blushMat = new THREE.MeshBasicMaterial({ color: 0xf87171, transparent: true, opacity: 0.5 });
    for (let side of [-0.24, 0.24]) {
      const blush = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.05, 0.02), blushMat);
      blush.position.set(side, -0.08, 0.39);
      headGroup.add(blush);
    }

    // 2. 머리스타일 (Hair Style)
    const hairMat = new THREE.MeshStandardMaterial({
      color: opt.hairColor,
      roughness: 0.8
    });

    if (opt.hairStyle === 'dandy') {
      // 댄디컷: 윗머리 덮개 + 앞머리 뱅
      const hairTop = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.38, 0.84), hairMat);
      hairTop.position.set(0, 0.32, 0);
      headGroup.add(hairTop);

      const bangs = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.22, 0.12), hairMat);
      bangs.position.set(0, 0.22, 0.41);
      headGroup.add(bangs);

    } else if (opt.hairStyle === 'twintail') {
      // 양갈래 트윈테일: 윗머리 + 양옆 포니테일 번 + 리본
      const hairTop = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.36, 0.84), hairMat);
      hairTop.position.set(0, 0.32, 0);
      headGroup.add(hairTop);

      const bangs = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.18, 0.1), hairMat);
      bangs.position.set(0, 0.22, 0.41);
      headGroup.add(bangs);

      const ribbonMat = new THREE.MeshStandardMaterial({ color: 0xf43f5e });
      for (let side of [-0.5, 0.5]) {
        // 양갈래 머리 타래
        const tail = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.65, 0.24), hairMat);
        tail.position.set(side, -0.05, -0.1);
        tail.rotation.z = side > 0 ? -0.2 : 0.2;
        headGroup.add(tail);

        // 리본 장식
        const ribbon = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.16), ribbonMat);
        ribbon.position.set(side, 0.26, -0.1);
        headGroup.add(ribbon);
      }

    } else if (opt.hairStyle === 'volume') {
      // 볼륨펌: 풍성하고 입체적인 컬
      const hairTop = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.45, 0.88), hairMat);
      hairTop.position.set(0, 0.34, 0);
      headGroup.add(hairTop);

      for (let i = -0.3; i <= 0.3; i += 0.3) {
        const curl = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.2, 0.16), hairMat);
        curl.position.set(i, 0.25, 0.44);
        headGroup.add(curl);
      }

    } else if (opt.hairStyle === 'bob') {
      // 단발 보브컷: 턱선까지 감싸는 머리
      const hairTop = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.4, 0.86), hairMat);
      hairTop.position.set(0, 0.32, 0);
      headGroup.add(hairTop);

      const hairSides = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.55, 0.86), hairMat);
      hairSides.position.set(0, -0.05, -0.08);
      headGroup.add(hairSides);

    } else if (opt.hairStyle === 'two_block') {
      // 투블럭: 옆머리 페이드 + 윗머리 볼륨
      const fadeMat = new THREE.MeshStandardMaterial({ color: 0x111827 });
      const fadeSides = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.3, 0.8), fadeMat);
      fadeSides.position.set(0, 0.15, 0);
      headGroup.add(fadeSides);

      const hairTop = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.35, 0.75), hairMat);
      hairTop.position.set(0, 0.35, 0.05);
      headGroup.add(hairTop);

    } else {
      // 캡 모자 (Cap)
      const capMat = new THREE.MeshStandardMaterial({ color: opt.topColor, roughness: 0.5 });
      const dome = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.35, 0.86), capMat);
      dome.position.set(0, 0.34, 0);
      headGroup.add(dome);

      // 모자 챙 (Visor)
      const visor = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.06, 0.4), capMat);
      visor.position.set(0, 0.24, 0.52);
      headGroup.add(visor);

      // 모자 밑 머리카락 살짝
      const hairPeek = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.15, 0.3), hairMat);
      hairPeek.position.set(0, 0.14, -0.35);
      headGroup.add(hairPeek);
    }

    // 안경 (Glasses)
    if (opt.hasGlasses) {
      const glassMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.8, roughness: 0.2 });
      for (let side of [-0.2, 0.2]) {
        const rim = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.04), glassMat);
        rim.position.set(side, 0.05, 0.42);
        headGroup.add(rim);
      }
      const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.04, 0.03), glassMat);
      bridge.position.set(0, 0.05, 0.42);
      headGroup.add(bridge);
    }

    charGroup.add(headGroup);

    // 3. 상의 & 몸통 (Top Clothing & Torso)
    const torsoGroup = new THREE.Group();
    torsoGroup.position.y = 1.15;

    const topMat = new THREE.MeshStandardMaterial({ color: opt.topColor, roughness: 0.6 });
    const shirtWhiteMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 });

    // 몸통 베이스
    const torsoMesh = new THREE.Mesh(new THREE.BoxGeometry(0.86, 1.05, 0.52), topMat);
    torsoMesh.castShadow = true;
    torsoGroup.add(torsoMesh);

    if (opt.topStyle === 'uniform') {
      // 교복 재킷: V넥 라펠 + 셔츠 + 넥타이/리본 + 포켓
      const collar = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.4, 0.04), shirtWhiteMat);
      collar.position.set(0, 0.35, 0.26);
      torsoGroup.add(collar);

      const tie = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.45, 0.06), new THREE.MeshStandardMaterial({ color: 0xef4444 }));
      tie.position.set(0, 0.2, 0.27);
      torsoGroup.add(tie);

      // 가슴 포켓 명찰
      const badge = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.08, 0.03), new THREE.MeshStandardMaterial({ color: 0xfbbf24 }));
      badge.position.set(-0.25, 0.25, 0.27);
      torsoGroup.add(badge);

    } else if (opt.topStyle === 'hoodie') {
      // 후드티: 목 뒤 접힌 모자 + 전면 캥거루 주머니
      const hoodBack = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.4, 0.25), topMat);
      hoodBack.position.set(0, 0.42, -0.32);
      torsoGroup.add(hoodBack);

      const pocket = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.32, 0.1), topMat);
      pocket.position.set(0, -0.22, 0.28);
      torsoGroup.add(pocket);

    } else if (opt.topStyle === 'knit_vest') {
      // 니트 조끼: V존 셔츠
      const innerShirt = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 0.04), shirtWhiteMat);
      innerShirt.position.set(0, 0.3, 0.26);
      torsoGroup.add(innerShirt);

    } else if (opt.topStyle === 'windbreaker') {
      // 바람막이 집업: 중앙 지퍼 라인
      const zipper = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.02, 0.04), new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.8 }));
      zipper.position.set(0, 0, 0.27);
      torsoGroup.add(zipper);
    }

    // 학생 백팩 (Backpack)
    if (opt.hasBackpack) {
      const packMat = new THREE.MeshStandardMaterial({ color: opt.backpackColor, roughness: 0.7 });
      const backpack = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.82, 0.32), packMat);
      backpack.position.set(0, 0.05, -0.38);
      backpack.castShadow = true;
      torsoGroup.add(backpack);

      // 백팩 앞 주머니
      const subPocket = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.1), packMat);
      subPocket.position.set(0, -0.15, -0.52);
      torsoGroup.add(subPocket);
    }

    charGroup.add(torsoGroup);

    // 4. 팔 (Arms - 상의 소매 + 살구색 손)
    const armMat = topMat;
    const handMat = headMat;

    function buildArm(side) {
      const armGroup = new THREE.Group();
      armGroup.position.set(side * 0.6, 1.15, 0);

      // 소매
      const sleeve = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.75, 0.28), armMat);
      sleeve.position.y = -0.1;
      sleeve.castShadow = true;
      armGroup.add(sleeve);

      // 손 (Hand)
      const hand = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.24, 0.22), handMat);
      hand.position.y = -0.48;
      armGroup.add(hand);

      return armGroup;
    }

    const leftArm = buildArm(-1);
    const rightArm = buildArm(1);
    charGroup.add(leftArm);
    charGroup.add(rightArm);

    // 5. 하의 (Pants / Skirt) & 신발 (Shoes)
    const bottomMat = new THREE.MeshStandardMaterial({ color: opt.bottomColor, roughness: 0.7 });
    const shoesMat = new THREE.MeshStandardMaterial({ color: opt.shoesColor, roughness: 0.5 });
    const whiteSoleMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 });

    // 스커트 착용 시 허리 스커트 메쉬
    if (opt.bottomStyle === 'skirt') {
      const skirtMesh = new THREE.Mesh(new THREE.ConeGeometry(0.62, 0.52, 16), bottomMat);
      skirtMesh.position.set(0, 0.65, 0);
      skirtMesh.rotation.y = Math.PI / 4;
      charGroup.add(skirtMesh);
    }

    function buildLeg(side) {
      const legGroup = new THREE.Group();
      legGroup.position.set(side * 0.22, 0.38, 0);

      // 다리 (바지 또는 스타킹/살결)
      let legMeshMat = bottomMat;
      if (opt.bottomStyle === 'skirt') {
        legMeshMat = headMat; // 살구빛 다리
      }

      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.68, 0.32), legMeshMat);
      leg.position.y = 0.12;
      leg.castShadow = true;
      legGroup.add(leg);

      // 신발 (Shoes)
      const shoeGroup = new THREE.Group();
      shoeGroup.position.y = -0.22;

      if (opt.shoesStyle === 'sneakers') {
        // 스니커즈: 밑창 + 본체
        const sole = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.12, 0.54), whiteSoleMat);
        sole.position.set(0, 0, 0.06);
        shoeGroup.add(sole);

        const upper = new THREE.Mesh(new THREE.BoxGeometry(0.33, 0.18, 0.5), shoesMat);
        upper.position.set(0, 0.1, 0.05);
        shoeGroup.add(upper);

      } else if (opt.shoesStyle === 'loafers') {
        // 로퍼: 굽 + 가죽 본체
        const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.2, 0.52), shoesMat);
        shoe.position.set(0, 0.05, 0.06);
        shoeGroup.add(shoe);

        // 버클 장식
        const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.04, 0.04), new THREE.MeshStandardMaterial({ color: 0xfbbf24, metalness: 0.9 }));
        buckle.position.set(0, 0.16, 0.12);
        shoeGroup.add(buckle);

      } else {
        // 하이탑 농구화
        const sole = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.12, 0.56), whiteSoleMat);
        sole.position.set(0, 0, 0.07);
        shoeGroup.add(sole);

        const upper = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.3, 0.52), shoesMat);
        upper.position.set(0, 0.18, 0.05);
        shoeGroup.add(upper);
      }

      legGroup.add(shoeGroup);
      return legGroup;
    }

    const leftLeg = buildLeg(-1);
    const rightLeg = buildLeg(1);
    charGroup.add(leftLeg);
    charGroup.add(rightLeg);

    // 하단 선택 발판 링
    const ringGeo = new THREE.RingGeometry(0.55, 0.75, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x3b82f6,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.6
    });
    const selectRing = new THREE.Mesh(ringGeo, ringMat);
    selectRing.rotation.x = -Math.PI / 2;
    selectRing.position.y = 0.02;
    charGroup.add(selectRing);

    // 애니메이션 제어를 위한 파츠 바인딩
    charGroup.userData = {
      leftArm,
      rightArm,
      leftLeg,
      rightLeg,
      head: headGroup,
      customOptions: opt
    };

    return charGroup;
  }

  // 플레이어 인게임 씬에 스폰 (커스텀 옵션 지원)
  function spawnPlayer(customOptions) {
    if (playerMesh && scene) {
      scene.remove(playerMesh);
    }
    playerMesh = createCustomCharacterMesh(customOptions);
    playerMesh.position.set(0, 0, 5);
    scene.add(playerMesh);
  }

  // -------------------------------------------------------------
  // [6] 캐릭터 선택용 턴테이블 3D 프리뷰
  // -------------------------------------------------------------
  let previewScene, previewCamera, previewRenderer;
  let previewCharMesh = null;
  let isAutoRotating = true;
  let targetRotationY = 0;

  function initPreview(containerId, initialCustomOptions) {
    const container = document.getElementById(containerId);
    if (!container) return;

    previewScene = new THREE.Scene();

    previewCamera = new THREE.PerspectiveCamera(
      45,
      container.clientWidth / container.clientHeight,
      0.1,
      50
    );
    previewCamera.position.set(0, 1.8, 4.4);
    previewCamera.lookAt(0, 1.3, 0);

    previewRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    previewRenderer.setSize(container.clientWidth, container.clientHeight);
    previewRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    previewRenderer.shadowMap.enabled = true;
    container.innerHTML = '';
    container.appendChild(previewRenderer.domElement);

    // 조명 (입체감과 색감이 돋보이는 3점 조명)
    const pAmbient = new THREE.AmbientLight(0xffffff, 0.85);
    previewScene.add(pAmbient);

    const pDir = new THREE.DirectionalLight(0xfff7ed, 1.3);
    pDir.position.set(4, 7, 5);
    previewScene.add(pDir);

    const pBack = new THREE.DirectionalLight(0x38bdf8, 0.8);
    pBack.position.set(-4, 5, -5);
    previewScene.add(pBack);

    // 마우스/터치 드래그로 캐릭터 회전 지원
    setupPreviewDrag(container);

    // 프리뷰 캔버스 창 크기 변경 및 회전 반응형 처리
    window.addEventListener('resize', () => {
      if (!previewRenderer || !previewCamera || !container) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w > 0 && h > 0) {
        previewCamera.aspect = w / h;
        previewCamera.updateProjectionMatrix();
        previewRenderer.setSize(w, h);
      }
    });

    updatePreviewCharacter(initialCustomOptions || defaultCustomData);

    function animPreview() {
      requestAnimationFrame(animPreview);
      if (previewCharMesh) {
        if (isAutoRotating) {
          previewCharMesh.rotation.y += 0.012;
        } else {
          previewCharMesh.rotation.y = THREE.MathUtils.lerp(previewCharMesh.rotation.y, targetRotationY, 0.1);
        }
      }
      previewRenderer.render(previewScene, previewCamera);
    }
    animPreview();
  }

  function setupPreviewDrag(container) {
    let isDragging = false;
    let prevX = 0;

    container.addEventListener('mousedown', e => {
      isDragging = true;
      isAutoRotating = false;
      prevX = e.clientX;
    });

    window.addEventListener('mousemove', e => {
      if (!isDragging || !previewCharMesh) return;
      const deltaX = e.clientX - prevX;
      prevX = e.clientX;
      targetRotationY = previewCharMesh.rotation.y + deltaX * 0.02;
      previewCharMesh.rotation.y += deltaX * 0.02;
    });

    window.addEventListener('mouseup', () => {
      isDragging = false;
    });

    // 터치 지원
    container.addEventListener('touchstart', e => {
      if (e.touches.length > 0) {
        isDragging = true;
        isAutoRotating = false;
        prevX = e.touches[0].clientX;
      }
    });

    window.addEventListener('touchmove', e => {
      if (!isDragging || !previewCharMesh || e.touches.length === 0) return;
      const deltaX = e.touches[0].clientX - prevX;
      prevX = e.touches[0].clientX;
      targetRotationY = previewCharMesh.rotation.y + deltaX * 0.02;
      previewCharMesh.rotation.y += deltaX * 0.02;
    });

    window.addEventListener('touchend', () => {
      isDragging = false;
    });
  }

  // 회전 컨트롤러 버튼용 API
  function rotatePreview(direction) {
    if (!previewCharMesh) return;
    isAutoRotating = false;
    if (direction === 'left') {
      targetRotationY = previewCharMesh.rotation.y - Math.PI / 4;
    } else if (direction === 'right') {
      targetRotationY = previewCharMesh.rotation.y + Math.PI / 4;
    } else if (direction === 'front') {
      targetRotationY = 0;
    }
  }

  function updatePreviewCharacter(customOptions) {
    if (!previewScene) return;
    const currentRotY = previewCharMesh ? previewCharMesh.rotation.y : 0;
    if (previewCharMesh) {
      previewScene.remove(previewCharMesh);
    }
    previewCharMesh = createCustomCharacterMesh(customOptions);
    previewCharMesh.rotation.y = currentRotY;
    previewScene.add(previewCharMesh);
  }

  // -------------------------------------------------------------
  // [7] 입력 및 물리 처리
  // -------------------------------------------------------------
  function setupInputListeners() {
    window.addEventListener('keydown', e => {
      // 1. 가구 배치 모드 중일 때의 전용 키 조작
      if (placementMode) {
        if (e.code === 'KeyR') {
          e.preventDefault();
          rotatePlacement();
          return;
        }
        if (e.code === 'Space' || e.code === 'Enter') {
          e.preventDefault();
          confirmFurniturePlacement();
          return;
        }
        if (e.code === 'Escape') {
          e.preventDefault();
          cancelFurniturePlacement(true);
          return;
        }
      }

      keysDown[e.code] = true;

      // Space키: 점프 (공원 벤치 뛰어넘기 & 점프 놀이)
      if (e.code === 'Space') {
        if (isGrounded) {
          playerVelocityY = 9.0;
          isGrounded = false;
        }
      }
      // E키: 상호작용 (조사하기)
      if (e.code === 'KeyE') {
        triggerNearbyInspect();
      }
      // C키: 가구 제작 모달
      if (e.code === 'KeyC') {
        const btn = document.getElementById('btn-open-crafting');
        if (btn) btn.click();
      }
      // R키: 랭킹 모달
      if (e.code === 'KeyR' && !placementMode) {
        const btn = document.getElementById('btn-open-rank');
        if (btn) btn.click();
      }
    });

    window.addEventListener('keyup', e => {
      keysDown[e.code] = false;
    });

    // 캔버스 마우스/터치 바닥 포인터 추적 및 클릭 배치
    const canvasContainer = document.getElementById('game-canvas-container');
    if (canvasContainer) {
      const handlePlacementPointer = (e) => {
        if (!placementMode || !placementGhostGroup || !camera) return;
        const rect = canvasContainer.getBoundingClientRect();
        const clientX = (e.touches && e.touches.length > 0) ? e.touches[0].clientX : e.clientX;
        const clientY = (e.touches && e.touches.length > 0) ? e.touches[0].clientY : e.clientY;
        if (clientX === undefined || clientY === undefined) return;

        placementMouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
        placementMouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;

        placementRaycaster.setFromCamera(placementMouse, camera);
        const hit = new THREE.Vector3();
        if (placementRaycaster.ray.intersectPlane(groundPlane, hit)) {
          const maxBound = (currentRoomId === 'room_5') ? 15.0 : 9.5;
          placementPos.x = Math.max(-maxBound, Math.min(maxBound, hit.x));
          placementPos.z = Math.max(-maxBound, Math.min(maxBound, hit.z));
          placementGhostGroup.position.set(placementPos.x, 0, placementPos.z);
        }
      };

      canvasContainer.addEventListener('mousemove', handlePlacementPointer);
      canvasContainer.addEventListener('touchmove', handlePlacementPointer, { passive: true });

      canvasContainer.addEventListener('click', (e) => {
        if (placementMode && placementGhostGroup) {
          if (renderer && e.target === renderer.domElement) {
            confirmFurniturePlacement();
          }
        }
      });
    }

    // 가구 배치 HUD 버튼 이벤트 바인딩
    const btnPlaceRotate = document.getElementById('btn-place-rotate');
    if (btnPlaceRotate) btnPlaceRotate.addEventListener('click', rotatePlacement);

    const btnPlaceToFront = document.getElementById('btn-place-to-front');
    if (btnPlaceToFront) btnPlaceToFront.addEventListener('click', placeInFrontOfPlayer);

    const btnPlaceConfirm = document.getElementById('btn-place-confirm');
    if (btnPlaceConfirm) btnPlaceConfirm.addEventListener('click', confirmFurniturePlacement);

    const btnPlaceCancel = document.getElementById('btn-place-cancel');
    if (btnPlaceCancel) btnPlaceCancel.addEventListener('click', () => cancelFurniturePlacement(true));

    // 모바일 가상 조이스틱 터치 이벤트
    setupVirtualJoystick();
  }

  function setupVirtualJoystick() {
    const zone = document.getElementById('joystick-zone');
    const stick = document.getElementById('joystick-stick');
    if (!zone || !stick) return;

    let touchId = null;
    let baseCenter = { x: 0, y: 0 };
    const maxRadius = 45;

    function handleStart(e) {
      const touch = e.changedTouches ? e.changedTouches[0] : e;
      touchId = touch.identifier !== undefined ? touch.identifier : 'mouse';
      const rect = zone.getBoundingClientRect();
      baseCenter = {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2
      };
      joystickActive = true;
      handleMove(e);
    }

    function handleMove(e) {
      if (!joystickActive) return;
      let targetTouch = null;
      if (e.changedTouches) {
        for (let t of e.changedTouches) {
          if (t.identifier === touchId) {
            targetTouch = t;
            break;
          }
        }
      } else {
        targetTouch = e;
      }
      if (!targetTouch) return;

      const dx = targetTouch.clientX - baseCenter.x;
      const dy = targetTouch.clientY - baseCenter.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const angle = Math.atan2(dy, dx);

      const clampedDist = Math.min(dist, maxRadius);
      const moveX = Math.cos(angle) * clampedDist;
      const moveY = Math.sin(angle) * clampedDist;

      stick.style.transform = `translate(${moveX}px, ${moveY}px)`;

      // 정규화된 이동 벡터 (-1 ~ 1)
      joystickVector.x = moveX / maxRadius;
      joystickVector.y = moveY / maxRadius;
    }

    function handleEnd(e) {
      joystickActive = false;
      touchId = null;
      joystickVector.x = 0;
      joystickVector.y = 0;
      stick.style.transform = 'translate(0px, 0px)';
    }

    zone.addEventListener('touchstart', handleStart, { passive: false });
    window.addEventListener('touchmove', handleMove, { passive: false });
    window.addEventListener('touchend', handleEnd, { passive: false });
    window.addEventListener('touchcancel', handleEnd, { passive: false });
  }

  // 주변 오브젝트 조사하기 트리거
  function triggerNearbyInspect() {
    if (!nearbyObject) return;
    if (window.App && window.App.onInspectObject) {
      window.App.onInspectObject(nearbyObject);
    }
  }

  // -------------------------------------------------------------
  // [8] 메인 애니메이션 루프 (매 프레임 호출)
  // -------------------------------------------------------------
  const clock = new THREE.Clock();

  function animate() {
    requestAnimationFrame(animate);
    const delta = Math.min(clock.getDelta(), 0.1);

    // 1. 캐릭터 이동 계산
    let moveX = 0;
    let moveZ = 0;

    // 키보드 입력
    if (keysDown['KeyW'] || keysDown['ArrowUp']) moveZ -= 1;
    if (keysDown['KeyS'] || keysDown['ArrowDown']) moveZ += 1;
    if (keysDown['KeyA'] || keysDown['ArrowLeft']) moveX -= 1;
    if (keysDown['KeyD'] || keysDown['ArrowRight']) moveX += 1;

    // 조이스틱 입력 합산
    if (joystickActive) {
      moveX += joystickVector.x;
      moveZ += joystickVector.y;
    }

    // 공원 전용 인터랙티브 피처 (트램펄린 슈퍼 점프 & 스피드 부스터)
    if (currentRoomId === 'room_5' && playerMesh) {
      // 1) 트램펄린 체크 (밟으면 슈퍼 점프!)
      trampolines.forEach(t => {
        const dx = playerMesh.position.x - t.x;
        const dz = playerMesh.position.z - t.z;
        if (dx * dx + dz * dz < t.radius * t.radius && isGrounded) {
          playerVelocityY = 16.5; // 슈퍼 점프!
          isGrounded = false;
          if (window.App && window.App.showToast) {
            window.App.showToast('🚀 트램펄린 슈퍼 점프! ✨', 1200);
          }
          if (window.confetti) {
            window.confetti({ particleCount: 30, spread: 60, origin: { y: 0.7 } });
          }
        }
      });

      // 2) 스피드 부스터 패드 체크 (밟으면 3.5초간 2배속 가속)
      boosters.forEach(b => {
        const dx = playerMesh.position.x - b.x;
        const dz = playerMesh.position.z - b.z;
        if (dx * dx + dz * dz < b.radius * b.radius && parkBoostTime <= 0) {
          parkBoostTime = 3.5;
          if (window.App && window.App.showToast) {
            window.App.showToast('⚡ 스피드 부스터 발동! (3초간 2배속 질주) 🏃‍♂️💨', 1500);
          }
        }
      });
    }

    if (parkBoostTime > 0) {
      parkBoostTime -= delta;
    }

    const inputLen = Math.sqrt(moveX * moveX + moveZ * moveZ);
    const isMoving = inputLen > 0.1;

    if (playerMesh) {
      // 수직 점프 및 중력 물리
      if (!isGrounded || playerMesh.position.y > 0) {
        playerVelocityY -= 28.0 * delta;
        playerMesh.position.y += playerVelocityY * delta;
        if (playerMesh.position.y <= 0) {
          playerMesh.position.y = 0;
          playerVelocityY = 0;
          isGrounded = true;
        }
      }

      if (isMoving) {
        // 정규화
        const normX = moveX / (inputLen || 1);
        const normZ = moveZ / (inputLen || 1);

        let currentSpeed = (keysDown['ShiftLeft'] || moveState.isRunning) ? 8.0 : 5.0;
        if (parkBoostTime > 0) {
          currentSpeed = 13.5; // 부스터 가속 속도!
        }
        const stepX = normX * currentSpeed * delta;
        const stepZ = normZ * currentSpeed * delta;

        // X축 이동 시도 (사물/가구 통과 방지 & 부드러운 미끄러짐)
        const nextX = playerMesh.position.x + stepX;
        if (!isColliding(nextX, playerMesh.position.z)) {
          playerMesh.position.x = nextX;
        }

        // Z축 이동 시도 (사물/가구 통과 방지 & 부드러운 미끄러짐)
        const nextZ = playerMesh.position.z + stepZ;
        if (!isColliding(playerMesh.position.x, nextZ)) {
          playerMesh.position.z = nextZ;
        }

        // 캐릭터 진행 방향 최단 회전각 보간 (Shortest Angle Interpolation)
        // W(직진)에서 A(좌회전) 전환 시 150도~270도 반대로 헛돌지 않고 깔끔하게 90도 회전
        const targetAngle = Math.atan2(normX, normZ);
        let angleDiff = targetAngle - playerMesh.rotation.y;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        playerMesh.rotation.y += angleDiff * 0.35;

        while (playerMesh.rotation.y < -Math.PI) playerMesh.rotation.y += Math.PI * 2;
        while (playerMesh.rotation.y > Math.PI) playerMesh.rotation.y -= Math.PI * 2;

        // 걷기/달리기 애니메이션 (팔/다리 스윙)
        walkAnimTime += delta * currentSpeed * 2.2;
        const swing = Math.sin(walkAnimTime) * 0.7;
        const parts = playerMesh.userData;
        if (parts) {
          if (parts.leftLeg) parts.leftLeg.rotation.x = swing;
          if (parts.rightLeg) parts.rightLeg.rotation.x = -swing;
          if (parts.leftArm) parts.leftArm.rotation.x = -swing * 0.8;
          if (parts.rightArm) parts.rightArm.rotation.x = swing * 0.8;
        }
      } else {
        // 정지 시 팔다리 리셋
        const parts = playerMesh.userData;
        if (parts) {
          if (parts.leftLeg) parts.leftLeg.rotation.x = THREE.MathUtils.lerp(parts.leftLeg.rotation.x, 0, 0.2);
          if (parts.rightLeg) parts.rightLeg.rotation.x = THREE.MathUtils.lerp(parts.rightLeg.rotation.x, 0, 0.2);
          if (parts.leftArm) parts.leftArm.rotation.x = THREE.MathUtils.lerp(parts.leftArm.rotation.x, 0, 0.2);
          if (parts.rightArm) parts.rightArm.rotation.x = THREE.MathUtils.lerp(parts.rightArm.rotation.x, 0, 0.2);
        }
      }

      // 카메라 부드러운 추적 (Third Person Camera)
      const targetCamX = playerMesh.position.x;
      const targetCamY = playerMesh.position.y + 6.0;
      const targetCamZ = playerMesh.position.z + 8.5;

      camera.position.x = THREE.MathUtils.lerp(camera.position.x, targetCamX, 0.08);
      camera.position.y = THREE.MathUtils.lerp(camera.position.y, targetCamY, 0.08);
      camera.position.z = THREE.MathUtils.lerp(camera.position.z, targetCamZ, 0.08);
      camera.lookAt(playerMesh.position.x, playerMesh.position.y + 1.2, playerMesh.position.z);
    }

    // 2. 오브젝트 마커 애니메이션 & 플레이어 거리 체크
    checkNearbyInteractiveObjects();

    // 3. 힐링 공원(Room 5) 분수대 물줄기 물리 시뮬레이션 및 잔물결 애니메이션
    if (currentRoomId === 'room_5') {
      updateFountainWater(delta);
    }

    renderer.render(scene, camera);
  }

  // 플레이어 근처 오브젝트 감지 및 마커 회전
  function checkNearbyInteractiveObjects() {
    let closest = null;
    let minDist = 999;

    roomObjects.forEach(obj => {
      // 마커 회전 및 부유
      if (obj.marker) {
        obj.marker.rotation.y += 0.02;
        obj.marker.position.y = 2.2 + Math.sin(clock.getElapsedTime() * 3 + obj.pos.x) * 0.15;
      }
      if (obj.ring) {
        obj.ring.rotation.z += 0.01;
      }

      if (playerMesh) {
        const dist = playerMesh.position.distanceTo(obj.pos);
        if (dist < obj.radius && dist < minDist) {
          minDist = dist;
          closest = obj;
        }
      }
    });

    // 3D 출구 게이트 (Exit Door) 접근 감지
    if (exitGateMesh && currentRoomId !== 'room_5' && playerMesh) {
      const gatePos = new THREE.Vector3(0, 0, -11.0);
      const dist = playerMesh.position.distanceTo(gatePos);
      if (dist < 3.2 && dist < minDist) {
        minDist = dist;
        closest = {
          isExitGate: true,
          title: '🚪 다음 방 탈출문 (모든 문제 해결 + 가구 꾸미기 완료 시 입장)',
          type: 'exit_gate',
          pos: gatePos
        };
      }
    }

    nearbyObject = closest;

    // UI 프롬프트 갱신
    const promptEl = document.getElementById('interaction-prompt');
    const promptNameEl = document.getElementById('prompt-obj-name');

    if (nearbyObject) {
      if (promptEl) promptEl.classList.remove('hidden');
      if (promptNameEl) promptNameEl.textContent = nearbyObject.title;
    } else {
      if (promptEl) promptEl.classList.add('hidden');
    }
  }

  // -------------------------------------------------------------
  // Public API 반환
  // -------------------------------------------------------------
  return {
    init: init,
    buildRoom: buildRoom,
    spawnPlayer: spawnPlayer,
    spawnFurniture: spawnFurniture,
    startFurniturePlacement: startFurniturePlacement,
    confirmFurniturePlacement: confirmFurniturePlacement,
    cancelFurniturePlacement: cancelFurniturePlacement,
    rotatePlacement: rotatePlacement,
    placeInFrontOfPlayer: placeInFrontOfPlayer,
    isPlacementMode: function() { return placementMode; },
    getPlacedFurnitures: function() { return placedFurnitures; },
    loadPlacedFurnituresFromLocal: loadPlacedFurnituresFromLocal,
    unlockExitGate: unlockExitGate,
    initPreview: initPreview,
    updatePreviewCharacter: updatePreviewCharacter,
    rotatePreview: rotatePreview,
    triggerNearbyInspect: triggerNearbyInspect,
    characterPresets: characterPresets,
    defaultCustomData: defaultCustomData,
    toggleRunning: function(state) {
      moveState.isRunning = state;
    },
    getCurrentRoomId: function() {
      return currentRoomId;
    },
    toggleTagRole: function() {
      tagRole = (tagRole === 'runner') ? 'tagger' : 'runner';
      const pill = document.getElementById('tag-role-pill');
      if (pill) {
        if (tagRole === 'tagger') {
          pill.className = 'tag-role-pill role-tagger';
          pill.innerHTML = '<i class="fa-solid fa-bullseye"></i> 술래 🎯';
        } else {
          pill.className = 'tag-role-pill role-runner';
          pill.innerHTML = '<i class="fa-solid fa-person-running"></i> 도망자 🏃';
        }
      }
      return tagRole;
    },
    getTagRole: function() {
      return tagRole;
    },
    triggerParkBoost: function() {
      parkBoostTime = 3.5;
    }
  };
})();
