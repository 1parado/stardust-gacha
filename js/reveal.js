/* ══════════════════════════════════════════════════════════════
   reveal.js —— 开卡演出（8 秒分镜）
   严格按策划案 §6 的时间轴实现。
   ══════════════════════════════════════════════════════════════ */

import { RARITY } from './core.js';
import { cardHTML, wireArt } from './cards.js';

const ORDER = { EX:5, SSR:4, SR:3, R:2, N:1 };
export const orderOf = (r) => ORDER[r] || 0;

/** 减少动效：整段演出压缩到几个关键帧，而不是把时间轴加速 */
const reduceMotion = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function createReveal({ audio, toast }){
  const el = {
    stage:     document.querySelector('#stage'),
    cardHost:  document.querySelector('#stageCard'),
    info:      document.querySelector('#stageInfo'),
    vignette:  document.querySelector('#vignette'),
    beam:      document.querySelector('#beam'),
    table:     document.querySelector('#table'),
    skip:      document.querySelector('#skip'),
    dust:      document.querySelector('#stardust'),
    name:      document.querySelector('#stageName'),
    rar:       document.querySelector('#stageRar'),
    tap:       document.querySelector('#stageTap'),
  };
  const { stage, cardHost, info, vignette, beam, table, skip, dust, name, rar, tap } = el;

  let tl = null;
  let looping = [];             // 无限循环的补间，必须单独回收
  let extras = [];              // 舞台上的临时节点
  let canSkip = false;
  /** 演出彻底结束（含收尾淡出）后调用 */
  let onFinished = null;
  /** 跳过解锁的兜底定时器（rAF 冻结时不依赖时间轴） */
  let skipUnlockTimer = null;

  const addExtra = (node) => { extras.push(node); stage.appendChild(node); return node; };
  const killLooping = () => { looping.forEach(t => t && t.kill()); looping = []; };

  function clearExtras(){
    extras.forEach(n => { gsap.killTweensOf(n); n.remove(); });
    extras = [];
  }

  function clearStage(){
    if (skipUnlockTimer){ clearTimeout(skipUnlockTimer); skipUnlockTimer = null; }
    if (tl){ tl.kill(); tl = null; }
    killLooping();
    gsap.killTweensOf([stage, cardHost, info, vignette, beam, table, dust, skip, tap]);
    gsap.globalTimeline.timeScale(1);
    stage.classList.remove('on', 'invert', 'ex-glow');
    document.body.classList.remove('shaking');
    clearExtras();
    cardHost.innerHTML = '';
    // 退场动画会把 cardHost 淡出到 0；若不重置，下一次抽卡卡片容器仍是透明的
    cardHost.style.opacity = 1;
    dust.innerHTML = '';
    stage.style.background = 'rgba(4,5,7,0)';
    vignette.style.opacity = 0;
    beam.style.opacity = 0;
    beam.style.height = '0px';
    table.style.opacity = 0;
    info.style.opacity = 0;
    skip.style.opacity = 0;
    skip.style.pointerEvents = 'none';
    canSkip = false;
    audio.stopDrone();
    audio.cancelSilence();
  }

  /* ── 星尘 ── */
  function spawnSparks(n, colors, size){
    dust.innerHTML = '';
    const cx = innerWidth / 2, cy = innerHeight / 2;
    for (let i = 0; i < n; i++){
      const s = document.createElement('div');
      s.className = 'spark';
      s.style.left = cx + 'px';
      s.style.top  = cy + 'px';
      s.style.width = s.style.height = (size * (0.5 + Math.random())) + 'px';
      s.style.background = colors[i % colors.length];
      dust.appendChild(s);
    }
    return Array.from(dust.querySelectorAll('.spark'));
  }

  /* ══════════════════════════════════════════════════════════════
     单抽：8 秒分镜
     ══════════════════════════════════════════════════════════════ */
  function playOne(result, done){
    clearStage();
    onFinished = done || null;
    stage.classList.add('on');

    cardHost.innerHTML = cardHTML(result.card);
    const cardRoot = cardHost.querySelector('.card3d');
    wireArt(cardRoot);
    const inner    = cardHost.querySelector('.card3d__inner');
    const sheen    = cardHost.querySelector('.sheen');
    const holo     = cardHost.querySelector('.holo');
    const backFace = cardHost.querySelector('.card3d__back');

    gsap.set(cardRoot, { x: 0, y: 0, scale: 1, opacity: 0, rotationY: 0 });
    gsap.set(inner, { rotationY: 180 });     // 起点：卡背朝向观众
    if (holo) gsap.set(holo, { opacity: 0 });
    gsap.set(sheen, { xPercent: -130 });

    const rarKey = result.rarity;
    const isEX  = rarKey === 'EX';
    const isSSR = rarKey === 'SSR' || isEX;
    const isSR  = rarKey === 'SR';
    const fast  = reduceMotion();

    gsap.to(stage, { duration: 0.3, backgroundColor: 'rgba(4,5,7,1)' });
    audio.startDrone();

    /* ── 减少动效：跳过全部演出，直接展示结果 ── */
    if (fast){
      gsap.set(cardRoot, { opacity: 1, y: 0, scale: 1 });
      gsap.set(inner, { rotationY: 0 });
      if (holo) gsap.set(holo, { opacity: .45 });
      gsap.set(vignette, { opacity: .85 });
      gsap.set(table, { opacity: 1 });
      gsap.set(info, { opacity: 1 });
      fillInfo(result);
      canSkip = true;
      skip.style.opacity = 0;
      skip.style.pointerEvents = 'none';
      return;
    }

    tl = gsap.timeline({
      paused: true,
      onComplete: () => {
        // 演出播完后仍必须能点任意处关闭：canSkip 保持 true，
        // 只把「跳过」按钮收起即可（定格帧靠 tap 提示继续）
        skip.style.opacity = 0;
        skip.style.pointerEvents = 'none';
        gsap.killTweensOf(skip);
        looping.push(gsap.to(tap, { duration: .5, opacity: .55, repeat: -1, yoyo: true }));
      },
    });

    /* 0.0–0.8 起飞 */
    tl.fromTo(cardRoot,
      { y: 340, scale: 0.55, opacity: 0 },
      { y: 0, scale: 1, opacity: 1, duration: 0.8, ease: 'power3.out' }, 0);
    tl.to(vignette, { opacity: isSSR ? .85 : .55, duration: 0.8 }, 0);
    tl.call(() => audio.thud(), null, 0.02);

    /* 0.8–1.5 蓄势 */
    tl.to(cardRoot, { scale: 1.08, duration: 0.7, ease: 'power2.inOut' }, 0.8);
    tl.call(() => audio.heartbeat(), null, 0.85);

    /* 1.5–2.2 预兆 */
    if (isEX){
      /* 至臻：万分之一。整段演出比 SSR 长，且从头到尾只有它一个颜色。 */
      tl.call(() => {
        cardHost.classList.add('shaking');
        audio.arpeggio(7);
        stage.classList.add('ex-glow');
      }, null, 1.5);
      // 三道光柱，交错旋转
      tl.to(beam, { opacity: 1, height: '170vh', duration: 0.6, ease: 'power2.out' }, 1.5);
      tl.fromTo(beam, { rotate: 0 }, { rotate: 360, duration: 2.2, ease: 'none' }, 1.5);
      tl.to(beam, { filter: 'hue-rotate(40deg)', duration: 2.2, ease: 'none' }, 1.5);
      tl.call(() => cardHost.classList.remove('shaking'), null, 2.25);
      tl.to(backFace, { filter: 'brightness(2.4) saturate(1.8)', duration: 0.45, yoyo: true, repeat: 1 }, 1.5);
      // 卡背纹章由内向外炸开
      tl.fromTo(backFace,
        { scale: 1 },
        { scale: 1.12, duration: 0.75, ease: 'power2.out', yoyo: true, repeat: 1 }, 1.5);
    } else if (isSSR){
      tl.call(() => {
        cardHost.classList.add('shaking');
        audio.arpeggio(2);
      }, null, 1.5);
      tl.to(beam, { opacity: 1, height: '150vh', duration: 0.55, ease: 'power2.out' }, 1.5);
      tl.fromTo(beam, { rotate: 0 }, { rotate: 180, duration: 1.4, ease: 'none' }, 1.5);
      tl.call(() => cardHost.classList.remove('shaking'), null, 2.1);
      tl.to(backFace, { filter: 'brightness(1.9)', duration: 0.35, yoyo: true, repeat: 1 }, 1.5);
    } else if (isSR){
      tl.call(() => audio.arpeggio(1), null, 1.55);
      tl.fromTo(beam,
        { opacity: 0, height: '0px' },
        { opacity: .85, height: '90vh', duration: 0.5, ease: 'power2.out' }, 1.5);
      tl.to(beam, { rotate: 180, duration: 0.9, ease: 'power1.inOut' }, 1.5);
      tl.to(backFace, { filter: 'brightness(1.45)', duration: 0.3, yoyo: true, repeat: 1 }, 1.6);
    } else if (rarKey === 'R'){
      tl.to(backFace, { filter: 'brightness(1.5)', duration: 0.4, yoyo: true, repeat: 1 }, 1.55);
      tl.call(() => audio.tone(880, .2, { type:'sine', gain:.06 }), null, 1.6);
    }

    /* 2.2–2.6 翻转 */
    tl.call(() => { canSkip = false; audio.ding(); }, null, 2.2);
    tl.to(inner, { rotationY: 0, duration: 0.55, ease: 'power3.inOut' }, 2.2);
    tl.to(cardRoot, { scale: 1.0, duration: 0.55, ease: 'power2.out' }, 2.2);
    tl.to(beam, { opacity: 0, height: '0px', duration: 0.4 }, 2.35);

    /* 2.6–3.4 显形 */
    tl.to(sheen, { xPercent: 130, duration: 0.85, ease: 'power2.inOut' }, 2.6);
    tl.call(() => {
      if (rarKey === 'SSR') audio.arpeggio(5);
      else if (rarKey === 'SR') audio.arpeggio(3);
      else if (rarKey === 'R') audio.arpeggio(1);
    }, null, 2.65);

    if (isSSR && holo){
      tl.to(holo, { opacity: isEX ? .78 : .5, duration: 0.7 }, 2.6);
      // 缓转挂在主时间轴之外：repeat:-1 会把时间轴撑成无限，
      // onComplete 也就不再触发
      tl.call(() => {
        looping.push(gsap.to(holo, { '--ha': 360, duration: 9, ease: 'none', repeat: -1 }));
      }, null, 2.6);
    }

    /* 3.4–5.0 定格 + 星尘 */
    const sparkColors =
      isEX             ? ['#FF8FB0', '#FFD1DF', '#FF5C8A'] :
      isSSR            ? ['#FFF3C4', '#FFD97A', '#7FE7FF'] :
      isSR             ? ['#FFD08A', '#FFB347'] :
                         ['#C9CDD4'];
    const sparks = spawnSparks(RARITY[rarKey].sparks, sparkColors, rarKey === 'N' ? 3 : 5);

    if (sparks.length){
      // 关键修复：初始状态必须由时间轴在 3.4s 设置，
      // 否则 40 颗亮点会在起飞阶段就静止停在屏幕正中。
      tl.set(sparks, { x: 0, y: 0, opacity: 1, scale: 1 }, 3.4);
      tl.to(sparks, {
        duration: 1.4,
        x: () => (Math.random() - 0.5) * 560,
        y: () => (Math.random() - 0.9) * 520,
        scale: () => 0.3 + Math.random(),
        ease: 'power2.out',
        stagger: 0.012,
        onComplete: () => {
          gsap.to(sparks, { opacity: 0, duration: 0.7, ease: 'power1.in' });
        },
      }, 3.4);
    }

    tl.call(() => {
      looping.push(gsap.to(cardRoot, { y: -10, duration: 1.6, ease: 'sine.inOut', yoyo: true, repeat: -1 }));
    }, null, 3.4);
    tl.to(table, { opacity: 1, duration: 0.8 }, 3.3);
    tl.to(vignette, { opacity: isSSR ? .92 : .7, duration: 1 }, 3.4);

    /* 5.0–8.0 停留 */
    tl.to(info, { opacity: 1, y: 0, duration: 0.6, ease: 'power2.out' }, 5.0);
    fillInfo(result);

    tl.call(() => {
      canSkip = true;
      skip.style.opacity = .65;
      skip.style.pointerEvents = 'auto';
      looping.push(gsap.to(skip, { opacity: .35, duration: 1.2, yoyo: true, repeat: -1 }));
    }, null, 2.75);
    tl.to({}, { duration: 0.01 }, 8.0);

    tl.play();

    /* 兜底：如果帧循环被冻结，时间轴不会推进，canSkip 永远是 false，
       玩家会被永久锁在抽卡界面里出不去。
       到点后无条件放开——动画没播完也得让人能走。 */
    skipUnlockTimer = setTimeout(() => {
      canSkip = true;
      skip.style.opacity = .65;
      skip.style.pointerEvents = 'auto';
    }, 2800);
  }

  function fillInfo(result){
    const r = RARITY[result.rarity];
    name.textContent = result.card.name;
    name.style.color =
      result.rarity === 'EX'  ? 'var(--ex)' :
      result.rarity === 'SSR' ? 'var(--gold-1)' :
      'var(--hi)';
    rar.textContent = `${r.label} · ${r.name}`;
    rar.style.color = `var(${r.colorVar})`;
  }

  /* ── 收尾 ── */
  function finishStage(runAfter){
    if (!onFinished && !runAfter) return;
    const cb = runAfter || onFinished;
    onFinished = null;
    canSkip = false;
    if (tl){ tl.kill(); tl = null; }

    /* 退场也用时间轴，但必须有兜底：
       rAF 被冻结时 GSAP 不会推进，舞台就永远关不掉，
       玩家会卡在抽卡界面出不来——这比动画丢失严重得多。 */
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      clearStage();
      if (cb) cb();
    };
    gsap.timeline({ onComplete: done })
      .to([info, cardHost, beam, table], { opacity: 0, duration: .3, ease: 'power2.in' }, 0)
      .to(stage, { backgroundColor: 'rgba(4,5,7,0)', duration: .4 }, .15);
    setTimeout(done, 520);
  }

  /* ══════════════════════════════════════════════════════════════
     多连（五连 / 十连）
     关键设计：整批结果先算好，演出只负责播。
     "演出结束"和"结算"是两个独立回调，不能互相覆盖。
     ══════════════════════════════════════════════════════════════ */
  function playMany(results, onDone){
    clearStage();
    onFinished = onDone || null;
    stage.classList.add('on');
    gsap.to(stage, { duration: 0.3, backgroundColor: 'rgba(4,5,7,1)' });
    gsap.to(vignette, { opacity: .75, duration: 0.5 });

    if (reduceMotion()){ showSummary(results); return; }

    const box = document.createElement('div');
    box.className = 'card3d';
    box.style.cssText = '--w:180px;position:absolute;left:50%;top:50%;margin-left:-90px;margin-top:-126px;z-index:9';
    box.innerHTML = `
      <div class="card3d__inner">
        <div class="card3d__face face-back" style="transform:rotateY(0deg)">
          <div class="back-ring"></div>
          <svg class="emblem card-emblem" viewBox="0 0 200 200" aria-hidden="true"></svg>
        </div>
      </div>`;
    addExtra(box);

    let started = false;
    const startGrid = () => {
      if (started) return;
      started = true;
      box.remove();
      showGrid(results);
    };

    tl = gsap.timeline({ onComplete: startGrid });
    tl.call(() => audio.thud(), null, 0);
    tl.fromTo(box, { y: 200, scale: .5, opacity: 0, rotationY: -90 },
      { y: 0, scale: 1, opacity: 1, rotationY: 0, duration: 0.7, ease: 'power3.out' }, 0);
    tl.to(box, { scale: 1.15, duration: 0.4, ease: 'power2.in' }, 0.75);
    tl.call(() => { audio.ding(); burst(); }, null, 1.1);
    tl.to(box, { scale: 0, opacity: 0, rotationY: 180, duration: 0.35, ease: 'power2.in' }, 1.1);

    // 兜底：rAF 冻结时时间轴不推进，网格永远不会出现，
    // 玩家会卡在一个空白舞台上
    setTimeout(startGrid, 1600);
  }

  function burst(){
    const sparks = spawnSparks(20, ['#FFF3C4', '#7FE7FF', '#FFD97A'], 5);
    gsap.set(sparks, { x: 0, y: 0, opacity: 1 });
    gsap.to(sparks, {
      x: () => (Math.random() - .5) * 700,
      y: () => (Math.random() - .5) * 700,
      opacity: 0, duration: 1, ease: 'power2.out', stagger: 0.008,
      onComplete: () => { dust.innerHTML = ''; },
    });
  }

  function showGrid(results){
    const { wrap, grid, best } = buildSummary(results);
    addExtra(wrap);

    const cards = Array.from(grid.querySelectorAll('.card3d'));
    const inners = cards.map(c => c.querySelector('.card3d__inner'));

    gsap.set(inners, { rotationY: 180 });
    gsap.set(cards, { opacity: 0, y: 40, scale: .86 });

    tl = gsap.timeline();
    tl.to(cards, {
      opacity: 1, y: 0, scale: 1,
      duration: 0.35, ease: 'back.out(1.6)', stagger: { each: 0.05, from: 'start' },
    }, 0);
    tl.to(inners, {
      rotationY: 0, duration: 0.5, ease: 'power3.inOut',
      stagger: { each: 0.055, from: 'start', ease: 'power2.in' },
    }, 0.15);

    // 翻完之后的下一步：有 SR+ 就单播，否则直接进结果页
    let advanced = false;
    // 兜底：无论 GSAP 时间轴是否跑完，进入结果页前都必须把卡翻到正面。
    // 低帧率/后台标签页里时间轴会被节流，卡片会停在 rotateY(180) 露出卡背。
    const faceAllFront = () => {
      if (tl){ tl.kill(); tl = null; }
      gsap.set(inners, { rotationY: 0 });
      gsap.set(cards, { opacity: 1, y: 0, scale: 1 });
    };
    const advance = () => {
      if (advanced) return;
      advanced = true;
      faceAllFront();
      // 多连抽不再插播单卡完整演出：之前的做法是抽到 SR+ 就再播 8 秒
      // 单卡演出，结果页要等 ~10 秒才出现。结果页已按稀有度排序、最高卡
      // 排在最前并标注「本轮最高」，信息不丢。单抽仍保留完整演出。
      dust.innerHTML = '';
      if (orderOf(best.rarity) >= 3) audio.arpeggio(orderOf(best.rarity) >= 5 ? 7 : 3);
      attachExit(wrap);
    };

    tl.to({}, { duration: 0.9 }, '>');
    tl.call(advance);

    // 兜底：整场翻牌的时长约 0.15 + 0.5 + 9×0.055 ≈ 1.15s，留足余量
    setTimeout(advance, 1500);
  }

  /** 结果页统一结构：标题 + 卡片网格 */
  function buildSummary(results){
    const wrap = document.createElement('div');
    wrap.className = 'summary' + (results.length === 5 ? ' summary--five' : '');

    const best = results.reduce((a, b) => orderOf(b.rarity) > orderOf(a.rarity) ? b : a, results[0]);
    wrap.classList.add('best-' + best.rarity.toLowerCase());

    const head = document.createElement('div');
    head.className = 'summary__head';
    head.innerHTML =
      '<div class="summary__eyebrow">' + (results.length === 5 ? '五连' : '十连') + '召唤 · 已结算</div>' +
      '<div class="summary__title">本轮最高 <b>' + RARITY[best.rarity].label + '</b></div>';

    const grid = document.createElement('div');
    grid.className = 'ten-grid' + (results.length === 5 ? ' is-five' : '');
    const sorted = [...results].sort((a, b) => orderOf(b.rarity) - orderOf(a.rarity));
    grid.innerHTML = sorted.map(r => cardHTML(r.card)).join('');
    grid.querySelectorAll('.card3d').forEach(wireArt);

    wrap.append(head, grid);
    return { wrap, grid, best };
  }

  /** 给结果页挂"收下"按钮，并保证演出结束回调恰好触发一次 */
  function attachExit(panel){
    const back = document.createElement('div');
    back.className = 'summary-exit mat-glass pressable';
    back.textContent = '收下';
    addExtra(back);

    let closed = false;
    const onStageClick = (e) => { if (e.target === stage) close(); };
    const skipHandler = (e) => { e.stopPropagation(); close(); };

    function close(){
      if (closed) return;
      closed = true;
      stage.removeEventListener('click', onStageClick);
      back.removeEventListener('click', skipHandler);
      audio.click();
      gsap.to([panel, back], { opacity: 0, duration: .25 });
      const cb = onFinished;
      onFinished = null;

      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        clearStage();
        if (cb) cb();
      };
      gsap.to(stage, {
        backgroundColor: 'rgba(4,5,7,0)', duration: .35,
        onComplete: done,
      });
      setTimeout(done, 460);   // rAF 冻结时兜底
    }
    back.addEventListener('click', skipHandler);
    stage.addEventListener('click', onStageClick);
  }

  function showSummary(results){
    clearStage();
    stage.classList.add('on');
    gsap.to(stage, { duration: 0.3, backgroundColor: 'rgba(4,5,7,1)' });
    gsap.to(vignette, { opacity: .8, duration: 0.4 });

    const { wrap, grid } = buildSummary(results);
    // 结果页的卡必须无条件正面朝上，不能依赖内联 transform 覆盖
    gsap.set(grid.querySelectorAll('.card3d__inner'), { rotationY: 0 });
    addExtra(wrap);

    attachExit(wrap);
  }

  /* ── 事件 ── */
  stage.addEventListener('click', (e) => {
    if (e.target === skip) return;
    if (!canSkip) return;
    finishStage();
  });

  skip.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!canSkip) return;
    audio.click();
    // 跳到定格帧，而不是直接关掉——SSR 的卡面必须让玩家看清
    if (tl) tl.time(5.2);
  });

  return {
    playOne,
    playMany,
    clearStage,
    /** 结果页需要外部直接进入时的入口（例如减少动效模式） */
    showSummary,
    get busy(){ return !!tl; },
  };
}
