/* ════════════════════════════════════════════════════════════════
   星尘 · 大厅 3D 卡盒
   Three.js 0.187 · 真折射亚克力 / PBR 烫金 / 程序化卡面贴图

   这个模块只做一件事：把大厅里那个 CSS 假盒子换成真 3D。
   加载失败（例如用 file:// 打开）时静默退出，CSS 版本继续工作。
   ════════════════════════════════════════════════════════════════ */

import * as THREE from './vendor/three/three.module.js';
import { RoomEnvironment } from './vendor/three/RoomEnvironment.js';
import { RoundedBoxGeometry } from './vendor/three/RoundedBoxGeometry.js';

const RARITY_HEX = {
  N:   '#8A8F98',
  R:   '#9CC7E8',
  SR:  '#FFB347',
  SSR: '#7FE7FF',
  HID: '#FF5C8A',
};
const RARITY_LABEL = { N:'N', R:'R', SR:'SR', SSR:'SSR', HID:'✦' };

/* 尺寸（世界单位，1 单位 ≈ 63mm 卡宽） */
const CARD_W = 1.00, CARD_H = 1.40;
const BASE = { w:1.30, h:0.060, d:0.46, y:-0.905 };
const TRAY = { w:1.16, h:0.30, d:0.36, y:-0.775 };  // 托盘底 = -0.925，正好落在底座上表面
const LID  = { w:1.18, h:1.44, d:0.38, y: 0.155 };  // 罩子底 = -0.565，与托盘顶 -0.625 之间留 0.06 缝隙
const CARD_Y = 0.155;                                // 卡片居中在罩子里

/* ───────────────────────── 卡面贴图 ───────────────────────── */

/** 与 2D 版本同一套数学：N 重旋转对称叶片 */
function bladePath(ctx, len, w){
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.bezierCurveTo( w*0.95, -len*0.26,  w*0.62, -len*0.78, 0, -len);
  ctx.bezierCurveTo(-w*0.62, -len*0.78, -w*0.95, -len*0.26, 0, 0);
  ctx.closePath();
}

