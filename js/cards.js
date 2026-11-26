/* ══════════════════════════════════════════════════════════════
   cards.js —— 卡面渲染
   几何徽记生成器 + 真实图片接入 + DOM 构造 + 倾斜交互
   ══════════════════════════════════════════════════════════════ */

import { mulberry32, RARITY, ROSTER } from './core.js';
import { gyro } from './gyro.js';

/* ══════════════════════════════════════════════════════════════
   几何徽记 —— 没有真实图片时的角色形象
   ══════════════════════════════════════════════════════════════ */

/**
 * 缓存池。同一张卡会同时出现在舞台、图鉴、灯箱、十连网格里，
 * 每次重拼一遍 SVG 字符串是纯浪费。
 */
const emblemCache = new Map();

export function makeEmblem(seed, arms, color, opts = {}){
  const key = `${seed}|${arms}|${color}`;
  const hit = emblemCache.get(key);
  if (hit) return hit;

  const rnd = mulberry32(seed);
  const S = 200, c = S / 2;
  const inner = opts.inner !== false;

  const blade = (len, w) =>
    `M0 0C${w*0.95} ${-len*0.26} ${w*0.62} ${-len*0.78} 0 ${-len}` +
    `C${-w*0.62} ${-len*0.78} ${-w*0.95} ${-len*0.26} 0 0Z`;

  const outerLen = 82 + rnd() * 12;
  const outerW   = 26 + rnd() * 10;
  const layer2   = 46 + rnd() * 14;

  // 叶片画在局部原点，外层统一 translate(c,c)，旋转只用单参数 rotate(deg)
  const rot = (deg) => `rotate(${deg.toFixed(2)})`;

  let g = "";

  for (let i = 0; i < arms; i++){
    g += `<path d="${blade(outerLen, outerW)}" transform="${rot(i * 360 / arms)}"
           fill="none" stroke="${color}" stroke-width="1.6" opacity="0.92"/>`;
  }
  if (inner){
    for (let i = 0; i < arms; i++){
      g += `<path d="${blade(layer2, outerW * 0.52)}" transform="${rot(i * 360 / arms + 180 / arms)}"
             fill="${color}" fill-opacity="0.09" stroke="${color}" stroke-width="0.9" opacity="0.65"/>`;
    }
  }
  g += `<circle r="${(outerLen * 0.94).toFixed(1)}" fill="none" stroke="${color}" stroke-width="0.9" opacity="0.34"
         stroke-dasharray="${arms % 2 === 0 ? '2 6' : 'none'}"/>`;
  for (let i = 0; i < arms; i++){
    const a = (i * 360 / arms - 90) * Math.PI / 180;
    const x = Math.cos(a) * (outerLen + 13);
    const y = Math.sin(a) * (outerLen + 13);
    g += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(1.6 + rnd() * 1.4).toFixed(1)}"
           fill="${color}" opacity="0.85"/>`;
  }
  g += `<circle r="${(8 + rnd() * 3).toFixed(1)}" fill="none" stroke="${color}" stroke-width="1.4" opacity="0.9"/>`;
  g += `<circle r="2.4" fill="${color}"/>`;
  g += `<circle r="${(outerLen * 0.42).toFixed(1)}" fill="none" stroke="${color}" stroke-width="0.5" opacity="0.28"/>`;

  const svg = `<svg class="emblem card-emblem" viewBox="0 0 ${S} ${S}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <g transform="translate(${c} ${c})">${g}</g>
  </svg>`;

  emblemCache.set(key, svg);
  return svg;
}

/* ══════════════════════════════════════════════════════════════
   真实图片
   ──────────────────────────────────────────────────────────────
   约定：把立绘放在 assets/cards/<cardId>.webp（或 .png / .jpg / .avif）。
   优先用 <picture> 让浏览器按格式挑一个，加载失败就退回几何徽记。
   不需要改代码，也不需要在数据里登记。
   ══════════════════════════════════════════════════════════════ */
const ART_EXTS = ['webp', 'avif', 'png', 'jpg'];

/** 已确认可用的图片路径，避免每次渲染都重新探测 */
const artOk = new Map();
/** 已确认缺失的卡，不再重复探测（否则图鉴每帧都在发 404） */
const artMissing = new Set();

/* 启动时把卡图预热进 HTTP 缓存：抽卡的卡是随机的，等到翻牌那一刻才
   发请求，网络稍慢就会「先徽记、几秒后才冒出立绘」。空闲时分批预取，
   之后 wireArt / background-image 都能命中缓存，翻牌即见立绘。 */
let preloadStarted = false;
export function preloadArt(){
  if (preloadStarted) return;
  preloadStarted = true;
  const ids = ROSTER.map(c => c.id);
  const run = () => {
    const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 120));
    let i = 0;
    const batch = () => {
      // 每批只发 6 张，避免一瞬间 61 个请求抢占翻牌演出的带宽
      for (let n = 0; n < 6 && i < ids.length; i++, n++){
        const id = ids[i];
        if (artOk.has(id) || artMissing.has(id)) continue;
        const img = new Image();
        img.onload = () => artOk.set(id, true);
        img.onerror = () => artMissing.add(id);
        img.src = `assets/cards/${id}.webp`;
      }
      if (i < ids.length) idle(batch, { timeout: 1500 });
    };
    idle(batch, { timeout: 1500 });
  };
  // 首屏先画出来，再预热，避免和首屏渲染抢主线程
  if (document.readyState === 'complete') run();
  else window.addEventListener('load', run, { once: true });
}

export function artCandidates(card){
  return ART_EXTS.map(ext => `assets/cards/${card.id}.${ext}`);
}

/**
 * 真实图片层。
 * 不用 <picture> 的多 <source>：浏览器只会挑第一个"它支持的类型"，
 * 而 .avif 在所有现代浏览器里都"支持"——于是永远选中那个不存在的文件，
 * 后面的 png 兜底根本轮不到（实测如此）。
 * 改成单个 <img>，路径由运行时探测决定。
 */
function artLayer(card){
  const id = card.id;
  if (artMissing.has(id)) return '';
  return `<div class="card-art" data-art="${id}">
    <img alt="" decoding="async">
  </div>`;
}

/**
 * 挂载图片层：按 webp → avif → png → jpg 顺序探测，
 * 第一个能解码成功的就用它；全失败则永久标记缺失，不再重试。
 */
export function wireArt(root){
  const layer = root.querySelector('.card-art');
  if (!layer) return;
  const img = layer.querySelector('img');
  if (!img) return;

  const id = root.dataset.id;
  if (artMissing.has(id)) return;

  // 已预热：缓存命中，直接挂上并点亮，省掉一次 load 事件往返
  if (artOk.has(id)){
    img.src = `assets/cards/${id}.webp`;
    layer.classList.add('ok');
    root.classList.add('has-art');
    return;
  }

  let i = 0;
  let settled = false;

  // 每次换源都重新绑一次 once 监听，避免监听器堆叠
  const attach = () => {
    img.addEventListener('load', onLoad, { once: true });
    img.addEventListener('error', onError, { once: true });
  };
  const onLoad = () => {
    if (settled) return;
    if (img.naturalWidth > 0){
      settled = true;
      layer.classList.add('ok');
      root.classList.add('has-art');
      artOk.set(id, true);
    } else {
      next();
    }
  };
  const onError = () => {
    if (settled) return;
    next();
  };
  const next = () => {
    if (settled) return;
    if (i >= ART_EXTS.length){
      settled = true;
      artMissing.add(id);
      layer.classList.add('miss');
      root.classList.remove('has-art');
      return;
    }
    // 先绑定再改 src：改 src 可能同步触发 load/error，
    // 反过来就会漏掉一次回调
    attach();
    img.src = `assets/cards/${id}.${ART_EXTS[i++]}`;
  };

  next();
}

/* ══════════════════════════════════════════════════════════════
   DOM 构造
   ══════════════════════════════════════════════════════════════ */
const orderOf = (() => {
  const idx = new Map(ROSTER.map((c, i) => [c.id, i + 1]));
  return (card) => String(idx.get(card.id) ?? 0).padStart(3, '0');
})();

export function cardHTML(card, { locked = false, showGlare = false } = {}){
  const r = RARITY[card.rarity];
  const emblem = makeEmblem(card.seed, card.arms, `var(${r.colorVar})`);
  const backEmblem = makeEmblem(card.seed + 777, 6, 'rgba(150,190,255,.8)');
  const isHolo = card.rarity === 'SSR' || card.rarity === 'EX';

  return `
  <div class="card3d ${r.cls} ${locked ? 'locked' : ''}" data-id="${card.id}"
       style="--rc:var(${r.colorVar})" role="button" tabindex="${locked ? -1 : 0}"
       aria-label="${card.name} · ${r.label}${locked ? ' · 未获得' : ''}">
    <div class="card3d__inner">
      <div class="card3d__face face-back card3d__back">
        <div class="back-ring"></div>
        ${backEmblem}
      </div>
      <div class="card3d__face card3d__front face-front">
        ${isHolo ? '<div class="holo"></div>' : ''}
        ${locked ? '' : artLayer(card)}
        <div class="sheen"></div>
        <div class="face-inner">${emblem}</div>
        <div class="card-rarity" style="color:var(${r.colorVar})">${r.label}</div>
        <div class="card-name">${card.name}</div>
        <div class="card-no">NO.${orderOf(card)}</div>
        <div class="frame"></div>
        ${showGlare ? '<div class="glare"></div>' : ''}
        ${locked ? '<div class="lock" aria-hidden="true">🔒</div>' : ''}
      </div>
    </div>
  </div>`;
}

/* ══════════════════════════════════════════════════════════════
   指针倾斜
   ══════════════════════════════════════════════════════════════ */
export function attachTilt(root, gsap, {
  maxTilt = 12, glare = true, baseRY = 0, useGyro = false,
} = {}){
  const inner = root.querySelector('.card3d__inner');
  const face  = root.querySelector('.face-front');
  if (!inner) return () => {};

  const g = glare ? root.querySelector('.glare') : null;
  const rxTo = gsap.quickTo(inner, 'rotationX', { duration: 0.45, ease: 'power2.out' });
  const ryTo = gsap.quickTo(inner, 'rotationY', { duration: 0.45, ease: 'power2.out' });

  /** nx/ny ∈ [-1,1]。baseRY 让卡背（锁定卡）保持 180° 翻转不被覆盖 */
  function apply(nx, ny, withGlare){
    ryTo(baseRY + nx * maxTilt);
    rxTo(-ny * maxTilt);
    if (face){
      face.style.setProperty('--mx', ((nx * .5 + .5) * 100) + '%');
      face.style.setProperty('--my', ((ny * .5 + .5) * 100) + '%');
      face.style.setProperty('--px', (nx * 30) + 'deg');
    }
    if (g) g.style.opacity = withGlare ? '1' : '0';
  }
  const reset = () => apply(0, 0, false);

  /* ── 指针 ── */
  const onMove = (e) => {
    if (gyro.enabled) return;              // 体感开启时指针让位
    const r = root.getBoundingClientRect();
    apply((e.clientX - r.left) / r.width * 2 - 1,
          (e.clientY - r.top) / r.height * 2 - 1, true);
  };
  const onLeave = () => { if (!gyro.enabled) reset(); };
  root.addEventListener('pointermove', onMove);
  root.addEventListener('pointerleave', onLeave);

  /* ── 陀螺仪 ──
     每张卡各自订阅同一份广播；离屏卡片跳过，避免 61 张卡白算 */
  let visible = true;
  let io = null;
  let offTilt = null;
  let offStatus = null;

  if (useGyro && gyro.supported &&
      !matchMedia('(prefers-reduced-motion: reduce)').matches){
    if ('IntersectionObserver' in window){
      io = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; });
      io.observe(root);
    }
    offTilt = gyro.subscribe(({ x, y }) => {
      if (!gyro.enabled) return;
      if (visible) apply(x, y, true);
    });
    // 刚挂载时立刻跟上当前姿态（灯箱打开、图鉴首次渲染都受益）
    if (gyro.enabled && visible) apply(gyro.tilt.x, gyro.tilt.y, true);
    // 关闭体感时立即回正，不等下一次 pointerleave
    offStatus = gyro.onStatus((status) => { if (status !== 'active') reset(); });
  }

  return () => {
    root.removeEventListener('pointermove', onMove);
    root.removeEventListener('pointerleave', onLeave);
    if (io) io.disconnect();
    if (offTilt) offTilt();
    if (offStatus) offStatus();
  };
}
