// 大小（シックボー）の画面
import { cell, betScreen, animate, stop } from '/betting-ui.js';
import { spec } from '/shared/games/sicbo.js';

export const banners = [];
const FACE = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
const rnd = () => FACE[1 + Math.floor(Math.random() * 6)];

export function render(root, v, api) {
  stop();
  const g = v.g;
  const out = g.outcomes ? g.outcomes[0] : null;
  const dice = out ? out.d.map((d) => FACE[d]) : [rnd(), rnd(), rnd()];
  const sum = out ? out.d[0] + out.d[1] + out.d[2] : null;
  const stage = `<div class="dicebox ${g.phase === 'spin' ? 'shake' : ''}">${dice.map((d) => `<span class="die">${d}</span>`).join('')}</div>
    <div class="dsum">${out ? `合計 ${sum}${out.d[0] === out.d[1] && out.d[1] === out.d[2] ? '　ゾロ目！' : sum >= 11 ? '　大' : '　小'}` : g.phase === 'spin' ? '振っています…' : 'ベット受付中'}</div>
    <div class="hist">${g.history.map((h) => `<span class="hchip">${h.split('（')[0]}</span>`).join('')}</div>`;
  const win = (k) => out !== null && spec.ret(k, out) > 0;
  const singles = [1, 2, 3, 4, 5, 6].map((n) => cell(v, 's' + n, FACE[n], 'face', win('s' + n))).join('');
  const sums = [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17].map((n) => cell(v, 't' + n, `${n}<small>×${{ 4: 61, 5: 31, 6: 18, 7: 13, 8: 9, 9: 7, 10: 7, 11: 7, 12: 7, 13: 9, 14: 13, 15: 18, 16: 31, 17: 61 }[n]}</small>`, 'sum', win('t' + n))).join('');
  const board = `<div class="sboard">
      <div class="srow2">${cell(v, 'small', '小 4〜10<small>×2</small>', 'big2', win('small'))}${cell(v, 'big', '大 11〜17<small>×2</small>', 'big2', win('big'))}</div>
      <div class="srow1">${cell(v, 'any3', 'ゾロ目（どれでも）<small>×31</small>', '', win('any3'))}</div>
      <div class="srow6">${singles}</div>
      <div class="ssums">${sums}</div>
    </div>`;
  betScreen(root, v, api, { stage, board, help: '大小=2倍（ゾロ目は負け）　数字=出た個数ぶん配当（1個で2倍、2個で3倍…）　合計=かけ率はマスに表示' });
  if (g.phase === 'spin') {
    const els = [...root.querySelectorAll('.die')];
    animate(() => els.forEach((el) => { el.textContent = rnd(); }), 90);
  }
}

export function sfx(prev, v) {
  const a = prev?.g?.phase, b = v.g.phase;
  if (a === 'bet' && b === 'spin') return ['dice'];
  return [];
}
