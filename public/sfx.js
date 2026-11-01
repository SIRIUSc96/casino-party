// 効果音: ファイルは使わず、ブラウザ内で音を合成する（WebAudio）。ミュートは右上のボタン
let ctx = null;
let muted = false;
try { muted = localStorage.getItem('casino_mute') === '1'; } catch { /* 保存できなくても動く */ }

function ac() {
  if (muted) return null;
  try {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
  } catch { return null; }
  return ctx;
}

function tone(freq, at, dur, { type = 'sine', vol = 0.13, to = 0 } = {}) {
  const c = ac();
  if (!c) return;
  const t = c.currentTime + at;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(c.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(at, dur, { vol = 0.12, freq = 3000 } = {}) {
  const c = ac();
  if (!c) return;
  const t = c.currentTime + at;
  const n = Math.max(1, Math.floor(c.sampleRate * dur));
  const buf = c.createBuffer(1, n, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const s = c.createBufferSource();
  s.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  const g = c.createGain();
  g.gain.value = vol;
  s.connect(f).connect(g).connect(c.destination);
  s.start(t);
}

const arp = (notes, step = 0.09, o = {}) => notes.forEach((f, i) => tone(f, i * step, 0.22, { type: 'triangle', vol: 0.14, ...o }));

const SOUNDS = {
  click: () => tone(660, 0, 0.05, { type: 'square', vol: 0.05 }),
  card: () => noise(0, 0.07, { vol: 0.16, freq: 2400 }),
  chip: () => { tone(1500, 0, 0.05, { type: 'triangle', vol: 0.1 }); tone(2100, 0.04, 0.07, { type: 'triangle', vol: 0.08 }); },
  ping: () => { tone(880, 0, 0.12); tone(1320, 0.1, 0.16); },
  banner: () => { tone(220, 0, 0.25, { type: 'sawtooth', vol: 0.08, to: 110 }); noise(0, 0.12, { vol: 0.1, freq: 800 }); },
  dice: () => { for (let i = 0; i < 6; i++) noise(i * 0.07 + Math.random() * 0.02, 0.05, { vol: 0.18, freq: 1500 + Math.random() * 1500 }); },
  spin: () => { for (let i = 0; i < 14; i++) tone(900 + (i % 2) * 200, i * (0.05 + i * 0.012), 0.03, { type: 'square', vol: 0.045 }); },
  ball: () => { tone(1800, 0, 0.12, { type: 'triangle', vol: 0.12 }); tone(1200, 0.1, 0.2, { type: 'triangle', vol: 0.1 }); },
  reel: () => { for (let i = 0; i < 12; i++) tone(500 + (i % 3) * 120, i * 0.07, 0.04, { type: 'square', vol: 0.04 }); },
  win: () => arp([523, 659, 784, 1047]),
  lose: () => { tone(330, 0, 0.2, { type: 'sawtooth', vol: 0.08, to: 220 }); tone(247, 0.18, 0.3, { type: 'sawtooth', vol: 0.08, to: 150 }); },
  jackpot: () => { arp([523, 659, 784, 1047, 1319, 1568, 2093], 0.07); for (let i = 0; i < 8; i++) tone(2400 + (i % 2) * 300, 0.5 + i * 0.06, 0.05, { type: 'triangle', vol: 0.08 }); },
  fanfare: () => { arp([392, 392, 392, 523, 659, 784], 0.12, { vol: 0.15 }); tone(1047, 0.8, 0.5, { type: 'triangle', vol: 0.14 }); },
};

export const sfx = {
  play(name) { try { SOUNDS[name]?.(); } catch { /* 音が出せなくてもゲームは続ける */ } },
  get muted() { return muted; },
  toggle() {
    muted = !muted;
    try { localStorage.setItem('casino_mute', muted ? '1' : '0'); } catch { /* 無視 */ }
    if (!muted) sfx.play('chip');
    return muted;
  },
  unlock() { ac(); },
};
