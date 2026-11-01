// 神経衰弱の画面
import { $, nameOf, cardHtml, backHtml, headerHtml, chipsHtml, logHtml, turnlineHtml, bindCommon } from '/ui.js';

export const banners = [['ペア成立', 'ペア成立！'], ['ゲーム終了', '終了！']];

export function render(root, v, api) {
  const g = v.g;
  const myTurn = v.phase === 'playing' && v.turn === v.you && !g.pending;
  const text = v.turn === v.you ? (g.flipped.length === 1 ? 'あなたの番: もう1枚めくってください' : 'あなたの番: 1枚目をめくってください') : v.turn >= 0 ? `${v.seats[v.turn].name} の番` : '';
  const cells = g.board.map((b, i) => {
    if (b.s === 0) return backHtml(`data-i="${i}" ${myTurn ? '' : 'disabled'}`, `bd ${myTurn ? 'pick' : ''}`);
    return cardHtml(b.c, { id: false, cls: `bd ${b.s === 2 ? 'gone' : g.matchPending ? 'hit' : 'up'}` });
  }).join('');
  root.innerHTML = headerHtml(v, `<span>残り ${g.left}組</span>`)
    + chipsHtml(v, (i) => ({ main: `${g.scores[i]}<small>組</small>` }))
    + `<div class="board" style="grid-template-columns:repeat(${g.cols},1fr)">${cells}</div>`
    + logHtml(v)
    + `<div class="me">${turnlineHtml(text, v.turn === v.you)}<div class="hint">同じ数字・同じ色（赤/黒）がペアです。揃えたらもう1回！</div></div>`;
  bindCommon(api);
  document.querySelectorAll('.pick').forEach((b) => { b.onclick = () => api.act({ t: 'flip', i: Number(b.dataset.i) }); });
}
