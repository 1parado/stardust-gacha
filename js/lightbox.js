/* ══════════════════════════════════════════════════════════════
   lightbox.js —— 图鉴灯箱
   放大查看已获得的卡，支持上一张 / 下一张 / 键盘 / ESC。
   ══════════════════════════════════════════════════════════════ */

import { RARITY } from './core.js';
import { cardHTML, attachTilt, wireArt } from './cards.js';

export function createLightbox({ audio }){
  let root = null;
  let list = [];        // 当前可翻阅的卡（只有已获得的）
  let index = 0;
  let tiltCleanup = null;
  let holoTween = null;
  let lastFocus = null;

  function build(){
    if (root) return root;
    root = document.createElement('div');
    root.id = 'lightbox';
    root.className = 'lightbox';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', '卡牌详情');
    root.innerHTML = `
      <button class="lb-btn lb-close" aria-label="关闭">✕</button>
      <button class="lb-btn lb-prev" aria-label="上一张">‹</button>
      <button class="lb-btn lb-next" aria-label="下一张">›</button>
      <div class="lb-stage" id="lbStage"></div>
      <div class="lb-meta" id="lbMeta"></div>
      <div class="lb-count" id="lbCount"></div>`;
    document.body.appendChild(root);

    root.querySelector('.lb-close').addEventListener('click', close);
    root.querySelector('.lb-prev').addEventListener('click', () => step(-1));
    root.querySelector('.lb-next').addEventListener('click', () => step(1));

    // 点背景关闭，点内容不关
    root.addEventListener('click', (e) => {
      if (e.target === root || e.target.classList.contains('lb-stage')) close();
    });

    document.addEventListener('keydown', onKey);
    return root;
  }

  function onKey(e){
    if (!root || !root.classList.contains('on')) return;
    if (e.key === 'Escape'){ e.preventDefault(); close(); return; }
    if (e.key === 'ArrowLeft'){ e.preventDefault(); step(-1); return; }
    if (e.key === 'ArrowRight'){ e.preventDefault(); step(1); return; }
    // 焦点留在灯箱内
    if (e.key === 'Tab'){
      const f = root.querySelectorAll('button');
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first){ e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last){ e.preventDefault(); first.focus(); }
    }
  }

  function step(dir){
    if (list.length < 2) return;
    index = (index + dir + list.length) % list.length;
    audio.click();
    render();
  }

  function render(){
    const card = list[index];
    if (!card) return;
    const r = RARITY[card.rarity];
    const stageEl = root.querySelector('#lbStage');

    if (tiltCleanup){ tiltCleanup(); tiltCleanup = null; }
    if (holoTween){ holoTween.kill(); holoTween = null; }

    stageEl.innerHTML = cardHTML(card, { showGlare: true });
    stageEl.classList.remove('enter');
    void stageEl.offsetWidth;
    stageEl.classList.add('enter');

    const cardEl = stageEl.querySelector('.card3d');
    wireArt(cardEl);
    tiltCleanup = attachTilt(cardEl, gsap, { maxTilt: 14, useGyro: true });

    if (card.rarity === 'SSR' || card.rarity === 'EX'){
      const holo = cardEl.querySelector('.holo');
      if (holo) holoTween = gsap.to(holo, { '--ha': 360, duration: 9, ease: 'none', repeat: -1 });
    }

    root.querySelector('#lbMeta').innerHTML = `
      <div class="lb-name" style="color:var(${r.colorVar})">${card.name}</div>
      <div class="lb-rar">${r.label} · ${r.name}</div>
      <div class="lb-stats">
        <div><span>攻</span><b>${card.atk}</b></div>
        <div><span>防</span><b>${card.def}</b></div>
        <div><span>速</span><b>${card.spd}</b></div>
      </div>`;
    root.querySelector('#lbCount').textContent =
      `${index + 1} / ${list.length}`;

    // 单张时隐藏翻页
    root.classList.toggle('single', list.length < 2);
  }

  function open(cards, startIndex = 0){
    list = cards;
    index = startIndex;
    lastFocus = document.activeElement;
    build();
    render();
    root.classList.add('on');
    document.body.style.overflow = 'hidden';
    audio.click();
    root.querySelector('.lb-close').focus();

    // 入场
    root.classList.remove('enter');
    void root.offsetWidth;
    root.classList.add('enter');
  }

  function close(){
    if (!root || !root.classList.contains('on')) return;
    root.classList.remove('on', 'enter');
    document.body.style.overflow = '';
    if (tiltCleanup){ tiltCleanup(); tiltCleanup = null; }
    if (holoTween){ holoTween.kill(); holoTween = null; }
    root.querySelector('#lbStage').innerHTML = '';
    if (lastFocus && lastFocus.focus) lastFocus.focus();
    lastFocus = null;
  }

  return { open, close, step, get isOpen(){ return !!root && root.classList.contains('on'); } };
}
