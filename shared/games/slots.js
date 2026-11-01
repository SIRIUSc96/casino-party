// スロット: 賭け金を決めて回すだけ。3つ揃えで大当たり、チェリー2つでも当たり
import { betSchema, createBetting, cpuUnit } from './betting.js';

export const meta = {
  id: 'slots', cat: 'casino', name: 'スロット', min: 1, max: 6,
  desc: '賭け金を決めてレバーを引くだけ。同じ絵柄が3つ揃えば払戻（7は150倍！）。みんなで同時に回して、最後にチップが多い人の勝ち',
  schema: betSchema(10),
};

// 絵柄ごとの出現率（合計1）と、3つ揃いの払戻倍率
export const SYMS = ['C', 'L', 'B', 'S', 'D', '7'];
export const WEIGHT = { C: 0.24, L: 0.22, B: 0.19, S: 0.15, D: 0.12, 7: 0.08 };
export const TRIPLE = { C: 10, L: 12, B: 18, S: 35, D: 70, 7: 150 };
const pickSym = (rng) => {
  let x = rng();
  for (const s of SYMS) { x -= WEIGHT[s]; if (x < 0) return s; }
  return SYMS[0];
};
export const slotRet = (r) => (r[0] === r[1] && r[1] === r[2] ? TRIPLE[r[0]] : r.filter((x) => x === 'C').length === 2 ? 2 : 0);

export const spec = {
  shared: false, spinMs: 2400,
  valid: (k) => k === 'spin',
  spin: (rng) => ({ r: [pickSym(rng), pickSym(rng), pickSym(rng)] }),
  ret: (_k, o) => slotRet(o.r),
  describe: (o) => o.r.map((x) => (x === '7' ? '7' : { C: '🍒', L: '🍋', B: '🔔', S: '⭐', D: '💎' }[x])).join(' '),
  cpuBets: (rng, chips) => [['spin', cpuUnit(rng, chips)]],
};

export const create = (n, settings, opts) => createBetting(n, settings, opts, spec);
