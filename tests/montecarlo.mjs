/* ══════════════════════════════════════════════════════════════
   蒙特卡洛验证 —— 对账 core.js 里的概率表

   跑法：
     node tests/montecarlo.mjs             # 默认 30 万抽
     node tests/montecarlo.mjs 1000000     # 指定抽数

   注意至臻是万分之一，样本量太小会看到 0。想让至臻的数字稳定，
   至少跑 100 万抽以上。
   ══════════════════════════════════════════════════════════════ */

import {
  rollOne, rollMany, defaultSave, commitPull, ssrRate, PITY,
  RARITY, TIERS, RATE, EX_CARD, BY_RARITY,
} from '../js/core.js';

const TOTAL = Number(process.argv[2]) || 300000;

function seeded(seed){
  let a = seed >>> 0;
  return () => {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

const rnd = seeded(0xC0FFEE);
const save = defaultSave();
const count = { N:0, R:0, SR:0, SSR:0, EX:0 };
let pulls = 0, ssrPlus = 0;
let exFirstPull = null;

console.log(`\n样本：${TOTAL.toLocaleString()} 抽\n`);

/* 单抽长跑 */
while (pulls < TOTAL){
  const r = rollOne(save, rnd);
  commitPull(save, [r]);
  count[r.rarity]++;
  pulls++;
  if (RARITY[r.rarity].tier >= 4) ssrPlus++;
  if (r.isEx && exFirstPull === null) exFirstPull = save.totalPulls;
}

const pct = k => count[k] / pulls * 100;
const f = (x, d = 3) => x.toFixed(d);

console.log('单抽分布');
for (const k of TIERS){
  const emp = pct(k);
  const theo = RATE[k] * 100;
  console.log(
    `  ${k.padEnd(4)} 实测 ${f(emp, 4).padStart(9)}%   理论 ${f(theo, 2).padStart(7)}%`
  );
}

console.log('\nSSR+（SSR + EX）');
console.log(`  实测 ${f(pct('SSR') + pct('EX'), 3)}%`);
console.log(`  平均 ${f(pulls / ssrPlus, 2)} 抽出 1 个`);

if (count.EX > 0){
  console.log('\n至臻');
  console.log(`  出现 ${count.EX} 次`);
  console.log(`  平均 ${Math.round(pulls / count.EX).toLocaleString()} 抽出 1 张`);
  if (exFirstPull) console.log(`  首次出现在第 ${exFirstPull} 抽`);
} else {
  console.log('\n至臻');
  console.log('  本批样本内未出现（万分之一，样本太小属正常）');
}

/* 连抽保底自检 */
console.log('\n连抽保底');
{
  const s = defaultSave();
  let fiveOk = 0, tenOk = 0, trials = 3000;
  const r2 = seeded(777);
  for (let i = 0; i < trials; i++){
    const f5 = rollMany(s, 5, r2);
    if (f5.some(x => RARITY[x.rarity].tier >= 2)) fiveOk++;
    const t10 = rollMany(s, 10, r2);
    if (t10.some(x => RARITY[x.rarity].tier >= 3)) tenOk++;
  }
  console.log(`  五连出 R+ 的比例  ${(fiveOk / trials * 100).toFixed(2)}%`);
  console.log(`  十连出 SR+ 的比例 ${(tenOk / trials * 100).toFixed(2)}%`);
  if (fiveOk !== trials) console.log('  ✗ 五连保底有漏');
  if (tenOk !== trials) console.log('  ✗ 十连保底有漏');
}

console.log('\n软保底曲线');
for (const n of [1, 62, 63, 70, 79, 80]){
  console.log(`  第 ${String(n).padStart(2)} 抽  ${f(ssrRate(n - 1) * 100, 1)}%`);
}

console.log(`\n至臻卡：${EX_CARD.name}（唯一）`);
console.log(`卡池共 ${TIERS.map(k => BY_RARITY[k].length).join('/')} 张  (N/R/SR/SSR/EX)`);

/* 断言 */
const fail = [];
const near = (got, want, tol) => Math.abs(got - want) <= tol;

if (!near(pct('N'), 59.99, 1.2))  fail.push(`N ${f(pct('N'), 2)}% ≠ 59.99%`);
if (!near(pct('R'), 30.0, 1.0))   fail.push(`R ${f(pct('R'), 2)}% ≠ 30%`);
if (!near(pct('SR'), 9.0, 0.7))   fail.push(`SR ${f(pct('SR'), 2)}% ≠ 9%`);
if (pulls >= 1_000_000 && !near(pct('EX'), 0.01, 0.008))
  fail.push(`EX ${f(pct('EX'), 4)}% ≠ 0.01%`);

console.log('');
if (fail.length){
  console.error('✗ 校验失败：');
  fail.forEach(x => console.error('   ' + x));
  process.exit(1);
} else {
  console.log('✓ 全部分布落在预期区间');
}
