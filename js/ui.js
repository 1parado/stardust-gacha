/* ══════════════════════════════════════════════════════════════
   ui.js —— DOM 与交互
   ══════════════════════════════════════════════════════════════ */

import {
  ROSTER, RARITY, TIERS, loadSave, saveTo,
  rollOne, rollMany, commitPull, PITY, EX_CARD, shareSummary,
} from './core.js';
import { createAudio } from './audio.js';
import { cardHTML, attachTilt, wireArt } from './cards.js';
import { gyro } from './gyro.js';
import { createReveal } from './reveal.js';
import { createLightbox } from './lightbox.js';

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

const audio = createAudio();
const storage = (() => { try { return window.localStorage; } catch (e){ return null; } })();
let save = loadSave(storage);

/* ══════════════════════════════════════════════════════════════
   提示
   ══════════════════════════════════════════════════════════════ */
let toastTimer = null;
function toast(msg){
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('on'), 2200);
}

/* ══════════════════════════════════════════════════════════════
   抽卡演出
   ══════════════════════════════════════════════════════════════ */
const reveal = createReveal({ audio, toast });

/* ══════════════════════════════════════════════════════════════
   经济
   ══════════════════════════════════════════════════════════════ */
function persist(){ saveTo(storage, save); }

function updateEconomy(){
  // 演示模式：无限抽卡，不显示钻石、不扣费、按钮永远可用。
  const p = Math.min(save.pity, PITY.hard);
  $('#pityNum').textContent = `${p} / ${PITY.hard}`;
  $('#grooveFill').style.width = (clamp(p / PITY.hard, 0, 1) * 100) + '%';
  $('#groove').classList.toggle('boiling', p >= 62);

  updateStats();
}

/** 战绩条：累计抽数 / 传说数 / 至臻记录 */
function updateStats(){
  $('#statPulls').textContent = save.totalPulls.toLocaleString();
  $('#statCollection').textContent = `${save.owned.length}/${ROSTER.length}`;

  const item = $('#statEX');
  const wrap = item.closest('.stats__item');
  if (save.exRecord){
    wrap.classList.add('got');
    item.textContent = `第 ${save.exRecord.atPull.toLocaleString()} 抽`;
  } else {
    wrap.classList.remove('got');
    item.textContent = '未获得';
  }
}

/** 最新章节：把最好的一张放到展示区 */
function updateFeatured(results){
  if (!results || !results.length) return;
  const best = results.reduce((a, b) =>
    RARITY[b.rarity].tier > RARITY[a.rarity].tier ? b : a, results[0]);
  setFeatured(best);
}

function setFeatured(result){
  const wrap = $('#featured');
  const art  = $('#featuredArt');
  const name = $('#featuredName');
  const label = $('#featuredLabel');
  if (!wrap) return;

  const r = RARITY[result.rarity];
  wrap.classList.remove('empty');
  wrap.classList.toggle('is-ex', result.rarity === 'EX');

  // 有立绘就用立绘；没有就退回徽记的银色底
  art.style.backgroundImage = `url("assets/cards/${result.card.id}.webp")`;
  art.style.opacity = '.92';
  name.textContent = result.card.name;
  label.textContent = `${r.label} · ${r.name}`;
  // 颜色交给 CSS：浅色模式下角色名要用深色，避免内联 #FFF 压过主题
  name.style.color = '';
}

function initFeatured(){
  const wrap = $('#featured');
  if (!wrap) return;
  // 有抽过卡就展示最近得到的；否则显示空状态
  const last = save.owned[save.owned.length - 1];
  if (last && save.totalPulls > 0){
    const card = ROSTER.find(c => c.id === last);
    if (card) setFeatured({ card, rarity: card.rarity });
    return;
  }
  wrap.classList.add('empty');
  $('#featuredName').textContent = '还没抽过卡';
  $('#featuredLabel').textContent = '试试下面的按钮';
}

/* ══════════════════════════════════════════════════════════════
   图鉴
   ══════════════════════════════════════════════════════════════ */
const lightbox = createLightbox({ audio });
const collTiltCleanups = [];
let collRendered = false;

