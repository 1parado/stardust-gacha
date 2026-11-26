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

/* ── CDN 加速 ──────────────────────────────────────────────────
   图片与页面同源托管在 GitHub Pages，但 github.io 在国内访问慢且
   不稳定。jsDelivr 有国内节点，对"其他人"访问快得多。
   只在部署域名下用 CDN；本地开发仍走相对路径，避免调试时反而变慢。
   jsdelivr 返回 ACAO:*，Canvas 导出需给 img 设 crossOrigin。 */
const CDN_BASE = 'https://cdn.jsdelivr.net/gh/1parado/stardust-gacha@main/';
const USE_CDN = location.hostname === '1parado.github.io';
export const usingCDN = USE_CDN;

/** 卡图地址：部署走 CDN，本地走同源。ext 缺省 webp。 */
export function imageUrl(id, ext = 'webp'){
  const p = `assets/cards/${id}.${ext}`;
  return USE_CDN ? CDN_BASE + p : p;
}

/* ── 图片加载状态 ──────────────────────────────────────────────
   同一张卡会在舞台、图鉴、结果页、灯箱里反复出现。共享缓存保证
   「只探测一次、命中即同步点亮」；偶发失败不永久封杀，下一次调用
   会重试。之前用 artMissing 永久封杀：一次 load 失败就让这张卡
   永远退回几何徽记——这正是「有时抽出来没图」的根因。 */
const artUrl = new Map();     // id -> 已确认可渲染的图片路径
const artPending = new Map(); // id -> 正在进行的探测 Promise

/** 加载并解码单张图，返回路径；失败 reject */
function loadOne(src){
  return new Promise((resolve, reject) => {
    const img = new Image();
    // 跨域图要进 Canvas（分享卡导出）必须声明 anonymous，
    // 否则画布被污染，toDataURL 抛 SecurityError
    if (USE_CDN) img.crossOrigin = 'anonymous';
    const ok = () => {
      // decode() 保证这张图真的能画出来，避免 load 成功却空白
      if (img.decode) img.decode().then(() => resolve(src), reject);
      else resolve(src);
    };
    img.onload = ok;
    img.onerror = reject;
    img.src = src;
    // 缓存命中时 onload 可能已经错过
    if (img.complete && img.naturalWidth > 0) ok();
  });
}

/** 按 webp → avif → png → jpg 探测，返回第一个能解码的路径。
    CDN 不可用（网络/未同步）时整套格式回退到同源本地路径。 */
async function probeArt(id){
  for (const ext of ART_EXTS){
    try { return await loadOne(imageUrl(id, ext)); }
    catch (e){ /* 换下一个格式 */ }
  }
  // CDN 整体失败：退回同源（部署在 github.io 时本地路径仍可用）
  if (USE_CDN){
    for (const ext of ART_EXTS){
      try { return await loadOne(`assets/cards/${id}.${ext}`); }
      catch (e){ /* 下一个 */ }
    }
  }
  return null;
}

/** 确保某张卡的图片就绪。同一 id 共享一次请求，成功后永久缓存 */
export function ensureArt(id){
  if (!id) return Promise.resolve(null);
  if (artUrl.has(id)) return Promise.resolve(artUrl.get(id));
  const pending = artPending.get(id);
  if (pending) return pending;
  const p = probeArt(id).then((url) => {
    artPending.delete(id);
    if (url) artUrl.set(id, url);
    return url;
  });
  artPending.set(id, p);
  return p;
}

/* 启动时把卡图预热进 HTTP 缓存：抽卡的卡是随机的，等到翻牌那一刻才
   发请求，网络稍慢就会「先徽记、几秒后才冒出立绘」。空闲时分批预取，
   之后 wireArt 就能命中缓存，翻牌即见立绘。 */
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
      for (let n = 0; n < 6 && i < ids.length; i++, n++) ensureArt(ids[i]);
      if (i < ids.length) idle(batch, { timeout: 1500 });
    };
    idle(batch, { timeout: 1500 });
  };
  // 首屏先画出来，再预热，避免和首屏渲染抢主线程
  if (document.readyState === 'complete') run();
  else window.addEventListener('load', run, { once: true });
}

export function artCandidates(card){
  return ART_EXTS.map(ext => imageUrl(card.id, ext));
}

/**
 * 真实图片层。
 * 不用 <picture> 的多 <source>：浏览器只会挑第一个「它支持的类型」，
 * 而 .avif 在所有现代浏览器里都「支持」——于是永远选中那个不存在的文件，
 * 后面的 png 兜底根本轮不到（实测如此）。改成单个 <img>，路径由运行时决定。
 * 这里始终渲染图片层：加载失败时不会加 has-art，自然退回几何徽记。
 */
function artLayer(card){
  return `<div class="card-art" data-art="${card.id}">
    <img alt="" decoding="async">
  </div>`;
}

/**
 * 挂载图片层：命中共享缓存就同步点亮（结果页重建 DOM 时不会空一帧），
 * 否则等探测完成后点亮。探测失败不永久封杀，下次调用会重试。
 */
export function wireArt(root){
  const layer = root.querySelector('.card-art');
  if (!layer) return;
  const img = layer.querySelector('img');
  if (!img) return;
  const id = root.dataset.id;
  if (!id) return;

  const light = (url) => {
    if (!url) return;
    img.src = url;
    layer.classList.add('ok');
    root.classList.add('has-art');
  };

  if (artUrl.has(id)){ light(artUrl.get(id)); return; }
  ensureArt(id).then(light);
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
