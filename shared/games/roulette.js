// ルーレット（ヨーロピアン 0〜36）: 数字・赤黒・奇偶・前半後半・ダース に賭ける
import { betSchema, createBetting, cpuUnit } from './betting.js';

export const meta = {
  id: 'roulette', cat: 'casino', name: 'ルーレット', min: 1, max: 6,
  desc: 'みんなで同時にベット。数字（36倍）・赤/黒・奇数/偶数・ダースなどに賭けて、ボールの行方を見守ろう。チップが多い人の勝ち',
  schema: betSchema(10),
};

export const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const OUTSIDE = ['red', 'black', 'odd', 'even', 'low', 'high', 'd1', 'd2', 'd3'];
export const colorOf = (o) => (o === 0 ? 'green' : RED.has(o) ? 'red' : 'black');

export const spec = {
  shared: true, spinMs: 4500,
  valid: (k) => OUTSIDE.includes(k) || (/^n\d{1,2}$/.test(k) && Number(k.slice(1)) <= 36),
  spin: (rng) => Math.floor(rng() * 37),
  ret(k, o) {
    if (k[0] === 'n') return o === Number(k.slice(1)) ? 36 : 0;
    const m = o >= 1;
    switch (k) {
      case 'red': return m && RED.has(o) ? 2 : 0;
      case 'black': return m && !RED.has(o) ? 2 : 0;
      case 'odd': return m && o % 2 === 1 ? 2 : 0;
      case 'even': return m && o % 2 === 0 ? 2 : 0;
      case 'low': return o >= 1 && o <= 18 ? 2 : 0;
      case 'high': return o >= 19 ? 2 : 0;
      case 'd1': return o >= 1 && o <= 12 ? 3 : 0;
      case 'd2': return o >= 13 && o <= 24 ? 3 : 0;
      case 'd3': return o >= 25 ? 3 : 0;
      default: return 0;
    }
  },
  describe: (o) => `${o}（${{ green: '緑', red: '赤', black: '黒' }[colorOf(o)]}）`,
  cpuBets(rng, chips) {
    const out = [];
    let left = chips;
    const k = 1 + Math.floor(rng() * 3);
    for (let i = 0; i < k && left > 0; i++) {
      const a = Math.min(left, cpuUnit(rng, chips));
      const key = rng() < 0.3 ? 'n' + Math.floor(rng() * 37) : OUTSIDE[Math.floor(rng() * OUTSIDE.length)];
      out.push([key, a]); left -= a;
    }
    return out;
  },
};

export const create = (n, settings, opts) => createBetting(n, settings, opts, spec);