const sortOrder = { EX:5, SSR:4, SR:3, R:2, N:1 };
const sortedRoster = [...ROSTER].sort(
  (a, b) => sortOrder[b.rarity] - sortOrder[a.rarity] || a.seed - b.seed
);

/** 当前已获得、且按图鉴顺序排列的卡（灯箱翻页用这个顺序） */
function ownedInViewOrder(){
  const owned = new Set(save.owned);
  return sortedRoster.filter(c => owned.has(c.id));
}

function openLightboxFor(card){
  const list = ownedInViewOrder();
  const i = list.findIndex(c => c.id === card.id);
  lightbox.open(list, i < 0 ? 0 : i);
}

function bindCollCard(el){
  const card = ROSTER.find(c => c.id === el.dataset.id);
  if (!card) return;
  const locked = el.classList.contains('locked');
  // 锁定卡的卡背要维持 180° 翻转，baseRY 把这一基准角交给倾斜引擎
  collTiltCleanups.push(attachTilt(el, gsap, {
    maxTilt: 10, useGyro: true, baseRY: locked ? 180 : 0,
  }));

  el.addEventListener('click', () => {
    if (locked || !save.owned.includes(card.id)) { audio.fail(); return; }
    openLightboxFor(card);
  });
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' '){
      e.preventDefault();
      if (!locked && save.owned.includes(card.id)) openLightboxFor(card);
    }
  });
}

/** 全量渲染（首次进入图鉴时用） */
function renderCollection(){
  const grid = $('#collGrid');
  collTiltCleanups.forEach(fn => fn());
  collTiltCleanups.length = 0;

  const owned = new Set(save.owned);
  grid.innerHTML = sortedRoster
    .map(c => cardHTML(c, { locked: !owned.has(c.id), showGlare: true }))
    .join('');
  grid.querySelectorAll('.card3d').forEach(wireArt);
  grid.querySelectorAll('.card3d').forEach(bindCollCard);
  $('#collCount').textContent = `${save.owned.length} / ${ROSTER.length}`;
  collRendered = true;
}

/**
 * 增量渲染：只处理这次新解锁的卡。
 * 全量重建 61 张卡 + 61 组监听，在每次抽卡后都跑一遍是纯浪费。
 */
function unlockCards(cards){
  const grid = $('#collGrid');
  let changed = false;
  for (const card of cards){
    if (!changed) changed = true;
    if (!grid) continue;
    const el = grid.querySelector(`.card3d[data-id="${card.id}"]`);
    if (!el || !el.classList.contains('locked')) continue;

    // 就地替换这一张，不动其它 60 张
    const tmp = document.createElement('div');
    tmp.innerHTML = cardHTML(card, { showGlare: true });
    const next = tmp.firstElementChild;
    el.replaceWith(next);
    wireArt(next);
    bindCollCard(next);
  }
  if (changed){
    $('#collCount').textContent = `${save.owned.length} / ${ROSTER.length}`;
  }
}

/* ══════════════════════════════════════════════════════════════
   抽卡入口
   ══════════════════════════════════════════════════════════════ */
function doOne(){
  audio.resume();
  const res = rollOne(save);
  const added = commitPull(save, [res]);
  persist();
  unlockCards(added);

  // 结算即刷新战绩：数字在演出开始前就已更新，不用等"收下"或刷新页面
  updateEconomy();
  updateFeatured([res]);
  reveal.playOne(res, () => {
    if (res.isEx) toast('至臻 · 无相');
  });
}

function doMulti(count){
  audio.resume();
  const results = rollMany(save, count);
  const added = commitPull(save, results);
  persist();
  unlockCards(added);

  // 同上：抽卡结果一落盘就刷新，演出只是展示
  updateEconomy();
  updateFeatured(results);
  reveal.playMany(results, () => {
    const best = results.reduce((a, b) =>
      RARITY[b.rarity].tier > RARITY[a.rarity].tier ? b : a, results[0]);
    if (best && RARITY[best.rarity].tier >= 3){
      toast(`获得 ${RARITY[best.rarity].label} · ${best.card.name}`);
    }
  });
}

