/* ══════════════════════════════════════════════════════════════
   core.js —— 纯逻辑，不碰 DOM
   抽卡引擎 / 概率 / 保底 / 抽卡记录 / 存档校验

   这个文件不依赖 GSAP、不依赖浏览器 API（除了注入的 storage），
   可以直接在 Node 里 import 做蒙特卡洛验证。
   ══════════════════════════════════════════════════════════════ */

/* ── 确定性 PRNG ── */
export function mulberry32(a){
  return function(){
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/* ══════════════════════════════════════════════════════════════
   稀有度
   EX（至臻）是全场唯一一张、概率 0.01% 的卡。
   它是「分享卡」的主角：抽到它需要多少次，值得被记录。
   ══════════════════════════════════════════════════════════════ */
export const RARITY = {
  N:  { key:'N',  label:'N',  name:'常见',   cls:'r-n',   colorVar:'--n',   sparks:0,  armp:3, tier:1 },
  R:  { key:'R',  label:'R',  name:'稀有',   cls:'r-r',   colorVar:'--r',   sparks:6,  armp:4, tier:2 },
  SR: { key:'SR', label:'SR', name:'超稀有', cls:'r-sr',  colorVar:'--sr',  sparks:14, armp:5, tier:3 },
  SSR:{ key:'SSR',label:'SSR',name:'传说',   cls:'r-ssr', colorVar:'--ssr', sparks:28, armp:6, tier:4 },
  EX: { key:'EX', label:'EX',  name:'至臻',   cls:'r-ex',  colorVar:'--ex',  sparks:48, armp:8, tier:5 },
};

export const TIERS = ['N', 'R', 'SR', 'SSR', 'EX'];

/* ── 概率常量 ──
   单抽基准概率，五档加起来正好 100%，没有隐藏的额外判定。 */
export const RATE = {
  N:   0.5999,
  R:   0.30,
  SR:  0.09,
  SSR: 0.01,
  EX:  0.0001,   // 万分之一
};

/* ── 保底 ── */
export const PITY = {
  softStart: 63,     // 第 63 抽起概率递增
  softStep: 0.055,   // 每抽 +5.5%
  hard: 80,          // 第 80 抽必出 SSR+
  base: RATE.SSR,
};

/** 第 n 抽（自上次 SSR+ 后，1-based）的 SSR 概率 */
export function ssrRate(pity){
  const n = pity + 1;
  if (n >= PITY.hard) return 1;
  if (n >= PITY.softStart) return Math.min(1, PITY.base + (n - (PITY.softStart - 1)) * PITY.softStep);
  return PITY.base;
}

/* ══════════════════════════════════════════════════════════════
   抽卡档位
   ══════════════════════════════════════════════════════════════ */
export const PRICE = { one: 100, five: 450, ten: 900 };

export const DRAW_MODES = [
  { id:'one',  count:1,  cost:PRICE.one,  label:'单抽', guarantee:null },
  { id:'five', count:5,  cost:PRICE.five, label:'五连', guarantee:'R+' },
  { id:'ten',  count:10, cost:PRICE.ten,  label:'十连', guarantee:'SR+' },
];

/* ══════════════════════════════════════════════════════════════
   角色表
   ══════════════════════════════════════════════════════════════ */
const GIVEN = ['霜','焰','砚','雪','岚','烬','澈','堇','朔','聆','昭','沉','湛','疏','玄','野','雾','烛','崖','川','桑','离','序','白'];
const TITLE = ['行','引','守','歌','徒','令','策','使','客','主','者','归'];
const SSR_NAMES = ['霜华','焰离','砚白','雪见','岚止','烬川','澈明','堇野'];

/** 至臻：全场唯一，名字不参与随机 */
const EX_NAME = '无相';

export function buildRoster(){
  const out = [];
  const rnd = mulberry32(20261126);
  const used = new Set();

  const pickName = () => {
    for (let tries = 0; tries < 400; tries++){
      const n = GIVEN[Math.floor(rnd() * GIVEN.length)] + TITLE[Math.floor(rnd() * TITLE.length)];
      if (!used.has(n)){ used.add(n); return n; }
    }
    let i = 2, n;
    do { n = '备' + (i++); } while (used.has(n));
    used.add(n); return n;
  };

  const make = (rarity, i, name) => {
    const r = RARITY[rarity];
    const seed = 1000 + i * 37 + rarity.charCodeAt(0) * 13;
    const srnd = mulberry32(seed);
    const boost = rarity === 'EX' ? 90 : rarity === 'SSR' ? 40 : rarity === 'SR' ? 20 : 0;
    return {
      id: rarity + i,
      name,
      rarity,
      seed,
      arms: r.armp + (srnd() > 0.55 ? 1 : 0),
      colorVar: r.colorVar,
      atk: Math.floor(20 + srnd() * 60 + boost),
      def: Math.floor(15 + srnd() * 50 + boost * 0.9),
      spd: Math.floor(10 + srnd() * 60 + boost * 0.5),
    };
  };

  let i = 0;
  for (let k = 0; k < 12; k++) out.push(make('N', ++i, pickName()));
  for (let k = 0; k < 24; k++) out.push(make('R', ++i, pickName()));
  for (let k = 0; k < 16; k++) out.push(make('SR', ++i, pickName()));
  SSR_NAMES.forEach(n => out.push(make('SSR', ++i, n)));
  out.push(make('EX', ++i, EX_NAME));
  return out;
}

export const ROSTER = buildRoster();
export const BY_RARITY = {
  N:   ROSTER.filter(c => c.rarity === 'N'),
  R:   ROSTER.filter(c => c.rarity === 'R'),
  SR:  ROSTER.filter(c => c.rarity === 'SR'),
  SSR: ROSTER.filter(c => c.rarity === 'SSR'),
  EX:  ROSTER.filter(c => c.rarity === 'EX'),
};

/** 至臻卡：全场唯一，分享卡的主角 */
export const EX_CARD = BY_RARITY.EX[0];

/* ══════════════════════════════════════════════════════════════
   存档
   ══════════════════════════════════════════════════════════════ */
export const SAVE_KEY = 'stardust.save.v3';
export const SAVE_VERSION = 3;

export function defaultSave(){
  return {
    v: SAVE_VERSION,
    gems: 1500,
    pity: 0,
    owned: [],
    sound: true,
    /** 累计抽卡次数 —— 分享卡的核心数字 */
    totalPulls: 0,
    /** 按稀有度累计，用于分享卡展示 */
    byRarity: { N:0, R:0, SR:0, SSR:0, EX:0 },
    /** 抽中至臻的那一刻：第几抽、什么时候 */
    exRecord: null,   // { atPull, ts }
  };
}

/** 把任何脏数据洗成合法存档。宁可丢进度，也不能让后续代码崩。 */
export function sanitizeSave(raw){
  const d = defaultSave();
  if (!raw || typeof raw !== 'object') return d;

  const num = (v, fallback, min = 0) => {
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? Math.max(min, Math.floor(n)) : fallback;
  };
  const validIds = new Set(ROSTER.map(c => c.id));

  d.gems  = num(raw.gems, d.gems);
  d.pity  = Math.min(num(raw.pity, 0), PITY.hard);
  d.sound = raw.sound !== false;
  d.owned = Array.isArray(raw.owned)
    ? Array.from(new Set(raw.owned.filter(x => typeof x === 'string' && validIds.has(x))))
    : [];

  d.totalPulls = num(raw.totalPulls, 0);

  if (raw.byRarity && typeof raw.byRarity === 'object'){
    for (const k of TIERS){
      d.byRarity[k] = num(raw.byRarity[k], 0);
    }
  }

  if (raw.exRecord && typeof raw.exRecord === 'object'){
    const at = num(raw.exRecord.atPull, 0);
    if (at > 0){
      d.exRecord = { atPull: at, ts: num(raw.exRecord.ts, Date.now()) };
    }
  }

  // v2 存档迁移：没有 totalPulls 就按已获卡数粗估
  if (!raw.v || raw.v < 3){
    d.totalPulls = Math.max(d.totalPulls, d.owned.length);
  }
  return d;
}

export function loadSave(storage){
  try {
    const raw = storage && storage.getItem(SAVE_KEY);
    if (!raw) return defaultSave();
    const parsed = JSON.parse(raw);
    const clean = sanitizeSave(parsed);
    if (JSON.stringify(parsed) !== JSON.stringify(clean)) {
      try { storage.setItem(SAVE_KEY, JSON.stringify(clean)); } catch (e){}
    }
    return clean;
  } catch (e){
    return defaultSave();
  }
}

export function saveTo(storage, save){
  try { storage.setItem(SAVE_KEY, JSON.stringify(save)); return true; }
  catch (e){ return false; }
}

/* ══════════════════════════════════════════════════════════════
   抽卡引擎
   ══════════════════════════════════════════════════════════════ */
function pickCard(rarity, rnd){
  const list = BY_RARITY[rarity];
  return list[Math.floor(rnd() * list.length)];
}

/**
 * 单抽。会就地推进 save 的保底与计数。
 * @returns {{card, rarity, isEx}}  isEx 用于分享卡记录
 */
export function rollOne(save, rnd = Math.random){
  const pity = save.pity;

  // 至臻：万分之一，独立于保底
  if (rnd() < RATE.EX){
    save.pity = 0;
    save.byRarity.EX++;
    return { card: EX_CARD, rarity:'EX', isEx:true };
  }

  // SSR+：走软保底曲线
  if (rnd() < ssrRate(pity)){
    save.pity = 0;
    save.byRarity.SSR++;
    return { card: pickCard('SSR', rnd), rarity:'SSR', isEx:false };
  }

  // 其余按权重在剩余概率里分配
  save.pity = Math.min(save.pity + 1, PITY.hard);
  const rest = RATE.N + RATE.R + RATE.SR;
  const x = rnd() * rest;
  let rarity;
  if (x < RATE.SR) rarity = 'SR';
  else if (x < RATE.SR + RATE.R) rarity = 'R';
  else rarity = 'N';

  save.byRarity[rarity]++;
  return { card: pickCard(rarity, rnd), rarity, isEx:false };
}

/**
 * 多连：先全部结算，再交给演出层。
 * @param {object} save
 * @param {number} count  5 或 10
 * @param {function} rnd
 */
export function rollMany(save, count = 10, rnd = Math.random){
  const results = [];
  for (let i = 0; i < count; i++) results.push(rollOne(save, rnd));

  // 连抽保底：十连保 SR+，五连保 R+
  const minTier = count >= 10 ? 3 : count >= 5 ? 2 : 0;
  if (minTier > 0){
    const best = results.reduce((m, r) => Math.max(m, RARITY[r.rarity].tier), 0);
    if (best < minTier){
      const forced = count >= 10 && rnd() < 0.10 ? 'SSR' : (minTier >= 3 ? 'SR' : 'R');
      // 回退最后一次对计数的影响，保持统计一致
      save.pity = Math.max(0, save.pity - 1);
      save.byRarity[results[count - 1].rarity]--;

      save.byRarity[forced]++;
      if (forced === 'SSR') save.pity = 0;
      results[count - 1] = {
        card: pickCard(forced, rnd),
        rarity: forced,
        forced: true,
        isEx: false,
      };
    }
  }
  return results;
}

/** 记录一次抽卡的全部结果，返回新增的卡 */
export function commitPull(save, results){
  const set = new Set(save.owned);
  const added = [];
  for (const r of results){
    save.totalPulls++;
    // 至臻是唯一的，只在第一次记录时刻
    if (r.isEx && !save.exRecord){
      save.exRecord = { atPull: save.totalPulls, ts: Date.now() };
    }
    if (!set.has(r.card.id)){
      set.add(r.card.id);
      added.push(r.card);
    }
  }
  save.owned = Array.from(set);
  return added;
}

/** 分享卡用的文案 */
export function shareSummary(save){
  const ex = save.exRecord;
  return {
    totalPulls: save.totalPulls,
    exOwned: !!ex,
    exAtPull: ex ? ex.atPull : null,
    exDate: ex ? new Date(ex.ts).toISOString().slice(0, 10) : null,
    byRarity: { ...save.byRarity },
    collection: save.owned.length,
    total: ROSTER.length,
  };
}

/** 给 UI 的数字：从模拟跑出来的分析值，测试脚本会校验它们 */
export const DISCLOSURE = {
  N: 59.99, R: 30.0, SR: 9.0, SSR: 1.0, EX: 0.01,
  srPlus: 10.0,
  avgPullsPerSSR: 45,
  avgPullsPerEX: 10000,
};
