/* ══════════════════════════════════════════════════════════════
   占位立绘生成器
   给每张卡画一张渐变 + 编号的占位图，用来在拿到真美术之前
   验证「有图」时的排版、灯箱放大、以及加载链路。

   跑法：node tools/gen-placeholder-art.mjs
   产出：assets/cards/<id>.svg

   为什么用 SVG：零依赖、纯文本、随时可删。
   注意 SVG 不在前端的探测列表（avif/webp/png/jpg）里，
   所以它不会顶替真图——这份产出是给你看的样式参考，
   要真用就转成 png/webp 再放进来。
   ══════════════════════════════════════════════════════════════ */

import { ROSTER, RARITY } from '../js/core.js';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '..', 'assets', 'cards');
mkdirSync(outDir, { recursive: true });

/** 每个稀有度一套配色，和 UI 里的 CSS 变量对应 */
const PALETTE = {
  N:   ['#2A2D33', '#14161A', '#8A8F98'],
  R:   ['#22323F', '#0E161C', '#9CC7E8'],
  SR:  ['#3A2C18', '#171109', '#FFB347'],
  SSR: ['#12303A', '#07161B', '#7FE7FF'],
  HID: ['#2E1220', '#12070C', '#FF5C8A'],
};

let count = 0;
for (const card of ROSTER){
  const [c1, c2, accent] = PALETTE[card.rarity];
  const no = String(ROSTER.indexOf(card) + 1).padStart(3, '0');

  // 用卡自己的 seed 让每张图的纹样略有不同
  let a = card.seed >>> 0;
  const rnd = () => {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };

  const rings = Array.from({ length: 5 }, (_, i) => {
    const r = 120 + i * 46 + rnd() * 20;
    return `<circle cx="384" cy="470" r="${r.toFixed(0)}" fill="none"
             stroke="${accent}" stroke-width="0.8" opacity="${(0.22 - i * 0.035).toFixed(2)}"/>`;
  }).join('');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 768 1075" width="768" height="1075">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0.4" y2="1">
      <stop offset="0" stop-color="${c1}"/>
      <stop offset="1" stop-color="${c2}"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.42" r="0.6">
      <stop offset="0" stop-color="${accent}" stop-opacity="0.30"/>
      <stop offset="1" stop-color="${accent}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#000" stop-opacity="0"/>
      <stop offset="1" stop-color="#000" stop-opacity="0.82"/>
    </linearGradient>
  </defs>

  <rect width="768" height="1075" fill="url(#bg)"/>
  <rect width="768" height="1075" fill="url(#glow)"/>
  ${rings}

  <!-- 主体轮廓：真美术会画在这里 -->
  <g stroke="${accent}" fill="none" opacity="0.55">
    <circle cx="384" cy="450" r="128" stroke-width="1.6"/>
    <path d="M384 322 C 470 380 470 520 384 578 C 298 520 298 380 384 322 Z" stroke-width="1.2"/>
  </g>

  <!-- 底部渐变，给角色名留位置 -->
  <rect y="620" width="768" height="455" fill="url(#fade)"/>

  <text x="384" y="452" text-anchor="middle" fill="${accent}" opacity="0.85"
        font-family="sans-serif" font-size="40" letter-spacing="6">占位</text>
  <text x="384" y="920" text-anchor="middle" fill="#FFF8DC"
        font-family="sans-serif" font-size="58" font-weight="700" letter-spacing="14">${card.name}</text>
  <text x="384" y="972" text-anchor="middle" fill="${accent}" opacity="0.7"
        font-family="sans-serif" font-size="26" letter-spacing="10">NO.${no}</text>
</svg>
`;
  writeFileSync(join(outDir, `${card.id}.svg`), svg, 'utf8');
  count++;
}

console.log(`✓ 生成 ${count} 张占位图 → assets/cards/*.svg`);
console.log('  注意：SVG 不在前端探测列表里，不会被真实加载。');
console.log('  想要生效，请转成 png/webp 后以相同 id 放进 assets/cards/。');
