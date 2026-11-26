/* ══════════════════════════════════════════════════════════════
   audio.js —— 全部音效实时合成，零音频文件
   ══════════════════════════════════════════════════════════════ */

export function createAudio(){
  let ctx = null, master = null, enabled = true;
  let silenceTimer = null;      // 可取消的静默恢复
  let droneNodes = null;

  function init(){
    if (ctx) return;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
    } catch (e){ enabled = false; }
  }

  function resume(){
    if (ctx && ctx.state === 'suspended') ctx.resume();
  }

  /** 正弦/三角波单音 */
  function tone(freq, dur, { type = 'sine', gain = 0.2, attack = 0.01, decay = null, detune = 0, when = 0 } = {}){
    if (!enabled || !ctx) return null;
    const t0 = ctx.currentTime + when;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    o.detune.value = detune;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + (decay || dur));
    o.connect(g); g.connect(master);
    o.start(t0); o.stop(t0 + (decay || dur) + 0.05);
    return g;
  }

  /** 噪声族 */
  function noise(dur, { gain = 0.2, type = 'bandpass', freq = 3000, q = 8, when = 0 } = {}){
    if (!enabled || !ctx) return;
    const t0 = ctx.currentTime + when;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource(); src.buffer = buf;
    const flt = ctx.createBiquadFilter();
    flt.type = type; flt.frequency.value = freq; flt.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(flt); flt.connect(g); g.connect(master);
    src.start(t0); src.stop(t0 + dur);
  }

  function thud(){
    tone(60, 0.15, { type:'sine', gain:0.35, attack:0.008, decay:0.16 });
    noise(0.18, { gain:0.10, type:'lowpass', freq:220, q:1 });
  }
  function heartbeat(){
    tone(40, 0.05, { type:'sine', gain:0.22, attack:0.005, decay:0.05, when:0 });
    tone(40, 0.05, { type:'sine', gain:0.16, attack:0.005, decay:0.05, when:0.2 });
  }
  function ding(){
    noise(0.4, { gain:0.16, type:'bandpass', freq:3000, q:8 });
    tone(2100, 0.35, { type:'sine', gain:0.05, attack:0.004, decay:0.35 });
  }

  /** 稀有度琶音——音数即稀有度 */
  function arpeggio(n){
    const scale = [523.25, 659.25, 783.99, 987.77, 1174.66, 1396.91, 1567.98];
    for (let i = 0; i < n; i++){
      tone(scale[i % scale.length], 0.5, {
        type: i < 3 ? 'triangle' : 'sine',
        gain: 0.16 - i * 0.012,
        attack: 0.008,
        decay: 0.9,
        when: i * 0.1,
      });
    }
  }

  /* ── 环境低鸣（拍频）—— 开卡时铺底，离开舞台就停 ── */
  function startDrone(){
    if (!enabled || !ctx || droneNodes) return;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.02, ctx.currentTime + 0.8);
    g.connect(master);
    const a = ctx.createOscillator(), b = ctx.createOscillator();
    a.type = b.type = 'sine';
    a.frequency.value = 55; b.frequency.value = 55.5;
    a.connect(g); b.connect(g);
    a.start(); b.start();
    droneNodes = { g, a, b };
  }
  function stopDrone(){
    if (!droneNodes) return;
    const { g, a, b } = droneNodes;
    try {
      g.gain.cancelScheduledValues(ctx.currentTime);
      g.gain.setValueAtTime(g.gain.value, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.45);
      a.stop(ctx.currentTime + 0.55);
      b.stop(ctx.currentTime + 0.55);
    } catch (e){ /* 已经停了 */ }
    droneNodes = null;
  }

  /**
   * 静默：隐藏款专用——"没有声音"就是最强的音效。
   * 定时器必须可取消：跳过演出或连抽时，上一次的恢复回调
   * 会把音量在一个错误的时刻偷偷调回来。
   */
  function silence(ms){
    if (!master || !ctx) return;
    cancelSilence();
    const cur = master.gain.value;
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setValueAtTime(cur, ctx.currentTime);
    master.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.03);
    silenceTimer = setTimeout(() => {
      silenceTimer = null;
      if (!master || !ctx) return;
      try {
        master.gain.cancelScheduledValues(ctx.currentTime);
        master.gain.setValueAtTime(cur, ctx.currentTime);
      } catch (e){}
    }, ms);
  }
  function cancelSilence(){
    if (silenceTimer){ clearTimeout(silenceTimer); silenceTimer = null; }
    // 立刻恢复到正常音量
    if (master && ctx){
      try {
        master.gain.cancelScheduledValues(ctx.currentTime);
        master.gain.setValueAtTime(0.5, ctx.currentTime);
      } catch (e){}
    }
  }

  function click(){ tone(1200, 0.04, { type:'square', gain:0.03, attack:0.002, decay:0.04 }); }
  function fail(){ tone(180, 0.25, { type:'sawtooth', gain:0.10, attack:0.01, decay:0.25 }); }

  return {
    init, resume, tone, noise, thud, heartbeat, ding, arpeggio,
    startDrone, stopDrone, silence, cancelSilence, click, fail,
    get enabled(){ return enabled; },
    set enabled(v){
      enabled = v;
      if (!v){ stopDrone(); cancelSilence(); }
    },
  };
}
