// スロットの画面
import { cell, betScreen, animate, stop } from '/betting-ui.js';
import { TRIPLE, SYMS } from '/shared/games/slots.js';

export const banners = [];
const ICON = { C: '🍒', L: '🍋', B: '🔔', S: '⭐', D: '💎', 7: '7️⃣' };
const rnd = () => ICON[SYMS[Math.floor(Math.random() * SYMS.length)]];

export function render(root, v, api) {
  stop();
  const g = v.g;
  const me = Math.max(0, v.you);
  const spin = g.phase === 'spin';
  const mine = g.outcomes ? g.outcomes[me].r.map((s) => ICON[s]) : [rnd(), rnd(), rnd()];
  const others = g.outcomes
    ? v.seats.map((s, i) => (i === v.you ? '' : `<span class="oth">${s.name}：${g.outcomes[i].r.map((x) => ICON[x]).join('')}</span>`)).join('')
    : '';
  const mypaid = g.paid ? g.paid[me] : 0;
  const stage = `<div class="reels ${spin ? 'spinning' : ''}">${mine.map((s) => `<div class="reel"><span>${s}</span></div>`).join('')}</div>
    <div class="dsum">${g.paid ? (mypaid ? `払戻 ${mypaid}！` : 'ハズレ…') : spin ? '回転中…' : 'ベット受付中'}</div>
    <div class="others">${others}</div>`;
  const paytable = `<div class="paytable">${Object.keys(TRIPLE).reverse().map((s) => `<span>${ICON[s]}${ICON[s]}${ICON[s]} ×${TRIPLE[s]}</span>`).join('')}<span>🍒🍒 ×2</span></div>`;
  const board = `<div class="sloboard">${cell(v, 'spin', '🎰 この金額で回す', 'spinbtn')}${paytable}</div>`;
  betScreen(root, v, api, { stage, board, help: '同じ絵柄が3つ揃えば払戻（×は賭け金に対する倍率）。🍒は2つでも当たり。みんな同時に回して、出目は人それぞれ' });
  if (spin) {
    const els = [...root.querySelectorAll('.reel span')];
    animate(() => els.forEach((el) => { el.textContent = rnd(); }), 80);
  }
}

export function sfx(prev, v) {
  const a = prev?.g?.phase, b = v.g.phase;
  if (a === 'bet' && b === 'spin') return ['reel'];
  if (a === 'spin' && b === 'done' && v.you >= 0) {
    const p = v.g.paid[v.you], tot = Object.values(v.g.bets[v.you] || {}).reduce((x, y) => x + y, 0);
    if (tot && p >= tot * 35) return ['jackpot'];
  }
  return [];
}
