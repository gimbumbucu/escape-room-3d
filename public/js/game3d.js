/**
 * 3D Game Engine (Three.js 기반)
 * 3D 방탈출 아카데미 - 룸 탐험, 캐릭터 컨트롤, 가구 소환, 오브젝트 상호작용
 */

window.Game3D = (function () {
  let scene, camera, renderer;
  let playerMesh = null;
  let currentRoomId = 'room_1';
  let roomObjects = []; // 인터랙티브 3D 오브젝트 목록
  let placedFurnitures = []; // 제작되어 방에 배치된 가구들
  let nearbyObject = null; // 현재 접근 중인 오브젝트

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
    }
  };

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

    // 창 크기 변경 이벤트
    window.addEventListener('resize', () => {
      if (!renderer || !camera || !container) return;
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    });

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

    // 조명 색상 테마 동기화
    pointLight.color.setHex(theme.lightColor);
    ambientLight.color.setHex(theme.ambientColor);

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

    // 테마별 고유 오브젝트 및 문제 조사 스팟 배치
    buildThemeSpecificObjects(roomId);

    // 기존 제작된 가구 재소환
    placedFurnitures.forEach(furn => {
      if (furn.roomId === roomId) {
        spawnFurnitureMesh(furn, false);
      }
    });

    scene.add(roomGroup);

    // 캐릭터 위치 방 중앙 앞쪽으로 리셋
    if (playerMesh) {
      playerMesh.position.set(0, 0, 5);
      playerMesh.rotation.y = Math.PI;
    }
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
    }
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
  }

  function createBlackboard(x, y, z) {
    const bGeo = new THREE.BoxGeometry(8, 3.5, 0.2);
    const bMat = new THREE.MeshStandardMaterial({ color: 0x064e3b, roughness: 0.9 });
    const board = new THREE.Mesh(bGeo, bMat);
    board.position.set(x, y, z);
    roomGroup.add(board);
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
  }

  function createMuseumPillars() {
    const pMat = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.3 });
    [-8, 8].forEach(px => {
      [-6, 2].forEach(pz => {
        const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 7, 16), pMat);
        pillar.position.set(px, 3.5, pz);
        pillar.castShadow = true;
        roomGroup.add(pillar);
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
  }

  function createAncientRelic(x, y, z) {
    const relic = new THREE.Mesh(
      new THREE.CylinderGeometry(0.4, 0.7, 2.5, 6),
      new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.8 })
    );
    relic.position.set(x, 1.25, z);
    roomGroup.add(relic);
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
  }

  function createToolBox(x, y, z) {
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 0.8, 0.8),
      new THREE.MeshStandardMaterial({ color: 0xd97706, metalness: 0.5 })
    );
    box.position.set(x, 0.4, z);
    roomGroup.add(box);
  }

  // -------------------------------------------------------------
  // [4] 가구 제작 시 방에 3D 가구 소환 (Spawn Furniture)
  // -------------------------------------------------------------
  function spawnFurniture(furnitureData) {
    const furnObj = {
      ...furnitureData,
      roomId: currentRoomId,
      instanceId: 'inst_' + Date.now()
    };
    placedFurnitures.push(furnObj);
    spawnFurnitureMesh(furnObj, true);
  }

  function spawnFurnitureMesh(furnObj, playFx) {
    if (!roomGroup) return;

    // 배치할 위치 (방 내부의 슬롯에 순차 배치)
    const slotIdx = placedFurnitures.filter(f => f.roomId === currentRoomId).indexOf(furnObj);
    const slots = [
      { x: -3, z: 1 },
      { x: 3, z: 1 },
      { x: -6, z: 4 },
      { x: 6, z: 4 },
      { x: 0, z: 2 }
    ];
    const pos = slots[slotIdx % slots.length] || { x: 0, z: 0 };

    const fGroup = new THREE.Group();
    fGroup.position.set(pos.x, 0, pos.z);

    const type = furnObj.modelType || 'chair';

    if (type === 'chair') {
      // 의자
      const seat = new THREE.Mesh(
        new THREE.BoxGeometry(0.9, 0.1, 0.9),
        new THREE.MeshStandardMaterial({ color: 0xb45309 })
      );
      seat.position.y = 0.6;
      fGroup.add(seat);

      const back = new THREE.Mesh(
        new THREE.BoxGeometry(0.9, 0.9, 0.1),
        new THREE.MeshStandardMaterial({ color: 0x92400e })
      );
      back.position.set(0, 1.1, -0.4);
      fGroup.add(back);

      // 다리 4개
      for (let dx of [-0.35, 0.35]) {
        for (let dz of [-0.35, 0.35]) {
          const leg = new THREE.Mesh(
            new THREE.CylinderGeometry(0.04, 0.04, 0.6),
            new THREE.MeshStandardMaterial({ color: 0x78350f })
          );
          leg.position.set(dx, 0.3, dz);
          fGroup.add(leg);
        }
      }
    } else if (type === 'desk') {
      // 책상
      const top = new THREE.Mesh(
        new THREE.BoxGeometry(1.8, 0.12, 1.1),
        new THREE.MeshStandardMaterial({ color: 0xa16207 })
      );
      top.position.y = 0.9;
      fGroup.add(top);

      for (let dx of [-0.75, 0.75]) {
        for (let dz of [-0.42, 0.42]) {
          const leg = new THREE.Mesh(
            new THREE.CylinderGeometry(0.05, 0.05, 0.9),
            new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.7 })
          );
          leg.position.set(dx, 0.45, dz);
          fGroup.add(leg);
        }
      }
    } else if (type === 'shelf') {
      // 금속 선반
      const shelf = new THREE.Mesh(
        new THREE.BoxGeometry(1.6, 2.2, 0.6),
        new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.8, roughness: 0.3 })
      );
      shelf.position.y = 1.1;
      fGroup.add(shelf);
    } else if (type === 'cabinet') {
      // 수납장
      const cab = new THREE.Mesh(
        new THREE.BoxGeometry(1.4, 1.6, 0.9),
        new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.5 })
      );
      cab.position.y = 0.8;
      fGroup.add(cab);
    } else {
      // 연금술 실험대
      const lab = new THREE.Mesh(
        new THREE.BoxGeometry(2.0, 1.2, 1.2),
        new THREE.MeshStandardMaterial({ color: 0x0284c7, metalness: 0.6 })
      );
      lab.position.y = 0.6;
      fGroup.add(lab);
    }

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
      keysDown[e.code] = true;

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
      if (e.code === 'KeyR') {
        const btn = document.getElementById('btn-open-rank');
        if (btn) btn.click();
      }
    });

    window.addEventListener('keyup', e => {
      keysDown[e.code] = false;
    });

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

    const inputLen = Math.sqrt(moveX * moveX + moveZ * moveZ);
    const isMoving = inputLen > 0.1;

    if (playerMesh) {
      if (isMoving) {
        // 정규화
        const normX = moveX / (inputLen || 1);
        const normZ = moveZ / (inputLen || 1);

        const currentSpeed = (keysDown['ShiftLeft'] || moveState.isRunning) ? 8.0 : 5.0;
        playerMesh.position.x += normX * currentSpeed * delta;
        playerMesh.position.z += normZ * currentSpeed * delta;

        // 벽 경계 충돌 처리 (-11 ~ 11)
        playerMesh.position.x = Math.max(-10.5, Math.min(10.5, playerMesh.position.x));
        playerMesh.position.z = Math.max(-10.5, Math.min(10.5, playerMesh.position.z));

        // 캐릭터 진행 방향 회전
        const targetAngle = Math.atan2(normX, normZ);
        playerMesh.rotation.y = THREE.MathUtils.lerp(playerMesh.rotation.y, targetAngle, 0.2);

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
    unlockExitGate: unlockExitGate,
    initPreview: initPreview,
    updatePreviewCharacter: updatePreviewCharacter,
    rotatePreview: rotatePreview,
    triggerNearbyInspect: triggerNearbyInspect,
    characterPresets: characterPresets,
    defaultCustomData: defaultCustomData,
    toggleRunning: function (state) {
      moveState.isRunning = state;
    }
  };
})();