/** 复用确定性 PRNG，保证 3D 卡面与图鉴里的卡是同一张 */
function prng(seed){
  let a = seed;
  return () => {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function drawEmblem(ctx, cx, cy, scale, seed, arms, color){
  const rnd = prng(seed);
  const outerLen = (82 + rnd() * 12) * scale / 82;
  const outerW   = (26 + rnd() * 10) * scale / 82;
  const layer2   = (46 + rnd() * 14) * scale / 82;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // 外瓣
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.92;
  ctx.lineWidth = Math.max(1, 1.6 * scale / 82 * 2.2);
  for (let i = 0; i < arms; i++){
    ctx.save();
    ctx.rotate((i * 360 / arms) * Math.PI / 180);
    bladePath(ctx, outerLen, outerW);
    ctx.stroke();
    ctx.restore();
  }
  // 内瓣
  ctx.globalAlpha = 0.65;
  ctx.lineWidth = Math.max(0.7, 0.9 * scale / 82 * 2.2);
  ctx.fillStyle = color;
  for (let i = 0; i < arms; i++){
    ctx.save();
    ctx.rotate((i * 360 / arms + 180 / arms) * Math.PI / 180);
    bladePath(ctx, layer2, outerW * 0.52);
    ctx.globalAlpha = 0.09; ctx.fill();
    ctx.globalAlpha = 0.65; ctx.stroke();
    ctx.restore();
  }
  // 外环
  ctx.globalAlpha = 0.34;
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(0, 0, outerLen * 0.94, 0, Math.PI * 2); ctx.stroke();
  // 内环
  ctx.globalAlpha = 0.28;
  ctx.beginPath(); ctx.arc(0, 0, outerLen * 0.42, 0, Math.PI * 2); ctx.stroke();
  // 角点
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = color;
  for (let i = 0; i < arms; i++){
    const a = (i * 360 / arms - 90) * Math.PI / 180;
    ctx.beginPath();
    ctx.arc(Math.cos(a) * (outerLen + 13*scale/82), Math.sin(a) * (outerLen + 13*scale/82),
            1.8 * scale / 82 * 2.2, 0, Math.PI * 2);
    ctx.fill();
  }
  // 中心
  ctx.globalAlpha = 0.9;
  ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.arc(0, 0, (8 + rnd()*3) * scale/82, 0, Math.PI*2); ctx.stroke();
  ctx.beginPath(); ctx.arc(0, 0, 2.4 * scale/82 * 1.4, 0, Math.PI*2); ctx.fill();

  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r){
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawCardFace(canvas, card){
  const W = canvas.width, H = canvas.height;
  const ctx = canvas.getContext('2d');
  const color = RARITY_HEX[card.rarity] || '#8A8F98';

  // 底：近黑渐变
  const bg = ctx.createLinearGradient(0, 0, W * 0.4, H);
  bg.addColorStop(0, '#1A1D23');
  bg.addColorStop(0.55, '#111318');
  bg.addColorStop(1, '#08090B');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // 稀有色晕
  const halo = ctx.createRadialGradient(W * 0.5, H * 0.44, 0, W * 0.5, H * 0.44, W * 0.72);
  halo.addColorStop(0, color + '2E');
  halo.addColorStop(1, 'transparent');
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, W, H);

  // 外框
  const inset = W * 0.045;
  ctx.lineWidth = Math.max(1.5, W * 0.0038);
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.8;
  roundRect(ctx, inset, inset, W - inset*2, H - inset*2, W * 0.028);
  ctx.stroke();

  // 内细线
  const i2 = inset + W * 0.018;
  ctx.globalAlpha = 0.22;
  ctx.lineWidth = Math.max(1, W * 0.0018);
  roundRect(ctx, i2, i2, W - i2*2, H - i2*2, W * 0.022);
  ctx.stroke();
  ctx.globalAlpha = 1;

  // 徽记
  drawEmblem(ctx, W * 0.5, H * 0.455, W * 0.40, card.seed, card.arms, color);

  // 角色名：烫金渐变字
  const nameSize = W * 0.105;
  ctx.font = `600 ${nameSize}px "PingFang SC","Microsoft YaHei","Noto Sans SC",sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.letterSpacing = `${W * 0.028}px`;

  const gold = ctx.createLinearGradient(0, H * 0.735, 0, H * 0.80);
  gold.addColorStop(0, '#FFFBE4');
  gold.addColorStop(0.55, '#E8C766');
  gold.addColorStop(1, '#A8801F');
  ctx.fillStyle = card.rarity === 'N' ? '#C9CDD4' : gold;
  ctx.fillText(card.name, W * 0.5, H * 0.755);

  // 稀有度
  const rSize = W * 0.042;
  ctx.font = `700 ${rSize}px system-ui,sans-serif`;
  ctx.textAlign = 'right';
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.95;
  ctx.letterSpacing = `${W*0.006}px`;
  ctx.fillText(RARITY_LABEL[card.rarity], W - inset - W * 0.022, inset + W * 0.055);

  // 编号
  ctx.font = `500 ${W * 0.030}px ui-monospace,monospace`;
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(232,234,237,0.32)';
  ctx.letterSpacing = `${W*0.007}px`;
  ctx.fillText('NO.' + String(card.no).padStart(3, '0'), W * 0.5, H * 0.885);
  ctx.globalAlpha = 1;
}

function drawCardBack(canvas, card){
  const W = canvas.width, H = canvas.height;
  const ctx = canvas.getContext('2d');

  const bg = ctx.createLinearGradient(0, 0, W * 0.5, H);
  bg.addColorStop(0, '#1C2030');
  bg.addColorStop(0.6, '#0C0E16');
  bg.addColorStop(1, '#070810');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  const halo = ctx.createRadialGradient(W*0.5, H*0.45, 0, W*0.5, H*0.45, W*0.7);
  halo.addColorStop(0, 'rgba(120,170,255,0.18)');
  halo.addColorStop(1, 'transparent');
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, W, H);

  // 同心环
  ctx.strokeStyle = 'rgba(160,200,255,0.22)';
  ctx.lineWidth = Math.max(1, W * 0.0022);
  for (const r of [0.40, 0.31, 0.22]){
    ctx.beginPath(); ctx.arc(W*0.5, H*0.45, W*r, 0, Math.PI*2); ctx.stroke();
  }
  drawEmblem(ctx, W*0.5, H*0.45, W*0.30, card.seed + 777, 6, 'rgba(150,190,255,0.75)');

  ctx.font = `600 ${W*0.038}px "PingFang SC","Microsoft YaHei",sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(160,190,255,0.34)';
  ctx.letterSpacing = `${W*0.02}px`;
  ctx.fillText('星 尘', W*0.5, H*0.86);
}

function makeCardTextures(card, maxAniso){
  const W = 768, H = Math.round(W / 0.7143);

  const front = document.createElement('canvas');
  front.width = W; front.height = H;
  drawCardFace(front, card);

  const back = document.createElement('canvas');
  back.width = W; back.height = H;
  drawCardBack(back, card);

  const tf = new THREE.CanvasTexture(front);
  const tb = new THREE.CanvasTexture(back);
  for (const t of [tf, tb]){
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = maxAniso;
    t.needsUpdate = true;
  }
  return { front: tf, back: tb };
}

/** 盒面铭牌：烫金字 */
function makeLabelTexture(title, sub){
  const W = 512, H = 160;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');

  ctx.clearRect(0, 0, W, H);
  const gold = ctx.createLinearGradient(0, 0, 0, H);
  gold.addColorStop(0, '#FFF6D0');
  gold.addColorStop(0.45, '#E8C766');
  gold.addColorStop(1, '#A8801F');

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = gold;
  ctx.font = `700 ${W * 0.155}px "PingFang SC","Microsoft YaHei",sans-serif`;
  ctx.letterSpacing = `${W*0.045}px`;
  ctx.fillText(title, W/2, H * 0.40);

  ctx.globalAlpha = 0.62;
  ctx.fillStyle = '#F7E7A6';
  ctx.font = `500 ${W * 0.052}px "PingFang SC","Microsoft YaHei",sans-serif`;
  ctx.letterSpacing = `${W*0.05}px`;
  ctx.fillText(sub, W/2, H * 0.74);

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/* ───────────────────────── 几何工具 ───────────────────────── */

function roundedRectShape(x, y, w, h, r){
  const s = new THREE.Shape();
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

/** 挤出成型的长方形框（烫金边框） */
function makeFrameGeometry(w, h, border, radius){
  const shape = roundedRectShape(-w/2, -h/2, w, h, radius);
  const hole = roundedRectShape(
    -w/2 + border, -h/2 + border, w - border*2, h - border*2, Math.max(0.002, radius - border*0.6)
  );
  shape.holes.push(hole);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.032, bevelEnabled: true, bevelThickness: 0.010,
    bevelSize: 0.010, bevelSegments: 3, curveSegments: 12,
  });
  geo.center();
  return geo;
}

/* ───────────────────────── 场景 ───────────────────────── */

export function initLobbyBox({ container, card, title, sub, onReady, onFail }){
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch (e){
    onFail && onFail(e);
    return null;
  }
  if (!renderer.getContext()){ onFail && onFail(new Error('no webgl')); return null; }

  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  // 小屏/低 DPR 设备上把像素比压一档，3D 在手机上最容易因为像素比过高掉帧
  const isSmall = Math.min(innerWidth, innerHeight) < 520;
  const maxDPR = isSmall ? 1.5 : 1.75;

  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, maxDPR));
  renderer.setClearAlpha(0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.92;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  // 近乎平视：摄像机与盒身中心同高，避免俯视把底座拉成一条长板
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 60);
  camera.position.set(0, 0.02, 3.95);
  camera.lookAt(0, 0.02, 0);

  /* 环境光照：RoomEnvironment 用代码生成，无需 HDR 文件 */
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const envRT = pmrem.fromScene(new RoomEnvironment(), 0.045);
  scene.environment = envRT.texture;
  // RoomEnvironment 本身就很亮，对亚克力来说会把白色冲爆，压低一档
  scene.environmentIntensity = 0.62;

  /* 补光：冷轮廓光勾边 + 暖侧光给金属加温 + 弱主光 */
  const rim = new THREE.DirectionalLight(0x9fd8ff, 2.4);
  rim.position.set(-3, 3.0, -3.5);
  scene.add(rim);
  const warm = new THREE.PointLight(0xffc879, 9, 7, 2);
  warm.position.set(2.2, -0.5, 2.2);
  scene.add(warm);
  const key = new THREE.DirectionalLight(0xffffff, 0.32);
  key.position.set(2, 4, 4);
  scene.add(key);
  // 底部反光：让底座的金色有东西可反射，不至于发灰
  const bounce = new THREE.PointLight(0xFFE2A8, 4.5, 5, 2);
  bounce.position.set(0, -1.25, 1.5);
  scene.add(bounce);

  /* ── 背景衬板 ── */
  (function backdrop(){
    // 只留一层柔和的径向辉光，不要实心圆盘——实心盘会透过玻璃
    // 在卡面上压出一层抹不掉的灰雾。
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    const rg = g.createRadialGradient(128, 120, 8, 128, 128, 128);
    rg.addColorStop(0,   'rgba(96,150,210,0.22)');
    rg.addColorStop(0.45,'rgba(60,90,140,0.09)');
    rg.addColorStop(1,   'rgba(0,0,0,0)');
    g.fillStyle = rg; g.fillRect(0, 0, 256, 256);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(6, 6),
      new THREE.MeshBasicMaterial({
        map: tex, transparent: true, depthWrite: false,
        toneMapped: false, opacity: 1, blending: THREE.AdditiveBlending,
      })
    );
    mesh.position.set(0, 0.15, -1.5);
    scene.add(mesh);
  })();

  const root = new THREE.Group();
  scene.add(root);

  /* ── 底座：哑光金 ── */
  const goldMat = new THREE.MeshPhysicalMaterial({
    color: 0xC9962B, metalness: 1.0, roughness: 0.22,
    clearcoat: 0.7, clearcoatRoughness: 0.14,
    emissive: 0x3D2A08, emissiveIntensity: 0.55,
    envMapIntensity: 2.1,
  });

  const base = new THREE.Mesh(
    new RoundedBoxGeometry(BASE.w, BASE.h, BASE.d, 4, 0.022), goldMat
  );
  base.position.y = BASE.y;
  root.add(base);

  // 底座上的一圈细金线，制造"机械加工"的分层感
  const lip = new THREE.Mesh(
    new RoundedBoxGeometry(BASE.w - 0.03, 0.014, BASE.d - 0.03, 3, 0.006), goldMat
  );
  lip.position.y = BASE.y + BASE.h / 2 + 0.006;
  root.add(lip);

  /* ── 托盘：半透明亚克力，装卡 ── */
  /* 亚克力不用 transmission（正对相机时会疯狂折射环境，糊成雾），
     也不用 opacity（层一多就叠加成灰壳）。改用"加法混合"：
     只往画面上叠光，永远不遮挡后面任何东西——
     这不只是技巧，它就是亚克力 + 玻璃的真实光学行为。 */
  const acrylicMat = new THREE.MeshPhysicalMaterial({
    color: 0x2E5E82,          // 加法混合下，颜色值直接就是"加多少光"，所以要压得很暗
    metalness: 0.35,
    roughness: 0.06,
    transparent: true,
    opacity: 0.30,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    clearcoat: 1.0,
    clearcoatRoughness: 0.02,
    ior: 1.5,
    envMapIntensity: 0.75,
    specularIntensity: 1,
    side: THREE.FrontSide,
  });

  /* 托盘用更清透的材质：透射率拉满、粗糙度接近 0，
     否则实心块会被环境光染成灰塑料。 */
  const trayMat = new THREE.MeshPhysicalMaterial({
    color: 0x2A5573, metalness: 0.35, roughness: 0.07,
    transparent: true, opacity: 0.34,
    blending: THREE.AdditiveBlending, depthWrite: false,
    clearcoat: 1.0, clearcoatRoughness: 0.02,
    ior: 1.5, envMapIntensity: 0.7,
    specularIntensity: 1, side: THREE.FrontSide,
  });
  const tray = new THREE.Mesh(new RoundedBoxGeometry(TRAY.w, TRAY.h, TRAY.d, 5, 0.026), trayMat);
  tray.position.y = TRAY.y;
  root.add(tray);

  /* 托盘顶部一道金色承托线，把"空盒子"的层次拉开 */
  const trayRim = new THREE.Mesh(
    new RoundedBoxGeometry(TRAY.w - 0.02, 0.012, TRAY.d - 0.02, 3, 0.005), goldMat
  );
  trayRim.position.y = TRAY.y + TRAY.h / 2;
  root.add(trayRim);

  /* ── 卡牌本体 ── */
  const aniso = renderer.capabilities.getMaxAnisotropy();
  const tex = makeCardTextures(card, aniso);

  const edgeMat = new THREE.MeshStandardMaterial({ color: 0x0B0C10, roughness: 0.85, metalness: 0 });
  /* 卡面是「印刷品」，不是被照亮的物体——它靠自身反射进入眼睛。
     用 PBR 材质会让环境光子把黑色区域抬亮，整张卡发灰。
     所以正面/背面直接用 Basic（不吃光照），再叠一层独立的清漆片
     来给"覆膜反光"，这样既保住图案的黑，又有塑料膜的高光。 */
  const faceMat = new THREE.MeshBasicMaterial({ map: tex.front, toneMapped: true });
  const backMat = new THREE.MeshBasicMaterial({ map: tex.back, toneMapped: true });

  const cardMesh = new THREE.Mesh(
    new THREE.BoxGeometry(CARD_W, CARD_H, 0.010),
    [edgeMat, edgeMat, edgeMat, edgeMat, faceMat, backMat]
  );
  cardMesh.position.set(0, CARD_Y + 0.02, -0.075);   // 略微后退，别贴着罩面
  root.add(cardMesh);

  /* 卡面覆膜：贴在卡前方的极薄薄片，只负责反光，不改变图案 */
  const filmMat = new THREE.MeshPhysicalMaterial({
    color: 0xFFFFFF, metalness: 0, roughness: 0.06,
    transparent: true, opacity: 0.22,
    clearcoat: 1.0, clearcoatRoughness: 0.03,
    envMapIntensity: 1.6,
    depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const film = new THREE.Mesh(new THREE.PlaneGeometry(CARD_W, CARD_H), filmMat);
  film.position.set(0, CARD_Y + 0.02, -0.075 + 0.0075);
  root.add(film);

  /* ── 盒盖：大罩子 + 烫金边框 + 铭牌 ── */
  const lidGroup = new THREE.Group();
  root.add(lidGroup);

  const lid = new THREE.Mesh(new RoundedBoxGeometry(LID.w, LID.h, LID.d, 6, 0.034), acrylicMat);
  lid.position.y = LID.y;
  lidGroup.add(lid);

  const frameMat = new THREE.MeshPhysicalMaterial({
    color: 0xE8C766, metalness: 1.0, roughness: 0.22,
    clearcoat: 0.8, clearcoatRoughness: 0.12,
    emissive: 0x3A2606, emissiveIntensity: 0.5,
    envMapIntensity: 1.6,
  });
  const frameGeo = makeFrameGeometry(LID.w - 0.075, LID.h - 0.075, 0.030, 0.040);
  const frame = new THREE.Mesh(frameGeo, frameMat);
  frame.position.set(0, LID.y, LID.d / 2 + 0.004);
  lidGroup.add(frame);

  /* 铭牌贴在罩子下沿——不能放在卡片高度上，否则会和卡面的角色名叠在一起 */
  const labelTex = makeLabelTexture(title, sub);
  const label = new THREE.Mesh(
    new THREE.PlaneGeometry(0.56, 0.175),
    new THREE.MeshBasicMaterial({
      map: labelTex, transparent: true, toneMapped: false,
      depthWrite: false, opacity: 0.95,
    })
  );
  // 卡面下沿在 -0.545 附近，铭牌必须落在它之下、且仍在金框内
  // （金框下沿在 -0.6275），所以可用区间只有约 0.08 高，字号相应压小。
  label.scale.setScalar(0.78);
  label.position.set(0, -0.592, LID.d / 2 + 0.030);
  lidGroup.add(label);

  /* ── 接地阴影 ── */
  (function shadow(){
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    const rg = g.createRadialGradient(128, 128, 4, 128, 128, 126);
    rg.addColorStop(0, 'rgba(0,0,0,0.72)');
    rg.addColorStop(0.45, 'rgba(0,0,0,0.34)');
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rg; g.fillRect(0, 0, 256, 256);
    const tex2 = new THREE.CanvasTexture(c);
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(2.1, 1.0),
      new THREE.MeshBasicMaterial({
        map: tex2, transparent: true, depthWrite: false,
        opacity: 0.55, toneMapped: false,
      })
    );
    m.rotation.x = -Math.PI / 2;
    // 必须沉到底座下方，否则水平面会被相机看成一条粗重的灰带
    m.position.set(0, -0.945, 0.14);
    m.renderOrder = -1;
    scene.add(m);
  })();

  /* ── 浮尘 ── */
  const motes = (function(){
    const N = 54;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++){
      pos[i*3]   = (Math.random() - 0.5) * 3.4;
      pos[i*3+1] = (Math.random() - 0.5) * 2.6;
      pos[i*3+2] = (Math.random() - 0.5) * 2.0 - 0.4;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xFFE7B0, size: 0.022, transparent: true, opacity: 0.42,
      depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
    });
    const p = new THREE.Points(geo, mat);
    scene.add(p);
    return p;
  })();

  /* ───────────────────── 交互与动画 ───────────────────── */

  let pointer = { x: 0, y: 0 };
  let target = { x: 0, y: 0 };
  let isOpen = false;
  let openTL = null;
  let visible = true;
  let clock = new THREE.Clock();
  let idle = 0;

  const onPointerMove = (e) => {
    const r = container.getBoundingClientRect();
    target.x = ((e.clientX - r.left) / r.width - 0.5) * 2;
    target.y = ((e.clientY - r.top) / r.height - 0.5) * 2;
  };
  container.addEventListener('pointermove', onPointerMove);
  container.addEventListener('pointerleave', () => { target.x = 0; target.y = 0; });

  const TILT = reduceMotion ? 0.08 : 0.30;

  function open(){
    if (isOpen || openTL) return;
    isOpen = true;
    if (openTL) openTL.kill();
    openTL = gsap.timeline({ onComplete: () => { openTL = null; } })
      // 盖子上浮、外翻、出画
      .to(lidGroup.position, { y: 1.85, duration: 1.15, ease: 'power3.inOut' }, 0)
      .to(lidGroup.rotation, { x: -0.55, z: 0.16, duration: 1.15, ease: 'power2.inOut' }, 0)
      // 卡片抽出、转向、放大（幅度受控，全程留在画幅内）
      .to(cardMesh.position, { y: 0.24, duration: 0.7, ease: 'power2.out' }, 0.2)
      .to(cardMesh.position, { z: 0.10, duration: 0.9, ease: 'power2.inOut' }, 0.36)
      .to(cardMesh.scale, { x: 0.96, y: 0.96, z: 0.96, duration: 0.9, ease: 'power2.inOut' }, 0.36)
      .to(cardMesh.rotation, { y: 0.26, x: -0.04, duration: 1.0, ease: 'power2.inOut' }, 0.36)
      .to(root.rotation, { z: 0, duration: 0.4 }, 0);
  }

  function close(){
    if (!isOpen || openTL) return;
    isOpen = false;
    if (openTL) openTL.kill();
    openTL = gsap.timeline({ onComplete: () => { openTL = null; } })
      .to(cardMesh.rotation, { y: 0, x: 0, duration: 0.5, ease: 'power2.inOut' }, 0)
      .to(cardMesh.scale, { x: 1, y: 1, z: 1, duration: 0.5, ease: 'power2.inOut' }, 0)
      .to(cardMesh.position, { z: 0, duration: 0.55, ease: 'power2.inOut' }, 0)
      .to(cardMesh.position, { y: 0.11, duration: 0.4, ease: 'power2.inOut' }, 0.28)
      .to(lidGroup.position, { y: 0, duration: 0.9, ease: 'power3.inOut' }, 0.42)
      .to(lidGroup.rotation, { x: 0, z: 0, duration: 0.9, ease: 'power3.inOut' }, 0.42);
  }

  container.addEventListener('click', () => { isOpen ? close() : open(); });
  container.style.cursor = 'pointer';

  /* 视图切换：离开大厅就停渲染 */
  window.__lobby3dPause = (p) => { visible = !p; };

  /* ───────────────────── 渲染循环 ───────────────────── */
  function resize(){
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    renderer.setSize(w, h, false);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    camera.aspect = w / h;
    // 竖屏窄画幅时拉远，保证盒子完整入镜
    const narrow = w / h < 0.95;
    camera.position.z = narrow ? 4.55 : 3.95;
    camera.updateProjectionMatrix();
  }
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(container);

  let raf = 0;
  function tick(){
    raf = requestAnimationFrame(tick);
    if (!visible || document.hidden) return;

    const dt = Math.min(clock.getDelta(), 0.05);
    idle += dt;

    // 指针倾斜（阻尼跟随）。开盒后收窄幅度，避免卡片转出画幅。
    pointer.x += (target.x - pointer.x) * Math.min(1, dt * 6);
    pointer.y += (target.y - pointer.y) * Math.min(1, dt * 6);
    const damp = isOpen ? 0.35 : 1;
    root.rotation.y = pointer.x * TILT * damp;
    root.rotation.x = pointer.y * TILT * 0.7 * damp;

    // 缓慢浮动（开盒时减弱，避免和动画打架）
    const bob = reduceMotion ? 0 : Math.sin(idle * 0.85) * 0.022 * (isOpen ? 0.3 : 1);
    root.position.y = bob;

    // 浮尘缓慢上飘
    if (!reduceMotion){
      const pos = motes.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++){
        let y = pos.getY(i) + dt * 0.055;
        if (y > 1.4) y = -1.4;
        pos.setY(i, y);
      }
      pos.needsUpdate = true;
      motes.rotation.y = Math.sin(idle * 0.12) * 0.1;
    }

    // 暖光轻微游走，让玻璃表面有活的光
    warm.position.x = 2.2 + Math.sin(idle * 0.5) * 0.5;
    warm.position.y = -0.6 + Math.cos(idle * 0.42) * 0.35;

    renderer.render(scene, camera);
  }
  tick();

  /* 首帧渲染完成后再通知外部，避免闪一下白 */
  requestAnimationFrame(() => {
    requestAnimationFrame(() => { if (onReady) onReady(); });
  });

  return {
    open, close,
    _scene: scene, _camera: camera, _renderer: renderer,
    _card: cardMesh, _lid: lidGroup, _tray: tray, _root: root,
    dispose(){
      cancelAnimationFrame(raf);
      ro.disconnect();
      container.removeEventListener('pointermove', onPointerMove);
      scene.traverse(o => {
        if (o.geometry) o.geometry.dispose();
        if (o.material){
          const ms = Array.isArray(o.material) ? o.material : [o.material];
          ms.forEach(m => { if (m.map) m.map.dispose(); m.dispose(); });
        }
      });
      envRT.dispose(); pmrem.dispose(); renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