/* ══════════════════════════════════════════════════════════════
   分享卡
   ══════════════════════════════════════════════════════════════ */
const SHARE_MODE_KEY = 'stardust.shareMode';
let shareMode = localStorage.getItem(SHARE_MODE_KEY) === 'coll' ? 'coll' : 'ex';

/** 已拥有的卡，按稀有度从高到低排，用于图鉴进度墙 */
function ownedSorted(){
  const set = new Set(save.owned);
  return ROSTER.filter(c => set.has(c.id))
    .sort((a, b) => RARITY[b.rarity].tier - RARITY[a.rarity].tier || a.id.localeCompare(b.id));
}

function renderShare(){
  const s = shareSummary(save);
  const wrap = $('#shareCard');
  if (!wrap) return;

  $$('.share-switch__btn').forEach(b => {
    const on = b.dataset.mode === shareMode;
    b.classList.toggle('on', on);
    b.setAttribute('aria-selected', String(on));
  });
  wrap.dataset.mode = shareMode;
  $('#sharePulls').textContent = s.totalPulls.toLocaleString();
  $('#sharePullsLabel').textContent = '累计抽卡';

  if (shareMode === 'coll'){
    // 图鉴进度：12 格缩略墙 + 已收录 / 还差几张
    const owned = ownedSorted().slice(0, 12);
    $('#shareGrid').innerHTML = Array.from({ length: 12 }, (_, i) => {
      const c = owned[i];
      return c
        ? `<div class="share-cell"><i style="background-image:url('assets/cards/${c.id}.webp')"></i></div>`
        : '<div class="share-cell locked"></div>';
    }).join('');
    wrap.classList.toggle('is-locked', s.collection === 0);
    $('#shareMark').textContent = '图 鉴';
    $('#shareTitle').textContent = `${s.collection}/${s.total}`;
    $('#shareSub').textContent = '已收录图鉴';
    $('#shareExAt').textContent = String(s.total - s.collection);
    $('#shareStat2Label').textContent = '还差几张';
    $('#shareFoot').textContent = `图鉴 ${s.collection}/${s.total} · 星尘抽卡`;
  } else {
    // 至臻时刻：至臻立绘 + 第几次抽到
    const got = s.exOwned;
    wrap.classList.toggle('is-locked', !got);
    $('#shareArt').style.backgroundImage = got ? `url("assets/cards/${EX_CARD.id}.webp")` : '';
    $('#shareMark').textContent = got ? '至 臻' : '未 解 锁';
    $('#shareTitle').textContent = got ? EX_CARD.name : '尚未相遇';
    $('#shareSub').textContent = '至臻 · 无相';
    $('#shareExAt').textContent = got ? `第 ${s.exAtPull.toLocaleString()} 抽` : '—';
    $('#shareStat2Label').textContent = '至臻于第几抽';
    $('#shareFoot').textContent = got
      ? `${s.exDate} · 图鉴 ${s.collection}/${s.total}`
      : `图鉴 ${s.collection}/${s.total} · 继续抽卡解锁至臻`;
  }
}

/* 分享模式切换 */
$$('.share-switch__btn').forEach(b => {
  b.addEventListener('click', () => {
    if (shareMode === b.dataset.mode) return;
    shareMode = b.dataset.mode;
    localStorage.setItem(SHARE_MODE_KEY, shareMode);
    audio.click();
    renderShare();
  });
});

