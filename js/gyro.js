/* ══════════════════════════════════════════════════════════════
   gyro.js —— 设备方向（陀螺仪）统一数据源
   ──────────────────────────────────────────────────────────────
   · 单例监听 deviceorientation，所有卡片共享一份数据
   · iOS 13+ 必须由用户手势触发 requestPermission()
   · 启用瞬间取当前姿态为基准，之后只响应「相对变化」
   · 广播归一化倾斜量 { x, y } ∈ [-1, 1]
   ══════════════════════════════════════════════════════════════ */

const MAX_DEG = 22;   // 设备倾斜到该角度即达到满幅
const EMA = 0.22;     // 传感器抖动抑制（指数平滑系数）
const SENSOR_TIMEOUT = 2200;

const tiltSubs = new Set();
const statusSubs = new Set();

const st = {
  listening: false,
  enabled: false,
  status: 'idle',       // idle | pending | active | denied | unsupported | no-sensor
  baseline: null,
  smooth: { beta: 0, gamma: 0 },
  gotData: false,
};
let sensorTimer = null;
let rafId = 0;
let raw = null;         // 最新一帧的传感器读数

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

function emitStatus(){
  for (const fn of statusSubs){
    try { fn(st.status); } catch (e) { /* 单个订阅者出错不影响其他 */ }
  }
}

function emitTilt(tilt){
  for (const fn of tiltSubs){
    try { fn(tilt); } catch (e) {}
  }
}

/** 把传感器事件合并到每帧一次：图鉴有 61 张卡，逐事件广播会重复驱动 */
function flush(){
  rafId = 0;
  if (!st.enabled || !raw || !st.baseline) return;
  const { beta, gamma } = raw;

  const db = beta - st.baseline.beta;
  const dg = gamma - st.baseline.gamma;
  st.smooth.beta  += (db - st.smooth.beta) * EMA;
  st.smooth.gamma += (dg - st.smooth.gamma) * EMA;

  emitTilt({
    x: clamp(st.smooth.gamma / MAX_DEG, -1, 1),
    y: clamp(st.smooth.beta / MAX_DEG, -1, 1),
  });
}

function onOrient(e){
  if (!st.enabled) return;
  if (typeof e.beta !== 'number' || typeof e.gamma !== 'number') return;

  // 基准必须同步锁定：若延后到 rAF，调试工具/低频传感器下
  // 首帧读数会和基准同一帧到达，差值被抹成 0。
  if (!st.baseline) st.baseline = { beta: e.beta, gamma: e.gamma };
  st.gotData = true;
  if (st.status !== 'active'){
    st.status = 'active';
    clearTimeout(sensorTimer);
    emitStatus();
  }

  raw = { beta: e.beta, gamma: e.gamma };
  if (!rafId) rafId = requestAnimationFrame(flush);
}

async function enable(){
  if (!('DeviceOrientationEvent' in window)){
    st.status = 'unsupported';
    emitStatus();
    return { ok: false, reason: 'unsupported' };
  }

  // iOS 13+：必须在用户手势的同步调用栈里请求
  if (typeof DeviceOrientationEvent.requestPermission === 'function'){
    let res;
    try { res = await DeviceOrientationEvent.requestPermission(); }
    catch (e){ res = 'denied'; }
    if (res !== 'granted'){
      st.status = 'denied';
      emitStatus();
      return { ok: false, reason: res || 'denied' };
    }
  }

  if (!st.listening){
    window.addEventListener('deviceorientation', onOrient, true);
    st.listening = true;
  }

  st.enabled = true;
  st.baseline = null;
  st.smooth.beta = 0;
  st.smooth.gamma = 0;
  st.gotData = false;
  st.status = 'pending';
  emitStatus();

  clearTimeout(sensorTimer);
  sensorTimer = setTimeout(() => {
    if (st.enabled && !st.gotData){
      st.enabled = false;
      st.status = 'no-sensor';
      emitTilt({ x: 0, y: 0 });
      emitStatus();
    }
  }, SENSOR_TIMEOUT);

  return { ok: true };
}

function disable(){
  st.enabled = false;
  clearTimeout(sensorTimer);
  if (rafId){ cancelAnimationFrame(rafId); rafId = 0; }
  raw = null;
  st.status = 'idle';
  emitTilt({ x: 0, y: 0 });
  emitStatus();
}

/** 以当前姿态为新的正前方；无传感器时无害 */
function recalibrate(){
  st.baseline = null;
  st.smooth.beta = 0;
  st.smooth.gamma = 0;
  emitTilt({ x: 0, y: 0 });
}

export const gyro = {
  get supported(){ return 'DeviceOrientationEvent' in window; },
  get enabled(){ return st.enabled; },
  get status(){ return st.status; },
  get tilt(){
    return {
      x: clamp(st.smooth.gamma / MAX_DEG, -1, 1),
      y: clamp(st.smooth.beta / MAX_DEG, -1, 1),
    };
  },

  /** 订阅倾斜量，返回取消订阅函数 */
  subscribe(fn){
    tiltSubs.add(fn);
    return () => tiltSubs.delete(fn);
  },

  /** 订阅开关状态 */
  onStatus(fn){
    statusSubs.add(fn);
    fn(st.status);
    return () => statusSubs.delete(fn);
  },

  enable, disable, recalibrate,
};
