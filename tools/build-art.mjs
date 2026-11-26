/* ══════════════════════════════════════════════════════════════
   立绘构建 —— 把原始大图转成页面能直接用的 WebP

   源目录：cards-art/<卡id>_<角色名>.png   （1024×1536，每张 2~3MB）
   产出：  assets/cards/<卡id>.webp         （宽 560，质量 82）

   为什么必须转：
     61 张原图合计约 148MB。全量放进页面，首屏要拉几十 MB，
     移动端直接卡死。转成 WebP 后总量约 1.5MB，且按需加载。

   跑法：node tools/build-art.mjs
   ══════════════════════════════════════════════════════════════ */

import { ROSTER } from '../js/core.js';
import { readdirSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const srcDir = join(root, 'cards-art');
const outDir = join(root, 'assets', 'cards');

const WIDTH = 560;     // 卡面最宽约 300px，560 已经足够清晰（2x）
const QUALITY = 82;

if (!existsSync(srcDir)){
  console.error('找不到 cards-art/ 目录');
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });

/* 建立 id -> 源文件 的索引（源文件名带中文后缀，只认前面的 id） */
const byId = new Map();
for (const f of readdirSync(srcDir)){
  const m = /^([A-Z]+\d+)_/.exec(f);
  if (!m) continue;
  if (!/\.(png|jpe?g|webp)$/i.test(f)) continue;
  // 旧的隐藏款 HID61 就是现在的至臻 EX61，别名一下
  const id = m[1].replace(/^HID/, 'EX');
  byId.set(id, f);
}

console.log(`源目录 ${byId.size} 张，卡池 ${ROSTER.length} 张`);

let ok = 0, skip = 0;
const missing = [];

for (const card of ROSTER){
  const src = byId.get(card.id);
  if (!src){
    missing.push(card.id);
    continue;
  }
  const out = join(outDir, `${card.id}.webp`);
  try {
    // 用 Python/Pillow 转码（Windows 上 ImageMagick 的路径容易出现转义问题）
    execFileSync('python', ['-I', '-c', `
import sys
from PIL import Image
im = Image.open(sys.argv[1]).convert('RGB')
w, h = im.size
nw = ${WIDTH}
nh = round(h * nw / w)
im = im.resize((nw, nh), Image.LANCZOS)
im.save(sys.argv[2], 'WEBP', quality=${QUALITY}, method=6)
`, join(srcDir, src), out], { stdio: 'pipe' });
    ok++;
    if (ok % 10 === 0) process.stdout.write(`  已转换 ${ok}…\n`);
  } catch (e){
    skip++;
    console.error(`  失败 ${card.id}: ${e.message.slice(0, 80)}`);
  }
}

/* 卡池里没有、但源目录多出来的图，提示一下（多半是 id 对不上） */
const rosterIds = new Set(ROSTER.map(c => c.id));
const orphans = [...byId.keys()].filter(id => !rosterIds.has(id));

console.log(`\n✓ 转换 ${ok} 张 → assets/cards/*.webp`);
if (skip) console.log(`  ${skip} 张失败`);
if (missing.length) console.log(`  缺图: ${missing.join(', ')}`);
if (orphans.length) console.log(`  源目录多余: ${orphans.join(', ')}`);