/** Canvas 圆角矩形路径 */
function canvasRoundRect(ctx, x, y, w, h, r){
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** 用 Canvas 画一张竖版分享图并下载 */
async function saveShareImage(){
  const s = shareSummary(save);
  const canvas = document.createElement('canvas');
  canvas.width = 750;
  canvas.height = 1000;
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;

  // 跟随当前主题：浅色模式用浅底 + 淡金光晕，暗色用深炭黑 + 玫红光晕
  const light = document.documentElement.dataset.theme === 'light';
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  if (light){
    bg.addColorStop(0, '#F8FAFD');
    bg.addColorStop(.55, '#EBF0F7');
    bg.addColorStop(1, '#DFE6F0');
  } else {
    bg.addColorStop(0, '#1B0E18');
    bg.addColorStop(.55, '#12060C');
    bg.addColorStop(1, '#080306');
  }
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  const glow = ctx.createRadialGradient(W / 2, H * .18, 0, W / 2, H * .18, W * .72);
  glow.addColorStop(0, light ? 'rgba(180,138,0,.20)' : 'rgba(255,92,138,.30)');
  glow.addColorStop(1, light ? 'rgba(180,138,0,0)' : 'rgba(255,92,138,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  const isColl = shareMode === 'coll';

  if (isColl){
    // 图鉴进度：4×3 缩略墙，只画已拥有的卡，空格留暗纹
    const owned = ownedSorted().slice(0, 12);
    const imgEls = await Promise.all(owned.map(async c => {
      const img = new Image();
      img.src = `assets/cards/${c.id}.webp`;
      try { await img.decode(); return img; } catch (e){ return null; }
    }));
    const gx = 50, gy = 108, gap = 12;
    const cw = (W - gx * 2 - gap * 3) / 4, ch = 138;
    for (let i = 0; i < 12; i++){
      const x = gx + (i % 4) * (cw + gap);
      const y = gy + Math.floor(i / 4) * (ch + gap);
      canvasRoundRect(ctx, x, y, cw, ch, 10);
      ctx.fillStyle = light ? 'rgba(255,255,255,.58)' : 'rgba(255,255,255,.06)';
      ctx.fill();
      ctx.strokeStyle = light ? 'rgba(198,62,110,.24)' : 'rgba(255,92,138,.26)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      const img = imgEls[i];
      if (img){
        ctx.save();
        canvasRoundRect(ctx, x, y, cw, ch, 10);
        ctx.clip();
        const scale = Math.max(cw / img.width, ch / img.height);
        const dw = img.width * scale, dh = img.height * scale;
        ctx.drawImage(img, x + (cw - dw) / 2, y + (ch - dh) / 2, dw, dh);
        ctx.restore();
      }
    }
  } else if (s.exOwned){
    // 至臻立绘：加载失败也只留背景，不影响出图
    const img = new Image();
    img.src = `assets/cards/${EX_CARD.id}.webp`;
    try {
      await img.decode();
      ctx.drawImage(img, 75, 30, 600, 900);
    } catch (e){}
  }

  // 底部渐隐，压住立绘/图鉴墙下半部，保证文字可读
  const veilTop = isColl ? H * .52 : H * .42;
  const veil = ctx.createLinearGradient(0, veilTop, 0, H);
  if (light){
    veil.addColorStop(0, 'rgba(247,249,252,0)');
    veil.addColorStop(.55, 'rgba(247,249,252,.82)');
    veil.addColorStop(1, '#F7F9FC');
  } else {
    veil.addColorStop(0, 'rgba(8,3,6,0)');
    veil.addColorStop(.55, 'rgba(8,3,6,.90)');
    veil.addColorStop(1, '#080306');
  }
  ctx.fillStyle = veil;
  ctx.fillRect(0, veilTop, W, H - veilTop);

  ctx.textAlign = 'center';
  ctx.fillStyle = light ? 'rgba(138,104,0,.74)' : 'rgba(247,231,166,.72)';
  ctx.font = '600 20px system-ui, sans-serif';
  ctx.fillText('S T A R D U S T  ·  星 尘', W / 2, 74);

  const mark = isColl ? '图 鉴' : (s.exOwned ? '至 臻' : '未 解 锁');
  ctx.fillStyle = light ? 'rgba(138,104,0,.74)' : 'rgba(247,231,166,.72)';
  ctx.font = '600 22px system-ui, sans-serif';
  ctx.fillText(mark, W / 2, 620);

  ctx.fillStyle = isColl
    ? (light ? '#1B2230' : '#FFF')
    : (s.exOwned ? (light ? '#C63E6E' : '#FF5C8A') : (light ? 'rgba(27,34,48,.42)' : 'rgba(232,234,237,.5)'));
  ctx.font = '700 76px "Songti SC", "Noto Serif SC", serif';
  ctx.fillText(isColl ? `${s.collection}/${s.total}` : (s.exOwned ? EX_CARD.name : '尚未相遇'), W / 2, 710);

  ctx.fillStyle = light ? 'rgba(27,34,48,.55)' : 'rgba(232,234,237,.55)';
  ctx.font = '400 22px system-ui, sans-serif';
  ctx.fillText(isColl ? '已收录图鉴' : '至臻 · 无相', W / 2, 748);

  ctx.fillStyle = light ? '#1B2230' : '#FFF';
  ctx.font = '700 62px system-ui, sans-serif';
  ctx.fillText(s.totalPulls.toLocaleString(), W * .28, 850);
  ctx.fillText(isColl ? String(s.total - s.collection) : (s.exOwned ? String(s.exAtPull) : '—'), W * .72, 850);

  ctx.fillStyle = light ? 'rgba(27,34,48,.55)' : 'rgba(232,234,237,.48)';
  ctx.font = '400 20px system-ui, sans-serif';
  ctx.fillText('累计抽卡', W * .28, 886);
  ctx.fillText(isColl ? '还差几张' : '至臻于第几抽', W * .72, 886);

  ctx.fillStyle = light ? 'rgba(27,34,48,.45)' : 'rgba(232,234,237,.30)';
  ctx.font = '400 17px system-ui, sans-serif';
  ctx.fillText(isColl ? `图鉴 ${s.collection}/${s.total} · 星尘抽卡` : (s.exOwned ? s.exDate : '分享卡 · 星尘抽卡原型'), W / 2, 954);

  const a = document.createElement('a');
  a.download = isColl
    ? `星尘-图鉴-${s.collection}/${s.total}.png`
    : `星尘-分享卡-${s.totalPulls}抽.png`;
  a.href = canvas.toDataURL('image/png');
  a.click();
  toast('分享卡已保存');
}

/* ══════════════════════════════════════════════════════════════
   视图切换
   ══════════════════════════════════════════════════════════════ */
const viewEls = {
  draw: $('#view-draw'), coll: $('#view-coll'), share: $('#view-share'),
};
let currentView = 'draw';

function switchView(name){
  if (name === currentView) return;
  if (lightbox.isOpen) lightbox.close();
  audio.click();

  const from = viewEls[currentView], to = viewEls[name];
  from.classList.remove('active');
  to.classList.add('active');
  to.classList.remove('enter');
  void to.offsetWidth;
  to.classList.add('enter');

  $$('.tab').forEach(t => {
    const on = t.dataset.view === name;
    t.classList.toggle('on', on);
    t.setAttribute('aria-selected', String(on));
  });

  currentView = name;
  if (name === 'coll' && !collRendered) renderCollection();
  if (name === 'share') renderShare();
}

/* ══════════════════════════════════════════════════════════════
   底部标签栏：弹簧阻尼
   ══════════════════════════════════════════════════════════════ */
const Tabs = (() => {
  const bar  = $('#tabbar');
  const pill = $('#tabpill');
  const tabs = $$('.tab', bar);

  const P = { stiffness: 210, damping: 21, mass: 1 };
  const st = {
    x: { pos: 0, vel: 0, target: 0 },
    w: { pos: 0, vel: 0, target: 0 },
    s: { pos: 1, vel: 0, target: 1 },
  };
  let ready = false;
  let idx = 0;
  let running = false;     // 只在动的时候跑循环
  let rafId = 0;

  function measure(i){
    const el = tabs[i];
    const br = bar.getBoundingClientRect();
    const r  = el.getBoundingClientRect();
    return { x: r.left - br.left, w: r.width };
  }

  function paint(){
    pill.style.width = st.w.pos + 'px';
    pill.style.transform = `translate3d(${st.x.pos}px,0,0) scaleX(${st.s.pos})`;
  }

  function atRest(){
    return Math.abs(st.x.target - st.x.pos) < 0.04 && Math.abs(st.x.vel) < 0.4
        && Math.abs(st.w.target - st.w.pos) < 0.04 && Math.abs(st.w.vel) < 0.4
        && Math.abs(1 - st.s.pos) < 0.0015 && Math.abs(st.s.vel) < 0.02;
  }

  let last = performance.now();
  function step(){
    if (document.hidden){ last = performance.now(); return; }
    const now = performance.now();
    const dt = Math.min((now - last) / 1000, 1 / 30);
    last = now;

    for (const k of ['x', 'w']){
      const o = st[k];
      const accel = (o.target - o.pos) * P.stiffness - o.vel * P.damping;
      o.vel += accel / P.mass * dt;
      o.pos += o.vel * dt;
      if (Math.abs(o.target - o.pos) < 0.04 && Math.abs(o.vel) < 0.4){
        o.pos = o.target; o.vel = 0;
      }
    }

    // 形变是独立弹簧，目标恒为 1 —— 被撑开之后自己弹回去
    const s = st.s;
    const sAccel = (1 - s.pos) * 170 - s.vel * 13;
    s.vel += sAccel * dt;
    s.pos += s.vel * dt;
    if (Math.abs(1 - s.pos) < 0.0015 && Math.abs(s.vel) < 0.02){
      s.pos = 1; s.vel = 0;
    }

    paint();
    if (atRest()) stopLoop();
  }

  /**
   * 只在动的时候跑循环。
   * 空闲时每帧调用 paint() 是白烧电量——尤其这个页面还有另一条
   * 视差循环在跑。
   */
  let fallbackTimer = null;

  function startLoop(){
    if (running) return;
    running = true;
    last = performance.now();

    // 主通道：rAF
    const tick = () => {
      if (!running) return;
      step();
      if (running) rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);

    // 兜底通道：rAF 被冻结时（后台标签页 / 嵌入式 webview）用定时器推进
    fallbackTimer = setInterval(() => {
      if (!running || document.hidden) return;
      if (performance.now() - last > 40) step();
    }, 16);
  }

  function stopLoop(){
    if (!running) return;
    running = false;
    cancelAnimationFrame(rafId);
    if (fallbackTimer){ clearInterval(fallbackTimer); fallbackTimer = null; }
    // 精确落到终态，避免残留半像素的抖动
    st.x.pos = st.x.target;
    st.w.pos = st.w.target;
    st.s.pos = 1;
    st.x.vel = st.w.vel = st.s.vel = 0;
    paint();
  }

  function snapTo(i, animate = false){
    idx = i;
    const m = measure(i);
    if (!animate || !ready){
      st.x.pos = st.x.target = m.x;
      st.w.pos = st.w.target = m.w;
      st.s.pos = 1; st.s.vel = 0;
      st.x.vel = st.w.vel = 0;
      paint();
      return;
    }
    st.x.target = m.x;
    st.w.target = m.w;

    const dist = Math.abs(m.x - st.x.pos);
    st.s.pos = 1 + Math.min(dist / 240, 0.26);
    st.s.vel = 0;
    st.x.vel += (m.x - st.x.pos) * 2.6;

    startLoop();
  }

  tabs.forEach((t, i) => {
    t.addEventListener('click', () => {
      snapTo(i, true);
      const ico = $('.ico', t);
      gsap.fromTo(ico, { scale: 0.72, y: 3 },
        { scale: 1, y: 0, duration: 0.75, ease: 'elastic.out(1, 0.42)' });
      switchView(t.dataset.view);
    });
    t.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); t.click(); }
    });
  });

  window.addEventListener('resize', () => snapTo(idx, false));

  function initPill(){
    snapTo(idx, false);
    ready = true;
  }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(initPill);
  setTimeout(initPill, 60);

  return { snapTo, index: () => idx };
})();

