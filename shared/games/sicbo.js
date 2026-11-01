// 大小（シックボー）: サイコロ3つの結果に賭ける
import { betSchema, createBetting, cpuUnit } from './betting.js';

export const meta = {
  id: 'sicbo', cat: 'casino', name: '大小（シックボー）', min: 1, max: 6,
  desc: 'サイコロ3つの出目を予想。大（11〜17）・小（4〜10）は2倍、単独の目や合計値、ゾロ目にも賭けられる。ゾロ目のときは大小とも負け',
  schema: betSchema(10),
};

const SUM_PAY = { 4: 60, 5: 30, 6: 17, 7: 12, 8: 8, 9: 6, 10: 6, 11: 6, 12: 6, 13: 8, 14: 12, 15: 17, 16: 30, 17: 60 };
const sum = (o) => o.d[0] + o.d[1] + o.d[2];
const triple = (o) => o.d[0] === o.d[1] && o.d[1] === o.d[2];

export const spec = {
  shared: true, spinMs: 3000,
  valid: (k) => ['big', 'small', 'any3'].includes(k) || /^s[1-6]$/.test(k) || (/^t\d{1,2}$/.test(k) && Number(k.slice(1)) in SUM_PAY),
  spin: (rng) => ({ d: [0, 0, 0].map(() => 1 + Math.floor(rng() * 6)) }),
  ret(k, o) {
    if (k === 'big') return !triple(o) && sum(o) >= 11 ? 2 : 0;
    if (k === 'small') return !triple(o) && sum(o) <= 10 ? 2 : 0;
    if (k === 'any3') return triple(o) ? 31 : 0;
    if (k[0] === 's') { const c = o.d.filter((x) => x === Number(k.slice(1))).length; return c ? 1 + c : 0; }
    if (k[0] === 't') return sum(o) === Number(k.slice(1)) ? SUM_PAY[sum(o)] + 1 : 0;
    return 0;
  },
  describe: (o) => `${o.d.join('・')}（合計${sum(o)}${triple(o) ? '・ゾロ目' : sum(o) >= 11 ? '・大' : '・小'}）`,
  cpuBets(rng, chips) {
    const out = [[rng() < 0.5 ? 'big' : 'small', cpuUnit(rng, chips)]];
    if (rng() < 0.4) out.push(['s' + (1 + Math.floor(rng() * 6)), Math.min(chips, cpuUnit(rng, chips))]);
    if (rng() < 0.1) out.push(['any3', Math.min(chips, 10)]);
    return out;
  },
};

export const create = (n, settings, opts) => createBetting(n, settings, opts, spec);
