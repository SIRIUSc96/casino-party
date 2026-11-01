// ルーレットの画面
import { cell, betScreen, animate, stop } from '/betting-ui.js';
import { spec, colorOf } from '/shared/games/roulette.js';

export const banners = [];
const COLOR = { red: '#c0392b', black: '#1c1c1c', green: '#1e8c4e' };
const ICON = { red: '🔴', black: '⚫', green: '🟢' };

// 0〜36 を放射状に並べたホイール（見た目用）
const WHEEL = (() => {
  const seg = 360 / 37;
  const order = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
  return `conic-gradient(${order.map((n, i) => `${COLOR[colorOf(n)]} ${(i * seg).toFixed(2)}deg ${((i + 1) * seg).toFixed(2)}deg`).join(',')})`;
})();

export function render(root, v, api) {
  stop();
  const g = v.g;
  const out = g.outcomes ? g.outcomes[0] : null;
  const stage = g.phase === 'spin'
    ? `<div class="wheel spinning" style="background:${WHEEL};animation-duration:${g.spinMs}ms"><div class="hub"></div></div><div class="ball-ring" style="animation-duration:${g.spinMs / 3}ms"><i></i></div><div id="rnum" class="rnum">?</div>`
    : out !== null
      ? `<div class="wheel" style="background:${WHEEL}"><div class="hub"></div></div><div class="rnum big" style="background:${COLOR[colorOf(out)]}">${out}</div>`
      : `<div class="wheel idle" style="background:${WHEEL}"><div class="hub"></div></div><div class="rnum dimmed">ベット受付中</div>`;
  const hist = g.history.map((h) => `<span class="hchip">${ICON[h.includes('赤') ? 'red' : h.includes('黒') ? 'black' : 'green']}${h.split('（')[0]}</span>`).join('');
  const win = (k) => out !== null && spec.ret(k, out) > 0;
  const nums = [];
  for (let row = 0; row < 3; row++) for (let col = 0; col < 12; col++) {
    const n = (2 - row) + 1 + col * 3;
    nums.push(cell(v, 'n' + n, n, 'num ' + colorOf(n), win('n' + n)));
  }
  const board = `<div class="rboard">
      ${cell(v, 'n0', '0', 'num green zero', win('n0'))}
      <div class="rgrid">${nums.join('')}</div>
      <div class="rrow3">${cell(v, 'd1', '1〜12 ×3', '', win('d1'))}${cell(v, 'd2', '13〜24 ×3', '', win('d2'))}${cell(v, 'd3', '25〜36 ×3', '', win('d3'))}</div>
      <div class="rrow6">${cell(v, 'low', '1〜18', '', win('low'))}${cell(v, 'even', '偶数', '', win('even'))}${cell(v, 'red', '赤', 'red', win('red'))}${cell(v, 'black', '黒', 'black', win('black'))}${cell(v, 'odd', '奇数', '', win('odd'))}${cell(v, 'high', '19〜36', '', win('high'))}</div>
    </div>`;
  betScreen(root, v, api, { stage: stage + `<div class="hist">${hist}</div>`, board, help: '数字=36倍　赤黒・奇偶・1〜18/19〜36=2倍　ダース=3倍　0は胴元の総取り（数字の0に賭けた人を除く）' });
  if (g.phase === 'spin') {
    const el = root.querySelector('#rnum');
    animate(() => { if (el) el.textContent = Math.floor(Math.random() * 37); }, 90);
  }
}

export function sfx(prev, v) {
  const a = prev?.g?.phase, b = v.g.phase;
  if (a === 'bet' && b === 'spin') return ['spin'];
  if (a === 'spin' && b === 'done') return ['ball'];
  return [];
}