/* ══════════════════════════════════════════════════════════════
   全局事件
   ══════════════════════════════════════════════════════════════ */
/* ── 明暗主题切换 ── */
const THEME_KEY = 'stardust.theme';
const themeBtn = $('#btnTheme');
function applyTheme(light){
  document.documentElement.dataset.theme = light ? 'light' : 'dark';
  themeBtn.textContent = light ? '☾' : '☀';
  const label = light ? '切换到暗色模式' : '切换到浅色模式';
  themeBtn.title = label;
  themeBtn.setAttribute('aria-label', label);
  themeBtn.setAttribute('aria-pressed', String(light));
  try { localStorage.setItem(THEME_KEY, light ? 'light' : 'dark'); } catch (e) {}
}
applyTheme(document.documentElement.dataset.theme === 'light');
themeBtn.addEventListener('click', () => {
  audio.resume();
  audio.click();
  applyTheme(document.documentElement.dataset.theme !== 'light');
});

$('#btnSound').addEventListener('click', () => {
  audio.enabled = !audio.enabled;
  save.sound = audio.enabled;
  persist();
  $('#btnSound').style.opacity = audio.enabled ? 1 : .4;
  $('#btnSound').setAttribute('aria-pressed', String(audio.enabled));
  if (audio.enabled){ audio.resume(); audio.arpeggio(1); }
});

/* ── 体感倾斜：触控设备默认开启，不再提供开关 ──
   iOS 13+ 的权限请求必须发生在用户手势里，首次被拒后
   等第一次触摸/点击再自动重试一次。 */
const forceGyro = new URLSearchParams(location.search).has('gyro');
const touchDevice = matchMedia('(pointer:coarse)').matches || navigator.maxTouchPoints > 0;

async function startGyro(){
  const r = await gyro.enable();
  if (r.ok) return;
  const needsGesture =
    r.reason === 'denied' &&
    typeof DeviceOrientationEvent !== 'undefined' &&
    typeof DeviceOrientationEvent.requestPermission === 'function';
  if (!needsGesture) return;

  const retry = async () => {
    document.removeEventListener('pointerdown', retry);
    await gyro.enable();
  };
  document.addEventListener('pointerdown', retry, { once: true, passive: true });
}
if (gyro.supported && (touchDevice || forceGyro)) startGyro();

$('#btn1').addEventListener('click', doOne);
$('#btn5').addEventListener('click', () => doMulti(5));
$('#btn10').addEventListener('click', () => doMulti(10));
$('#btnSaveShare').addEventListener('click', async () => {
  audio.resume();
  audio.arpeggio(2);
  await saveShareImage();
});

// 烫金按钮的高光跟随
$$('.mat-gold').forEach(el => {
  el.addEventListener('pointermove', (e) => {
    const r = el.getBoundingClientRect();
    el.style.setProperty('--gx', ((e.clientX - r.left) / r.width * 100) + '%');
  });
});

// 首次交互解锁音频
['pointerdown', 'touchstart', 'keydown'].forEach(ev =>
  document.addEventListener(ev, function unlock(){
    audio.init();
    audio.resume();
    document.removeEventListener(ev, unlock);
  }, { once: true })
);

/* 减少动效：交给 reveal 模块自行决定怎么降级，
   不再用 timeScale —— 那只会让动画更快，而不是更少。 */
if (window.matchMedia('(prefers-reduced-motion: reduce)').matches){
  document.documentElement.classList.add('reduced-motion');
}

/* ══════════════════════════════════════════════════════════════
   初始化
   ══════════════════════════════════════════════════════════════ */
audio.enabled = save.sound !== false;
$('#btnSound').style.opacity = audio.enabled ? 1 : .4;
$('#btnSound').setAttribute('aria-pressed', String(audio.enabled));

updateEconomy();
initFeatured();
renderShare();

console.log('%c星尘 v0.4', 'color:#D4AF37;font-weight:700;font-size:14px',
  '\n卡池: ' + ROSTER.length + ' 张',
  '\nN/R/SR/SSR/EX: ' + TIERS.map(k => ROSTER.filter(c => c.rarity === k).length).join('/'));

/* 调试/测试钩子 */
window.__stardust = {
  ROSTER, RARITY, TIERS, EX_CARD, lightbox, Tabs, gyro,
  share: () => shareSummary(save),
  get save(){ return save; },
};
